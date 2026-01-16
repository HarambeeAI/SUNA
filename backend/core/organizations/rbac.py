"""Role-Based Access Control (RBAC) for organizations.

This module defines the role hierarchy and permissions for organization members,
along with FastAPI dependencies for enforcing role-based access control.

Role Hierarchy (highest to lowest):
- owner: Full control including billing and deletion
- admin: Manage members, agents, settings (no billing)
- member: Create and manage own agents, view shared agents
- viewer: Read-only access to organization agents

Usage:
    from core.organizations.rbac import (
        require_org_owner,
        require_org_admin,
        require_org_member,
        require_org_viewer,
        OrgAccessContext,
    )

    @router.delete("/organizations/{org_id}")
    async def delete_organization(
        org_id: str,
        ctx: OrgAccessContext = Depends(require_org_owner)
    ):
        # Only owners can delete organizations
        ...
"""

from enum import Enum
from typing import Optional, Set
from dataclasses import dataclass
from fastapi import HTTPException, Depends, Request

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.organizations import repo as org_repo


class OrganizationRole(str, Enum):
    """Organization member roles in order of decreasing privilege."""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class Permission(str, Enum):
    """Fine-grained permissions that can be assigned to roles."""
    # Organization management
    ORG_DELETE = "org:delete"
    ORG_UPDATE = "org:update"
    ORG_VIEW = "org:view"

    # Billing management
    BILLING_MANAGE = "billing:manage"
    BILLING_VIEW = "billing:view"

    # Member management
    MEMBERS_MANAGE = "members:manage"
    MEMBERS_INVITE = "members:invite"
    MEMBERS_VIEW = "members:view"

    # Agent management
    AGENTS_CREATE = "agents:create"
    AGENTS_DELETE_ANY = "agents:delete_any"
    AGENTS_DELETE_OWN = "agents:delete_own"
    AGENTS_UPDATE_ANY = "agents:update_any"
    AGENTS_UPDATE_OWN = "agents:update_own"
    AGENTS_VIEW = "agents:view"
    AGENTS_RUN = "agents:run"

    # Thread management
    THREADS_CREATE = "threads:create"
    THREADS_DELETE_ANY = "threads:delete_any"
    THREADS_DELETE_OWN = "threads:delete_own"
    THREADS_VIEW = "threads:view"

    # Settings
    SETTINGS_UPDATE = "settings:update"
    SETTINGS_VIEW = "settings:view"


# Role to permissions mapping
ROLE_PERMISSIONS: dict[OrganizationRole, Set[Permission]] = {
    OrganizationRole.OWNER: {
        # Full control
        Permission.ORG_DELETE,
        Permission.ORG_UPDATE,
        Permission.ORG_VIEW,
        Permission.BILLING_MANAGE,
        Permission.BILLING_VIEW,
        Permission.MEMBERS_MANAGE,
        Permission.MEMBERS_INVITE,
        Permission.MEMBERS_VIEW,
        Permission.AGENTS_CREATE,
        Permission.AGENTS_DELETE_ANY,
        Permission.AGENTS_DELETE_OWN,
        Permission.AGENTS_UPDATE_ANY,
        Permission.AGENTS_UPDATE_OWN,
        Permission.AGENTS_VIEW,
        Permission.AGENTS_RUN,
        Permission.THREADS_CREATE,
        Permission.THREADS_DELETE_ANY,
        Permission.THREADS_DELETE_OWN,
        Permission.THREADS_VIEW,
        Permission.SETTINGS_UPDATE,
        Permission.SETTINGS_VIEW,
    },
    OrganizationRole.ADMIN: {
        # Everything except billing and org deletion
        Permission.ORG_UPDATE,
        Permission.ORG_VIEW,
        Permission.BILLING_VIEW,  # Can view but not manage
        Permission.MEMBERS_MANAGE,
        Permission.MEMBERS_INVITE,
        Permission.MEMBERS_VIEW,
        Permission.AGENTS_CREATE,
        Permission.AGENTS_DELETE_ANY,
        Permission.AGENTS_DELETE_OWN,
        Permission.AGENTS_UPDATE_ANY,
        Permission.AGENTS_UPDATE_OWN,
        Permission.AGENTS_VIEW,
        Permission.AGENTS_RUN,
        Permission.THREADS_CREATE,
        Permission.THREADS_DELETE_ANY,
        Permission.THREADS_DELETE_OWN,
        Permission.THREADS_VIEW,
        Permission.SETTINGS_UPDATE,
        Permission.SETTINGS_VIEW,
    },
    OrganizationRole.MEMBER: {
        # Create/manage own, view shared
        Permission.ORG_VIEW,
        Permission.MEMBERS_VIEW,
        Permission.AGENTS_CREATE,
        Permission.AGENTS_DELETE_OWN,
        Permission.AGENTS_UPDATE_OWN,
        Permission.AGENTS_VIEW,
        Permission.AGENTS_RUN,
        Permission.THREADS_CREATE,
        Permission.THREADS_DELETE_OWN,
        Permission.THREADS_VIEW,
        Permission.SETTINGS_VIEW,
    },
    OrganizationRole.VIEWER: {
        # Read-only access
        Permission.ORG_VIEW,
        Permission.MEMBERS_VIEW,
        Permission.AGENTS_VIEW,
        Permission.THREADS_VIEW,
        Permission.SETTINGS_VIEW,
    },
}


# Role hierarchy for permission checks
ROLE_HIERARCHY = {
    OrganizationRole.OWNER: 4,
    OrganizationRole.ADMIN: 3,
    OrganizationRole.MEMBER: 2,
    OrganizationRole.VIEWER: 1,
}


def role_has_permission(role: OrganizationRole, permission: Permission) -> bool:
    """Check if a role has a specific permission."""
    return permission in ROLE_PERMISSIONS.get(role, set())


def role_at_least(role: OrganizationRole, min_role: OrganizationRole) -> bool:
    """Check if a role is at least as privileged as another role."""
    return ROLE_HIERARCHY.get(role, 0) >= ROLE_HIERARCHY.get(min_role, 0)


@dataclass
class OrgAccessContext:
    """Context object containing organization access information.

    This is returned by the RBAC dependency functions and contains
    information about the authenticated user and their role in the organization.
    """
    user_id: str
    org_id: str
    role: OrganizationRole

    def has_permission(self, permission: Permission) -> bool:
        """Check if the user has a specific permission."""
        return role_has_permission(self.role, permission)

    def is_at_least(self, min_role: OrganizationRole) -> bool:
        """Check if the user's role is at least as privileged as the given role."""
        return role_at_least(self.role, min_role)


async def _get_org_access_context(
    org_id: str,
    user_id: str,
    min_role: Optional[OrganizationRole] = None,
    required_permission: Optional[Permission] = None,
) -> OrgAccessContext:
    """
    Internal function to verify organization access and return context.

    Args:
        org_id: The organization ID
        user_id: The authenticated user ID
        min_role: Optional minimum role required
        required_permission: Optional specific permission required

    Returns:
        OrgAccessContext with user's role information

    Raises:
        HTTPException: 403 if user lacks required access
    """
    # Get user's role in the organization
    role_str = await org_repo.get_user_role_in_org(user_id, org_id)

    if not role_str:
        logger.debug(f"User {user_id} is not a member of org {org_id}")
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        role = OrganizationRole(role_str)
    except ValueError:
        logger.error(f"Invalid role '{role_str}' for user {user_id} in org {org_id}")
        raise HTTPException(status_code=500, detail="Invalid role configuration")

    # Check minimum role requirement
    if min_role and not role_at_least(role, min_role):
        logger.debug(
            f"User {user_id} has role {role.value} but requires at least {min_role.value}"
        )
        raise HTTPException(
            status_code=403,
            detail=f"This action requires {min_role.value} role or higher"
        )

    # Check specific permission requirement
    if required_permission and not role_has_permission(role, required_permission):
        logger.debug(
            f"User {user_id} with role {role.value} lacks permission {required_permission.value}"
        )
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to perform this action"
        )

    return OrgAccessContext(user_id=user_id, org_id=org_id, role=role)


# ============================================================================
# FastAPI Dependencies for Role-Based Access Control
# ============================================================================

async def require_org_viewer(
    org_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> OrgAccessContext:
    """
    Require viewer-level access to an organization.

    All organization members (viewer and above) pass this check.
    This is the minimum access level for any organization resource.

    Usage:
        @router.get("/organizations/{org_id}/agents")
        async def list_agents(ctx: OrgAccessContext = Depends(require_org_viewer)):
            ...
    """
    return await _get_org_access_context(
        org_id=org_id,
        user_id=user_id,
        min_role=OrganizationRole.VIEWER
    )


async def require_org_member(
    org_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> OrgAccessContext:
    """
    Require member-level access to an organization.

    Members can create and manage their own agents/threads.
    Viewers are denied access.

    Usage:
        @router.post("/organizations/{org_id}/agents")
        async def create_agent(ctx: OrgAccessContext = Depends(require_org_member)):
            ...
    """
    return await _get_org_access_context(
        org_id=org_id,
        user_id=user_id,
        min_role=OrganizationRole.MEMBER
    )


async def require_org_admin(
    org_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> OrgAccessContext:
    """
    Require admin-level access to an organization.

    Admins can manage members, all agents, and settings.
    Admins cannot manage billing or delete the organization.

    Usage:
        @router.patch("/organizations/{org_id}/settings")
        async def update_settings(ctx: OrgAccessContext = Depends(require_org_admin)):
            ...
    """
    return await _get_org_access_context(
        org_id=org_id,
        user_id=user_id,
        min_role=OrganizationRole.ADMIN
    )


async def require_org_owner(
    org_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> OrgAccessContext:
    """
    Require owner-level access to an organization.

    Owners have full control including billing and deletion.

    Usage:
        @router.delete("/organizations/{org_id}")
        async def delete_organization(ctx: OrgAccessContext = Depends(require_org_owner)):
            ...
    """
    return await _get_org_access_context(
        org_id=org_id,
        user_id=user_id,
        min_role=OrganizationRole.OWNER
    )


async def require_org_permission(
    permission: Permission
):
    """
    Factory function to create a dependency that requires a specific permission.

    Usage:
        @router.post("/organizations/{org_id}/billing/checkout")
        async def create_checkout(
            ctx: OrgAccessContext = Depends(require_org_permission(Permission.BILLING_MANAGE))
        ):
            ...
    """
    async def dependency(
        org_id: str,
        user_id: str = Depends(verify_and_get_user_id_from_jwt)
    ) -> OrgAccessContext:
        return await _get_org_access_context(
            org_id=org_id,
            user_id=user_id,
            required_permission=permission
        )

    return dependency
