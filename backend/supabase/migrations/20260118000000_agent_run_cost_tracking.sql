-- Migration: Add cost and token tracking columns to agent_runs table
-- Part of US-024: Agent run cost calculation
--
-- This migration adds:
-- - cost_usd: Total cost in USD for the agent run
-- - input_tokens: Number of prompt/input tokens used
-- - output_tokens: Number of completion/output tokens generated
-- - total_tokens: Sum of input + output tokens
-- - tool_execution_ms: Total tool execution time in milliseconds

BEGIN;

-- Add cost and token tracking columns to agent_runs
ALTER TABLE public.agent_runs
ADD COLUMN IF NOT EXISTS cost_usd DECIMAL(12, 6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS input_tokens BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS tool_execution_ms BIGINT DEFAULT 0;

-- Add comment documentation
COMMENT ON COLUMN public.agent_runs.cost_usd IS 'Total cost in USD for this agent run (calculated from LLM provider pricing)';
COMMENT ON COLUMN public.agent_runs.input_tokens IS 'Total number of prompt/input tokens used in this run';
COMMENT ON COLUMN public.agent_runs.output_tokens IS 'Total number of completion/output tokens generated in this run';
COMMENT ON COLUMN public.agent_runs.total_tokens IS 'Sum of input + output tokens for this run';
COMMENT ON COLUMN public.agent_runs.tool_execution_ms IS 'Total tool execution time in milliseconds';

-- Create index for cost-based queries (e.g., dashboard analytics)
CREATE INDEX IF NOT EXISTS idx_agent_runs_cost_usd ON public.agent_runs(cost_usd);
CREATE INDEX IF NOT EXISTS idx_agent_runs_total_tokens ON public.agent_runs(total_tokens);

-- Create composite index for organization cost analytics
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_cost ON public.agent_runs(org_id, cost_usd)
WHERE org_id IS NOT NULL;

-- Function to update agent run costs and tokens
CREATE OR REPLACE FUNCTION public.update_agent_run_usage(
    p_agent_run_id UUID,
    p_input_tokens BIGINT DEFAULT 0,
    p_output_tokens BIGINT DEFAULT 0,
    p_cost_usd DECIMAL(12, 6) DEFAULT 0,
    p_tool_execution_ms BIGINT DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_tokens BIGINT;
BEGIN
    v_total_tokens := COALESCE(p_input_tokens, 0) + COALESCE(p_output_tokens, 0);

    UPDATE public.agent_runs
    SET
        input_tokens = COALESCE(input_tokens, 0) + COALESCE(p_input_tokens, 0),
        output_tokens = COALESCE(output_tokens, 0) + COALESCE(p_output_tokens, 0),
        total_tokens = COALESCE(total_tokens, 0) + v_total_tokens,
        cost_usd = COALESCE(cost_usd, 0) + COALESCE(p_cost_usd, 0),
        tool_execution_ms = COALESCE(tool_execution_ms, 0) + COALESCE(p_tool_execution_ms, 0),
        updated_at = NOW()
    WHERE id = p_agent_run_id;

    RETURN FOUND;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_agent_run_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_run_usage TO service_role;

-- Function to get agent run cost summary for an organization
CREATE OR REPLACE FUNCTION public.get_org_cost_summary(
    p_org_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
    total_cost_usd DECIMAL(12, 6),
    total_runs BIGINT,
    total_input_tokens BIGINT,
    total_output_tokens BIGINT,
    total_tokens BIGINT,
    total_tool_execution_ms BIGINT,
    avg_cost_per_run DECIMAL(12, 6),
    avg_tokens_per_run DECIMAL(12, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(ar.cost_usd), 0)::DECIMAL(12, 6) as total_cost_usd,
        COUNT(ar.id)::BIGINT as total_runs,
        COALESCE(SUM(ar.input_tokens), 0)::BIGINT as total_input_tokens,
        COALESCE(SUM(ar.output_tokens), 0)::BIGINT as total_output_tokens,
        COALESCE(SUM(ar.total_tokens), 0)::BIGINT as total_tokens,
        COALESCE(SUM(ar.tool_execution_ms), 0)::BIGINT as total_tool_execution_ms,
        CASE
            WHEN COUNT(ar.id) > 0 THEN (COALESCE(SUM(ar.cost_usd), 0) / COUNT(ar.id))::DECIMAL(12, 6)
            ELSE 0
        END as avg_cost_per_run,
        CASE
            WHEN COUNT(ar.id) > 0 THEN (COALESCE(SUM(ar.total_tokens), 0)::DECIMAL / COUNT(ar.id))::DECIMAL(12, 2)
            ELSE 0
        END as avg_tokens_per_run
    FROM public.agent_runs ar
    WHERE ar.org_id = p_org_id
    AND (p_start_date IS NULL OR DATE(ar.started_at) >= p_start_date)
    AND (p_end_date IS NULL OR DATE(ar.started_at) <= p_end_date);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_org_cost_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_cost_summary TO service_role;

-- Function to get cost breakdown by agent for an organization
CREATE OR REPLACE FUNCTION public.get_org_cost_by_agent(
    p_org_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    agent_id UUID,
    agent_name TEXT,
    total_cost_usd DECIMAL(12, 6),
    total_runs BIGINT,
    total_tokens BIGINT,
    avg_cost_per_run DECIMAL(12, 6)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.agent_id,
        a.name as agent_name,
        COALESCE(SUM(ar.cost_usd), 0)::DECIMAL(12, 6) as total_cost_usd,
        COUNT(ar.id)::BIGINT as total_runs,
        COALESCE(SUM(ar.total_tokens), 0)::BIGINT as total_tokens,
        CASE
            WHEN COUNT(ar.id) > 0 THEN (COALESCE(SUM(ar.cost_usd), 0) / COUNT(ar.id))::DECIMAL(12, 6)
            ELSE 0
        END as avg_cost_per_run
    FROM public.agents a
    LEFT JOIN public.agent_runs ar ON ar.agent_id = a.agent_id
        AND ar.org_id = p_org_id
        AND ar.started_at >= date_trunc('month', CURRENT_DATE)
    WHERE a.org_id = p_org_id
    GROUP BY a.agent_id, a.name
    ORDER BY total_cost_usd DESC
    LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_org_cost_by_agent TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_cost_by_agent TO service_role;

COMMIT;
