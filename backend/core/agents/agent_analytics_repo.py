"""Repository functions for agent performance analytics.

Part of US-029: Agent performance monitoring.
Provides queries for per-agent statistics, charts, and exports.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from core.services.db import execute_one_read, execute_read, serialize_row, serialize_rows


async def get_agent_performance_stats(
    agent_id: str,
    days: int = 30
) -> Optional[Dict[str, Any]]:
    """
    Get performance statistics for a specific agent.

    Returns:
        - total_runs, completed_runs, failed_runs, stopped_runs
        - success_rate (percentage)
        - avg_duration_seconds
        - total_cost_usd, total_tokens, total_tool_execution_ms
    """
    sql = """
    SELECT
        a.agent_id,
        a.name as agent_name,
        COUNT(ar.id)::BIGINT as total_runs,
        COUNT(CASE WHEN ar.status = 'completed' AND ar.error IS NULL THEN 1 END)::BIGINT as completed_runs,
        COUNT(CASE WHEN ar.status IN ('failed', 'error') OR ar.error IS NOT NULL THEN 1 END)::BIGINT as failed_runs,
        COUNT(CASE WHEN ar.status = 'stopped' THEN 1 END)::BIGINT as stopped_runs,
        CASE
            WHEN COUNT(ar.id) > 0 THEN
                ROUND(
                    COUNT(CASE WHEN ar.status = 'completed' AND ar.error IS NULL THEN 1 END)::DECIMAL / COUNT(ar.id) * 100,
                    2
                )
            ELSE 0
        END as success_rate,
        COALESCE(
            ROUND(AVG(
                CASE WHEN ar.completed_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at))
                END
            )::DECIMAL, 2),
            0
        ) as avg_duration_seconds,
        COALESCE(SUM(ar.cost_usd), 0)::DECIMAL(12, 6) as total_cost_usd,
        COALESCE(SUM(ar.total_tokens), 0)::BIGINT as total_tokens,
        COALESCE(SUM(ar.tool_execution_ms), 0)::BIGINT as total_tool_execution_ms
    FROM agents a
    LEFT JOIN agent_runs ar ON ar.agent_id = a.agent_id
        AND ar.started_at >= NOW() - (:days || ' days')::INTERVAL
        AND ar.status != 'running'
    WHERE a.agent_id = :agent_id
    GROUP BY a.agent_id, a.name
    """

    result = await execute_one_read(sql, {"agent_id": agent_id, "days": days})
    return serialize_row(dict(result)) if result else None


async def get_agent_runs_timeline(
    agent_id: str,
    days: int = 30
) -> List[Dict[str, Any]]:
    """
    Get agent runs over time for a line chart with success/failure breakdown.

    Returns daily run counts for the last N days.
    """
    sql = """
    WITH date_series AS (
        SELECT generate_series(
            CURRENT_DATE - :days * INTERVAL '1 day',
            CURRENT_DATE,
            '1 day'::INTERVAL
        )::DATE as date
    ),
    daily_runs AS (
        SELECT
            DATE(completed_at) as run_date,
            COUNT(*) as total_runs,
            COUNT(CASE WHEN error IS NULL AND status = 'completed' THEN 1 END) as success_count,
            COUNT(CASE WHEN error IS NOT NULL OR status IN ('failed', 'error') THEN 1 END) as failure_count,
            COUNT(CASE WHEN status = 'stopped' THEN 1 END) as stopped_count
        FROM agent_runs
        WHERE agent_id = :agent_id
        AND completed_at >= CURRENT_DATE - :days * INTERVAL '1 day'
        GROUP BY DATE(completed_at)
    )
    SELECT
        ds.date,
        COALESCE(dr.total_runs, 0) as total_runs,
        COALESCE(dr.success_count, 0) as success_count,
        COALESCE(dr.failure_count, 0) as failure_count,
        COALESCE(dr.stopped_count, 0) as stopped_count
    FROM date_series ds
    LEFT JOIN daily_runs dr ON ds.date = dr.run_date
    ORDER BY ds.date ASC
    """

    results = await execute_read(sql, {"agent_id": agent_id, "days": days})
    return serialize_rows([dict(r) for r in results])


async def get_agent_slowest_tools(
    agent_id: str,
    days: int = 30,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Get slowest tool executions for an agent.

    Returns tool statistics sorted by average execution time.
    If no tool execution data exists, falls back to aggregate data.
    """
    # First try the detailed tool executions table
    sql = """
    SELECT
        te.tool_name,
        COUNT(*)::BIGINT as execution_count,
        ROUND(AVG(te.duration_ms)::DECIMAL, 2) as avg_duration_ms,
        MAX(te.duration_ms) as max_duration_ms,
        MIN(te.duration_ms) as min_duration_ms,
        SUM(te.duration_ms)::BIGINT as total_duration_ms,
        COUNT(CASE WHEN te.status = 'error' THEN 1 END)::BIGINT as error_count
    FROM agent_run_tool_executions te
    JOIN agent_runs ar ON te.agent_run_id = ar.id
    WHERE ar.agent_id = :agent_id
    AND te.started_at >= NOW() - (:days || ' days')::INTERVAL
    AND te.duration_ms IS NOT NULL
    GROUP BY te.tool_name
    ORDER BY avg_duration_ms DESC
    LIMIT :limit
    """

    results = await execute_read(sql, {"agent_id": agent_id, "days": days, "limit": limit})
    return serialize_rows([dict(r) for r in results])


async def get_agent_run_logs(
    agent_id: str,
    days: Optional[int] = 30,
    limit: int = 1000,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Get detailed agent run logs for export.

    Returns all agent runs for the specified period.
    """
    sql = """
    SELECT
        ar.id as run_id,
        ar.thread_id,
        ar.status,
        ar.started_at,
        ar.completed_at,
        EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)) as duration_seconds,
        ar.error,
        ar.metadata->>'model_name' as model_name,
        ar.cost_usd,
        ar.input_tokens,
        ar.output_tokens,
        ar.total_tokens,
        ar.tool_execution_ms,
        ar.metadata
    FROM agent_runs ar
    WHERE ar.agent_id = :agent_id
    """

    params: Dict[str, Any] = {"agent_id": agent_id, "limit": limit, "offset": offset}

    if days is not None:
        sql += " AND ar.started_at >= NOW() - (:days || ' days')::INTERVAL"
        params["days"] = days

    sql += """
    ORDER BY ar.started_at DESC
    LIMIT :limit OFFSET :offset
    """

    results = await execute_read(sql, params)
    return serialize_rows([dict(r) for r in results])


async def get_agent_run_logs_count(
    agent_id: str,
    days: Optional[int] = 30
) -> int:
    """Get total count of agent run logs for pagination."""
    sql = """
    SELECT COUNT(*) as count
    FROM agent_runs ar
    WHERE ar.agent_id = :agent_id
    """

    params: Dict[str, Any] = {"agent_id": agent_id}

    if days is not None:
        sql += " AND ar.started_at >= NOW() - (:days || ' days')::INTERVAL"
        params["days"] = days

    result = await execute_one_read(sql, params)
    return int(result["count"]) if result else 0


async def get_tool_executions_for_agent(
    agent_id: str,
    days: int = 30,
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Get detailed tool executions for an agent.

    Returns individual tool execution records.
    """
    sql = """
    SELECT
        te.id,
        te.agent_run_id,
        te.tool_name,
        te.tool_call_id,
        te.started_at,
        te.completed_at,
        te.duration_ms,
        te.status,
        te.error_message,
        te.input_summary,
        te.output_summary,
        te.metadata
    FROM agent_run_tool_executions te
    JOIN agent_runs ar ON te.agent_run_id = ar.id
    WHERE ar.agent_id = :agent_id
    AND te.started_at >= NOW() - (:days || ' days')::INTERVAL
    ORDER BY te.duration_ms DESC NULLS LAST, te.started_at DESC
    LIMIT :limit OFFSET :offset
    """

    results = await execute_read(
        sql,
        {"agent_id": agent_id, "days": days, "limit": limit, "offset": offset}
    )
    return serialize_rows([dict(r) for r in results])


async def get_tool_executions_count(
    agent_id: str,
    days: int = 30
) -> int:
    """Get total count of tool executions for an agent."""
    sql = """
    SELECT COUNT(*) as count
    FROM agent_run_tool_executions te
    JOIN agent_runs ar ON te.agent_run_id = ar.id
    WHERE ar.agent_id = :agent_id
    AND te.started_at >= NOW() - (:days || ' days')::INTERVAL
    """

    result = await execute_one_read(sql, {"agent_id": agent_id, "days": days})
    return int(result["count"]) if result else 0


async def get_agent_name(agent_id: str) -> Optional[str]:
    """Get agent name by ID."""
    sql = "SELECT name FROM agents WHERE agent_id = :agent_id"
    result = await execute_one_read(sql, {"agent_id": agent_id})
    return result["name"] if result else None


async def verify_agent_access(
    agent_id: str,
    user_id: str,
    org_id: Optional[str] = None
) -> bool:
    """
    Verify user has access to the agent for analytics.

    User has access if:
    - They are the agent creator (via account_id)
    - They are a member of the organization that owns the agent
    """
    sql = """
    SELECT EXISTS (
        SELECT 1 FROM agents a
        WHERE a.agent_id = :agent_id
        AND (
            -- User owns the agent via account
            a.account_id IN (
                SELECT account_id FROM basejump.account_user
                WHERE user_id = :user_id
            )
            -- Or user is in the same organization
            OR (
                a.org_id IS NOT NULL AND
                a.org_id IN (
                    SELECT org_id FROM public.organization_members
                    WHERE user_id = :user_id
                )
            )
        )
    ) as has_access
    """

    result = await execute_one_read(sql, {"agent_id": agent_id, "user_id": user_id})
    return bool(result["has_access"]) if result else False
