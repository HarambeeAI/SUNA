-- US-029: Agent performance monitoring - Tool execution tracking
-- This migration creates a table to track individual tool executions for detailed analytics

BEGIN;

-- Create table to track individual tool executions within agent runs
CREATE TABLE IF NOT EXISTS public.agent_run_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    tool_call_id TEXT,  -- The unique ID for this tool call (from LLM)
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,  -- Execution time in milliseconds
    status TEXT NOT NULL DEFAULT 'running', -- running, completed, error
    error_message TEXT,  -- Error message if failed
    input_summary TEXT,  -- Truncated/summarized input for debugging
    output_summary TEXT,  -- Truncated/summarized output for debugging
    metadata JSONB DEFAULT '{}'::jsonb,  -- Additional context (file paths, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('running', 'completed', 'error'))
);

-- Create indexes for efficient querying
CREATE INDEX idx_tool_executions_agent_run_id ON public.agent_run_tool_executions(agent_run_id);
CREATE INDEX idx_tool_executions_tool_name ON public.agent_run_tool_executions(tool_name);
CREATE INDEX idx_tool_executions_duration ON public.agent_run_tool_executions(duration_ms DESC);
CREATE INDEX idx_tool_executions_status ON public.agent_run_tool_executions(status);
CREATE INDEX idx_tool_executions_started_at ON public.agent_run_tool_executions(started_at DESC);

-- Composite index for agent analytics queries
CREATE INDEX idx_tool_executions_agent_analytics ON public.agent_run_tool_executions(agent_run_id, tool_name, duration_ms);

-- Add RLS policies
ALTER TABLE public.agent_run_tool_executions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read tool executions for their own agent runs
CREATE POLICY "tool_executions_select_policy" ON public.agent_run_tool_executions
    FOR SELECT
    USING (
        agent_run_id IN (
            SELECT ar.id FROM agent_runs ar
            JOIN threads t ON ar.thread_id = t.thread_id
            WHERE t.account_id IN (
                SELECT account_id FROM basejump.account_user
                WHERE user_id = auth.uid()
            )
        )
        OR
        agent_run_id IN (
            SELECT ar.id FROM agent_runs ar
            WHERE ar.org_id IN (
                SELECT org_id FROM public.organization_members
                WHERE user_id = auth.uid()
            )
        )
    );

-- Policy: Service role can insert tool executions
CREATE POLICY "tool_executions_insert_policy" ON public.agent_run_tool_executions
    FOR INSERT
    WITH CHECK (true);  -- Insertions happen via backend service

-- Policy: Service role can update tool executions
CREATE POLICY "tool_executions_update_policy" ON public.agent_run_tool_executions
    FOR UPDATE
    USING (true);  -- Updates happen via backend service

-- Grant permissions
GRANT SELECT ON public.agent_run_tool_executions TO authenticated;
GRANT ALL ON public.agent_run_tool_executions TO service_role;

-- =====================================================
-- Helper functions for agent performance analytics
-- =====================================================

-- Function: Get agent performance stats
CREATE OR REPLACE FUNCTION public.get_agent_performance_stats(
    p_agent_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
    total_runs BIGINT,
    completed_runs BIGINT,
    failed_runs BIGINT,
    stopped_runs BIGINT,
    success_rate DECIMAL(5, 2),
    avg_duration_seconds DECIMAL(10, 2),
    total_cost_usd DECIMAL(12, 6),
    total_tokens BIGINT,
    total_tool_execution_ms BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_runs,
        COUNT(CASE WHEN ar.status = 'completed' AND ar.error IS NULL THEN 1 END)::BIGINT as completed_runs,
        COUNT(CASE WHEN ar.status IN ('failed', 'error') OR ar.error IS NOT NULL THEN 1 END)::BIGINT as failed_runs,
        COUNT(CASE WHEN ar.status = 'stopped' THEN 1 END)::BIGINT as stopped_runs,
        CASE
            WHEN COUNT(*) > 0 THEN
                ROUND(
                    COUNT(CASE WHEN ar.status = 'completed' AND ar.error IS NULL THEN 1 END)::DECIMAL / COUNT(*) * 100,
                    2
                )
            ELSE 0
        END as success_rate,
        COALESCE(
            ROUND(AVG(EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)))::DECIMAL, 2),
            0
        ) as avg_duration_seconds,
        COALESCE(SUM(ar.cost_usd), 0)::DECIMAL(12, 6) as total_cost_usd,
        COALESCE(SUM(ar.total_tokens), 0)::BIGINT as total_tokens,
        COALESCE(SUM(ar.tool_execution_ms), 0)::BIGINT as total_tool_execution_ms
    FROM agent_runs ar
    WHERE ar.agent_id = p_agent_id
    AND ar.started_at >= NOW() - (p_days || ' days')::INTERVAL
    AND ar.status != 'running';  -- Exclude currently running
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get agent runs timeline with success/failure breakdown
CREATE OR REPLACE FUNCTION public.get_agent_runs_timeline(
    p_agent_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
    run_date DATE,
    total_runs INTEGER,
    success_count INTEGER,
    failure_count INTEGER,
    stopped_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(
            CURRENT_DATE - p_days,
            CURRENT_DATE,
            '1 day'::INTERVAL
        )::DATE as date
    )
    SELECT
        ds.date as run_date,
        COALESCE(COUNT(ar.id), 0)::INTEGER as total_runs,
        COALESCE(COUNT(CASE WHEN ar.status = 'completed' AND ar.error IS NULL THEN 1 END), 0)::INTEGER as success_count,
        COALESCE(COUNT(CASE WHEN ar.status IN ('failed', 'error') OR ar.error IS NOT NULL THEN 1 END), 0)::INTEGER as failure_count,
        COALESCE(COUNT(CASE WHEN ar.status = 'stopped' THEN 1 END), 0)::INTEGER as stopped_count
    FROM date_series ds
    LEFT JOIN agent_runs ar ON DATE(ar.completed_at) = ds.date AND ar.agent_id = p_agent_id
    GROUP BY ds.date
    ORDER BY ds.date ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get slowest tool executions for an agent
CREATE OR REPLACE FUNCTION public.get_agent_slowest_tools(
    p_agent_id UUID,
    p_days INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    tool_name TEXT,
    execution_count BIGINT,
    avg_duration_ms DECIMAL(10, 2),
    max_duration_ms INTEGER,
    min_duration_ms INTEGER,
    total_duration_ms BIGINT,
    error_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
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
    WHERE ar.agent_id = p_agent_id
    AND te.started_at >= NOW() - (p_days || ' days')::INTERVAL
    AND te.duration_ms IS NOT NULL
    GROUP BY te.tool_name
    ORDER BY avg_duration_ms DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Track a tool execution (called from backend)
CREATE OR REPLACE FUNCTION public.track_tool_execution(
    p_agent_run_id UUID,
    p_tool_name TEXT,
    p_tool_call_id TEXT DEFAULT NULL,
    p_duration_ms INTEGER DEFAULT NULL,
    p_status TEXT DEFAULT 'completed',
    p_error_message TEXT DEFAULT NULL,
    p_input_summary TEXT DEFAULT NULL,
    p_output_summary TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_execution_id UUID;
BEGIN
    INSERT INTO public.agent_run_tool_executions (
        agent_run_id,
        tool_name,
        tool_call_id,
        started_at,
        completed_at,
        duration_ms,
        status,
        error_message,
        input_summary,
        output_summary,
        metadata
    ) VALUES (
        p_agent_run_id,
        p_tool_name,
        p_tool_call_id,
        NOW() - (COALESCE(p_duration_ms, 0) || ' milliseconds')::INTERVAL,
        NOW(),
        p_duration_ms,
        p_status,
        p_error_message,
        LEFT(p_input_summary, 500),  -- Truncate to 500 chars
        LEFT(p_output_summary, 500), -- Truncate to 500 chars
        p_metadata
    )
    RETURNING id INTO v_execution_id;

    RETURN v_execution_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE public.agent_run_tool_executions IS 'Tracks individual tool executions within agent runs for performance analytics (US-029)';
COMMENT ON COLUMN public.agent_run_tool_executions.tool_name IS 'Name of the tool that was executed';
COMMENT ON COLUMN public.agent_run_tool_executions.duration_ms IS 'Execution time in milliseconds';
COMMENT ON COLUMN public.agent_run_tool_executions.status IS 'Execution status: running, completed, or error';
COMMENT ON COLUMN public.agent_run_tool_executions.input_summary IS 'Truncated tool input for debugging (max 500 chars)';
COMMENT ON COLUMN public.agent_run_tool_executions.output_summary IS 'Truncated tool output for debugging (max 500 chars)';

COMMIT;
