"""Agent run cost tracking service.

Part of US-024: Agent run cost calculation.
Calculates and tracks costs for agent runs including LLM usage and tool execution time.
"""

import asyncio
from decimal import Decimal
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import time

from core.utils.logger import logger
from core.services.db import execute_one, serialize_row
from core.billing.credits.calculator import (
    calculate_token_cost,
    calculate_cached_token_cost,
    calculate_cache_write_cost
)


class AgentRunCostTracker:
    """
    Tracks costs and usage for a single agent run.

    Usage:
        tracker = AgentRunCostTracker(agent_run_id)
        tracker.add_llm_usage(prompt_tokens, completion_tokens, model)
        tracker.add_tool_execution_time(duration_ms)
        await tracker.finalize()
    """

    def __init__(self, agent_run_id: str):
        self.agent_run_id = agent_run_id
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_cost_usd = Decimal('0')
        self.total_tool_execution_ms = 0
        self._lock = asyncio.Lock()

    def add_llm_usage(
        self,
        prompt_tokens: int,
        completion_tokens: int,
        model: str,
        cache_read_tokens: int = 0,
        cache_creation_tokens: int = 0
    ) -> Decimal:
        """
        Add LLM usage to the tracker and calculate cost.

        Args:
            prompt_tokens: Number of input/prompt tokens
            completion_tokens: Number of output/completion tokens
            model: Model identifier for pricing lookup
            cache_read_tokens: Number of tokens read from cache (cheaper)
            cache_creation_tokens: Number of tokens written to cache

        Returns:
            Cost in USD for this LLM call
        """
        cost = Decimal('0')

        # Calculate cost based on caching
        if cache_read_tokens > 0 or cache_creation_tokens > 0:
            non_cached_prompt_tokens = prompt_tokens - cache_read_tokens - cache_creation_tokens

            if cache_read_tokens > 0:
                cost += calculate_cached_token_cost(cache_read_tokens, model)

            if cache_creation_tokens > 0:
                cost += calculate_cache_write_cost(cache_creation_tokens, model, cache_ttl="5m")

            cost += calculate_token_cost(non_cached_prompt_tokens, completion_tokens, model)
        else:
            cost = calculate_token_cost(prompt_tokens, completion_tokens, model)

        # Update totals
        self.total_input_tokens += prompt_tokens
        self.total_output_tokens += completion_tokens
        self.total_cost_usd += cost

        logger.debug(
            f"[COST_TRACKER] Run {self.agent_run_id}: +{prompt_tokens} input, "
            f"+{completion_tokens} output, +${cost:.6f} (total: ${self.total_cost_usd:.6f})"
        )

        return cost

    def add_tool_execution_time(self, duration_ms: int):
        """
        Add tool execution time to the tracker.

        Args:
            duration_ms: Tool execution duration in milliseconds
        """
        self.total_tool_execution_ms += duration_ms
        logger.debug(
            f"[COST_TRACKER] Run {self.agent_run_id}: +{duration_ms}ms tool time "
            f"(total: {self.total_tool_execution_ms}ms)"
        )

    async def update_database(self) -> bool:
        """
        Update the agent_runs record with accumulated usage data.

        Returns:
            True if update was successful
        """
        async with self._lock:
            try:
                sql = """
                SELECT public.update_agent_run_usage(
                    :agent_run_id,
                    :input_tokens,
                    :output_tokens,
                    :cost_usd,
                    :tool_execution_ms
                ) as success
                """

                result = await execute_one(sql, {
                    "agent_run_id": self.agent_run_id,
                    "input_tokens": self.total_input_tokens,
                    "output_tokens": self.total_output_tokens,
                    "cost_usd": float(self.total_cost_usd),
                    "tool_execution_ms": self.total_tool_execution_ms
                }, commit=True)

                success = result.get("success", False) if result else False

                if success:
                    logger.info(
                        f"[COST_TRACKER] Updated run {self.agent_run_id}: "
                        f"tokens={self.total_input_tokens}+{self.total_output_tokens}, "
                        f"cost=${self.total_cost_usd:.6f}, tools={self.total_tool_execution_ms}ms"
                    )
                    # Reset counters after successful update
                    self.total_input_tokens = 0
                    self.total_output_tokens = 0
                    self.total_cost_usd = Decimal('0')
                    self.total_tool_execution_ms = 0
                else:
                    logger.warning(f"[COST_TRACKER] Failed to update run {self.agent_run_id}")

                return success

            except Exception as e:
                logger.error(f"[COST_TRACKER] Error updating run {self.agent_run_id}: {e}")
                return False

    async def finalize(self) -> Dict[str, Any]:
        """
        Finalize the cost tracking by persisting to database.

        Returns:
            Summary of the tracked usage
        """
        await self.update_database()

        return {
            "agent_run_id": self.agent_run_id,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_tokens": self.total_input_tokens + self.total_output_tokens,
            "total_cost_usd": float(self.total_cost_usd),
            "total_tool_execution_ms": self.total_tool_execution_ms
        }


# Global registry of active cost trackers per agent run
_active_trackers: Dict[str, AgentRunCostTracker] = {}
_tracker_lock = asyncio.Lock()


async def get_or_create_cost_tracker(agent_run_id: str) -> AgentRunCostTracker:
    """
    Get or create a cost tracker for an agent run.

    Args:
        agent_run_id: The agent run ID

    Returns:
        AgentRunCostTracker instance
    """
    async with _tracker_lock:
        if agent_run_id not in _active_trackers:
            _active_trackers[agent_run_id] = AgentRunCostTracker(agent_run_id)
            logger.debug(f"[COST_TRACKER] Created tracker for run {agent_run_id}")
        return _active_trackers[agent_run_id]


async def finalize_cost_tracker(agent_run_id: str) -> Optional[Dict[str, Any]]:
    """
    Finalize and remove a cost tracker for an agent run.

    Args:
        agent_run_id: The agent run ID

    Returns:
        Summary of the tracked usage, or None if no tracker found
    """
    async with _tracker_lock:
        tracker = _active_trackers.pop(agent_run_id, None)

    if tracker:
        return await tracker.finalize()

    return None


async def track_llm_usage(
    agent_run_id: str,
    prompt_tokens: int,
    completion_tokens: int,
    model: str,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0
) -> Decimal:
    """
    Convenience function to track LLM usage for an agent run.

    Args:
        agent_run_id: The agent run ID
        prompt_tokens: Number of input/prompt tokens
        completion_tokens: Number of output/completion tokens
        model: Model identifier for pricing lookup
        cache_read_tokens: Number of tokens read from cache
        cache_creation_tokens: Number of tokens written to cache

    Returns:
        Cost in USD for this LLM call
    """
    tracker = await get_or_create_cost_tracker(agent_run_id)
    return tracker.add_llm_usage(
        prompt_tokens, completion_tokens, model,
        cache_read_tokens, cache_creation_tokens
    )


async def track_tool_execution(agent_run_id: str, duration_ms: int):
    """
    Convenience function to track tool execution time for an agent run.

    Args:
        agent_run_id: The agent run ID
        duration_ms: Tool execution duration in milliseconds
    """
    tracker = await get_or_create_cost_tracker(agent_run_id)
    tracker.add_tool_execution_time(duration_ms)


async def get_agent_run_cost(agent_run_id: str) -> Optional[Dict[str, Any]]:
    """
    Get cost information for an agent run from the database.

    Args:
        agent_run_id: The agent run ID

    Returns:
        Cost information dict or None if not found
    """
    sql = """
    SELECT
        id,
        cost_usd,
        input_tokens,
        output_tokens,
        total_tokens,
        tool_execution_ms
    FROM agent_runs
    WHERE id = :agent_run_id
    """

    result = await execute_one(sql, {"agent_run_id": agent_run_id})
    return serialize_row(dict(result)) if result else None
