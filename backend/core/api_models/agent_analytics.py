"""Agent Analytics API Models

Pydantic models for agent performance monitoring.
Part of US-029: Agent performance monitoring.
"""

from datetime import date, datetime
from typing import Optional, List, Any, Dict
from uuid import UUID
from pydantic import BaseModel, Field


class AgentPerformanceStats(BaseModel):
    """Overall performance statistics for an agent."""
    agent_id: UUID
    agent_name: str

    # Run counts
    total_runs: int = Field(default=0, description="Total runs in the period")
    completed_runs: int = Field(default=0, description="Successfully completed runs")
    failed_runs: int = Field(default=0, description="Failed/errored runs")
    stopped_runs: int = Field(default=0, description="User-stopped runs")

    # Success rate
    success_rate: float = Field(default=0.0, description="Percentage of successful runs")

    # Duration
    avg_duration_seconds: float = Field(default=0.0, description="Average run duration in seconds")

    # Cost and tokens
    total_cost_usd: float = Field(default=0.0, description="Total cost in USD")
    total_tokens: int = Field(default=0, description="Total tokens used")
    total_tool_execution_ms: int = Field(default=0, description="Total tool execution time in ms")

    class Config:
        from_attributes = True


class AgentRunTimelinePoint(BaseModel):
    """Single data point for agent runs timeline chart."""
    date: date
    total_runs: int = Field(default=0, description="Total runs on this day")
    success_count: int = Field(default=0, description="Successful runs on this day")
    failure_count: int = Field(default=0, description="Failed runs on this day")
    stopped_count: int = Field(default=0, description="Stopped runs on this day")

    class Config:
        from_attributes = True


class AgentRunsTimelineResponse(BaseModel):
    """Response for agent runs timeline chart data."""
    agent_id: UUID
    data: List[AgentRunTimelinePoint]
    days: int = Field(default=30, description="Number of days in the timeline")


class SlowToolStats(BaseModel):
    """Statistics for a slow tool."""
    tool_name: str
    execution_count: int = Field(default=0, description="Number of times executed")
    avg_duration_ms: float = Field(default=0.0, description="Average execution time in ms")
    max_duration_ms: int = Field(default=0, description="Maximum execution time in ms")
    min_duration_ms: int = Field(default=0, description="Minimum execution time in ms")
    total_duration_ms: int = Field(default=0, description="Total execution time in ms")
    error_count: int = Field(default=0, description="Number of errors")

    class Config:
        from_attributes = True


class SlowestToolsResponse(BaseModel):
    """Response for slowest tool executions data."""
    agent_id: UUID
    tools: List[SlowToolStats]
    days: int = Field(default=30, description="Analysis period in days")


class AgentRunLogEntry(BaseModel):
    """Single agent run log entry for export."""
    run_id: UUID
    thread_id: Optional[UUID] = None
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    error: Optional[str] = None
    model_name: Optional[str] = None
    cost_usd: Optional[float] = Field(default=0.0)
    input_tokens: Optional[int] = Field(default=0)
    output_tokens: Optional[int] = Field(default=0)
    total_tokens: Optional[int] = Field(default=0)
    tool_execution_ms: Optional[int] = Field(default=0)
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    class Config:
        from_attributes = True


class AgentRunLogsExport(BaseModel):
    """Export response for agent run logs."""
    agent_id: UUID
    agent_name: str
    runs: List[AgentRunLogEntry]
    total_count: int
    exported_at: datetime
    period_start: Optional[date] = None
    period_end: Optional[date] = None


class ToolExecutionDetail(BaseModel):
    """Detailed tool execution record."""
    id: UUID
    agent_run_id: UUID
    tool_name: str
    tool_call_id: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    status: str
    error_message: Optional[str] = None
    input_summary: Optional[str] = None
    output_summary: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    class Config:
        from_attributes = True


class ToolExecutionsResponse(BaseModel):
    """Response for tool executions list."""
    agent_id: UUID
    executions: List[ToolExecutionDetail]
    total_count: int
    page: int = 1
    page_size: int = 50


class AgentAnalyticsDashboard(BaseModel):
    """Full agent analytics dashboard response."""
    stats: AgentPerformanceStats
    runs_timeline: AgentRunsTimelineResponse
    slowest_tools: SlowestToolsResponse
