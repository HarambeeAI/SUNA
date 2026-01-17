"""Repository functions for organization usage dashboard.

Part of US-020: Organization usage dashboard.
Provides queries for dashboard statistics, charts, and exports.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

from core.services.db import execute_one_read, execute_read, serialize_row, serialize_rows


async def get_org_dashboard_stats(org_id: str) -> Optional[Dict[str, Any]]:
    """
    Get dashboard statistics for an organization.

    Returns:
        - total_agents: Total agents in the organization
        - active_agents: Agents used in the last 30 days
        - total_runs_month: Total runs this month
        - total_cost_usd: Total cost in USD this month (US-024)
        - total_tokens: Total tokens used this month (US-024)
        - usage with limits and percentages
    """
    sql = """
    WITH agent_counts AS (
        SELECT
            COUNT(*) as total_agents,
            COUNT(DISTINCT CASE
                WHEN a.agent_id IN (
                    SELECT DISTINCT ar.agent_id
                    FROM agent_runs ar
                    WHERE ar.org_id = :org_id
                    AND ar.completed_at >= NOW() - INTERVAL '30 days'
                    AND ar.agent_id IS NOT NULL
                )
                THEN a.agent_id
            END) as active_agents
        FROM agents a
        WHERE a.org_id = :org_id
    ),
    cost_summary AS (
        -- US-024: Get cost and token totals from agent_runs for current month
        SELECT
            COALESCE(SUM(cost_usd), 0) as total_cost_usd,
            COALESCE(SUM(input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(output_tokens), 0) as total_output_tokens,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(tool_execution_ms), 0) as total_tool_execution_ms
        FROM agent_runs
        WHERE org_id = :org_id
        AND started_at >= date_trunc('month', CURRENT_DATE)
    ),
    usage_info AS (
        SELECT
            o.id as org_id,
            o.name as org_name,
            o.plan_tier,
            o.billing_status,
            pt.agent_limit,
            pt.run_limit_monthly,
            pt.display_name as plan_display_name,
            COALESCE(u.agents_created, 0) as agents_created,
            COALESCE(u.runs_executed, 0) as runs_executed,
            COALESCE(u.total_tokens_used, 0) as total_tokens_used,
            COALESCE(u.estimated_cost_cents, 0) as estimated_cost_cents,
            u.period_start,
            u.period_end
        FROM organizations o
        JOIN plan_tiers pt ON pt.tier_name = o.plan_tier
        LEFT JOIN organization_usage u ON u.org_id = o.id
            AND u.period_start = date_trunc('month', CURRENT_DATE)::DATE
        WHERE o.id = :org_id
    )
    SELECT
        ac.total_agents,
        ac.active_agents,
        ui.org_id,
        ui.org_name,
        ui.plan_tier,
        ui.billing_status,
        ui.agent_limit,
        ui.run_limit_monthly,
        ui.plan_display_name,
        ui.agents_created,
        ui.runs_executed as total_runs_month,
        ui.total_tokens_used,
        ui.estimated_cost_cents,
        ui.period_start,
        ui.period_end,
        -- US-024: Include cost tracking from agent_runs
        cs.total_cost_usd,
        cs.total_input_tokens,
        cs.total_output_tokens,
        cs.total_tokens,
        cs.total_tool_execution_ms,
        CASE
            WHEN ui.agent_limit IS NOT NULL AND ui.agent_limit > 0
            THEN ROUND((ac.total_agents::NUMERIC / ui.agent_limit) * 100, 1)
            ELSE 0
        END as agents_percent,
        CASE
            WHEN ui.run_limit_monthly IS NOT NULL AND ui.run_limit_monthly > 0
            THEN ROUND((ui.runs_executed::NUMERIC / ui.run_limit_monthly) * 100, 1)
            ELSE 0
        END as runs_percent
    FROM agent_counts ac, usage_info ui, cost_summary cs
    """

    result = await execute_one_read(sql, {"org_id": org_id})
    return serialize_row(dict(result)) if result else None


async def get_org_runs_timeline(
    org_id: str,
    days: int = 30
) -> List[Dict[str, Any]]:
    """
    Get agent runs over time for a line chart.

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
            COUNT(*) as run_count,
            COUNT(CASE WHEN error IS NULL AND status = 'completed' THEN 1 END) as success_count,
            COUNT(CASE WHEN error IS NOT NULL OR status = 'failed' THEN 1 END) as failure_count
        FROM agent_runs
        WHERE org_id = :org_id
        AND completed_at >= CURRENT_DATE - :days * INTERVAL '1 day'
        GROUP BY DATE(completed_at)
    )
    SELECT
        ds.date,
        COALESCE(dr.run_count, 0) as run_count,
        COALESCE(dr.success_count, 0) as success_count,
        COALESCE(dr.failure_count, 0) as failure_count
    FROM date_series ds
    LEFT JOIN daily_runs dr ON ds.date = dr.run_date
    ORDER BY ds.date ASC
    """

    results = await execute_read(sql, {"org_id": org_id, "days": days})
    return serialize_rows([dict(r) for r in results])


async def get_org_top_agents(
    org_id: str,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Get top N most active agents by run count.

    Returns agent name and run count for bar chart.
    """
    sql = """
    SELECT
        a.agent_id,
        a.name as agent_name,
        COUNT(ar.id) as run_count,
        COUNT(CASE WHEN ar.error IS NULL AND ar.status = 'completed' THEN 1 END) as success_count,
        COUNT(CASE WHEN ar.error IS NOT NULL OR ar.status = 'failed' THEN 1 END) as failure_count,
        ROUND(
            COUNT(CASE WHEN ar.error IS NULL AND ar.status = 'completed' THEN 1 END)::NUMERIC /
            NULLIF(COUNT(ar.id), 0) * 100,
            1
        ) as success_rate
    FROM agents a
    LEFT JOIN agent_runs ar ON ar.agent_id = a.agent_id
        AND ar.org_id = :org_id
        AND ar.completed_at >= CURRENT_DATE - INTERVAL '30 days'
    WHERE a.org_id = :org_id
    GROUP BY a.agent_id, a.name
    HAVING COUNT(ar.id) > 0
    ORDER BY run_count DESC
    LIMIT :limit
    """

    results = await execute_read(sql, {"org_id": org_id, "limit": limit})
    return serialize_rows([dict(r) for r in results])


async def get_org_active_users(
    org_id: str,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Get most active users by run count.

    Returns user info and run count for table.
    """
    sql = """
    SELECT
        om.user_id,
        om.role,
        COUNT(DISTINCT ar.id) as run_count,
        COUNT(DISTINCT CASE WHEN ar.error IS NULL AND ar.status = 'completed' THEN ar.id END) as success_count,
        MAX(ar.completed_at) as last_active
    FROM organization_members om
    LEFT JOIN threads t ON t.org_id = :org_id AND t.account_id IN (
        SELECT account_id FROM basejump.account_user WHERE user_id = om.user_id
    )
    LEFT JOIN agent_runs ar ON ar.thread_id = t.thread_id
        AND ar.org_id = :org_id
        AND ar.completed_at >= CURRENT_DATE - INTERVAL '30 days'
    WHERE om.org_id = :org_id
    GROUP BY om.user_id, om.role
    HAVING COUNT(DISTINCT ar.id) > 0
    ORDER BY run_count DESC
    LIMIT :limit
    """

    results = await execute_read(sql, {"org_id": org_id, "limit": limit})
    return serialize_rows([dict(r) for r in results])


async def get_org_usage_export(org_id: str) -> List[Dict[str, Any]]:
    """
    Get detailed usage data for CSV export.

    Returns all agent runs for the current billing period.
    US-024: Includes cost and token data.
    """
    sql = """
    SELECT
        ar.id as run_id,
        a.name as agent_name,
        t.thread_id,
        ar.status,
        ar.started_at,
        ar.completed_at,
        EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)) as duration_seconds,
        ar.error,
        ar.metadata->>'model_name' as model_name,
        -- US-024: Include cost and token data
        ar.cost_usd,
        ar.input_tokens,
        ar.output_tokens,
        ar.total_tokens,
        ar.tool_execution_ms
    FROM agent_runs ar
    LEFT JOIN agents a ON ar.agent_id = a.agent_id
    LEFT JOIN threads t ON ar.thread_id = t.thread_id
    WHERE ar.org_id = :org_id
    AND ar.started_at >= date_trunc('month', CURRENT_DATE)
    ORDER BY ar.started_at DESC
    """

    results = await execute_read(sql, {"org_id": org_id})
    return serialize_rows([dict(r) for r in results])


async def get_org_usage_history(
    org_id: str,
    months: int = 12
) -> List[Dict[str, Any]]:
    """
    Get historical usage data for the past N months.

    Returns monthly usage records.
    """
    sql = """
    SELECT
        u.id,
        u.org_id,
        u.period_start,
        u.period_end,
        u.agents_created,
        u.runs_executed,
        u.total_tokens_used,
        u.estimated_cost_cents,
        u.created_at,
        u.updated_at
    FROM organization_usage u
    WHERE u.org_id = :org_id
    ORDER BY u.period_start DESC
    LIMIT :months
    """

    results = await execute_read(sql, {"org_id": org_id, "months": months})
    return serialize_rows([dict(r) for r in results])
