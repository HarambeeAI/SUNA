"""Organization Usage Limit Enforcement

Part of US-007: Usage limit enforcement.
Checks organization plan limits for agent creation and agent runs,
returning 402 Payment Required with upgrade CTA when limits are exceeded.

Extended for US-023: Adds email notifications for approaching and hitting limits.
"""

import asyncio
from typing import Dict, Any, Optional
from uuid import UUID

from core.services.db import execute_one_read, execute_one, serialize_row
from core.utils.logger import logger


# Error codes for limit violations
ERROR_CODE_AGENT_LIMIT = "ORG_AGENT_LIMIT_EXCEEDED"
ERROR_CODE_RUN_LIMIT = "ORG_RUN_LIMIT_MONTHLY_EXCEEDED"

# Threshold for "approaching limit" notification (percentage)
APPROACHING_LIMIT_THRESHOLD = 80


async def get_org_plan_and_usage(org_id: str) -> Optional[Dict[str, Any]]:
    """
    Get organization's current plan limits and usage in a single query.

    Returns:
        Dict with org info, plan limits, and current usage, or None if org not found.
    """
    sql = """
    SELECT
        o.id as org_id,
        o.name as org_name,
        o.plan_tier,
        o.billing_status,
        pt.agent_limit,
        pt.run_limit_monthly,
        pt.display_name as plan_display_name,
        pt.monthly_price_cents,
        COALESCE(u.agents_created, 0) as agents_created,
        COALESCE(u.runs_executed, 0) as runs_executed,
        u.period_start,
        u.period_end
    FROM organizations o
    JOIN plan_tiers pt ON pt.tier_name = o.plan_tier
    LEFT JOIN organization_usage u ON u.org_id = o.id
        AND u.period_start = date_trunc('month', CURRENT_DATE)::DATE
    WHERE o.id = :org_id
    """

    result = await execute_one_read(sql, {"org_id": org_id})
    if not result:
        return None

    return serialize_row(dict(result))


async def count_org_agents(org_id: str) -> int:
    """Count total agents belonging to an organization."""
    sql = """
    SELECT COUNT(*) as count FROM agents WHERE org_id = :org_id
    """
    result = await execute_one_read(sql, {"org_id": org_id})
    return result['count'] if result else 0


async def check_org_agent_limit(org_id: str) -> Dict[str, Any]:
    """
    Check if organization can create more agents based on plan limits.

    Args:
        org_id: Organization ID to check

    Returns:
        Dict with:
        - can_create: bool indicating if creation is allowed
        - current_count: current number of agents
        - limit: plan's agent limit (None = unlimited)
        - plan_tier: organization's plan tier
        - error_response: prepared 402 error response if limit exceeded
    """
    try:
        # Get plan and usage info
        plan_info = await get_org_plan_and_usage(org_id)
        if not plan_info:
            logger.warning(f"Organization {org_id} not found for agent limit check")
            return {
                'can_create': True,  # Fail open if org not found
                'current_count': 0,
                'limit': None,
                'plan_tier': 'unknown',
                'error_response': None
            }

        # Count actual agents (not just usage tracking)
        current_count = await count_org_agents(org_id)
        agent_limit = plan_info.get('agent_limit')
        plan_tier = plan_info.get('plan_tier', 'free')

        # NULL agent_limit means unlimited
        if agent_limit is None:
            return {
                'can_create': True,
                'current_count': current_count,
                'limit': None,
                'plan_tier': plan_tier,
                'error_response': None
            }

        can_create = current_count < agent_limit

        result = {
            'can_create': can_create,
            'current_count': current_count,
            'limit': agent_limit,
            'plan_tier': plan_tier,
            'error_response': None
        }

        if not can_create:
            result['error_response'] = _build_limit_error(
                error_code=ERROR_CODE_AGENT_LIMIT,
                message=f"Agent limit reached. Your {plan_info.get('plan_display_name', 'Free')} plan allows {agent_limit} agents. Upgrade to create more.",
                current_count=current_count,
                limit=agent_limit,
                plan_tier=plan_tier,
                plan_display_name=plan_info.get('plan_display_name', 'Free'),
                org_id=str(org_id),
                org_name=plan_info.get('org_name', '')
            )

            # Log limit hit for analytics/conversion tracking
            await _log_limit_hit(
                org_id=org_id,
                limit_type="agent_creation",
                plan_tier=plan_tier,
                current_count=current_count,
                limit=agent_limit
            )

        return result

    except Exception as e:
        logger.error(f"Error checking org agent limit for {org_id}: {e}")
        # Fail open on error to not block users
        return {
            'can_create': True,
            'current_count': 0,
            'limit': None,
            'plan_tier': 'unknown',
            'error_response': None
        }


async def check_org_run_limit(org_id: str) -> Dict[str, Any]:
    """
    Check if organization can execute more agent runs based on monthly limits.

    Args:
        org_id: Organization ID to check

    Returns:
        Dict with:
        - can_run: bool indicating if run is allowed
        - current_count: runs executed this month
        - limit: plan's monthly run limit (None = unlimited)
        - plan_tier: organization's plan tier
        - error_response: prepared 402 error response if limit exceeded
    """
    try:
        # Get plan and usage info
        plan_info = await get_org_plan_and_usage(org_id)
        if not plan_info:
            logger.warning(f"Organization {org_id} not found for run limit check")
            return {
                'can_run': True,  # Fail open if org not found
                'current_count': 0,
                'limit': None,
                'plan_tier': 'unknown',
                'error_response': None
            }

        runs_executed = plan_info.get('runs_executed', 0)
        run_limit = plan_info.get('run_limit_monthly')
        plan_tier = plan_info.get('plan_tier', 'free')

        # NULL run_limit means unlimited
        if run_limit is None:
            return {
                'can_run': True,
                'current_count': runs_executed,
                'limit': None,
                'plan_tier': plan_tier,
                'error_response': None
            }

        can_run = runs_executed < run_limit

        result = {
            'can_run': can_run,
            'current_count': runs_executed,
            'limit': run_limit,
            'plan_tier': plan_tier,
            'error_response': None
        }

        if not can_run:
            result['error_response'] = _build_limit_error(
                error_code=ERROR_CODE_RUN_LIMIT,
                message=f"Monthly run limit reached. Your {plan_info.get('plan_display_name', 'Free')} plan allows {run_limit} runs per month. Upgrade for more runs.",
                current_count=runs_executed,
                limit=run_limit,
                plan_tier=plan_tier,
                plan_display_name=plan_info.get('plan_display_name', 'Free'),
                org_id=str(org_id),
                org_name=plan_info.get('org_name', ''),
                period_end=str(plan_info.get('period_end')) if plan_info.get('period_end') else None
            )

            # Log limit hit for analytics/conversion tracking
            await _log_limit_hit(
                org_id=org_id,
                limit_type="monthly_runs",
                plan_tier=plan_tier,
                current_count=runs_executed,
                limit=run_limit
            )

        return result

    except Exception as e:
        logger.error(f"Error checking org run limit for {org_id}: {e}")
        # Fail open on error to not block users
        return {
            'can_run': True,
            'current_count': 0,
            'limit': None,
            'plan_tier': 'unknown',
            'error_response': None
        }


async def increment_org_agent_usage(org_id: str) -> int:
    """
    Increment agent creation count for an organization.

    Also checks and sends notification if approaching the limit (80%).

    Args:
        org_id: Organization ID

    Returns:
        New count of agents created this period
    """
    sql = "SELECT public.increment_org_agent_count(:org_id) as new_count"
    result = await execute_one(sql, {"org_id": org_id}, commit=True)
    new_count = result['new_count'] if result else 0

    # Check if approaching limit and send notification (US-023)
    # For agents, we use actual agent count, not the usage tracking count
    if new_count > 0:
        plan_info = await get_org_plan_and_usage(org_id)
        if plan_info and plan_info.get('agent_limit'):
            actual_count = await count_org_agents(org_id)
            await check_and_notify_approaching_limit(
                org_id=org_id,
                limit_type="agents",
                current_count=actual_count,
                limit=plan_info['agent_limit'],
                plan_tier=plan_info.get('plan_tier', 'free')
            )

    return new_count


async def increment_org_run_usage(
    org_id: str,
    tokens_used: int = 0,
    cost_cents: int = 0
) -> int:
    """
    Increment run count for an organization.

    Also checks and sends notification if approaching the limit (80%).

    Args:
        org_id: Organization ID
        tokens_used: Total tokens used in the run
        cost_cents: Estimated cost in cents

    Returns:
        New count of runs this period
    """
    sql = """
    SELECT public.increment_org_run_count(:org_id, :tokens_used, :cost_cents) as new_count
    """
    result = await execute_one(sql, {
        "org_id": org_id,
        "tokens_used": tokens_used,
        "cost_cents": cost_cents
    }, commit=True)
    new_count = result['new_count'] if result else 0

    # Check if approaching limit and send notification (US-023)
    if new_count > 0:
        plan_info = await get_org_plan_and_usage(org_id)
        if plan_info and plan_info.get('run_limit_monthly'):
            await check_and_notify_approaching_limit(
                org_id=org_id,
                limit_type="runs",
                current_count=new_count,
                limit=plan_info['run_limit_monthly'],
                plan_tier=plan_info.get('plan_tier', 'free')
            )

    return new_count


def _build_limit_error(
    error_code: str,
    message: str,
    current_count: int,
    limit: int,
    plan_tier: str,
    plan_display_name: str,
    org_id: str,
    org_name: str,
    period_end: Optional[str] = None
) -> Dict[str, Any]:
    """Build a standardized limit exceeded error response for 402."""
    error = {
        "error_code": error_code,
        "message": message,
        "current_count": current_count,
        "limit": limit,
        "plan_tier": plan_tier,
        "plan_display_name": plan_display_name,
        "org_id": org_id,
        "org_name": org_name,
        "upgrade_cta": {
            "text": "Upgrade Plan",
            "url": f"/settings/billing?org={org_id}",
            "description": "Unlock unlimited agents and more runs with Pro"
        }
    }

    if period_end:
        error["period_end"] = period_end
        error["upgrade_cta"]["description"] = f"Upgrade to continue or wait until {period_end} for limit reset"

    return error


async def _log_limit_hit(
    org_id: str,
    limit_type: str,
    plan_tier: str,
    current_count: int,
    limit: int
) -> None:
    """
    Log a limit hit event for analytics and conversion tracking.

    This logs to both the application logger and could be extended
    to send to an analytics service (e.g., Mixpanel, Amplitude).
    """
    logger.info(
        f"Org limit hit: org_id={org_id} type={limit_type} tier={plan_tier} "
        f"usage={current_count}/{limit}",
        extra={
            "event": "org_limit_hit",
            "org_id": str(org_id),
            "limit_type": limit_type,
            "plan_tier": plan_tier,
            "current_count": current_count,
            "limit": limit,
            "usage_percent": round((current_count / limit) * 100, 1) if limit else 0
        }
    )

    # Send limit reached email notification (US-023)
    try:
        from core.notifications.org_billing_notifications import org_billing_notifications
        asyncio.create_task(
            org_billing_notifications.send_usage_limit_reached(
                org_id=org_id,
                limit_type="agents" if limit_type == "agent_creation" else "runs",
                limit=limit
            )
        )
    except Exception as e:
        logger.warning(f"Failed to send usage limit reached notification for org {org_id}: {e}")


async def check_and_notify_approaching_limit(
    org_id: str,
    limit_type: str,
    current_count: int,
    limit: int,
    plan_tier: str
) -> None:
    """
    Check if organization is approaching a limit and send notification if so.

    Sends notification when usage crosses the 80% threshold.
    Uses a tracking mechanism to avoid sending duplicate notifications.

    Args:
        org_id: Organization ID
        limit_type: Type of limit ("agents" or "runs")
        current_count: Current usage count
        limit: Maximum allowed by plan
        plan_tier: Organization's current plan tier
    """
    if limit is None or limit == 0:
        return  # Unlimited, no notification needed

    percentage = round((current_count / limit) * 100)

    # Check if we've crossed the 80% threshold
    if percentage >= APPROACHING_LIMIT_THRESHOLD and percentage < 100:
        # Check if notification was already sent this period
        notification_sent = await _check_approaching_notification_sent(org_id, limit_type)

        if not notification_sent:
            logger.info(
                f"Org approaching limit: org_id={org_id} type={limit_type} "
                f"usage={current_count}/{limit} ({percentage}%)"
            )

            # Mark notification as sent before sending to avoid race conditions
            await _mark_approaching_notification_sent(org_id, limit_type)

            # Send approaching limit email notification (US-023)
            try:
                from core.notifications.org_billing_notifications import org_billing_notifications
                asyncio.create_task(
                    org_billing_notifications.send_usage_limit_approaching(
                        org_id=org_id,
                        limit_type=limit_type,
                        current_usage=current_count,
                        limit=limit,
                        percentage=percentage
                    )
                )
            except Exception as e:
                logger.warning(f"Failed to send approaching limit notification for org {org_id}: {e}")


async def _check_approaching_notification_sent(org_id: str, limit_type: str) -> bool:
    """Check if approaching notification was already sent this billing period."""
    try:
        from core.utils.cache import Cache
        cache_key = f"org_approaching_notification:{org_id}:{limit_type}"
        result = await Cache.get(cache_key)
        return result is not None
    except Exception as e:
        logger.warning(f"Error checking approaching notification cache: {e}")
        return False  # Fail open - send notification if we can't check


async def _mark_approaching_notification_sent(org_id: str, limit_type: str) -> None:
    """Mark approaching notification as sent for this billing period."""
    try:
        from core.utils.cache import Cache
        cache_key = f"org_approaching_notification:{org_id}:{limit_type}"
        # TTL of 32 days to cover a full billing period with some buffer
        await Cache.set(cache_key, True, ttl=32 * 24 * 60 * 60)
    except Exception as e:
        logger.warning(f"Error setting approaching notification cache: {e}")
