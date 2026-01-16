"""API Models for Organization Billing

This module contains Pydantic models for organization subscription management.
"""

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class OrgPlanTier(str, Enum):
    """Plan tier for organizations."""
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class OrgCheckoutRequest(BaseModel):
    """Request model for creating an organization checkout session."""
    plan_tier: OrgPlanTier = Field(..., description="Target plan tier (pro or enterprise)")
    success_url: str = Field(..., description="URL to redirect on successful checkout")
    cancel_url: Optional[str] = Field(None, description="URL to redirect on cancelled checkout")


class OrgCheckoutResponse(BaseModel):
    """Response model for checkout session creation."""
    checkout_url: str = Field(..., description="Stripe hosted checkout URL")
    session_id: str = Field(..., description="Stripe checkout session ID")
    message: Optional[str] = None


class OrgBillingPortalRequest(BaseModel):
    """Request model for creating a billing portal session."""
    return_url: str = Field(..., description="URL to return to after portal session")


class OrgBillingPortalResponse(BaseModel):
    """Response model for billing portal session."""
    portal_url: str = Field(..., description="Stripe billing portal URL")


class OrgSubscriptionStatusResponse(BaseModel):
    """Response model for organization subscription status."""
    org_id: str
    plan_tier: OrgPlanTier
    billing_status: str
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    has_active_subscription: bool


class UpgradeCTA(BaseModel):
    """Upgrade call-to-action for limit errors."""
    text: str
    url: str
    description: str
