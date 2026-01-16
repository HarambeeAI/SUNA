"""API endpoints for managing user auth context (organization switching)."""

from fastapi import APIRouter, Depends, HTTPException, Request
from uuid import UUID

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.api_models.auth_context import (
    OrganizationSummary,
    AuthContextResponse,
    SwitchOrgRequest,
    SwitchOrgResponse,
)
from core.api_models.organizations import OrganizationRole, PlanTier
from core.organizations import auth_context_repo

router = APIRouter(prefix="/v1/auth", tags=["auth-context"])


@router.get("/context", response_model=AuthContextResponse)
async def get_auth_context(
    request: Request,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Get the current authentication context.

    Returns:
        - The user's ID
        - The currently active organization (if any)
        - List of all organizations the user belongs to
    """
    context = await auth_context_repo.get_user_auth_context(user_id)

    # Convert to response model
    available_orgs = [
        OrganizationSummary(
            id=UUID(org["id"]),
            name=org["name"],
            slug=org["slug"],
            plan_tier=PlanTier(org["plan_tier"]),
            role=OrganizationRole(org["role"])
        )
        for org in context["organizations"]
    ]

    active_org = None
    if context["active_org"]:
        active_org = OrganizationSummary(
            id=UUID(context["active_org"]["id"]),
            name=context["active_org"]["name"],
            slug=context["active_org"]["slug"],
            plan_tier=PlanTier(context["active_org"]["plan_tier"]),
            role=OrganizationRole(context["active_org"]["role"])
        )

    return AuthContextResponse(
        user_id=UUID(user_id),
        active_org_id=UUID(context["active_org_id"]) if context["active_org_id"] else None,
        active_org=active_org,
        available_organizations=available_orgs
    )


@router.post("/context/switch", response_model=SwitchOrgResponse)
async def switch_organization(
    request: Request,
    body: SwitchOrgRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Switch the active organization context.

    Pass org_id to switch to an organization, or null/omit to switch to personal workspace.

    Returns:
        - Success status
        - The new active organization (if any)
        - A confirmation message
    """
    org_id_str = str(body.org_id) if body.org_id else None

    try:
        await auth_context_repo.set_user_active_org(user_id, org_id_str)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Get the updated context
    context = await auth_context_repo.get_user_auth_context(user_id)

    active_org = None
    if context["active_org"]:
        active_org = OrganizationSummary(
            id=UUID(context["active_org"]["id"]),
            name=context["active_org"]["name"],
            slug=context["active_org"]["slug"],
            plan_tier=PlanTier(context["active_org"]["plan_tier"]),
            role=OrganizationRole(context["active_org"]["role"])
        )

    if body.org_id:
        message = f"Switched to organization: {active_org.name}" if active_org else "Switched to organization"
    else:
        message = "Switched to personal workspace"

    return SwitchOrgResponse(
        success=True,
        active_org_id=UUID(context["active_org_id"]) if context["active_org_id"] else None,
        active_org=active_org,
        message=message
    )
