"""Organization Billing API Endpoints

This module provides Stripe subscription management for organizations.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict
import stripe
import time
import secrets

from core.utils.config import config
from core.utils.logger import logger
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.api_models.org_billing import (
    OrgCheckoutRequest,
    OrgCheckoutResponse,
    OrgBillingPortalRequest,
    OrgBillingPortalResponse,
    OrgSubscriptionStatusResponse,
    OrgPlanTier,
)
from core.billing.external.stripe import StripeAPIWrapper
from . import repo
from .rbac import require_org_owner, OrgAccessContext

stripe.api_key = config.STRIPE_SECRET_KEY

router = APIRouter(tags=["organization-billing"])


# Mapping from our plan tiers to Stripe price IDs
# These should be configured in environment variables for production
ORG_PLAN_PRICE_IDS = {
    "pro": config.STRIPE_TIER_6_50_ID if hasattr(config, 'STRIPE_TIER_6_50_ID') else None,
    "enterprise": None,  # Enterprise uses custom pricing via sales
}


def _get_price_id_for_plan(plan_tier: str) -> str:
    """Get the Stripe price ID for a given plan tier."""
    price_id = ORG_PLAN_PRICE_IDS.get(plan_tier)
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"Plan tier '{plan_tier}' is not available for self-service checkout. Contact sales for enterprise plans."
        )
    return price_id


async def _get_or_create_org_stripe_customer(org_id: str, user_id: str) -> str:
    """
    Get or create a Stripe customer for an organization.

    Uses the organization ID in the metadata and the requesting user's email.
    """
    org = await repo.get_organization_by_id(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # If org already has a Stripe customer, return it
    if org.get('stripe_customer_id'):
        # Verify the customer still exists in Stripe
        try:
            customer = await StripeAPIWrapper.retrieve_customer(org['stripe_customer_id'])
            if customer and not customer.get('deleted'):
                return org['stripe_customer_id']
        except Exception as e:
            logger.warning(f"[ORG BILLING] Stripe customer {org['stripe_customer_id']} not found: {e}")

    # Create a new Stripe customer for the organization
    # Use the organization name and the requesting user's info
    customer = await StripeAPIWrapper.create_customer(
        name=org['name'],
        metadata={
            'org_id': org_id,
            'org_slug': org['slug'],
            'type': 'organization',
        }
    )

    # Save the customer ID to the organization
    await repo.update_organization_billing(
        org_id=org_id,
        stripe_customer_id=customer.id
    )

    logger.info(f"[ORG BILLING] Created Stripe customer {customer.id} for org {org_id}")
    return customer.id


@router.post("/organizations/{org_id}/billing/checkout", response_model=OrgCheckoutResponse)
async def create_org_checkout_session(
    org_id: str,
    request: OrgCheckoutRequest,
    access: OrgAccessContext = Depends(require_org_owner)
) -> Dict:
    """
    Create a Stripe checkout session for organization subscription upgrade.

    Only organization owners can manage billing.
    """
    try:
        # Get the organization
        org = await repo.get_organization_by_id(org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        # Don't allow checkout for already-subscribed orgs at the same tier
        if org['plan_tier'] == request.plan_tier.value and org['billing_status'] == 'active':
            raise HTTPException(
                status_code=400,
                detail=f"Organization is already on the {request.plan_tier.value} plan"
            )

        # Get or create Stripe customer
        customer_id = await _get_or_create_org_stripe_customer(org_id, access.user_id)

        # Get the price ID for the target plan
        price_id = _get_price_id_for_plan(request.plan_tier.value)

        # Generate idempotency key
        timestamp = int(time.time() * 1000)
        idempotency_key = f"org_checkout_{org_id}_{request.plan_tier.value}_{timestamp}"

        # Build metadata for webhook handling
        metadata = {
            'org_id': org_id,
            'account_type': 'organization',
            'target_plan_tier': request.plan_tier.value,
            'previous_plan_tier': org['plan_tier'],
        }

        # If upgrading from a paid plan, mark for cleanup
        if org.get('stripe_subscription_id') and org['plan_tier'] != 'free':
            metadata['cancel_after_checkout'] = org['stripe_subscription_id']
            metadata['requires_cleanup'] = 'true'

        # Create checkout session
        session = await StripeAPIWrapper.create_checkout_session(
            customer=customer_id,
            payment_method_types=['card'],
            line_items=[{'price': price_id, 'quantity': 1}],
            mode='subscription',
            success_url=request.success_url,
            cancel_url=request.cancel_url or request.success_url,
            allow_promotion_codes=True,
            subscription_data={'metadata': metadata},
            idempotency_key=idempotency_key,
        )

        logger.info(f"[ORG BILLING] Created checkout session {session.id} for org {org_id} -> {request.plan_tier.value}")

        return OrgCheckoutResponse(
            checkout_url=session.url,
            session_id=session.id,
            message=f"Redirecting to checkout for {request.plan_tier.value} plan"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ORG BILLING] Error creating checkout session for org {org_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/organizations/{org_id}/billing/portal", response_model=OrgBillingPortalResponse)
async def create_org_billing_portal_session(
    org_id: str,
    request: OrgBillingPortalRequest,
    access: OrgAccessContext = Depends(require_org_owner)
) -> Dict:
    """
    Create a Stripe billing portal session for the organization.

    Only organization owners can access billing portal.
    """
    try:
        org = await repo.get_organization_by_id(org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        if not org.get('stripe_customer_id'):
            raise HTTPException(
                status_code=400,
                detail="Organization has no billing information. Please subscribe to a plan first."
            )

        # Create portal session
        portal_session = await StripeAPIWrapper.safe_stripe_call(
            stripe.billing_portal.Session.create_async,
            customer=org['stripe_customer_id'],
            return_url=request.return_url,
        )

        logger.info(f"[ORG BILLING] Created portal session for org {org_id}")

        return OrgBillingPortalResponse(portal_url=portal_session.url)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ORG BILLING] Error creating portal session for org {org_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/organizations/{org_id}/billing/status", response_model=OrgSubscriptionStatusResponse)
async def get_org_subscription_status(
    org_id: str,
    access: OrgAccessContext = Depends(require_org_owner)
) -> Dict:
    """
    Get the current subscription status for an organization.

    Only organization owners can view billing status.
    """
    try:
        org = await repo.get_organization_by_id(org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        has_active = (
            org.get('stripe_subscription_id') is not None and
            org['billing_status'] in ('active', 'trialing')
        )

        return OrgSubscriptionStatusResponse(
            org_id=org_id,
            plan_tier=OrgPlanTier(org['plan_tier']),
            billing_status=org['billing_status'],
            stripe_customer_id=org.get('stripe_customer_id'),
            stripe_subscription_id=org.get('stripe_subscription_id'),
            has_active_subscription=has_active
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ORG BILLING] Error getting subscription status for org {org_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
