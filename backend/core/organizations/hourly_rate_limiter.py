"""Hourly Rate Limiting for Agent Runs

Part of US-025: Rate limiting for free tier.

Implements per-user hourly rate limits based on plan tier:
- Free tier: max 10 agent runs per hour
- Pro tier: max 100 agent runs per hour
- Enterprise tier: no rate limit

Uses Redis sliding window for accurate, performant rate limiting.
Returns 429 Too Many Requests when limit exceeded with Retry-After header.
"""

import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple

from core.services import redis
from core.utils.logger import logger


# Rate limits by plan tier (runs per hour)
HOURLY_RATE_LIMITS: Dict[str, Optional[int]] = {
    "free": 10,       # Free tier: 10 runs/hour
    "pro": 100,       # Pro tier: 100 runs/hour
    "enterprise": None,  # Enterprise: unlimited
}

# Redis key TTL (1 hour + buffer for safety)
RATE_LIMIT_TTL_SECONDS = 3660  # 61 minutes

# Error code for rate limit exceeded
ERROR_CODE_RATE_LIMIT = "HOURLY_RATE_LIMIT_EXCEEDED"


def _get_current_hour_key(user_id: str, org_id: Optional[str]) -> str:
    """
    Generate Redis key for current hour window.

    Key format: rate_limit:hourly_runs:{context}:{hour_timestamp}

    Context is org_id if in org context, otherwise user_id.
    This allows rate limiting to be per-organization for org users
    and per-user for personal workspace users.
    """
    # Get current UTC hour as timestamp
    now = datetime.now(timezone.utc)
    hour_timestamp = now.replace(minute=0, second=0, microsecond=0).strftime("%Y%m%d%H")

    # Use org_id for org context, user_id for personal workspace
    context = org_id if org_id else user_id

    return f"rate_limit:hourly_runs:{context}:{hour_timestamp}"


def _get_seconds_until_next_hour() -> int:
    """Calculate seconds remaining until the next hour."""
    now = datetime.now(timezone.utc)
    seconds_into_hour = now.minute * 60 + now.second
    seconds_until_next_hour = 3600 - seconds_into_hour
    return max(1, seconds_until_next_hour)  # At least 1 second


def _get_next_hour_reset_time() -> str:
    """Get ISO timestamp of when the rate limit resets (next hour)."""
    now = datetime.now(timezone.utc)
    next_hour = now.replace(minute=0, second=0, microsecond=0)
    # Add 1 hour
    next_hour = next_hour.replace(hour=(next_hour.hour + 1) % 24)
    if now.hour == 23:
        # Handle day rollover
        next_hour = next_hour.replace(day=next_hour.day + 1)
    return next_hour.isoformat()


def _build_rate_limit_error(
    current_count: int,
    limit: int,
    plan_tier: str,
    plan_display_name: str,
    retry_after_seconds: int,
    reset_at: str,
    context_id: str,
    is_org: bool
) -> Dict[str, Any]:
    """Build a standardized rate limit exceeded error response for 429."""
    return {
        "error_code": ERROR_CODE_RATE_LIMIT,
        "message": f"Hourly rate limit exceeded. You've made {current_count} requests this hour. Your {plan_display_name} plan allows {limit} per hour.",
        "current_count": current_count,
        "limit": limit,
        "plan_tier": plan_tier,
        "plan_display_name": plan_display_name,
        "retry_after_seconds": retry_after_seconds,
        "reset_at": reset_at,
        "upgrade_cta": {
            "text": "Upgrade Plan",
            "url": f"/settings/billing?org={context_id}" if is_org else "/settings/billing",
            "description": "Upgrade to Pro for 100 runs/hour or Enterprise for unlimited"
        }
    }


async def check_hourly_rate_limit(
    user_id: str,
    org_id: Optional[str],
    plan_tier: str
) -> Dict[str, Any]:
    """
    Check if user/organization can execute another agent run based on hourly rate limits.

    Uses Redis INCR for atomic increment and count check in a single operation.

    Args:
        user_id: User ID making the request
        org_id: Organization ID if in org context, None for personal workspace
        plan_tier: User's or organization's plan tier ('free', 'pro', 'enterprise')

    Returns:
        Dict with:
        - can_proceed: bool indicating if request should be allowed
        - current_count: current count of requests this hour
        - limit: hourly limit for the plan tier (None = unlimited)
        - plan_tier: the plan tier used for limit checking
        - error_response: prepared 429 error response if limit exceeded, None otherwise
        - retry_after_seconds: seconds until reset if limit exceeded, None otherwise
    """
    try:
        # Normalize plan tier
        tier = plan_tier.lower() if plan_tier else "free"

        # Get the rate limit for this tier
        limit = HOURLY_RATE_LIMITS.get(tier)

        # Enterprise has no limit
        if limit is None:
            return {
                'can_proceed': True,
                'current_count': 0,
                'limit': None,
                'plan_tier': tier,
                'error_response': None,
                'retry_after_seconds': None
            }

        # Get Redis key for current hour
        rate_key = _get_current_hour_key(user_id, org_id)

        # Atomic increment - Redis returns the new count
        current_count = await redis.incr(rate_key)

        # Set expiration on first increment (when count is 1)
        if current_count == 1:
            await redis.expire(rate_key, RATE_LIMIT_TTL_SECONDS)

        # Check if over limit
        can_proceed = current_count <= limit

        result = {
            'can_proceed': can_proceed,
            'current_count': current_count,
            'limit': limit,
            'plan_tier': tier,
            'error_response': None,
            'retry_after_seconds': None
        }

        if not can_proceed:
            retry_after = _get_seconds_until_next_hour()
            reset_at = _get_next_hour_reset_time()

            # Get display name for plan
            plan_display_names = {
                "free": "Free",
                "pro": "Pro",
                "enterprise": "Enterprise"
            }
            plan_display_name = plan_display_names.get(tier, tier.capitalize())

            result['error_response'] = _build_rate_limit_error(
                current_count=current_count,
                limit=limit,
                plan_tier=tier,
                plan_display_name=plan_display_name,
                retry_after_seconds=retry_after,
                reset_at=reset_at,
                context_id=org_id if org_id else user_id,
                is_org=bool(org_id)
            )
            result['retry_after_seconds'] = retry_after

            # Log rate limit hit for analytics
            _log_rate_limit_hit(
                user_id=user_id,
                org_id=org_id,
                plan_tier=tier,
                current_count=current_count,
                limit=limit
            )

        return result

    except Exception as e:
        logger.error(f"Error checking hourly rate limit for user {user_id}: {e}")
        # Fail open on error to not block users
        return {
            'can_proceed': True,
            'current_count': 0,
            'limit': None,
            'plan_tier': plan_tier or 'unknown',
            'error_response': None,
            'retry_after_seconds': None
        }


async def get_current_hourly_usage(
    user_id: str,
    org_id: Optional[str]
) -> Tuple[int, int]:
    """
    Get current hourly usage for a user/organization.

    Useful for displaying remaining quota in UI.

    Args:
        user_id: User ID
        org_id: Organization ID if in org context, None for personal workspace

    Returns:
        Tuple of (current_count, seconds_until_reset)
    """
    try:
        rate_key = _get_current_hour_key(user_id, org_id)
        count_str = await redis.get(rate_key)
        current_count = int(count_str) if count_str else 0
        seconds_until_reset = _get_seconds_until_next_hour()
        return (current_count, seconds_until_reset)
    except Exception as e:
        logger.warning(f"Error getting hourly usage for user {user_id}: {e}")
        return (0, 3600)


def _log_rate_limit_hit(
    user_id: str,
    org_id: Optional[str],
    plan_tier: str,
    current_count: int,
    limit: int
) -> None:
    """
    Log a rate limit hit event for analytics and monitoring.
    """
    logger.info(
        f"Hourly rate limit hit: user_id={user_id} org_id={org_id} tier={plan_tier} "
        f"usage={current_count}/{limit}",
        extra={
            "event": "hourly_rate_limit_hit",
            "user_id": user_id,
            "org_id": str(org_id) if org_id else None,
            "plan_tier": plan_tier,
            "current_count": current_count,
            "limit": limit,
        }
    )
