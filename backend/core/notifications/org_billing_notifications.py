"""Organization Billing Email Notifications

Part of US-023: Email notifications for billing events.
Sends branded transactional emails for organization billing events.
"""

from typing import Dict, Any, Optional
from core.utils.logger import logger
from core.services.supabase import DBConnection
from .notification_service import notification_service
from .novu_service import novu_service


class OrgBillingNotificationService:
    """Handles email notifications for organization billing events."""

    def __init__(self):
        self.db = DBConnection()
        self.novu = novu_service
        self.notification_service = notification_service

    async def send_subscription_created(
        self,
        org_id: str,
        plan_name: str = "Pro"
    ) -> Dict[str, Any]:
        """
        Send "Welcome to Worryless AI Pro!" email when subscription is created.

        Args:
            org_id: Organization ID
            plan_name: Name of the subscribed plan (Pro, Enterprise)

        Returns:
            Dict with success status and result/error
        """
        try:
            # Get organization owners to send notifications
            owners = await self._get_org_owners(org_id)
            org_info = await self._get_org_info(org_id)

            if not owners:
                logger.warning(f"No owners found for org {org_id} for subscription created notification")
                return {"success": False, "error": "No organization owners found"}

            results = []
            for owner in owners:
                account_info = await self._get_account_info(owner['user_id'])
                if not account_info or not account_info.get('email'):
                    continue

                payload = {
                    "first_name": account_info.get("first_name", "there"),
                    "plan_name": plan_name,
                    "org_name": org_info.get("name", "your organization"),
                    "dashboard_url": f"https://www.worryless.ai/settings/organization?org={org_id}",
                    "features": self._get_plan_features(plan_name)
                }

                result = await self.novu.trigger_workflow(
                    workflow_id="org-subscription-created",
                    subscriber_id=owner['user_id'],
                    payload=payload,
                    subscriber_email=account_info.get("email"),
                    subscriber_name=account_info.get("name")
                )

                results.append({
                    "user_id": owner['user_id'],
                    "result": result
                })

            logger.info(f"Subscription created notifications sent for org {org_id}: {len(results)} owners")
            return {"success": True, "results": results}

        except Exception as e:
            logger.error(f"Error sending subscription created notification for org {org_id}: {e}")
            return {"success": False, "error": str(e)}

    async def send_payment_success(
        self,
        org_id: str,
        amount_cents: int,
        currency: str = "USD",
        invoice_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send "Your payment was processed successfully" email.

        Args:
            org_id: Organization ID
            amount_cents: Payment amount in cents
            currency: Currency code (default: USD)
            invoice_url: Optional URL to view/download invoice

        Returns:
            Dict with success status and result/error
        """
        try:
            owners = await self._get_org_owners(org_id)
            org_info = await self._get_org_info(org_id)

            if not owners:
                logger.warning(f"No owners found for org {org_id} for payment success notification")
                return {"success": False, "error": "No organization owners found"}

            # Format amount
            amount_formatted = f"${amount_cents / 100:.2f}" if currency == "USD" else f"{amount_cents / 100:.2f} {currency}"

            results = []
            for owner in owners:
                account_info = await self._get_account_info(owner['user_id'])
                if not account_info or not account_info.get('email'):
                    continue

                payload = {
                    "first_name": account_info.get("first_name", "there"),
                    "amount": amount_formatted,
                    "org_name": org_info.get("name", "your organization"),
                    "plan_name": org_info.get("plan_tier", "Pro").title(),
                    "invoice_url": invoice_url or f"https://www.worryless.ai/settings/organization?org={org_id}",
                    "billing_url": f"https://www.worryless.ai/settings/organization?org={org_id}"
                }

                result = await self.novu.trigger_workflow(
                    workflow_id="org-payment-success",
                    subscriber_id=owner['user_id'],
                    payload=payload,
                    subscriber_email=account_info.get("email"),
                    subscriber_name=account_info.get("name")
                )

                results.append({
                    "user_id": owner['user_id'],
                    "result": result
                })

            logger.info(f"Payment success notifications sent for org {org_id}: {len(results)} owners")
            return {"success": True, "results": results}

        except Exception as e:
            logger.error(f"Error sending payment success notification for org {org_id}: {e}")
            return {"success": False, "error": str(e)}

    async def send_payment_failed(
        self,
        org_id: str,
        amount_cents: int,
        currency: str = "USD",
        failure_reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send "Action required: Update your payment method" email.

        Args:
            org_id: Organization ID
            amount_cents: Failed payment amount in cents
            currency: Currency code (default: USD)
            failure_reason: Optional reason for payment failure

        Returns:
            Dict with success status and result/error
        """
        try:
            owners = await self._get_org_owners(org_id)
            org_info = await self._get_org_info(org_id)

            if not owners:
                logger.warning(f"No owners found for org {org_id} for payment failed notification")
                return {"success": False, "error": "No organization owners found"}

            # Format amount
            amount_formatted = f"${amount_cents / 100:.2f}" if currency == "USD" else f"{amount_cents / 100:.2f} {currency}"

            results = []
            for owner in owners:
                account_info = await self._get_account_info(owner['user_id'])
                if not account_info or not account_info.get('email'):
                    continue

                payload = {
                    "first_name": account_info.get("first_name", "there"),
                    "amount": amount_formatted,
                    "org_name": org_info.get("name", "your organization"),
                    "failure_reason": failure_reason or "Your payment method was declined",
                    "update_payment_url": f"https://www.worryless.ai/settings/organization?org={org_id}&action=update-payment",
                    "billing_url": f"https://www.worryless.ai/settings/organization?org={org_id}"
                }

                result = await self.novu.trigger_workflow(
                    workflow_id="org-payment-failed",
                    subscriber_id=owner['user_id'],
                    payload=payload,
                    subscriber_email=account_info.get("email"),
                    subscriber_name=account_info.get("name")
                )

                results.append({
                    "user_id": owner['user_id'],
                    "result": result
                })

            logger.info(f"Payment failed notifications sent for org {org_id}: {len(results)} owners")
            return {"success": True, "results": results}

        except Exception as e:
            logger.error(f"Error sending payment failed notification for org {org_id}: {e}")
            return {"success": False, "error": str(e)}

    async def send_usage_limit_approaching(
        self,
        org_id: str,
        limit_type: str,
        current_usage: int,
        limit: int,
        percentage: int = 80
    ) -> Dict[str, Any]:
        """
        Send "You're approaching your plan limit" email at 80% usage.

        Args:
            org_id: Organization ID
            limit_type: Type of limit ("agents" or "runs")
            current_usage: Current usage count
            limit: Maximum allowed by plan
            percentage: Usage percentage (default: 80)

        Returns:
            Dict with success status and result/error
        """
        try:
            owners = await self._get_org_owners(org_id)
            org_info = await self._get_org_info(org_id)

            if not owners:
                logger.warning(f"No owners found for org {org_id} for usage approaching notification")
                return {"success": False, "error": "No organization owners found"}

            limit_type_display = "agent" if limit_type == "agents" else "monthly run"

            results = []
            for owner in owners:
                account_info = await self._get_account_info(owner['user_id'])
                if not account_info or not account_info.get('email'):
                    continue

                payload = {
                    "first_name": account_info.get("first_name", "there"),
                    "org_name": org_info.get("name", "your organization"),
                    "plan_name": org_info.get("plan_tier", "Free").title(),
                    "limit_type": limit_type_display,
                    "current_usage": current_usage,
                    "limit": limit,
                    "percentage": percentage,
                    "remaining": limit - current_usage,
                    "upgrade_url": f"https://www.worryless.ai/settings/organization?org={org_id}",
                    "usage_url": f"https://www.worryless.ai/settings/usage?org={org_id}"
                }

                result = await self.novu.trigger_workflow(
                    workflow_id="org-usage-approaching",
                    subscriber_id=owner['user_id'],
                    payload=payload,
                    subscriber_email=account_info.get("email"),
                    subscriber_name=account_info.get("name")
                )

                results.append({
                    "user_id": owner['user_id'],
                    "result": result
                })

            logger.info(f"Usage approaching notifications sent for org {org_id}: {len(results)} owners")
            return {"success": True, "results": results}

        except Exception as e:
            logger.error(f"Error sending usage approaching notification for org {org_id}: {e}")
            return {"success": False, "error": str(e)}

    async def send_usage_limit_reached(
        self,
        org_id: str,
        limit_type: str,
        limit: int
    ) -> Dict[str, Any]:
        """
        Send "You've reached your plan limit - Upgrade to continue" email.

        Args:
            org_id: Organization ID
            limit_type: Type of limit ("agents" or "runs")
            limit: Maximum allowed by plan

        Returns:
            Dict with success status and result/error
        """
        try:
            owners = await self._get_org_owners(org_id)
            org_info = await self._get_org_info(org_id)

            if not owners:
                logger.warning(f"No owners found for org {org_id} for usage limit reached notification")
                return {"success": False, "error": "No organization owners found"}

            limit_type_display = "agent" if limit_type == "agents" else "monthly run"
            action_blocked = "create more agents" if limit_type == "agents" else "run more agents"

            results = []
            for owner in owners:
                account_info = await self._get_account_info(owner['user_id'])
                if not account_info or not account_info.get('email'):
                    continue

                payload = {
                    "first_name": account_info.get("first_name", "there"),
                    "org_name": org_info.get("name", "your organization"),
                    "plan_name": org_info.get("plan_tier", "Free").title(),
                    "limit_type": limit_type_display,
                    "limit": limit,
                    "action_blocked": action_blocked,
                    "upgrade_url": f"https://www.worryless.ai/settings/organization?org={org_id}",
                    "usage_url": f"https://www.worryless.ai/settings/usage?org={org_id}"
                }

                result = await self.novu.trigger_workflow(
                    workflow_id="org-usage-limit-reached",
                    subscriber_id=owner['user_id'],
                    payload=payload,
                    subscriber_email=account_info.get("email"),
                    subscriber_name=account_info.get("name")
                )

                results.append({
                    "user_id": owner['user_id'],
                    "result": result
                })

            logger.info(f"Usage limit reached notifications sent for org {org_id}: {len(results)} owners")
            return {"success": True, "results": results}

        except Exception as e:
            logger.error(f"Error sending usage limit reached notification for org {org_id}: {e}")
            return {"success": False, "error": str(e)}

    async def _get_org_owners(self, org_id: str) -> list:
        """Get all owners of an organization."""
        try:
            client = await self.db.client

            result = await client.table('organization_members').select(
                'user_id, role'
            ).eq('org_id', org_id).eq('role', 'owner').execute()

            return result.data if result and result.data else []

        except Exception as e:
            logger.error(f"Error getting org owners for {org_id}: {e}")
            return []

    async def _get_org_info(self, org_id: str) -> Dict[str, Any]:
        """Get organization info."""
        try:
            client = await self.db.client

            result = await client.table('organizations').select(
                'id, name, slug, plan_tier, billing_status'
            ).eq('id', org_id).maybe_single().execute()

            return result.data if result and result.data else {}

        except Exception as e:
            logger.error(f"Error getting org info for {org_id}: {e}")
            return {}

    async def _get_account_info(self, account_id: str) -> Dict[str, Any]:
        """Get account info using notification_service helper."""
        return await self.notification_service._get_account_info(account_id)

    def _get_plan_features(self, plan_name: str) -> list:
        """Get list of features for a plan."""
        features = {
            "Pro": [
                "Unlimited agents",
                "5,000 agent runs per month",
                "Priority email support",
                "API access",
                "Advanced analytics"
            ],
            "Enterprise": [
                "Unlimited agents",
                "Unlimited agent runs",
                "Dedicated support",
                "Custom integrations",
                "SSO & advanced security",
                "SLA guarantees"
            ]
        }
        return features.get(plan_name, features["Pro"])


# Singleton instance
org_billing_notifications = OrgBillingNotificationService()
