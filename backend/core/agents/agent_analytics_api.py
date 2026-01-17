"""Agent Analytics API

FastAPI router for agent performance monitoring endpoints.
Part of US-029: Agent performance monitoring.
"""

from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from core.utils.logger import logger
from core.utils.auth_utils import get_current_user
from core.api_models.agent_analytics import (
    AgentPerformanceStats,
    AgentRunTimelinePoint,
    AgentRunsTimelineResponse,
    SlowToolStats,
    SlowestToolsResponse,
    AgentRunLogEntry,
    AgentRunLogsExport,
    ToolExecutionDetail,
    ToolExecutionsResponse,
    AgentAnalyticsDashboard,
)
from core.agents import agent_analytics_repo

router = APIRouter(prefix="/agents", tags=["agent-analytics"])


@router.get("/{agent_id}/analytics", response_model=AgentAnalyticsDashboard)
async def get_agent_analytics_dashboard(
    agent_id: UUID,
    days: int = Query(default=30, ge=1, le=365, description="Analysis period in days"),
    user_id: str = Depends(get_current_user),
):
    """
    Get full analytics dashboard for an agent.

    Returns:
    - Performance stats (total runs, success rate, avg duration, cost)
    - Runs timeline chart data (success/failure breakdown by day)
    - Slowest tool executions

    Requires user to have access to the agent.
    """
    # Verify user has access to this agent
    has_access = await agent_analytics_repo.verify_agent_access(
        str(agent_id), user_id
    )
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this agent"
        )

    # Get all dashboard data in parallel
    import asyncio
    stats_task = agent_analytics_repo.get_agent_performance_stats(str(agent_id), days)
    timeline_task = agent_analytics_repo.get_agent_runs_timeline(str(agent_id), days)
    tools_task = agent_analytics_repo.get_agent_slowest_tools(str(agent_id), days)

    stats_data, timeline_data, tools_data = await asyncio.gather(
        stats_task, timeline_task, tools_task
    )

    if not stats_data:
        raise HTTPException(
            status_code=404,
            detail="Agent not found"
        )

    # Build response
    stats = AgentPerformanceStats(
        agent_id=agent_id,
        agent_name=stats_data.get("agent_name", "Unknown"),
        total_runs=stats_data.get("total_runs", 0),
        completed_runs=stats_data.get("completed_runs", 0),
        failed_runs=stats_data.get("failed_runs", 0),
        stopped_runs=stats_data.get("stopped_runs", 0),
        success_rate=float(stats_data.get("success_rate", 0)),
        avg_duration_seconds=float(stats_data.get("avg_duration_seconds", 0)),
        total_cost_usd=float(stats_data.get("total_cost_usd", 0)),
        total_tokens=int(stats_data.get("total_tokens", 0)),
        total_tool_execution_ms=int(stats_data.get("total_tool_execution_ms", 0)),
    )

    timeline = AgentRunsTimelineResponse(
        agent_id=agent_id,
        data=[
            AgentRunTimelinePoint(
                date=row["date"],
                total_runs=row.get("total_runs", 0),
                success_count=row.get("success_count", 0),
                failure_count=row.get("failure_count", 0),
                stopped_count=row.get("stopped_count", 0),
            )
            for row in timeline_data
        ],
        days=days,
    )

    slowest_tools = SlowestToolsResponse(
        agent_id=agent_id,
        tools=[
            SlowToolStats(
                tool_name=row["tool_name"],
                execution_count=row.get("execution_count", 0),
                avg_duration_ms=float(row.get("avg_duration_ms", 0)),
                max_duration_ms=row.get("max_duration_ms", 0) or 0,
                min_duration_ms=row.get("min_duration_ms", 0) or 0,
                total_duration_ms=row.get("total_duration_ms", 0) or 0,
                error_count=row.get("error_count", 0),
            )
            for row in tools_data
        ],
        days=days,
    )

    return AgentAnalyticsDashboard(
        stats=stats,
        runs_timeline=timeline,
        slowest_tools=slowest_tools,
    )


@router.get("/{agent_id}/analytics/stats", response_model=AgentPerformanceStats)
async def get_agent_stats(
    agent_id: UUID,
    days: int = Query(default=30, ge=1, le=365, description="Analysis period in days"),
    user_id: str = Depends(get_current_user),
):
    """
    Get performance statistics for an agent.

    Returns total runs, success rate, average duration, and cost data.
    """
    has_access = await agent_analytics_repo.verify_agent_access(
        str(agent_id), user_id
    )
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this agent"
        )

    stats_data = await agent_analytics_repo.get_agent_performance_stats(
        str(agent_id), days
    )

    if not stats_data:
        raise HTTPException(
            status_code=404,
            detail="Agent not found"
        )

    return AgentPerformanceStats(
        agent_id=agent_id,
        agent_name=stats_data.get("agent_name", "Unknown"),
        total_runs=stats_data.get("total_runs", 0),
        completed_runs=stats_data.get("completed_runs", 0),
        failed_runs=stats_data.get("failed_runs", 0),
        stopped_runs=stats_data.get("stopped_runs", 0),
        success_rate=float(stats_data.get("success_rate", 0)),
        avg_duration_seconds=float(stats_data.get("avg_duration_seconds", 0)),
        total_cost_usd=float(stats_data.get("total_cost_usd", 0)),
        total_tokens=int(stats_data.get("total_tokens", 0)),
        total_tool_execution_ms=int(stats_data.get("total_tool_execution_ms", 0)),
    )


@router.get("/{agent_id}/analytics/timeline", response_model=AgentRunsTimelineResponse)
async def get_agent_timeline(
    agent_id: UUID,
    days: int = Query(default=30, ge=1, le=365, description="Analysis period in days"),
    user_id: str = Depends(get_current_user),
):
    """
    Get runs timeline chart data for an agent.

    Returns daily run counts with success/failure breakdown.
    """
    has_access = await agent_analytics_repo.verify_agent_access(
        str(agent_id), user_id
    )
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this agent"
        )

    timeline_data = await agent_analytics_repo.get_agent_runs_timeline(
        str(agent_id), days
    )

    return AgentRunsTimelineResponse(
        agent_id=agent_id,
        data=[
            AgentRunTimelinePoint(
                date=row["date"],
                total_runs=row.get("total_runs", 0),
                success_count=row.get("success_count", 0),
                failure_count=row.get("failure_count", 0),
                stopped_count=row.get("stopped_count", 0),
            )
            for row in timeline_data
        ],
        days=days,
    )


@router.get("/{agent_id}/analytics/tools", response_model=SlowestToolsResponse)
async def get_agent_slowest_tools(
    agent_id: UUID,
    days: int = Query(default=30, ge=1, le=365, description="Analysis period in days"),
    limit: int = Query(default=10, ge=1, le=50, description="Maximum tools to return"),
    user_id: str = Depends(get_current_user),
):
    """
    Get slowest tool executions for an agent.

    Returns tool execution statistics sorted by average duration.
    Useful for identifying performance bottlenecks.
    """
    has_access = await agent_analytics_repo.verify_agent_access(
        str(agent_id), user_id
    )
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this agent"
        )

    tools_data = await agent_analytics_repo.get_agent_slowest_tools(
        str(agent_id), days, limit
    )

    return SlowestToolsResponse(
        agent_id=agent_id,
        tools=[
            SlowToolStats(
                tool_name=row["tool_name"],
                execution_count=row.get("execution_count", 0),
                avg_duration_ms=float(row.get("avg_duration_ms", 0)),
                max_duration_ms=row.get("max_duration_ms", 0) or 0,
                min_duration_ms=row.get("min_duration_ms", 0) or 0,
                total_duration_ms=row.get("total_duration_ms", 0) or 0,
                error_count=row.get("error_count", 0),
            )
            for row in tools_data
        ],
        days=days,
    )


@router.get("/{agent_id}/analytics/logs/export", response_model=AgentRunLogsExport)
async def export_agent_run_logs(
    agent_id: UUID,
    days: Optional[int] = Query(default=30, ge=1, le=365, description="Analysis period in days"),
    user_id: str = Depends(get_current_user),
):
    """
    Export agent run logs as JSON for debugging.

    Returns detailed run information including:
    - Status, timing, and error information
    - Cost and token usage
    - Model and metadata
    """
    has_access = await agent_analytics_repo.verify_agent_access(
        str(agent_id), user_id
    )
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this agent"
        )

    # Get agent name
    agent_name = await agent_analytics_repo.get_agent_name(str(agent_id))
    if not agent_name:
        raise HTTPException(
            status_code=404,
            detail="Agent not found"
        )

    # Get run logs and count
    import asyncio
    logs_task = agent_analytics_repo.get_agent_run_logs(str(agent_id), days)
    count_task = agent_analytics_repo.get_agent_run_logs_count(str(agent_id), days)

    logs_data, total_count = await asyncio.gather(logs_task, count_task)

    runs = [
        AgentRunLogEntry(
            run_id=row["run_id"],
            thread_id=row.get("thread_id"),
            status=row.get("status", "unknown"),
            started_at=row["started_at"],
            completed_at=row.get("completed_at"),
            duration_seconds=float(row["duration_seconds"]) if row.get("duration_seconds") else None,
            error=row.get("error"),
            model_name=row.get("model_name"),
            cost_usd=float(row.get("cost_usd", 0) or 0),
            input_tokens=int(row.get("input_tokens", 0) or 0),
            output_tokens=int(row.get("output_tokens", 0) or 0),
            total_tokens=int(row.get("total_tokens", 0) or 0),
            tool_execution_ms=int(row.get("tool_execution_ms", 0) or 0),
            metadata=row.get("metadata") or {},
        )
        for row in logs_data
    ]

    now = datetime.now(timezone.utc)
    return AgentRunLogsExport(
        agent_id=agent_id,
        agent_name=agent_name,
        runs=runs,
        total_count=total_count,
        exported_at=now,
        period_start=(now - (days or 30) * 86400 * 1000000).date() if days else None,  # Will be calculated properly
        period_end=now.date(),
    )


@router.get("/{agent_id}/analytics/tool-executions", response_model=ToolExecutionsResponse)
async def get_tool_executions(
    agent_id: UUID,
    days: int = Query(default=30, ge=1, le=365, description="Analysis period in days"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=100, description="Items per page"),
    user_id: str = Depends(get_current_user),
):
    """
    Get detailed tool execution records for an agent.

    Returns individual tool execution entries sorted by duration (slowest first).
    """
    has_access = await agent_analytics_repo.verify_agent_access(
        str(agent_id), user_id
    )
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this agent"
        )

    offset = (page - 1) * page_size

    import asyncio
    executions_task = agent_analytics_repo.get_tool_executions_for_agent(
        str(agent_id), days, page_size, offset
    )
    count_task = agent_analytics_repo.get_tool_executions_count(str(agent_id), days)

    executions_data, total_count = await asyncio.gather(executions_task, count_task)

    executions = [
        ToolExecutionDetail(
            id=row["id"],
            agent_run_id=row["agent_run_id"],
            tool_name=row["tool_name"],
            tool_call_id=row.get("tool_call_id"),
            started_at=row["started_at"],
            completed_at=row.get("completed_at"),
            duration_ms=row.get("duration_ms"),
            status=row.get("status", "unknown"),
            error_message=row.get("error_message"),
            input_summary=row.get("input_summary"),
            output_summary=row.get("output_summary"),
            metadata=row.get("metadata") or {},
        )
        for row in executions_data
    ]

    return ToolExecutionsResponse(
        agent_id=agent_id,
        executions=executions,
        total_count=total_count,
        page=page,
        page_size=page_size,
    )
