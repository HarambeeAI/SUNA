"""Organization Billing Webhook Handlers

This module handles Stripe webhook events for organization subscriptions.
"""

from typing import Dict, Any, Optional

from core.utils.logger import logger
from . import repo


class OrgBillingWebhookHandler:
    """Handles Stripe webhook events for organization billing."""

    @staticmethod
    async def handle_checkout_session_completed(event: Dict[str, Any]) -> bool:
        """
        Handle checkout.session.completed event for organization subscriptions.

        Returns True if this was an organization checkout, False otherwise.
        """
        session = event.data.object
        metadata = session.get('metadata', {})

        # Check if this is an organization checkout
        if metadata.get('account_type') != 'organization':
            return False

        org_id = metadata.get('org_id')
        if not org_id:
            logger.warning("[ORG WEBHOOK] checkout.session.completed missing org_id in metadata")
            return False

        logger.info(f"[ORG WEBHOOK] Processing checkout.session.completed for org {org_id}")

        subscription_id = session.get('subscription')
        customer_id = session.get('customer')
        target_plan_tier = metadata.get('target_plan_tier', 'pro')

        try:
            # Update organization with subscription info
            await repo.update_organization_billing(
                org_id=org_id,
                plan_tier=target_plan_tier,
                billing_status='active',
                stripe_customer_id=customer_id,
                stripe_subscription_id=subscription_id
            )

            logger.info(
                f"[ORG WEBHOOK] Updated org {org_id}: plan_tier={target_plan_tier}, "
                f"subscription={subscription_id}"
            )

            # Cancel old subscription if upgrading
            cancel_after_checkout = metadata.get('cancel_after_checkout')
            if cancel_after_checkout:
                try:
                    # Import here to avoid circular dependency
                    from core.billing.external.stripe import StripeAPIWrapper
                    await StripeAPIWrapper.cancel_subscription(
                        cancel_after_checkout,
                        cancel_immediately=True
                    )
                    logger.info(f"[ORG WEBHOOK] Cancelled old subscription {cancel_after_checkout}")
                except Exception as e:
                    logger.warning(
                        f"[ORG WEBHOOK] Could not cancel old subscription {cancel_after_checkout}: {e}"
                    )

            # Log for analytics
            logger.info(
                f"[ORG BILLING ANALYTICS] org_checkout_completed "
                f"org_id={org_id} plan_tier={target_plan_tier} "
                f"previous_tier={metadata.get('previous_plan_tier', 'unknown')}"
            )

            return True

        except Exception as e:
            logger.error(f"[ORG WEBHOOK] Error processing checkout for org {org_id}: {e}")
            raise

    @staticmethod
    async def handle_subscription_deleted(event: Dict[str, Any]) -> bool:
        """
        Handle customer.subscription.deleted event for organization subscriptions.

        Downgrades the organization to free tier when subscription is deleted.
        Returns True if this was an organization subscription, False otherwise.
        """
        subscription = event.data.object
        metadata = subscription.get('metadata', {})

        # Check if this is an organization subscription
        if metadata.get('account_type') != 'organization':
            # Try to find org by subscription ID
            org = await _find_org_by_subscription_id(subscription.get('id'))
            if not org:
                return False
        else:
            org_id = metadata.get('org_id')
            org = await repo.get_organization_by_id(org_id) if org_id else None

        if not org:
            return False

        org_id = org['id']
        logger.info(f"[ORG WEBHOOK] Processing subscription.deleted for org {org_id}")

        try:
            # Downgrade to free tier
            await repo.update_organization_billing(
                org_id=org_id,
                plan_tier='free',
                billing_status='canceled',
                stripe_subscription_id=None  # Clear subscription ID
            )

            logger.info(f"[ORG WEBHOOK] Downgraded org {org_id} to free tier")

            # Log for analytics
            logger.info(
                f"[ORG BILLING ANALYTICS] org_subscription_deleted "
                f"org_id={org_id} previous_tier={org.get('plan_tier', 'unknown')}"
            )

            return True

        except Exception as e:
            logger.error(f"[ORG WEBHOOK] Error handling subscription deleted for org {org_id}: {e}")
            raise

    @staticmethod
    async def handle_invoice_payment_failed(event: Dict[str, Any]) -> bool:
        """
        Handle invoice.payment_failed event for organization subscriptions.

        Sets the organization billing status to past_due.
        Returns True if this was an organization invoice, False otherwise.
        """
        invoice = event.data.object
        subscription_id = invoice.get('subscription')

        if not subscription_id:
            return False

        # Try to find the organization by subscription
        org = await _find_org_by_subscription_id(subscription_id)
        if not org:
            return False

        org_id = org['id']
        logger.info(f"[ORG WEBHOOK] Processing invoice.payment_failed for org {org_id}")

        try:
            # Update billing status to past_due
            await repo.update_organization_billing(
                org_id=org_id,
                billing_status='past_due'
            )

            logger.info(f"[ORG WEBHOOK] Set org {org_id} billing_status to past_due")

            # Log for analytics
            logger.info(
                f"[ORG BILLING ANALYTICS] org_payment_failed "
                f"org_id={org_id} plan_tier={org.get('plan_tier', 'unknown')}"
            )

            return True

        except Exception as e:
            logger.error(f"[ORG WEBHOOK] Error handling payment failed for org {org_id}: {e}")
            raise

    @staticmethod
    async def handle_subscription_updated(event: Dict[str, Any]) -> bool:
        """
        Handle customer.subscription.updated event for organization subscriptions.

        Updates the organization billing status based on subscription status.
        Handles cancel_at_period_end gracefully - subscription stays active until period ends.
        Returns True if this was an organization subscription, False otherwise.
        """
        subscription = event.data.object
        metadata = subscription.get('metadata', {})

        # Check if this is an organization subscription
        if metadata.get('account_type') != 'organization':
            org = await _find_org_by_subscription_id(subscription.get('id'))
            if not org:
                return False
        else:
            org_id = metadata.get('org_id')
            org = await repo.get_organization_by_id(org_id) if org_id else None

        if not org:
            return False

        org_id = org['id']
        subscription_status = subscription.get('status')
        cancel_at_period_end = subscription.get('cancel_at_period_end', False)

        logger.info(
            f"[ORG WEBHOOK] Processing subscription.updated for org {org_id}, "
            f"status={subscription_status}, cancel_at_period_end={cancel_at_period_end}"
        )

        try:
            # Map Stripe subscription status to our billing status
            # If cancel_at_period_end is set but subscription is still active,
            # the subscription remains active until the period ends
            billing_status = _map_subscription_status(subscription_status)

            # Log cancellation scheduled for analytics
            if cancel_at_period_end and subscription_status == 'active':
                cancel_at = subscription.get('cancel_at')
                logger.info(
                    f"[ORG BILLING ANALYTICS] org_subscription_cancel_scheduled "
                    f"org_id={org_id} plan_tier={org.get('plan_tier', 'unknown')} "
                    f"cancel_at={cancel_at}"
                )

            await repo.update_organization_billing(
                org_id=org_id,
                billing_status=billing_status
            )

            logger.info(f"[ORG WEBHOOK] Updated org {org_id} billing_status to {billing_status}")

            return True

        except Exception as e:
            logger.error(f"[ORG WEBHOOK] Error handling subscription updated for org {org_id}: {e}")
            raise


async def _find_org_by_subscription_id(subscription_id: str) -> Optional[Dict[str, Any]]:
    """Find an organization by its Stripe subscription ID."""
    from core.services.db import execute_one_read, serialize_row

    sql = """
    SELECT
        id, name, slug, plan_tier, billing_status, account_id,
        stripe_customer_id, stripe_subscription_id, settings,
        created_at, updated_at
    FROM organizations
    WHERE stripe_subscription_id = :subscription_id
    """

    result = await execute_one_read(sql, {"subscription_id": subscription_id})
    return serialize_row(dict(result)) if result else None


def _map_subscription_status(stripe_status: str) -> str:
    """Map Stripe subscription status to our billing status.

    Important: When a user cancels via the billing portal, Stripe sets
    cancel_at_period_end=true but the status remains 'active' until
    the subscription actually ends. This means:
    - The user keeps access to paid features until the period ends
    - The subscription.deleted webhook fires when it actually ends
    - Only then do we downgrade to free tier

    This provides a graceful cancellation experience where users don't
    lose access immediately.
    """
    status_mapping = {
        'active': 'active',
        'past_due': 'past_due',
        'canceled': 'canceled',
        'unpaid': 'unpaid',
        'trialing': 'trialing',
        'incomplete': 'past_due',
        'incomplete_expired': 'canceled',
        'paused': 'past_due',
    }
    return status_mapping.get(stripe_status, 'active')
