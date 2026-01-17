"""
Platform Admin API
Provides comprehensive platform overview for the admin dashboard including:
- Overview stats: total users, organizations, agents, runs today
- Organization management: list, change plan tier
- User management: suspend/unsuspend accounts
- System health metrics
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from enum import Enum
from core.auth import require_admin
from core.services.supabase import DBConnection
from core.utils.logger import logger
from core.utils.pagination import PaginationService, PaginationParams, PaginatedResponse

router = APIRouter(prefix="/admin/platform", tags=["admin-platform"])


# ============================================================================
# MODELS
# ============================================================================

class PlatformOverviewStats(BaseModel):
    """Overview statistics for the admin dashboard."""
    total_users: int = Field(description="Total number of registered users")
    total_organizations: int = Field(description="Total number of organizations")
    total_agents: int = Field(description="Total number of agents created")
    runs_today: int = Field(description="Number of agent runs today")
    runs_this_week: int = Field(description="Number of agent runs this week")
    active_users_today: int = Field(description="Users who ran agents today")
    active_users_week: int = Field(description="Users who ran agents this week")
    pending_template_submissions: int = Field(description="Template submissions awaiting review")
    new_users_today: int = Field(description="New user signups today")
    new_users_week: int = Field(description="New user signups this week")


class PlanTierEnum(str, Enum):
    free = "free"
    pro = "pro"
    enterprise = "enterprise"


class OrganizationAdminSummary(BaseModel):
    """Organization summary for admin list view."""
    id: str
    name: str
    slug: str
    plan_tier: str
    billing_status: Optional[str] = None
    member_count: int = 0
    agent_count: int = 0
    runs_this_month: int = 0
    created_at: datetime
    owner_email: Optional[str] = None


class UpdateOrgPlanTierRequest(BaseModel):
    """Request to update an organization's plan tier."""
    plan_tier: PlanTierEnum
    reason: Optional[str] = Field(None, description="Admin note for the change")


class UserAdminSummary(BaseModel):
    """User summary for admin list view."""
    id: str
    email: Optional[str] = None
    created_at: datetime
    is_suspended: bool = False
    suspension_reason: Optional[str] = None
    suspended_at: Optional[datetime] = None
    last_activity: Optional[datetime] = None
    agent_count: int = 0
    runs_count: int = 0


class SuspendUserRequest(BaseModel):
    """Request to suspend a user account."""
    reason: str = Field(..., description="Reason for suspension")


class SystemHealthMetrics(BaseModel):
    """System health metrics for admin dashboard."""
    api_healthy: bool = True
    database_healthy: bool = True
    redis_healthy: bool = True
    avg_response_time_ms: Optional[float] = None
    error_rate_percent: Optional[float] = None
    active_agent_runs: int = 0
    background_jobs_pending: int = 0


# ============================================================================
# PLATFORM OVERVIEW ENDPOINTS
# ============================================================================

@router.get("/overview", response_model=PlatformOverviewStats)
async def get_platform_overview(
    admin: dict = Depends(require_admin)
) -> PlatformOverviewStats:
    """Get comprehensive platform overview statistics."""
    try:
        db = DBConnection()
        client = await db.client

        # Get current date boundaries
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)

        # Run multiple queries in parallel for efficiency
        # Total users (accounts)
        users_result = await client.schema('basejump').from_('accounts').select('*', count='exact').execute()
        total_users = users_result.count or 0

        # Total organizations
        orgs_result = await client.from_('organizations').select('*', count='exact').execute()
        total_organizations = orgs_result.count or 0

        # Total agents
        agents_result = await client.from_('agents').select('*', count='exact').execute()
        total_agents = agents_result.count or 0

        # Runs today
        runs_today_result = await client.from_('agent_runs').select(
            'id', count='exact'
        ).gte('created_at', today_start.isoformat()).execute()
        runs_today = runs_today_result.count or 0

        # Runs this week
        runs_week_result = await client.from_('agent_runs').select(
            'id', count='exact'
        ).gte('created_at', week_start.isoformat()).execute()
        runs_this_week = runs_week_result.count or 0

        # Active users today (users who ran agents)
        active_today_result = await client.from_('agent_runs').select(
            'threads!inner(account_id)'
        ).gte('created_at', today_start.isoformat()).execute()
        active_today_accounts = set()
        for run in active_today_result.data or []:
            if run.get('threads') and run['threads'].get('account_id'):
                active_today_accounts.add(run['threads']['account_id'])
        active_users_today = len(active_today_accounts)

        # Active users this week
        active_week_result = await client.from_('agent_runs').select(
            'threads!inner(account_id)'
        ).gte('created_at', week_start.isoformat()).execute()
        active_week_accounts = set()
        for run in active_week_result.data or []:
            if run.get('threads') and run['threads'].get('account_id'):
                active_week_accounts.add(run['threads']['account_id'])
        active_users_week = len(active_week_accounts)

        # Pending template submissions
        pending_result = await client.from_('template_submissions').select(
            'submission_id', count='exact'
        ).eq('status', 'pending').execute()
        pending_template_submissions = pending_result.count or 0

        # New users today
        new_today_result = await client.schema('basejump').from_('accounts').select(
            'id', count='exact'
        ).gte('created_at', today_start.isoformat()).execute()
        new_users_today = new_today_result.count or 0

        # New users this week
        new_week_result = await client.schema('basejump').from_('accounts').select(
            'id', count='exact'
        ).gte('created_at', week_start.isoformat()).execute()
        new_users_week = new_week_result.count or 0

        return PlatformOverviewStats(
            total_users=total_users,
            total_organizations=total_organizations,
            total_agents=total_agents,
            runs_today=runs_today,
            runs_this_week=runs_this_week,
            active_users_today=active_users_today,
            active_users_week=active_users_week,
            pending_template_submissions=pending_template_submissions,
            new_users_today=new_users_today,
            new_users_week=new_users_week
        )

    except Exception as e:
        logger.error(f"Failed to get platform overview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve platform overview")


# ============================================================================
# ORGANIZATION MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/organizations")
async def list_organizations(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by name or slug"),
    plan_tier: Optional[str] = Query(None, description="Filter by plan tier"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    admin: dict = Depends(require_admin)
) -> PaginatedResponse[OrganizationAdminSummary]:
    """List all organizations with admin details."""
    try:
        db = DBConnection()
        client = await db.client

        pagination_params = PaginationParams(page=page, page_size=page_size)
        offset = (page - 1) * page_size

        # Build base query
        query = client.from_('organizations').select(
            '''
            id,
            name,
            slug,
            plan_tier,
            billing_status,
            created_at,
            organization_members(user_id),
            agents(agent_id)
            '''
        )

        # Apply filters
        if search:
            query = query.or_(f"name.ilike.%{search}%,slug.ilike.%{search}%")

        if plan_tier:
            query = query.eq('plan_tier', plan_tier)

        # Get total count
        count_query = client.from_('organizations').select('id', count='exact')
        if search:
            count_query = count_query.or_(f"name.ilike.%{search}%,slug.ilike.%{search}%")
        if plan_tier:
            count_query = count_query.eq('plan_tier', plan_tier)
        count_result = await count_query.execute()
        total_count = count_result.count or 0

        # Apply sorting and pagination
        query = query.order(sort_by, desc=(sort_order.lower() == 'desc'))
        query = query.range(offset, offset + page_size - 1)

        result = await query.execute()

        organizations = []
        for org in result.data or []:
            # Get member count
            members = org.get('organization_members') or []
            member_count = len(members)

            # Get agent count
            agents = org.get('agents') or []
            agent_count = len(agents)

            # Get owner email (first owner in members)
            owner_email = None
            if members:
                # Get the first member's email (simplified - would need join for actual email)
                owner_email = None  # Would need separate query for email

            organizations.append(OrganizationAdminSummary(
                id=org['id'],
                name=org['name'],
                slug=org['slug'],
                plan_tier=org.get('plan_tier', 'free'),
                billing_status=org.get('billing_status'),
                member_count=member_count,
                agent_count=agent_count,
                runs_this_month=0,  # Would need aggregation query
                created_at=datetime.fromisoformat(org['created_at'].replace('Z', '+00:00')),
                owner_email=owner_email
            ))

        return await PaginationService.paginate_with_total_count(
            items=organizations,
            total_count=total_count,
            params=pagination_params
        )

    except Exception as e:
        logger.error(f"Failed to list organizations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve organizations")


@router.patch("/organizations/{org_id}/plan-tier")
async def update_organization_plan_tier(
    org_id: str,
    request: UpdateOrgPlanTierRequest,
    admin: dict = Depends(require_admin)
):
    """Update an organization's plan tier (admin only)."""
    try:
        db = DBConnection()
        client = await db.client

        # Verify organization exists
        org_result = await client.from_('organizations').select('id, name, plan_tier').eq('id', org_id).execute()

        if not org_result.data:
            raise HTTPException(status_code=404, detail="Organization not found")

        old_tier = org_result.data[0].get('plan_tier', 'free')
        org_name = org_result.data[0].get('name', 'Unknown')

        # Update plan tier
        update_result = await client.from_('organizations').update({
            'plan_tier': request.plan_tier.value,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', org_id).execute()

        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update organization plan tier")

        logger.info(
            f"Organization plan tier updated: {org_name} ({org_id}) "
            f"from {old_tier} to {request.plan_tier.value} by admin {admin.get('email', 'unknown')}"
            f"{' - ' + request.reason if request.reason else ''}"
        )

        return {
            "success": True,
            "message": f"Plan tier updated from {old_tier} to {request.plan_tier.value}",
            "org_id": org_id,
            "old_tier": old_tier,
            "new_tier": request.plan_tier.value
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update organization plan tier: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update organization plan tier")


# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/users")
async def list_users_admin(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search_email: Optional[str] = Query(None, description="Search by email"),
    is_suspended: Optional[bool] = Query(None, description="Filter by suspension status"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    admin: dict = Depends(require_admin)
) -> PaginatedResponse[UserAdminSummary]:
    """List all users with admin details."""
    try:
        db = DBConnection()
        client = await db.client

        pagination_params = PaginationParams(page=page, page_size=page_size)

        # Use RPC for complex join query
        rpc_result = await client.rpc('admin_list_users_by_tier', {
            'p_tier': None,
            'p_search_email': search_email,
            'p_page': page,
            'p_page_size': page_size,
            'p_sort_by': sort_by,
            'p_sort_order': sort_order.lower()
        }).execute()

        if not rpc_result.data:
            return await PaginationService.paginate_with_total_count(
                items=[],
                total_count=0,
                params=pagination_params
            )

        result_data = rpc_result.data
        total_count = result_data.get('total_count', 0)
        raw_users = result_data.get('data', []) or []

        # Check suspension status for each user
        user_ids = [u['id'] for u in raw_users]
        suspension_result = await client.from_('user_suspensions').select(
            'user_id, reason, suspended_at'
        ).in_('user_id', user_ids).eq('is_active', True).execute()

        suspension_map = {}
        for susp in suspension_result.data or []:
            suspension_map[susp['user_id']] = {
                'reason': susp.get('reason'),
                'suspended_at': susp.get('suspended_at')
            }

        users = []
        for item in raw_users:
            user_id = item['id']
            suspension = suspension_map.get(user_id)

            # Apply suspension filter if specified
            if is_suspended is not None:
                has_suspension = user_id in suspension_map
                if is_suspended != has_suspension:
                    continue

            users.append(UserAdminSummary(
                id=user_id,
                email=item.get('email') or 'N/A',
                created_at=datetime.fromisoformat(item['created_at'].replace('Z', '+00:00')),
                is_suspended=user_id in suspension_map,
                suspension_reason=suspension.get('reason') if suspension else None,
                suspended_at=datetime.fromisoformat(suspension['suspended_at'].replace('Z', '+00:00')) if suspension and suspension.get('suspended_at') else None,
                agent_count=0,  # Would need separate query
                runs_count=0  # Would need separate query
            ))

        return await PaginationService.paginate_with_total_count(
            items=users,
            total_count=total_count,
            params=pagination_params
        )

    except Exception as e:
        logger.error(f"Failed to list users: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve users")


@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    request: SuspendUserRequest,
    admin: dict = Depends(require_admin)
):
    """Suspend a user account."""
    try:
        db = DBConnection()
        client = await db.client

        # Verify user exists
        user_result = await client.schema('basejump').from_('accounts').select('id').eq('id', user_id).execute()

        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")

        # Check if already suspended
        existing = await client.from_('user_suspensions').select('id').eq(
            'user_id', user_id
        ).eq('is_active', True).execute()

        if existing.data:
            raise HTTPException(status_code=400, detail="User is already suspended")

        # Create suspension record
        suspension_data = {
            'user_id': user_id,
            'reason': request.reason,
            'suspended_by': admin.get('user_id'),
            'suspended_at': datetime.utcnow().isoformat(),
            'is_active': True
        }

        await client.from_('user_suspensions').insert(suspension_data).execute()

        logger.info(f"User suspended: {user_id} by admin {admin.get('email', 'unknown')} - Reason: {request.reason}")

        return {
            "success": True,
            "message": "User suspended successfully",
            "user_id": user_id,
            "reason": request.reason
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to suspend user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to suspend user")


@router.post("/users/{user_id}/unsuspend")
async def unsuspend_user(
    user_id: str,
    admin: dict = Depends(require_admin)
):
    """Unsuspend a user account."""
    try:
        db = DBConnection()
        client = await db.client

        # Check if suspended
        existing = await client.from_('user_suspensions').select('id').eq(
            'user_id', user_id
        ).eq('is_active', True).execute()

        if not existing.data:
            raise HTTPException(status_code=400, detail="User is not suspended")

        # Deactivate suspension
        await client.from_('user_suspensions').update({
            'is_active': False,
            'unsuspended_by': admin.get('user_id'),
            'unsuspended_at': datetime.utcnow().isoformat()
        }).eq('user_id', user_id).eq('is_active', True).execute()

        logger.info(f"User unsuspended: {user_id} by admin {admin.get('email', 'unknown')}")

        return {
            "success": True,
            "message": "User unsuspended successfully",
            "user_id": user_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to unsuspend user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to unsuspend user")


# ============================================================================
# SYSTEM HEALTH ENDPOINTS
# ============================================================================

@router.get("/health", response_model=SystemHealthMetrics)
async def get_system_health(
    admin: dict = Depends(require_admin)
) -> SystemHealthMetrics:
    """Get system health metrics."""
    try:
        db = DBConnection()
        client = await db.client

        # Check database health
        database_healthy = True
        try:
            await client.from_('agents').select('agent_id').limit(1).execute()
        except Exception:
            database_healthy = False

        # Check Redis health
        redis_healthy = True
        try:
            from core.services.redis import redis_service
            await redis_service.ping()
        except Exception:
            redis_healthy = False

        # Get active agent runs
        active_runs_result = await client.from_('agent_runs').select(
            'id', count='exact'
        ).eq('status', 'running').execute()
        active_agent_runs = active_runs_result.count or 0

        # Background jobs (simplified - would need actual job queue integration)
        background_jobs_pending = 0

        return SystemHealthMetrics(
            api_healthy=True,
            database_healthy=database_healthy,
            redis_healthy=redis_healthy,
            avg_response_time_ms=None,  # Would need APM integration
            error_rate_percent=None,  # Would need error tracking integration
            active_agent_runs=active_agent_runs,
            background_jobs_pending=background_jobs_pending
        )

    except Exception as e:
        logger.error(f"Failed to get system health: {e}", exc_info=True)
        return SystemHealthMetrics(
            api_healthy=True,
            database_healthy=False,
            redis_healthy=False,
            active_agent_runs=0,
            background_jobs_pending=0
        )
