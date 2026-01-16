"""Pydantic models for auth context endpoints."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from uuid import UUID

from core.api_models.organizations import OrganizationRole, PlanTier, BillingStatus


class OrganizationSummary(BaseModel):
    """Summary of an organization for the auth context."""
    id: UUID
    name: str
    slug: str
    plan_tier: PlanTier
    role: OrganizationRole


class AuthContextResponse(BaseModel):
    """Response for GET /v1/auth/context endpoint."""
    user_id: UUID
    active_org_id: Optional[UUID] = Field(
        None,
        description="The currently active organization ID. None means personal workspace."
    )
    active_org: Optional[OrganizationSummary] = Field(
        None,
        description="Details of the active organization, if any."
    )
    available_organizations: List[OrganizationSummary] = Field(
        default_factory=list,
        description="List of organizations the user belongs to."
    )


class SwitchOrgRequest(BaseModel):
    """Request body for POST /v1/auth/context/switch endpoint."""
    org_id: Optional[UUID] = Field(
        None,
        description="Organization ID to switch to. None to switch to personal workspace."
    )


class SwitchOrgResponse(BaseModel):
    """Response for POST /v1/auth/context/switch endpoint."""
    success: bool
    active_org_id: Optional[UUID] = Field(
        None,
        description="The new active organization ID. None means personal workspace."
    )
    active_org: Optional[OrganizationSummary] = Field(
        None,
        description="Details of the new active organization, if any."
    )
    message: str
