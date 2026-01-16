"""Repository functions for organization database operations."""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from core.services.db import execute_one, execute_one_read, execute_read, execute_mutate, serialize_row, serialize_rows


async def create_organization(
    name: str,
    slug: str,
    creator_user_id: str,
    plan_tier: str = "free"
) -> Optional[Dict[str, Any]]:
    """
    Create a new organization and add the creator as owner.

    This uses a transaction to:
    1. Create a basejump account for the organization
    2. Create the organization record
    3. Add the creator as owner in organization_members
    """
    now = datetime.now(timezone.utc)

    # Use the SQL function that handles all the setup atomically
    sql = """
    SELECT public.create_organization(:name, :slug) as org_id
    """

    result = await execute_one(sql, {
        "name": name,
        "slug": slug,
    }, commit=True)

    if not result or not result.get('org_id'):
        return None

    org_id = str(result['org_id'])

    # Fetch the created organization
    return await get_organization_by_id(org_id)


async def get_organization_by_id(org_id: str) -> Optional[Dict[str, Any]]:
    """Get an organization by its ID."""
    sql = """
    SELECT
        id, name, slug, plan_tier, billing_status, account_id,
        stripe_customer_id, stripe_subscription_id, settings,
        created_at, updated_at
    FROM organizations
    WHERE id = :org_id
    """

    result = await execute_one_read(sql, {"org_id": org_id})
    return serialize_row(dict(result)) if result else None


async def get_organization_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    """Get an organization by its slug."""
    sql = """
    SELECT
        id, name, slug, plan_tier, billing_status, account_id,
        stripe_customer_id, stripe_subscription_id, settings,
        created_at, updated_at
    FROM organizations
    WHERE slug = :slug
    """

    result = await execute_one_read(sql, {"slug": slug})
    return serialize_row(dict(result)) if result else None


async def get_user_organizations(user_id: str) -> List[Dict[str, Any]]:
    """Get all organizations a user belongs to."""
    sql = """
    SELECT
        o.id, o.name, o.slug, o.plan_tier, o.billing_status, o.account_id,
        o.stripe_customer_id, o.stripe_subscription_id, o.settings,
        o.created_at, o.updated_at,
        om.role as member_role
    FROM organizations o
    INNER JOIN organization_members om ON o.id = om.org_id
    WHERE om.user_id = :user_id
    ORDER BY o.created_at DESC
    """

    results = await execute_read(sql, {"user_id": user_id})
    return serialize_rows([dict(r) for r in results])


async def update_organization(
    org_id: str,
    updates: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Update an organization's fields."""
    if not updates:
        return await get_organization_by_id(org_id)

    # Only allow updating specific columns (including Stripe billing fields)
    valid_columns = {
        "name", "slug", "plan_tier", "billing_status", "settings",
        "stripe_customer_id", "stripe_subscription_id"
    }
    filtered_updates = {k: v for k, v in updates.items() if k in valid_columns}

    if not filtered_updates:
        return await get_organization_by_id(org_id)

    # Build SET clause dynamically
    set_parts = [f"{key} = :{key}" for key in filtered_updates.keys()]
    set_parts.append("updated_at = :updated_at")

    sql = f"""
    UPDATE organizations
    SET {', '.join(set_parts)}
    WHERE id = :org_id
    RETURNING *
    """

    params = {
        **filtered_updates,
        "org_id": org_id,
        "updated_at": datetime.now(timezone.utc)
    }

    result = await execute_one(sql, params, commit=True)
    return serialize_row(dict(result)) if result else None


async def get_organization_members(org_id: str) -> List[Dict[str, Any]]:
    """Get all members of an organization with their user info."""
    sql = """
    SELECT
        om.id, om.org_id, om.user_id, om.role, om.invited_by,
        om.joined_at, om.metadata
    FROM organization_members om
    WHERE om.org_id = :org_id
    ORDER BY
        CASE om.role
            WHEN 'owner' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'member' THEN 3
            WHEN 'viewer' THEN 4
        END,
        om.joined_at ASC
    """

    results = await execute_read(sql, {"org_id": org_id})
    return serialize_rows([dict(r) for r in results])


async def get_user_role_in_org(user_id: str, org_id: str) -> Optional[str]:
    """Get a user's role in an organization."""
    sql = """
    SELECT role FROM organization_members
    WHERE user_id = :user_id AND org_id = :org_id
    """

    result = await execute_one_read(sql, {"user_id": user_id, "org_id": org_id})
    return result['role'] if result else None


async def is_org_member(user_id: str, org_id: str) -> bool:
    """Check if a user is a member of an organization."""
    role = await get_user_role_in_org(user_id, org_id)
    return role is not None


async def has_org_permission(user_id: str, org_id: str, min_role: str) -> bool:
    """
    Check if a user has at least the specified role level in an organization.

    Role hierarchy: owner > admin > member > viewer
    """
    role = await get_user_role_in_org(user_id, org_id)
    if not role:
        return False

    role_hierarchy = {"owner": 4, "admin": 3, "member": 2, "viewer": 1}
    user_level = role_hierarchy.get(role, 0)
    required_level = role_hierarchy.get(min_role, 0)

    return user_level >= required_level


async def get_organization_by_stripe_customer_id(stripe_customer_id: str) -> Optional[Dict[str, Any]]:
    """Get an organization by its Stripe customer ID."""
    sql = """
    SELECT
        id, name, slug, plan_tier, billing_status, account_id,
        stripe_customer_id, stripe_subscription_id, settings,
        created_at, updated_at
    FROM organizations
    WHERE stripe_customer_id = :stripe_customer_id
    """

    result = await execute_one_read(sql, {"stripe_customer_id": stripe_customer_id})
    return serialize_row(dict(result)) if result else None


async def update_organization_billing(
    org_id: str,
    plan_tier: Optional[str] = None,
    billing_status: Optional[str] = None,
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Update an organization's billing-related fields.

    This is a specialized update function for billing operations that only
    modifies billing-related columns.
    """
    updates = {}
    if plan_tier is not None:
        updates["plan_tier"] = plan_tier
    if billing_status is not None:
        updates["billing_status"] = billing_status
    if stripe_customer_id is not None:
        updates["stripe_customer_id"] = stripe_customer_id
    if stripe_subscription_id is not None:
        updates["stripe_subscription_id"] = stripe_subscription_id

    if not updates:
        return await get_organization_by_id(org_id)

    # Build SET clause dynamically
    set_parts = [f"{key} = :{key}" for key in updates.keys()]
    set_parts.append("updated_at = :updated_at")

    sql = f"""
    UPDATE organizations
    SET {', '.join(set_parts)}
    WHERE id = :org_id
    RETURNING *
    """

    params = {
        **updates,
        "org_id": org_id,
        "updated_at": datetime.now(timezone.utc)
    }

    result = await execute_one(sql, params, commit=True)
    return serialize_row(dict(result)) if result else None


async def get_organization_owners(org_id: str) -> List[Dict[str, Any]]:
    """Get all owners of an organization for billing notifications."""
    sql = """
    SELECT
        om.user_id,
        om.role
    FROM organization_members om
    WHERE om.org_id = :org_id AND om.role = 'owner'
    """

    results = await execute_read(sql, {"org_id": org_id})
    return serialize_rows([dict(r) for r in results])
