"""Template Submission Email Notifications

Part of US-027: Template submission by users.
Sends email notifications when template submissions are approved or rejected.
"""

from typing import Dict, Any, Optional
from core.utils.logger import logger
from core.services.supabase import DBConnection
from .notification_service import notification_service
from .novu_service import novu_service


class TemplateNotificationService:
    """Handles email notifications for template submission events."""

    def __init__(self):
        self.db = DBConnection()
        self.novu = novu_service
        self.notification_service = notification_service

    async def _get_user_info(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user email and name from auth.users."""
        try:
            client = await self.db.get_supabase()
            response = await client.rpc(
                "get_user_email_and_name",
                {"p_user_id": user_id}
            ).execute()

            if response.data and len(response.data) > 0:
                return response.data[0]

            # Fallback to direct query
            result = await client.schema("auth").table("users").select(
                "email, raw_user_meta_data->name"
            ).eq("id", user_id).maybe_single().execute()

            if result.data:
                return {
                    "email": result.data.get("email"),
                    "name": result.data.get("name") or result.data.get("email", "").split("@")[0]
                }

            return None
        except Exception as e:
            logger.warning(f"Failed to get user info for {user_id}: {e}")
            return None

    @classmethod
    async def send_submission_approved(
        cls,
        user_id: str,
        template_name: str,
        template_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send email notification when a template submission is approved.

        Args:
            user_id: ID of the user who submitted the template
            template_name: Name of the approved template
            template_id: ID of the published template (optional)

        Returns:
            Dict with success status and result/error
        """
        service = cls()
        try:
            user_info = await service._get_user_info(user_id)

            if not user_info or not user_info.get("email"):
                logger.warning(f"No email found for user {user_id} for template approval notification")
                return {"success": False, "error": "User email not found"}

            first_name = user_info.get("name", "there")
            if first_name and " " in first_name:
                first_name = first_name.split(" ")[0]

            template_url = f"https://www.worryless.ai/templates"
            if template_id:
                template_url = f"https://www.worryless.ai/templates/{template_id}"

            payload = {
                "first_name": first_name,
                "template_name": template_name,
                "template_url": template_url,
                "marketplace_url": "https://www.worryless.ai/templates"
            }

            result = await service.novu.trigger_workflow(
                workflow_id="template-submission-approved",
                subscriber_id=user_id,
                payload=payload,
                subscriber_email=user_info.get("email"),
                subscriber_name=user_info.get("name")
            )

            logger.info(f"Template approval notification sent to user {user_id} for template '{template_name}'")
            return {"success": True, "result": result}

        except Exception as e:
            logger.error(f"Error sending template approval notification to user {user_id}: {e}")
            return {"success": False, "error": str(e)}

    @classmethod
    async def send_submission_rejected(
        cls,
        user_id: str,
        template_name: str,
        rejection_reason: str
    ) -> Dict[str, Any]:
        """
        Send email notification when a template submission is rejected.

        Args:
            user_id: ID of the user who submitted the template
            template_name: Name of the rejected template
            rejection_reason: Reason for rejection

        Returns:
            Dict with success status and result/error
        """
        service = cls()
        try:
            user_info = await service._get_user_info(user_id)

            if not user_info or not user_info.get("email"):
                logger.warning(f"No email found for user {user_id} for template rejection notification")
                return {"success": False, "error": "User email not found"}

            first_name = user_info.get("name", "there")
            if first_name and " " in first_name:
                first_name = first_name.split(" ")[0]

            payload = {
                "first_name": first_name,
                "template_name": template_name,
                "rejection_reason": rejection_reason,
                "guidelines_url": "https://www.worryless.ai/docs/templates/guidelines",
                "support_email": "support@worryless.ai"
            }

            result = await service.novu.trigger_workflow(
                workflow_id="template-submission-rejected",
                subscriber_id=user_id,
                payload=payload,
                subscriber_email=user_info.get("email"),
                subscriber_name=user_info.get("name")
            )

            logger.info(f"Template rejection notification sent to user {user_id} for template '{template_name}'")
            return {"success": True, "result": result}

        except Exception as e:
            logger.error(f"Error sending template rejection notification to user {user_id}: {e}")
            return {"success": False, "error": str(e)}

    @classmethod
    async def send_submission_received(
        cls,
        user_id: str,
        template_name: str
    ) -> Dict[str, Any]:
        """
        Send email confirmation when a template submission is received.

        Args:
            user_id: ID of the user who submitted the template
            template_name: Name of the submitted template

        Returns:
            Dict with success status and result/error
        """
        service = cls()
        try:
            user_info = await service._get_user_info(user_id)

            if not user_info or not user_info.get("email"):
                logger.warning(f"No email found for user {user_id} for template submission received notification")
                return {"success": False, "error": "User email not found"}

            first_name = user_info.get("name", "there")
            if first_name and " " in first_name:
                first_name = first_name.split(" ")[0]

            payload = {
                "first_name": first_name,
                "template_name": template_name,
                "dashboard_url": "https://www.worryless.ai/dashboard",
                "expected_review_time": "1-3 business days"
            }

            result = await service.novu.trigger_workflow(
                workflow_id="template-submission-received",
                subscriber_id=user_id,
                payload=payload,
                subscriber_email=user_info.get("email"),
                subscriber_name=user_info.get("name")
            )

            logger.info(f"Template submission received notification sent to user {user_id} for template '{template_name}'")
            return {"success": True, "result": result}

        except Exception as e:
            logger.error(f"Error sending template submission received notification to user {user_id}: {e}")
            return {"success": False, "error": str(e)}
