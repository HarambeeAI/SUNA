"""API Models for Organization Invitations

This module contains Pydantic models for invitation CRUD operations.
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Dict, Any, List
from enum import Enum

from core.api_models.organizations import OrganizationRole


class InvitationStatus(str, Enum):
    """Status of an organization invitation."""
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    REVOKED = "revoked"


class InvitationCreateRequest(BaseModel):
    """Request model for creating an invitation."""
    email: EmailStr = Field(..., description="Email address of the person to invite")
    role: OrganizationRole = Field(
        default=OrganizationRole.MEMBER,
        description="Role to assign when invitation is accepted"
    )


class InvitationResponse(BaseModel):
    """Response model for an invitation."""
    id: str
    org_id: str
    email: str
    role: OrganizationRole
    status: InvitationStatus
    invited_by: str
    created_at: str
    expires_at: str
    accepted_at: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class InvitationsListResponse(BaseModel):
    """Response model for listing invitations."""
    invitations: List[InvitationResponse]


class InvitationPublicResponse(BaseModel):
    """Public response model for invitation details (for accept page)."""
    id: str
    org_id: str
    org_name: str
    org_slug: str
    email: str
    role: OrganizationRole
    status: InvitationStatus
    created_at: str
    expires_at: str


class AcceptInvitationResponse(BaseModel):
    """Response model for accepting an invitation."""
    member_id: str
    org_id: str
    message: str = "Successfully joined the organization"
