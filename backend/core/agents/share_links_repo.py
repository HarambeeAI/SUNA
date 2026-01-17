"""Repository functions for agent share links."""

from typing import List, Dict, Any, Optional
from core.services.db import execute, execute_one, serialize_row
from core.utils.logger import logger
from datetime import datetime, timezone, timedelta
import secrets


def generate_share_token() -> str:
    """Generate a unique share token."""
    # Use alphanumeric characters (no ambiguous chars like 0/O, 1/l)
    return secrets.token_urlsafe(24)[:32]


async def create_share_link(
    agent_id: str,
    account_id: str,
    expires_in_days: Optional[int] = None,
    settings: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """Create a new share link for an agent."""
    share_id = generate_share_token()

    expires_at = None
    if expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

    sql = """
    INSERT INTO agent_share_links (
        share_id, agent_id, created_by, expires_at, settings, created_at
    )
    VALUES (
        :share_id, :agent_id, :created_by, :expires_at, :settings, :created_at
    )
    RETURNING *
    """

    result = await execute_one(sql, {
        "share_id": share_id,
        "agent_id": agent_id,
        "created_by": account_id,
        "expires_at": expires_at,
        "settings": settings or {},
        "created_at": datetime.now(timezone.utc)
    }, commit=True)

    return serialize_row(dict(result)) if result else None


async def get_share_link_by_id(share_id: str) -> Optional[Dict[str, Any]]:
    """Get a share link by its ID/token."""
    sql = """
    SELECT * FROM agent_share_links WHERE share_id = :share_id
    """
    result = await execute_one(sql, {"share_id": share_id})
    return serialize_row(dict(result)) if result else None


async def get_share_link_with_agent(share_id: str) -> Optional[Dict[str, Any]]:
    """Get a share link with associated agent info."""
    sql = """
    SELECT
        sl.*,
        a.agent_id,
        a.name as agent_name,
        a.description as agent_description,
        a.icon_name,
        a.icon_color,
        a.icon_background,
        a.account_id as agent_owner_id
    FROM agent_share_links sl
    JOIN agents a ON sl.agent_id = a.agent_id
    WHERE sl.share_id = :share_id
    """
    result = await execute_one(sql, {"share_id": share_id})
    return serialize_row(dict(result)) if result else None


async def get_agent_share_links(
    agent_id: str,
    account_id: str
) -> List[Dict[str, Any]]:
    """Get all share links for an agent."""
    sql = """
    SELECT * FROM agent_share_links
    WHERE agent_id = :agent_id AND created_by = :account_id
    ORDER BY created_at DESC
    """
    rows = await execute(sql, {"agent_id": agent_id, "account_id": account_id})
    return [serialize_row(dict(row)) for row in rows] if rows else []


async def update_share_link(
    share_id: str,
    account_id: str,
    updates: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Update a share link."""
    if not updates:
        return await get_share_link_by_id(share_id)

    valid_columns = {"is_active", "settings", "expires_at"}
    set_parts = []
    params = {"share_id": share_id, "account_id": account_id}

    for key, value in updates.items():
        if key in valid_columns:
            set_parts.append(f"{key} = :{key}")
            params[key] = value

    if not set_parts:
        return await get_share_link_by_id(share_id)

    set_sql = ", ".join(set_parts)

    sql = f"""
    UPDATE agent_share_links
    SET {set_sql}
    WHERE share_id = :share_id AND created_by = :account_id
    RETURNING *
    """

    result = await execute_one(sql, params, commit=True)
    return serialize_row(dict(result)) if result else None


async def revoke_share_link(
    share_id: str,
    account_id: str
) -> bool:
    """Revoke (deactivate) a share link."""
    sql = """
    UPDATE agent_share_links
    SET is_active = false
    WHERE share_id = :share_id AND created_by = :account_id
    RETURNING share_id
    """
    result = await execute_one(sql, {"share_id": share_id, "account_id": account_id}, commit=True)
    return result is not None


async def delete_share_link(
    share_id: str,
    account_id: str
) -> bool:
    """Delete a share link permanently."""
    sql = """
    DELETE FROM agent_share_links
    WHERE share_id = :share_id AND created_by = :account_id
    RETURNING share_id
    """
    result = await execute_one(sql, {"share_id": share_id, "account_id": account_id}, commit=True)
    return result is not None


async def increment_view_count(share_id: str) -> None:
    """Increment the view count for a share link."""
    sql = """
    UPDATE agent_share_links
    SET views_count = views_count + 1, last_viewed_at = :last_viewed_at
    WHERE share_id = :share_id
    """
    await execute_one(sql, {
        "share_id": share_id,
        "last_viewed_at": datetime.now(timezone.utc)
    }, commit=True)


async def increment_run_count(share_id: str) -> None:
    """Increment the run count for a share link."""
    sql = """
    UPDATE agent_share_links
    SET runs_count = runs_count + 1, last_run_at = :last_run_at
    WHERE share_id = :share_id
    """
    await execute_one(sql, {
        "share_id": share_id,
        "last_run_at": datetime.now(timezone.utc)
    }, commit=True)


async def verify_agent_ownership(agent_id: str, account_id: str) -> bool:
    """Verify that the user owns the agent."""
    sql = """
    SELECT 1 FROM agents WHERE agent_id = :agent_id AND account_id = :account_id
    """
    result = await execute_one(sql, {"agent_id": agent_id, "account_id": account_id})
    return result is not None


async def check_share_link_valid(share_id: str) -> Dict[str, Any]:
    """Check if a share link is valid (active and not expired).

    Returns a dict with:
    - valid: bool
    - error: str (if not valid)
    - code: str (error code if not valid)
    - share_link: dict (if valid)
    """
    share_link = await get_share_link_with_agent(share_id)

    if not share_link:
        return {
            "valid": False,
            "error": "Share link not found",
            "code": "LINK_NOT_FOUND"
        }

    if not share_link.get("is_active"):
        return {
            "valid": False,
            "error": "This share link has been deactivated",
            "code": "LINK_DEACTIVATED"
        }

    expires_at = share_link.get("expires_at")
    if expires_at:
        # Handle string dates
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        if expires_at < datetime.now(timezone.utc):
            return {
                "valid": False,
                "error": "This share link has expired",
                "code": "LINK_EXPIRED"
            }

    return {
        "valid": True,
        "share_link": share_link
    }
