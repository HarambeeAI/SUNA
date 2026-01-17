"""Usage Dashboard API Models

Pydantic models for organization usage dashboard.
Part of US-020: Organization usage dashboard.
"""

from datetime import date, datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field

from .organizations import PlanTier, BillingStatus


class DashboardStats(BaseModel):
    """Organization dashboard statistics."""
    org_id: UUID
    org_name: str
    plan_tier: PlanTier
    billing_status: BillingStatus
    plan_display_name: str

    # Agent counts
    total_agents: int = Field(default=0, description="Total agents in the organization")
    active_agents: int = Field(default=0, description="Agents used in the last 30 days")

    # Run counts
    total_runs_month: int = Field(default=0, description="Total runs this month")

    # Usage tracking
    total_tokens_used: int = Field(default=0, description="Total tokens used this month")
    estimated_cost_cents: int = Field(default=0, description="Estimated cost in cents")

    # US-024: Cost tracking from agent_runs
    total_cost_usd: float = Field(default=0.0, description="Total cost in USD this month")
    total_input_tokens: int = Field(default=0, description="Total input tokens this month")
    total_output_tokens: int = Field(default=0, description="Total output tokens this month")
    total_tokens: int = Field(default=0, description="Total tokens (input + output) this month")
    total_tool_execution_ms: int = Field(default=0, description="Total tool execution time in milliseconds")

    # Billing period
    period_start: Optional[date] = None
    period_end: Optional[date] = None

    # Limits
    agent_limit: Optional[int] = Field(None, description="Maximum agents (null = unlimited)")
    run_limit_monthly: Optional[int] = Field(None, description="Maximum monthly runs (null = unlimited)")

    # Percentages
    agents_percent: float = Field(default=0, description="Percentage of agent limit used")
    runs_percent: float = Field(default=0, description="Percentage of run limit used")

    class Config:
        from_attributes = True


class TimelineDataPoint(BaseModel):
    """Single data point for runs timeline chart."""
    date: date
    run_count: int = Field(default=0, description="Total runs on this day")
    success_count: int = Field(default=0, description="Successful runs on this day")
    failure_count: int = Field(default=0, description="Failed runs on this day")

    class Config:
        from_attributes = True


class RunsTimelineResponse(BaseModel):
    """Response for runs timeline chart data."""
    data: List[TimelineDataPoint]
    days: int = Field(default=30, description="Number of days in the timeline")


class TopAgentData(BaseModel):
    """Data for a single agent in top agents chart."""
    agent_id: UUID
    agent_name: str
    run_count: int = Field(default=0, description="Total runs by this agent")
    success_count: int = Field(default=0, description="Successful runs")
    failure_count: int = Field(default=0, description="Failed runs")
    success_rate: Optional[float] = Field(None, description="Success rate percentage")

    class Config:
        from_attributes = True


class TopAgentsResponse(BaseModel):
    """Response for top agents bar chart data."""
    agents: List[TopAgentData]
    limit: int = Field(default=10, description="Maximum number of agents returned")


class ActiveUserData(BaseModel):
    """Data for a single user in active users table."""
    user_id: UUID
    role: str
    run_count: int = Field(default=0, description="Total runs by this user")
    success_count: int = Field(default=0, description="Successful runs")
    last_active: Optional[datetime] = Field(None, description="Last activity timestamp")

    class Config:
        from_attributes = True


class ActiveUsersResponse(BaseModel):
    """Response for active users table data."""
    users: List[ActiveUserData]
    limit: int = Field(default=10, description="Maximum number of users returned")


class UsageExportRow(BaseModel):
    """Single row for usage CSV export."""
    run_id: UUID
    agent_name: Optional[str] = None
    thread_id: Optional[UUID] = None
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    error: Optional[str] = None
    model_name: Optional[str] = None
    # US-024: Cost tracking fields
    cost_usd: Optional[float] = Field(default=0.0, description="Cost in USD for this run")
    input_tokens: Optional[int] = Field(default=0, description="Input tokens used")
    output_tokens: Optional[int] = Field(default=0, description="Output tokens generated")
    total_tokens: Optional[int] = Field(default=0, description="Total tokens used")
    tool_execution_ms: Optional[int] = Field(default=0, description="Tool execution time in ms")

    class Config:
        from_attributes = True


class UsageExportResponse(BaseModel):
    """Response for usage export."""
    rows: List[UsageExportRow]
    total_count: int
    period_start: date
    period_end: date


class DashboardResponse(BaseModel):
    """Full dashboard response combining all data."""
    stats: DashboardStats
    runs_timeline: RunsTimelineResponse
    top_agents: TopAgentsResponse
    active_users: ActiveUsersResponse
