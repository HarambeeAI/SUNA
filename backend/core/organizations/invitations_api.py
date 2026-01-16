"""API endpoints for organization invitations.

Endpoints:
- POST /organizations/:id/invitations - Create/send a new invitation
- GET /organizations/:id/invitations - List invitations for an organization
- POST /invitations/:token/accept - Accept an invitation
- GET /invitations/:token - Get invitation details (public)
- DELETE /organizations/:id/invitations/:invitation_id - Revoke an invitation
"""

from fastapi import APIRouter, HTTPException, Depends

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.api_models.invitations import (
    InvitationCreateRequest,
    InvitationResponse,
    InvitationsListResponse,
    InvitationPublicResponse,
    AcceptInvitationResponse,
)
from core.organizations import repo as org_repo
from core.organizations import invitations_repo


router = APIRouter(tags=["invitations"])


@router.post(
    "/organizations/{org_id}/invitations",
    response_model=InvitationResponse,
    summary="Create Invitation",
    operation_id="create_invitation"
)
async def create_invitation(
    org_id: str,
    invitation_data: InvitationCreateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Create and send an organization invitation.

    Only organization owners and admins can send invitations.
    Admins cannot invite users as owner or admin.
    """
    logger.debug(f"Creating invitation to {invitation_data.email} for org {org_id} by user {user_id}")

    try:
        # Check if user has permission (owner or admin)
        has_permission = await org_repo.has_org_permission(user_id, org_id, "admin")
        if not has_permission:
            raise HTTPException(status_code=403, detail="Only owners and admins can send invitations")

        # Get user's role to check if admin is trying to invite as owner/admin
        user_role = await org_repo.get_user_role_in_org(user_id, org_id)
        if user_role == "admin" and invitation_data.role.value in ["owner", "admin"]:
            raise HTTPException(
                status_code=403,
                detail="Admins cannot invite users as owner or admin"
            )

        # Check if organization exists
        org = await org_repo.get_organization_by_id(org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        # Check if user is already a member
        is_existing_member = await invitations_repo.check_existing_member(
            org_id, invitation_data.email
        )
        if is_existing_member:
            raise HTTPException(
                status_code=400,
                detail="User is already a member of this organization"
            )

        # Create the invitation
        invitation = await invitations_repo.create_invitation(
            org_id=org_id,
            email=invitation_data.email,
            role=invitation_data.role.value,
            invited_by_user_id=user_id,
        )

        if not invitation:
            raise HTTPException(status_code=500, detail="Failed to create invitation")

        logger.info(f"Invitation created for {invitation_data.email} to org {org_id}")

        # TODO: Send invitation email with accept/decline links
        # The email should contain: invitation['token']
        # Accept URL: /invitations/{token}/accept
        # This will be implemented when email service is set up

        return InvitationResponse(**invitation)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating invitation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create invitation: {str(e)}")


@router.get(
    "/organizations/{org_id}/invitations",
    response_model=InvitationsListResponse,
    summary="List Organization Invitations",
    operation_id="list_organization_invitations"
)
async def list_organization_invitations(
    org_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    List all invitations for an organization.

    Only organization members can view invitations.
    """
    logger.debug(f"Listing invitations for org {org_id} by user {user_id}")

    try:
        # Check if user is a member
        is_member = await org_repo.is_org_member(user_id, org_id)
        if not is_member:
            raise HTTPException(status_code=403, detail="Access denied")

        # Get invitations
        invitations = await invitations_repo.get_organization_invitations(org_id)

        invitation_responses = [
            InvitationResponse(
                id=inv['id'],
                org_id=inv['org_id'],
                email=inv['email'],
                role=inv['role'],
                status=inv['status'],
                invited_by=inv['invited_by'],
                created_at=inv['created_at'],
                expires_at=inv['expires_at'],
                accepted_at=inv.get('accepted_at'),
                metadata=inv.get('metadata'),
            )
            for inv in invitations
        ]

        return InvitationsListResponse(invitations=invitation_responses)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing invitations for org {org_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list invitations")


@router.get(
    "/invitations/{token}",
    response_model=InvitationPublicResponse,
    summary="Get Invitation by Token",
    operation_id="get_invitation_by_token"
)
async def get_invitation_by_token(token: str):
    """
    Get invitation details by token.

    This is a public endpoint that doesn't require authentication,
    allowing users to view invitation details before signing in.
    """
    logger.debug(f"Fetching invitation by token")

    try:
        invitation = await invitations_repo.get_invitation_by_token(token)

        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        return InvitationPublicResponse(
            id=invitation['id'],
            org_id=invitation['org_id'],
            org_name=invitation['org_name'],
            org_slug=invitation['org_slug'],
            email=invitation['email'],
            role=invitation['role'],
            status=invitation['status'],
            created_at=invitation['created_at'],
            expires_at=invitation['expires_at'],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invitation by token: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch invitation")


@router.post(
    "/invitations/{token}/accept",
    response_model=AcceptInvitationResponse,
    summary="Accept Invitation",
    operation_id="accept_invitation"
)
async def accept_invitation(
    token: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Accept an organization invitation.

    The authenticated user's email must match the invitation email.
    """
    logger.debug(f"User {user_id} accepting invitation")

    try:
        # Get the invitation
        invitation = await invitations_repo.get_invitation_by_token(token)

        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        # Check if invitation is still pending
        if invitation['status'] != 'pending':
            raise HTTPException(
                status_code=400,
                detail=f"Invitation is no longer valid (status: {invitation['status']})"
            )

        # Get user's email
        user_email = await invitations_repo.get_user_email(user_id)
        if not user_email:
            raise HTTPException(status_code=400, detail="User email not found")

        # Check if email matches
        if user_email.lower() != invitation['email'].lower():
            raise HTTPException(
                status_code=403,
                detail="This invitation was sent to a different email address"
            )

        # Check if user is already a member
        is_member = await org_repo.is_org_member(user_id, invitation['org_id'])
        if is_member:
            # Mark invitation as accepted anyway for tracking
            await invitations_repo.update_invitation_status(
                invitation['id'], 'accepted', user_id
            )
            raise HTTPException(
                status_code=400,
                detail="You are already a member of this organization"
            )

        # Accept the invitation (adds user to org and marks invitation as accepted)
        member_id = await invitations_repo.accept_invitation(
            invitation_id=invitation['id'],
            user_id=user_id,
            org_id=invitation['org_id'],
            role=invitation['role'],
            invited_by=invitation['invited_by'],
        )

        if not member_id:
            raise HTTPException(status_code=500, detail="Failed to accept invitation")

        logger.info(f"User {user_id} accepted invitation to org {invitation['org_id']}")

        return AcceptInvitationResponse(
            member_id=member_id,
            org_id=invitation['org_id'],
            message="Successfully joined the organization"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting invitation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to accept invitation: {str(e)}")


@router.delete(
    "/organizations/{org_id}/invitations/{invitation_id}",
    summary="Revoke Invitation",
    operation_id="revoke_invitation"
)
async def revoke_invitation(
    org_id: str,
    invitation_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Revoke a pending invitation.

    Only organization owners and admins can revoke invitations.
    """
    logger.debug(f"Revoking invitation {invitation_id} in org {org_id} by user {user_id}")

    try:
        # Check if user has permission (owner or admin)
        has_permission = await org_repo.has_org_permission(user_id, org_id, "admin")
        if not has_permission:
            raise HTTPException(
                status_code=403,
                detail="Only owners and admins can revoke invitations"
            )

        # Get the invitation
        invitation = await invitations_repo.get_invitation_by_id(invitation_id)

        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        # Verify invitation belongs to this org
        if invitation['org_id'] != org_id:
            raise HTTPException(status_code=404, detail="Invitation not found")

        # Check if invitation is still pending
        if invitation['status'] != 'pending':
            raise HTTPException(
                status_code=400,
                detail=f"Cannot revoke invitation with status: {invitation['status']}"
            )

        # Revoke the invitation
        await invitations_repo.update_invitation_status(invitation_id, 'revoked')

        logger.info(f"Invitation {invitation_id} revoked by user {user_id}")

        return {"message": "Invitation revoked successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking invitation {invitation_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to revoke invitation")
