"""Repository functions for template submissions."""

from typing import List, Dict, Any, Optional
from core.services.db import execute, execute_one, execute_one_read, serialize_row
from core.utils.logger import logger
from datetime import datetime, timezone


async def create_submission(
    agent_id: str,
    submitter_id: str,
    template_name: str,
    template_description: Optional[str] = None,
    category_id: Optional[str] = None,
    use_cases: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """Create a new template submission."""
    sql = """
    INSERT INTO template_submissions (
        agent_id, submitter_id, template_name, template_description,
        category_id, use_cases, metadata, status, submitted_at, created_at, updated_at
    )
    VALUES (
        :agent_id, :submitter_id, :template_name, :template_description,
        :category_id, :use_cases, :metadata, 'pending', :now, :now, :now
    )
    RETURNING *
    """

    now = datetime.now(timezone.utc)
    result = await execute_one(sql, {
        "agent_id": agent_id,
        "submitter_id": submitter_id,
        "template_name": template_name,
        "template_description": template_description,
        "category_id": category_id,
        "use_cases": use_cases or [],
        "metadata": metadata or {},
        "now": now
    }, commit=True)

    return serialize_row(dict(result)) if result else None


async def get_submission_by_id(submission_id: str) -> Optional[Dict[str, Any]]:
    """Get a template submission by ID."""
    sql = """
    SELECT * FROM template_submissions WHERE submission_id = :submission_id
    """
    result = await execute_one_read(sql, {"submission_id": submission_id})
    return serialize_row(dict(result)) if result else None


async def get_submission_with_details(submission_id: str) -> Optional[Dict[str, Any]]:
    """Get a template submission with agent and category details."""
    sql = """
    SELECT
        ts.*,
        a.name as agent_name,
        tc.name as category_name,
        u.email as submitter_email
    FROM template_submissions ts
    LEFT JOIN agents a ON ts.agent_id = a.agent_id
    LEFT JOIN template_categories tc ON ts.category_id = tc.id
    LEFT JOIN auth.users u ON ts.submitter_id = u.id
    WHERE ts.submission_id = :submission_id
    """
    result = await execute_one_read(sql, {"submission_id": submission_id})
    return serialize_row(dict(result)) if result else None


async def get_user_submissions(
    user_id: str,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> tuple[List[Dict[str, Any]], int]:
    """Get submissions for a specific user."""
    status_filter = "AND ts.status = :status" if status else ""

    count_sql = f"""
    SELECT COUNT(*) as total
    FROM template_submissions ts
    WHERE ts.submitter_id = :user_id {status_filter}
    """

    list_sql = f"""
    SELECT
        ts.*,
        a.name as agent_name,
        tc.name as category_name
    FROM template_submissions ts
    LEFT JOIN agents a ON ts.agent_id = a.agent_id
    LEFT JOIN template_categories tc ON ts.category_id = tc.id
    WHERE ts.submitter_id = :user_id {status_filter}
    ORDER BY ts.submitted_at DESC
    LIMIT :limit OFFSET :offset
    """

    params = {
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
    }
    if status:
        params["status"] = status

    count_result = await execute_one_read(count_sql, params)
    total = count_result["total"] if count_result else 0

    rows = await execute(list_sql, params, read_only=True)
    submissions = [serialize_row(dict(row)) for row in rows] if rows else []

    return submissions, total


async def get_pending_submissions(
    limit: int = 50,
    offset: int = 0
) -> tuple[List[Dict[str, Any]], int]:
    """Get all pending submissions (for admin review)."""
    count_sql = """
    SELECT COUNT(*) as total
    FROM template_submissions
    WHERE status = 'pending'
    """

    list_sql = """
    SELECT
        ts.*,
        a.name as agent_name,
        tc.name as category_name,
        u.email as submitter_email
    FROM template_submissions ts
    LEFT JOIN agents a ON ts.agent_id = a.agent_id
    LEFT JOIN template_categories tc ON ts.category_id = tc.id
    LEFT JOIN auth.users u ON ts.submitter_id = u.id
    WHERE ts.status = 'pending'
    ORDER BY ts.submitted_at ASC
    LIMIT :limit OFFSET :offset
    """

    count_result = await execute_one_read(count_sql, {})
    total = count_result["total"] if count_result else 0

    rows = await execute(list_sql, {"limit": limit, "offset": offset}, read_only=True)
    submissions = [serialize_row(dict(row)) for row in rows] if rows else []

    return submissions, total


async def get_all_submissions(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> tuple[List[Dict[str, Any]], int]:
    """Get all submissions (for admin view)."""
    status_filter = "WHERE ts.status = :status" if status else ""

    count_sql = f"""
    SELECT COUNT(*) as total
    FROM template_submissions ts
    {status_filter}
    """

    list_sql = f"""
    SELECT
        ts.*,
        a.name as agent_name,
        tc.name as category_name,
        u.email as submitter_email
    FROM template_submissions ts
    LEFT JOIN agents a ON ts.agent_id = a.agent_id
    LEFT JOIN template_categories tc ON ts.category_id = tc.id
    LEFT JOIN auth.users u ON ts.submitter_id = u.id
    {status_filter}
    ORDER BY ts.submitted_at DESC
    LIMIT :limit OFFSET :offset
    """

    params = {"limit": limit, "offset": offset}
    if status:
        params["status"] = status

    count_result = await execute_one_read(count_sql, params)
    total = count_result["total"] if count_result else 0

    rows = await execute(list_sql, params, read_only=True)
    submissions = [serialize_row(dict(row)) for row in rows] if rows else []

    return submissions, total


async def check_existing_pending_submission(agent_id: str) -> bool:
    """Check if there's already a pending submission for this agent."""
    sql = """
    SELECT 1 FROM template_submissions
    WHERE agent_id = :agent_id AND status = 'pending'
    LIMIT 1
    """
    result = await execute_one_read(sql, {"agent_id": agent_id})
    return result is not None


async def verify_agent_ownership(agent_id: str, user_id: str) -> bool:
    """Verify that the user owns the agent."""
    sql = """
    SELECT 1 FROM agents
    WHERE agent_id = :agent_id AND account_id = :user_id
    LIMIT 1
    """
    result = await execute_one_read(sql, {"agent_id": agent_id, "user_id": user_id})
    return result is not None


async def approve_submission(
    submission_id: str,
    reviewer_id: str,
    admin_notes: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Approve a template submission and create the template.
    This uses a transaction to ensure atomicity.
    """
    # First, get the submission and agent details
    submission = await get_submission_by_id(submission_id)
    if not submission or submission["status"] != "pending":
        return None

    # Get agent and version data
    agent_sql = """
    SELECT a.*, av.system_prompt, av.configured_mcps, av.custom_mcps, av.agentpress_tools
    FROM agents a
    JOIN agent_versions av ON a.current_version_id = av.version_id
    WHERE a.agent_id = :agent_id
    """
    agent = await execute_one_read(agent_sql, {"agent_id": submission["agent_id"]})
    if not agent:
        logger.error(f"Agent not found for submission {submission_id}")
        return None

    agent = dict(agent)

    # Build template config
    config = {
        "system_prompt": agent.get("system_prompt", ""),
        "model": agent.get("model"),
        "tools": {
            "agentpress": agent.get("agentpress_tools", {}),
            "mcp": agent.get("configured_mcps", []),
            "custom_mcp": agent.get("custom_mcps", [])
        },
        "metadata": {
            "avatar": agent.get("icon_name"),
            "avatar_color": agent.get("icon_color"),
            "avatar_background": agent.get("icon_background")
        }
    }

    # Build usage examples from use cases
    use_cases = submission.get("use_cases", [])
    usage_examples = [{"role": "user", "content": uc} for uc in use_cases] if use_cases else []

    now = datetime.now(timezone.utc)

    # Create the template
    template_sql = """
    INSERT INTO agent_templates (
        creator_id, name, description, config, category_id,
        tags, is_public, is_kortix_team, marketplace_published_at,
        download_count, template_version, usage_examples, created_at, updated_at
    )
    VALUES (
        :creator_id, :name, :description, :config, :category_id,
        :tags, true, false, :now,
        0, 1, :usage_examples, :now, :now
    )
    RETURNING template_id
    """

    template_result = await execute_one(template_sql, {
        "creator_id": submission["submitter_id"],
        "name": submission["template_name"],
        "description": submission.get("template_description"),
        "config": config,
        "category_id": submission.get("category_id"),
        "tags": [],
        "usage_examples": usage_examples,
        "now": now
    }, commit=True)

    if not template_result:
        logger.error(f"Failed to create template for submission {submission_id}")
        return None

    template_id = template_result["template_id"]

    # Update the submission
    update_sql = """
    UPDATE template_submissions
    SET
        status = 'approved',
        reviewed_at = :now,
        reviewed_by = :reviewer_id,
        admin_notes = :admin_notes,
        published_template_id = :template_id,
        updated_at = :now
    WHERE submission_id = :submission_id
    RETURNING *
    """

    result = await execute_one(update_sql, {
        "submission_id": submission_id,
        "now": now,
        "reviewer_id": reviewer_id,
        "admin_notes": admin_notes,
        "template_id": template_id
    }, commit=True)

    return serialize_row(dict(result)) if result else None


async def reject_submission(
    submission_id: str,
    reviewer_id: str,
    rejection_reason: str,
    admin_notes: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Reject a template submission."""
    sql = """
    UPDATE template_submissions
    SET
        status = 'rejected',
        reviewed_at = :now,
        reviewed_by = :reviewer_id,
        rejection_reason = :rejection_reason,
        admin_notes = :admin_notes,
        updated_at = :now
    WHERE submission_id = :submission_id AND status = 'pending'
    RETURNING *
    """

    result = await execute_one(sql, {
        "submission_id": submission_id,
        "now": datetime.now(timezone.utc),
        "reviewer_id": reviewer_id,
        "rejection_reason": rejection_reason,
        "admin_notes": admin_notes
    }, commit=True)

    return serialize_row(dict(result)) if result else None


async def cancel_submission(submission_id: str, user_id: str) -> bool:
    """Cancel a pending submission (by the submitter)."""
    sql = """
    DELETE FROM template_submissions
    WHERE submission_id = :submission_id
    AND submitter_id = :user_id
    AND status = 'pending'
    """

    await execute_one(sql, {
        "submission_id": submission_id,
        "user_id": user_id
    }, commit=True)

    # Check if deletion succeeded by trying to get the submission
    check = await get_submission_by_id(submission_id)
    return check is None


async def get_submission_stats() -> Dict[str, Any]:
    """Get template submission statistics."""
    sql = """
    SELECT
        COUNT(*)::INTEGER as total_submissions,
        COUNT(*) FILTER (WHERE status = 'pending')::INTEGER as pending_count,
        COUNT(*) FILTER (WHERE status = 'approved')::INTEGER as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected')::INTEGER as rejected_count,
        COUNT(*) FILTER (WHERE submitted_at > NOW() - INTERVAL '7 days')::INTEGER as submissions_this_week,
        ROUND(AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600) FILTER (WHERE reviewed_at IS NOT NULL), 2) as avg_review_time_hours
    FROM template_submissions
    """
    result = await execute_one_read(sql, {})
    return serialize_row(dict(result)) if result else {
        "total_submissions": 0,
        "pending_count": 0,
        "approved_count": 0,
        "rejected_count": 0,
        "submissions_this_week": 0,
        "avg_review_time_hours": None
    }


async def get_user_email(user_id: str) -> Optional[str]:
    """Get user email by user ID."""
    sql = """
    SELECT email FROM auth.users WHERE id = :user_id
    """
    result = await execute_one_read(sql, {"user_id": user_id})
    return result["email"] if result else None
