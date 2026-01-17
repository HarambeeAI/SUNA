"""API endpoints for organization usage dashboard.

Part of US-020: Organization usage dashboard.
Provides endpoints for dashboard statistics, charts, and data export.
"""

from datetime import date
from io import StringIO
import csv

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse

from core.utils.logger import logger
from core.api_models.usage_dashboard import (
    DashboardStats,
    TimelineDataPoint,
    RunsTimelineResponse,
    TopAgentData,
    TopAgentsResponse,
    ActiveUserData,
    ActiveUsersResponse,
    UsageExportRow,
    UsageExportResponse,
    DashboardResponse,
)
from core.organizations.rbac import (
    OrgAccessContext,
    require_org_admin,
    require_org_viewer,
)
from core.organizations import usage_dashboard_repo as dashboard_repo


router = APIRouter(tags=["organization-usage-dashboard"])


@router.get(
    "/organizations/{org_id}/usage/dashboard",
    response_model=DashboardResponse,
    summary="Get Full Usage Dashboard",
    operation_id="get_usage_dashboard"
)
async def get_usage_dashboard(
    org_id: str,
    ctx: OrgAccessContext = Depends(require_org_viewer)
):
    """
    Get full organization usage dashboard data.

    Includes:
    - Stats: total agents, active agents, total runs this month
    - Runs timeline: daily run counts for the last 30 days
    - Top agents: top 10 most active agents
    - Active users: most active users by run count

    Requires: viewer role or higher
    """
    logger.debug(f"Fetching usage dashboard for org {org_id}")

    try:
        # Fetch all dashboard data in parallel
        stats_data = await dashboard_repo.get_org_dashboard_stats(org_id)
        if not stats_data:
            raise HTTPException(status_code=404, detail="Organization not found")

        timeline_data = await dashboard_repo.get_org_runs_timeline(org_id, days=30)
        top_agents_data = await dashboard_repo.get_org_top_agents(org_id, limit=10)
        active_users_data = await dashboard_repo.get_org_active_users(org_id, limit=10)

        # Build response
        stats = DashboardStats(**stats_data)

        runs_timeline = RunsTimelineResponse(
            data=[TimelineDataPoint(**dp) for dp in timeline_data],
            days=30
        )

        top_agents = TopAgentsResponse(
            agents=[TopAgentData(**agent) for agent in top_agents_data],
            limit=10
        )

        active_users = ActiveUsersResponse(
            users=[ActiveUserData(**user) for user in active_users_data],
            limit=10
        )

        return DashboardResponse(
            stats=stats,
            runs_timeline=runs_timeline,
            top_agents=top_agents,
            active_users=active_users
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching usage dashboard for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch usage dashboard")


@router.get(
    "/organizations/{org_id}/usage/stats",
    response_model=DashboardStats,
    summary="Get Dashboard Stats",
    operation_id="get_dashboard_stats"
)
async def get_dashboard_stats(
    org_id: str,
    ctx: OrgAccessContext = Depends(require_org_viewer)
):
    """
    Get organization usage statistics.

    Returns:
    - Total agents in the organization
    - Active agents (used in last 30 days)
    - Total runs this month
    - Usage percentages and limits

    Requires: viewer role or higher
    """
    logger.debug(f"Fetching dashboard stats for org {org_id}")

    try:
        stats_data = await dashboard_repo.get_org_dashboard_stats(org_id)
        if not stats_data:
            raise HTTPException(status_code=404, detail="Organization not found")

        return DashboardStats(**stats_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching dashboard stats for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard stats")


@router.get(
    "/organizations/{org_id}/usage/timeline",
    response_model=RunsTimelineResponse,
    summary="Get Runs Timeline",
    operation_id="get_runs_timeline"
)
async def get_runs_timeline(
    org_id: str,
    days: int = Query(default=30, ge=1, le=90, description="Number of days for timeline"),
    ctx: OrgAccessContext = Depends(require_org_viewer)
):
    """
    Get agent runs over time for line chart.

    Returns daily run counts with success/failure breakdown.

    Requires: viewer role or higher
    """
    logger.debug(f"Fetching runs timeline for org {org_id} ({days} days)")

    try:
        timeline_data = await dashboard_repo.get_org_runs_timeline(org_id, days=days)

        return RunsTimelineResponse(
            data=[TimelineDataPoint(**dp) for dp in timeline_data],
            days=days
        )

    except Exception as e:
        logger.error(f"Error fetching runs timeline for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch runs timeline")


@router.get(
    "/organizations/{org_id}/usage/agents",
    response_model=TopAgentsResponse,
    summary="Get Top Agents",
    operation_id="get_top_agents"
)
async def get_top_agents(
    org_id: str,
    limit: int = Query(default=10, ge=1, le=50, description="Maximum number of agents to return"),
    ctx: OrgAccessContext = Depends(require_org_viewer)
):
    """
    Get top N most active agents by run count.

    Returns agent names with run counts for bar chart.

    Requires: viewer role or higher
    """
    logger.debug(f"Fetching top {limit} agents for org {org_id}")

    try:
        agents_data = await dashboard_repo.get_org_top_agents(org_id, limit=limit)

        return TopAgentsResponse(
            agents=[TopAgentData(**agent) for agent in agents_data],
            limit=limit
        )

    except Exception as e:
        logger.error(f"Error fetching top agents for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch top agents")


@router.get(
    "/organizations/{org_id}/usage/users",
    response_model=ActiveUsersResponse,
    summary="Get Active Users",
    operation_id="get_active_users"
)
async def get_active_users(
    org_id: str,
    limit: int = Query(default=10, ge=1, le=50, description="Maximum number of users to return"),
    ctx: OrgAccessContext = Depends(require_org_viewer)
):
    """
    Get most active users by run count.

    Returns user info with run counts for table display.

    Requires: viewer role or higher
    """
    logger.debug(f"Fetching top {limit} active users for org {org_id}")

    try:
        users_data = await dashboard_repo.get_org_active_users(org_id, limit=limit)

        return ActiveUsersResponse(
            users=[ActiveUserData(**user) for user in users_data],
            limit=limit
        )

    except Exception as e:
        logger.error(f"Error fetching active users for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch active users")


@router.get(
    "/organizations/{org_id}/usage/export",
    response_model=UsageExportResponse,
    summary="Get Usage Export Data",
    operation_id="get_usage_export"
)
async def get_usage_export(
    org_id: str,
    ctx: OrgAccessContext = Depends(require_org_admin)
):
    """
    Get detailed usage data for export.

    Returns all agent runs for the current billing period.

    Requires: admin role or higher
    """
    logger.debug(f"Fetching usage export data for org {org_id}")

    try:
        export_data = await dashboard_repo.get_org_usage_export(org_id)

        # Get billing period
        today = date.today()
        period_start = today.replace(day=1)
        next_month = period_start.replace(day=28) + timedelta(days=4)
        period_end = next_month - timedelta(days=next_month.day)

        return UsageExportResponse(
            rows=[UsageExportRow(**row) for row in export_data],
            total_count=len(export_data),
            period_start=period_start,
            period_end=period_end
        )

    except Exception as e:
        logger.error(f"Error fetching usage export for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch usage export data")


# Import timedelta for the CSV export
from datetime import timedelta


@router.get(
    "/organizations/{org_id}/usage/export/csv",
    summary="Export Usage as CSV",
    operation_id="export_usage_csv"
)
async def export_usage_csv(
    org_id: str,
    ctx: OrgAccessContext = Depends(require_org_admin)
):
    """
    Export usage data as CSV file.

    Downloads all agent runs for the current billing period as a CSV file.

    Requires: admin role or higher
    """
    logger.debug(f"Exporting usage CSV for org {org_id}")

    try:
        export_data = await dashboard_repo.get_org_usage_export(org_id)

        # Create CSV in memory
        output = StringIO()
        writer = csv.writer(output)

        # Write header
        writer.writerow([
            "Run ID",
            "Agent Name",
            "Thread ID",
            "Status",
            "Started At",
            "Completed At",
            "Duration (seconds)",
            "Error",
            "Model Name"
        ])

        # Write data rows
        for row in export_data:
            writer.writerow([
                str(row.get('run_id', '')),
                row.get('agent_name', ''),
                str(row.get('thread_id', '')),
                row.get('status', ''),
                str(row.get('started_at', '')),
                str(row.get('completed_at', '')) if row.get('completed_at') else '',
                f"{row.get('duration_seconds', 0):.2f}" if row.get('duration_seconds') else '',
                row.get('error', ''),
                row.get('model_name', '')
            ])

        # Reset stream position
        output.seek(0)

        # Generate filename with date
        today = date.today()
        filename = f"usage_export_{org_id[:8]}_{today.isoformat()}.csv"

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        logger.error(f"Error exporting usage CSV for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to export usage data")
