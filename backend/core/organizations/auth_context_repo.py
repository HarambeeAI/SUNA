"""Repository functions for user auth context operations."""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from core.services.db import execute_one, execute_one_read, execute_read


async def get_user_active_org_id(user_id: str) -> Optional[str]:
    """Get the user's currently active organization ID."""
    sql = """
    SELECT active_org_id
    FROM user_org_preferences
    WHERE user_id = :user_id
    """

    result = await execute_one_read(sql, {"user_id": user_id})
    if result and result.get("active_org_id"):
        return str(result["active_org_id"])
    return None


async def set_user_active_org(user_id: str, org_id: Optional[str]) -> bool:
    """
    Set the user's active organization.

    Args:
        user_id: The user's ID
        org_id: The organization ID to switch to, or None for personal workspace

    Returns:
        True if successful

    Raises:
        Exception if user is not a member of the organization
    """
    if org_id is not None:
        # Verify user is a member of the organization
        member_check_sql = """
        SELECT 1 FROM organization_members
        WHERE user_id = :user_id AND org_id = :org_id
        """
        result = await execute_one_read(member_check_sql, {
            "user_id": user_id,
            "org_id": org_id
        })

        if not result:
            raise ValueError("User is not a member of this organization")

    # Upsert the preference
    sql = """
    INSERT INTO user_org_preferences (user_id, active_org_id, updated_at)
    VALUES (:user_id, :org_id, :updated_at)
    ON CONFLICT (user_id)
    DO UPDATE SET
        active_org_id = :org_id,
        updated_at = :updated_at
    RETURNING *
    """

    await execute_one(sql, {
        "user_id": user_id,
        "org_id": org_id,
        "updated_at": datetime.now(timezone.utc)
    }, commit=True)

    return True


async def get_user_auth_context(user_id: str) -> Dict[str, Any]:
    """
    Get the user's complete auth context including active org and available orgs.

    Returns a dict with:
        - active_org_id: The currently active organization ID (or None)
        - organizations: List of orgs the user belongs to with role info
    """
    # Get active org preference
    active_org_id = await get_user_active_org_id(user_id)

    # Get all organizations user belongs to
    orgs_sql = """
    SELECT
        o.id,
        o.name,
        o.slug,
        o.plan_tier::text as plan_tier,
        om.role::text as role
    FROM organization_members om
    INNER JOIN organizations o ON o.id = om.org_id
    WHERE om.user_id = :user_id
    ORDER BY o.created_at DESC
    """

    results = await execute_read(orgs_sql, {"user_id": user_id})

    organizations = []
    active_org = None

    for row in results:
        org_data = {
            "id": str(row["id"]),
            "name": row["name"],
            "slug": row["slug"],
            "plan_tier": row["plan_tier"],
            "role": row["role"]
        }
        organizations.append(org_data)

        # If this is the active org, store it
        if active_org_id and str(row["id"]) == active_org_id:
            active_org = org_data

    # If active_org_id is set but org was not found (user removed from org),
    # clear the preference
    if active_org_id and not active_org:
        await set_user_active_org(user_id, None)
        active_org_id = None

    return {
        "user_id": user_id,
        "active_org_id": active_org_id,
        "active_org": active_org,
        "organizations": organizations
    }


async def validate_org_access(user_id: str, org_id: str) -> Optional[str]:
    """
    Validate that a user has access to an organization and return their role.

    Returns the user's role in the org, or None if not a member.
    """
    sql = """
    SELECT role::text as role
    FROM organization_members
    WHERE user_id = :user_id AND org_id = :org_id
    """

    result = await execute_one_read(sql, {
        "user_id": user_id,
        "org_id": org_id
    })

    return result["role"] if result else None
