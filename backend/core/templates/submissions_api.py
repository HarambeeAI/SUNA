"""API endpoints for template submissions."""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional

from core.utils.logger import logger
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.endpoints.user_roles_repo import get_user_admin_role
from core.api_models import (
    TemplateSubmissionStatus,
    TemplateSubmissionCreateRequest,
    TemplateSubmissionResponse,
    TemplateSubmissionsListResponse,
    ApproveSubmissionRequest,
    RejectSubmissionRequest,
    TemplateSubmissionStatsResponse,
)
from . import submissions_repo


router = APIRouter(prefix="/template-submissions", tags=["template-submissions"])
admin_router = APIRouter(prefix="/admin/template-submissions", tags=["admin-template-submissions"])


def _format_submission_response(submission: dict) -> TemplateSubmissionResponse:
    """Format a submission dict as a response model."""
    return TemplateSubmissionResponse(
        submission_id=str(submission["submission_id"]),
        agent_id=str(submission["agent_id"]),
        submitter_id=str(submission["submitter_id"]),
        template_name=submission["template_name"],
        template_description=submission.get("template_description"),
        category_id=str(submission["category_id"]) if submission.get("category_id") else None,
        use_cases=submission.get("use_cases"),
        status=TemplateSubmissionStatus(submission["status"]),
        submitted_at=str(submission["submitted_at"]),
        reviewed_at=str(submission["reviewed_at"]) if submission.get("reviewed_at") else None,
        reviewed_by=str(submission["reviewed_by"]) if submission.get("reviewed_by") else None,
        rejection_reason=submission.get("rejection_reason"),
        published_template_id=str(submission["published_template_id"]) if submission.get("published_template_id") else None,
        metadata=submission.get("metadata"),
        created_at=str(submission["created_at"]),
        updated_at=str(submission["updated_at"]),
        agent_name=submission.get("agent_name"),
        submitter_email=submission.get("submitter_email"),
        category_name=submission.get("category_name"),
    )


# ============================================================================
# User endpoints
# ============================================================================

@router.post("", response_model=TemplateSubmissionResponse)
async def create_template_submission(
    request: TemplateSubmissionCreateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Submit an agent as a template for marketplace review.

    The submission will go into a moderation queue for admin approval.
    """
    try:
        # Verify agent ownership
        owns_agent = await submissions_repo.verify_agent_ownership(request.agent_id, user_id)
        if not owns_agent:
            raise HTTPException(status_code=403, detail="You don't have permission to submit this agent as a template")

        # Check for existing pending submission
        has_pending = await submissions_repo.check_existing_pending_submission(request.agent_id)
        if has_pending:
            raise HTTPException(status_code=400, detail="A pending submission already exists for this agent")

        submission = await submissions_repo.create_submission(
            agent_id=request.agent_id,
            submitter_id=user_id,
            template_name=request.template_name,
            template_description=request.template_description,
            category_id=request.category_id,
            use_cases=request.use_cases,
        )

        if not submission:
            raise HTTPException(status_code=500, detail="Failed to create submission")

        logger.info(f"Template submission created: {submission['submission_id']} by user {user_id}")
        return _format_submission_response(submission)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating template submission: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("", response_model=TemplateSubmissionsListResponse)
async def list_my_submissions(
    status: Optional[str] = Query(None, description="Filter by status: pending, approved, rejected"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    List the current user's template submissions.
    """
    try:
        offset = (page - 1) * page_size
        submissions, total = await submissions_repo.get_user_submissions(
            user_id=user_id,
            status=status,
            limit=page_size,
            offset=offset
        )

        return TemplateSubmissionsListResponse(
            submissions=[_format_submission_response(s) for s in submissions],
            total=total,
            page=page,
            page_size=page_size,
            has_more=offset + len(submissions) < total
        )

    except Exception as e:
        logger.error(f"Error listing user submissions: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{submission_id}", response_model=TemplateSubmissionResponse)
async def get_submission(
    submission_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Get a specific template submission.

    Users can only view their own submissions.
    """
    try:
        submission = await submissions_repo.get_submission_with_details(submission_id)

        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")

        # Check ownership
        if submission["submitter_id"] != user_id:
            # Check if user is admin
            admin_role = await get_user_admin_role(user_id)
            if not admin_role["isAdmin"]:
                raise HTTPException(status_code=403, detail="You don't have permission to view this submission")

        return _format_submission_response(submission)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting submission {submission_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{submission_id}")
async def cancel_submission(
    submission_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Cancel a pending template submission.

    Only the submitter can cancel, and only if the submission is still pending.
    """
    try:
        # Verify the submission exists and is owned by user
        submission = await submissions_repo.get_submission_by_id(submission_id)

        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")

        if submission["submitter_id"] != user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to cancel this submission")

        if submission["status"] != "pending":
            raise HTTPException(status_code=400, detail="Only pending submissions can be cancelled")

        success = await submissions_repo.cancel_submission(submission_id, user_id)

        if not success:
            raise HTTPException(status_code=500, detail="Failed to cancel submission")

        logger.info(f"Template submission cancelled: {submission_id} by user {user_id}")
        return {"message": "Submission cancelled successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling submission {submission_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================================
# Admin endpoints
# ============================================================================

async def require_admin(user_id: str = Depends(verify_and_get_user_id_from_jwt)) -> str:
    """Dependency to require admin role."""
    admin_role = await get_user_admin_role(user_id)
    if not admin_role["isAdmin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id


@admin_router.get("", response_model=TemplateSubmissionsListResponse)
async def list_all_submissions(
    status: Optional[str] = Query(None, description="Filter by status: pending, approved, rejected"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    user_id: str = Depends(require_admin)
):
    """
    List all template submissions (admin only).

    Use status=pending to see submissions awaiting review.
    """
    try:
        offset = (page - 1) * page_size

        if status == "pending":
            submissions, total = await submissions_repo.get_pending_submissions(
                limit=page_size,
                offset=offset
            )
        else:
            submissions, total = await submissions_repo.get_all_submissions(
                status=status,
                limit=page_size,
                offset=offset
            )

        return TemplateSubmissionsListResponse(
            submissions=[_format_submission_response(s) for s in submissions],
            total=total,
            page=page,
            page_size=page_size,
            has_more=offset + len(submissions) < total
        )

    except Exception as e:
        logger.error(f"Error listing all submissions: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@admin_router.get("/stats", response_model=TemplateSubmissionStatsResponse)
async def get_submission_stats(
    user_id: str = Depends(require_admin)
):
    """
    Get template submission statistics (admin only).
    """
    try:
        stats = await submissions_repo.get_submission_stats()
        return TemplateSubmissionStatsResponse(
            total_submissions=stats.get("total_submissions", 0),
            pending_count=stats.get("pending_count", 0),
            approved_count=stats.get("approved_count", 0),
            rejected_count=stats.get("rejected_count", 0),
            submissions_this_week=stats.get("submissions_this_week", 0),
            avg_review_time_hours=stats.get("avg_review_time_hours"),
        )
    except Exception as e:
        logger.error(f"Error getting submission stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@admin_router.post("/{submission_id}/approve", response_model=TemplateSubmissionResponse)
async def approve_submission(
    submission_id: str,
    request: ApproveSubmissionRequest,
    user_id: str = Depends(require_admin)
):
    """
    Approve a template submission and publish it to the marketplace.

    This creates a new public template from the submitted agent.
    """
    try:
        # Get the submission
        submission = await submissions_repo.get_submission_by_id(submission_id)

        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")

        if submission["status"] != "pending":
            raise HTTPException(status_code=400, detail="Submission has already been reviewed")

        result = await submissions_repo.approve_submission(
            submission_id=submission_id,
            reviewer_id=user_id,
            admin_notes=request.admin_notes
        )

        if not result:
            raise HTTPException(status_code=500, detail="Failed to approve submission")

        logger.info(f"Template submission approved: {submission_id} by admin {user_id}")

        # Send notification email (async, non-blocking)
        try:
            from core.notifications.template_notifications import TemplateNotificationService
            import asyncio
            asyncio.create_task(
                TemplateNotificationService.send_submission_approved(
                    user_id=submission["submitter_id"],
                    template_name=submission["template_name"],
                    template_id=result.get("published_template_id")
                )
            )
        except Exception as notify_err:
            logger.warning(f"Failed to send approval notification: {notify_err}")

        return _format_submission_response(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving submission {submission_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@admin_router.post("/{submission_id}/reject", response_model=TemplateSubmissionResponse)
async def reject_submission(
    submission_id: str,
    request: RejectSubmissionRequest,
    user_id: str = Depends(require_admin)
):
    """
    Reject a template submission.

    The rejection reason will be sent to the user.
    """
    try:
        # Get the submission
        submission = await submissions_repo.get_submission_by_id(submission_id)

        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")

        if submission["status"] != "pending":
            raise HTTPException(status_code=400, detail="Submission has already been reviewed")

        result = await submissions_repo.reject_submission(
            submission_id=submission_id,
            reviewer_id=user_id,
            rejection_reason=request.rejection_reason,
            admin_notes=request.admin_notes
        )

        if not result:
            raise HTTPException(status_code=500, detail="Failed to reject submission")

        logger.info(f"Template submission rejected: {submission_id} by admin {user_id}")

        # Send notification email (async, non-blocking)
        try:
            from core.notifications.template_notifications import TemplateNotificationService
            import asyncio
            asyncio.create_task(
                TemplateNotificationService.send_submission_rejected(
                    user_id=submission["submitter_id"],
                    template_name=submission["template_name"],
                    rejection_reason=request.rejection_reason
                )
            )
        except Exception as notify_err:
            logger.warning(f"Failed to send rejection notification: {notify_err}")

        return _format_submission_response(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting submission {submission_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
