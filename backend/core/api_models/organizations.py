"""API Models for Organization Management

This module contains Pydantic models for organization CRUD operations.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from enum import Enum


class PlanTier(str, Enum):
    """Plan tier for organizations."""
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class BillingStatus(str, Enum):
    """Billing status for organizations."""
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    TRIALING = "trialing"
    UNPAID = "unpaid"


class OrganizationRole(str, Enum):
    """Role within an organization."""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class OrganizationCreateRequest(BaseModel):
    """Request model for creating an organization."""
    name: str = Field(..., min_length=1, max_length=255, description="Organization name")
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$", description="URL-friendly slug")


class OrganizationUpdateRequest(BaseModel):
    """Request model for updating an organization."""
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Organization name")
    settings: Optional[Dict[str, Any]] = Field(None, description="Organization settings")


class OrganizationMemberResponse(BaseModel):
    """Response model for an organization member."""
    id: str
    user_id: str
    role: OrganizationRole
    joined_at: str
    metadata: Optional[Dict[str, Any]] = None
    # User profile info (populated via join)
    email: Optional[str] = None
    display_name: Optional[str] = None


class OrganizationResponse(BaseModel):
    """Response model for an organization."""
    id: str
    name: str
    slug: str
    plan_tier: PlanTier
    billing_status: BillingStatus
    account_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    settings: Dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    members: Optional[List[OrganizationMemberResponse]] = None


class OrganizationsListResponse(BaseModel):
    """Response model for listing user's organizations."""
    organizations: List[OrganizationResponse]
