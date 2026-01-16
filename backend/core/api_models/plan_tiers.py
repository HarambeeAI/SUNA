"""Plan Tiers and Usage API Models

Pydantic models for plan tier definitions and organization usage tracking.
Part of US-006: Freemium plan tier schema.
"""

from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field

from .organizations import PlanTier


class PlanTierFeatures(BaseModel):
    """Features included in a plan tier."""
    support_level: str = Field(default="community", description="Support tier: community, email, dedicated")
    api_access: bool = Field(default=False, description="Whether API access is enabled")
    custom_branding: bool = Field(default=False, description="Whether custom branding is allowed")
    priority_execution: bool = Field(default=False, description="Whether agents get priority execution")
    sso: bool = Field(default=False, description="Whether SSO is enabled")
    audit_logs: bool = Field(default=False, description="Whether audit logs are available")
    dedicated_support: bool = Field(default=False, description="Whether dedicated support is available")
    custom_integrations: bool = Field(default=False, description="Whether custom integrations are allowed")
    sla_guarantee: bool = Field(default=False, description="Whether SLA guarantee is included")


class PlanTierResponse(BaseModel):
    """Response model for a plan tier."""
    id: UUID
    tier_name: PlanTier
    display_name: str
    monthly_price_cents: Optional[int] = Field(None, description="Monthly price in cents (null for custom pricing)")
    agent_limit: Optional[int] = Field(None, description="Maximum agents (null for unlimited)")
    run_limit_monthly: Optional[int] = Field(None, description="Maximum monthly runs (null for unlimited)")
    features: PlanTierFeatures

    class Config:
        from_attributes = True


class PlanTiersListResponse(BaseModel):
    """Response model for listing all plan tiers."""
    tiers: list[PlanTierResponse]


class UsagePercentages(BaseModel):
    """Usage percentages relative to plan limits."""
    agents_percent: float = Field(default=0, description="Percentage of agent limit used")
    runs_percent: float = Field(default=0, description="Percentage of run limit used")


class UsageLimits(BaseModel):
    """Plan limits for usage tracking."""
    agent_limit: Optional[int] = Field(None, description="Maximum agents (null for unlimited)")
    run_limit_monthly: Optional[int] = Field(None, description="Maximum monthly runs (null for unlimited)")


class OrganizationUsageResponse(BaseModel):
    """Response model for organization usage with limits."""
    org_id: UUID
    org_name: str
    plan_tier: PlanTier
    period_start: date
    period_end: date
    agents_created: int = Field(default=0, description="Agents created this period")
    runs_executed: int = Field(default=0, description="Agent runs this period")
    total_tokens_used: int = Field(default=0, description="Total tokens used this period")
    estimated_cost_cents: int = Field(default=0, description="Estimated cost in cents")
    limits: UsageLimits
    usage_percentages: UsagePercentages

    class Config:
        from_attributes = True


class UsageRecordResponse(BaseModel):
    """Response model for a single usage record."""
    id: UUID
    org_id: UUID
    period_start: date
    period_end: date
    agents_created: int = Field(default=0)
    runs_executed: int = Field(default=0)
    total_tokens_used: int = Field(default=0)
    estimated_cost_cents: int = Field(default=0)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UsageHistoryResponse(BaseModel):
    """Response model for usage history."""
    usage_records: list[UsageRecordResponse]
    total_records: int
