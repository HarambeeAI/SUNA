"""Repository functions for organization invitation database operations."""

from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
import secrets

from core.services.db import execute_one, execute_one_read, execute_read, serialize_row, serialize_rows


async def create_invitation(
    org_id: str,
    email: str,
    role: str,
    invited_by_user_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Create a new organization invitation.

    First expires any existing pending invitations for this email/org,
    then creates a new one.
    """
    # Generate a unique token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # Expire any existing pending invitations for this email/org
    expire_sql = """
    UPDATE organization_invitations
    SET status = 'expired'
    WHERE org_id = :org_id
      AND LOWER(email) = LOWER(:email)
      AND status = 'pending'
    """
    await execute_one(expire_sql, {"org_id": org_id, "email": email}, commit=True)

    # Create the new invitation
    sql = """
    INSERT INTO organization_invitations (org_id, email, role, token, invited_by, expires_at)
    VALUES (:org_id, :email, :role, :token, :invited_by, :expires_at)
    RETURNING id, org_id, email, role, token, status, invited_by, created_at, expires_at, metadata
    """

    result = await execute_one(sql, {
        "org_id": org_id,
        "email": email.lower(),
        "role": role,
        "token": token,
        "invited_by": invited_by_user_id,
        "expires_at": expires_at,
    }, commit=True)

    return serialize_row(dict(result)) if result else None


async def get_invitation_by_id(invitation_id: str) -> Optional[Dict[str, Any]]:
    """Get an invitation by its ID."""
    sql = """
    SELECT id, org_id, email, role, token, status, invited_by,
           created_at, expires_at, accepted_at, metadata
    FROM organization_invitations
    WHERE id = :invitation_id
    """

    result = await execute_one_read(sql, {"invitation_id": invitation_id})
    return serialize_row(dict(result)) if result else None


async def get_invitation_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Get an invitation by its token, including organization details."""
    sql = """
    SELECT
        oi.id, oi.org_id, oi.email, oi.role, oi.status, oi.invited_by,
        oi.created_at, oi.expires_at, oi.accepted_at, oi.metadata,
        o.name as org_name, o.slug as org_slug
    FROM organization_invitations oi
    JOIN organizations o ON o.id = oi.org_id
    WHERE oi.token = :token
    """

    result = await execute_one_read(sql, {"token": token})
    if not result:
        return None

    invitation = serialize_row(dict(result))

    # Check if expired but not yet marked
    if invitation['status'] == 'pending':
        expires_at = datetime.fromisoformat(invitation['expires_at'].replace('Z', '+00:00'))
        if expires_at < datetime.now(timezone.utc):
            # Mark as expired
            await update_invitation_status(invitation['id'], 'expired')
            invitation['status'] = 'expired'

    return invitation


async def get_organization_invitations(org_id: str) -> List[Dict[str, Any]]:
    """Get all invitations for an organization."""
    sql = """
    SELECT id, org_id, email, role, status, invited_by,
           created_at, expires_at, accepted_at, metadata
    FROM organization_invitations
    WHERE org_id = :org_id
    ORDER BY created_at DESC
    """

    results = await execute_read(sql, {"org_id": org_id})
    return serialize_rows([dict(r) for r in results])


async def get_pending_invitations_for_email(email: str) -> List[Dict[str, Any]]:
    """Get all pending invitations for an email address."""
    sql = """
    SELECT
        oi.id, oi.org_id, oi.email, oi.role, oi.status, oi.token,
        oi.created_at, oi.expires_at,
        o.name as org_name, o.slug as org_slug
    FROM organization_invitations oi
    JOIN organizations o ON o.id = oi.org_id
    WHERE LOWER(oi.email) = LOWER(:email)
      AND oi.status = 'pending'
      AND oi.expires_at > NOW()
    ORDER BY oi.created_at DESC
    """

    results = await execute_read(sql, {"email": email})
    return serialize_rows([dict(r) for r in results])


async def update_invitation_status(
    invitation_id: str,
    status: str,
    accepted_by_user_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Update an invitation's status."""
    if status == 'accepted':
        sql = """
        UPDATE organization_invitations
        SET status = :status,
            accepted_at = NOW(),
            accepted_by_user_id = :accepted_by
        WHERE id = :invitation_id
        RETURNING *
        """
        params = {
            "invitation_id": invitation_id,
            "status": status,
            "accepted_by": accepted_by_user_id
        }
    else:
        sql = """
        UPDATE organization_invitations
        SET status = :status
        WHERE id = :invitation_id
        RETURNING *
        """
        params = {
            "invitation_id": invitation_id,
            "status": status
        }

    result = await execute_one(sql, params, commit=True)
    return serialize_row(dict(result)) if result else None


async def accept_invitation(
    invitation_id: str,
    user_id: str,
    org_id: str,
    role: str,
    invited_by: str
) -> Optional[str]:
    """
    Accept an invitation - adds user to organization and marks invitation as accepted.

    Returns the new member ID if successful.
    """
    # Add user to organization members
    member_sql = """
    INSERT INTO organization_members (org_id, user_id, role, invited_by, joined_at)
    VALUES (:org_id, :user_id, :role, :invited_by, NOW())
    RETURNING id
    """

    member_result = await execute_one(member_sql, {
        "org_id": org_id,
        "user_id": user_id,
        "role": role,
        "invited_by": invited_by,
    }, commit=True)

    if not member_result:
        return None

    member_id = str(member_result['id'])

    # Mark invitation as accepted
    await update_invitation_status(invitation_id, 'accepted', user_id)

    return member_id


async def check_existing_member(org_id: str, email: str) -> bool:
    """Check if a user with this email is already a member of the organization."""
    sql = """
    SELECT 1
    FROM organization_members om
    JOIN auth.users u ON u.id = om.user_id
    WHERE om.org_id = :org_id
      AND LOWER(u.email) = LOWER(:email)
    """

    result = await execute_one_read(sql, {"org_id": org_id, "email": email})
    return result is not None


async def get_user_email(user_id: str) -> Optional[str]:
    """Get a user's email address."""
    sql = """
    SELECT email FROM auth.users WHERE id = :user_id
    """

    result = await execute_one_read(sql, {"user_id": user_id})
    return result['email'] if result else None


async def expire_old_invitations() -> int:
    """Expire all pending invitations that have passed their expiry date."""
    sql = """
    WITH expired AS (
        UPDATE organization_invitations
        SET status = 'expired'
        WHERE status = 'pending'
          AND expires_at < NOW()
        RETURNING id
    )
    SELECT COUNT(*) as count FROM expired
    """

    result = await execute_one(sql, {}, commit=True)
    return result['count'] if result else 0
