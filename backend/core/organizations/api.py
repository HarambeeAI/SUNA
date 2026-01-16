"""API endpoints for organization management.

Endpoints:
- POST /organizations - Create a new organization
- GET /organizations/:id - Get organization details with member list
- PATCH /organizations/:id - Update organization name/settings
- DELETE /organizations/:id - Delete an organization (owner only)

Role-based access control:
- viewer: Can view organization details
- member: Can view organization details
- admin: Can update organization name/settings
- owner: Full control including deletion and billing
"""

from fastapi import APIRouter, HTTPException, Depends

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.api_models.organizations import (
    OrganizationCreateRequest,
    OrganizationUpdateRequest,
    OrganizationResponse,
    OrganizationMemberResponse,
    OrganizationsListResponse,
)
from core.organizations import repo as org_repo
from core.organizations.rbac import (
    OrgAccessContext,
    require_org_owner,
    require_org_admin,
    require_org_viewer,
)


router = APIRouter(tags=["organizations"])


@router.post("/organizations", response_model=OrganizationResponse, summary="Create Organization", operation_id="create_organization")
async def create_organization(
    org_data: OrganizationCreateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Create a new organization.

    The authenticated user becomes the owner of the organization.
    """
    logger.debug(f"Creating organization '{org_data.slug}' for user {user_id}")

    try:
        # Check if slug is already taken
        existing = await org_repo.get_organization_by_slug(org_data.slug)
        if existing:
            raise HTTPException(status_code=400, detail="Organization slug is already taken")

        # Create the organization
        org = await org_repo.create_organization(
            name=org_data.name,
            slug=org_data.slug,
            creator_user_id=user_id,
        )

        if not org:
            raise HTTPException(status_code=500, detail="Failed to create organization")

        logger.info(f"Organization '{org_data.slug}' created with id {org['id']} by user {user_id}")

        return OrganizationResponse(**org)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating organization: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create organization: {str(e)}")


@router.get("/organizations/{org_id}", response_model=OrganizationResponse, summary="Get Organization", operation_id="get_organization")
async def get_organization(
    org_id: str,
    ctx: OrgAccessContext = Depends(require_org_viewer)
):
    """
    Get organization details with member list.

    Requires: viewer role or higher (any organization member)
    """
    logger.debug(f"Fetching organization {org_id} for user {ctx.user_id}")

    try:
        # Get the organization
        org = await org_repo.get_organization_by_id(org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        # Get members
        members = await org_repo.get_organization_members(org_id)
        member_responses = [
            OrganizationMemberResponse(
                id=m['id'],
                user_id=m['user_id'],
                role=m['role'],
                joined_at=m['joined_at'],
                metadata=m.get('metadata'),
            )
            for m in members
        ]

        return OrganizationResponse(
            **org,
            members=member_responses
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching organization {org_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch organization")


@router.patch("/organizations/{org_id}", response_model=OrganizationResponse, summary="Update Organization", operation_id="update_organization")
async def update_organization(
    org_id: str,
    org_data: OrganizationUpdateRequest,
    ctx: OrgAccessContext = Depends(require_org_admin)
):
    """
    Update organization name/settings.

    Requires: admin role or higher
    """
    logger.debug(f"Updating organization {org_id} by user {ctx.user_id}")

    try:
        # Check if organization exists
        org = await org_repo.get_organization_by_id(org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        # Build updates dict (only non-None values)
        updates = {}
        if org_data.name is not None:
            updates['name'] = org_data.name
        if org_data.settings is not None:
            updates['settings'] = org_data.settings

        if not updates:
            # No changes, return existing organization
            return OrganizationResponse(**org)

        # Update the organization
        updated_org = await org_repo.update_organization(org_id, updates)
        if not updated_org:
            raise HTTPException(status_code=500, detail="Failed to update organization")

        logger.info(f"Organization {org_id} updated by user {ctx.user_id}")

        return OrganizationResponse(**updated_org)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating organization {org_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update organization")


@router.get("/organizations", response_model=OrganizationsListResponse, summary="List User Organizations", operation_id="list_organizations")
async def list_organizations(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    List all organizations the authenticated user belongs to.
    """
    logger.debug(f"Listing organizations for user {user_id}")

    try:
        orgs = await org_repo.get_user_organizations(user_id)

        org_responses = [
            OrganizationResponse(
                id=org['id'],
                name=org['name'],
                slug=org['slug'],
                plan_tier=org['plan_tier'],
                billing_status=org['billing_status'],
                account_id=org.get('account_id'),
                stripe_customer_id=org.get('stripe_customer_id'),
                stripe_subscription_id=org.get('stripe_subscription_id'),
                settings=org.get('settings', {}),
                created_at=org['created_at'],
                updated_at=org['updated_at'],
            )
            for org in orgs
        ]

        return OrganizationsListResponse(organizations=org_responses)

    except Exception as e:
        logger.error(f"Error listing organizations for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list organizations")
