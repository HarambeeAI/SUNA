BEGIN;

-- =====================================================
-- Add org_id Foreign Key to Core Tables
-- Part of US-001: Multi-tenant database schema
-- =====================================================

-- Add org_id column to threads table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='threads' AND column_name='org_id' AND table_schema='public') THEN
        ALTER TABLE public.threads
        ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

        COMMENT ON COLUMN public.threads.org_id IS 'Organization that owns this thread. NULL for personal workspace threads.';
    END IF;
END $$;

-- Create index for threads.org_id
CREATE INDEX IF NOT EXISTS idx_threads_org_id ON public.threads(org_id) WHERE org_id IS NOT NULL;

-- Add org_id column to agents table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='agents' AND column_name='org_id' AND table_schema='public') THEN
        ALTER TABLE public.agents
        ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

        COMMENT ON COLUMN public.agents.org_id IS 'Organization that owns this agent. NULL for personal workspace agents.';
    END IF;
END $$;

-- Create index for agents.org_id
CREATE INDEX IF NOT EXISTS idx_agents_org_id ON public.agents(org_id) WHERE org_id IS NOT NULL;

-- Add org_id column to agent_runs table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='agent_runs' AND column_name='org_id' AND table_schema='public') THEN
        ALTER TABLE public.agent_runs
        ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

        COMMENT ON COLUMN public.agent_runs.org_id IS 'Organization that owns this agent run. NULL for personal workspace runs.';
    END IF;
END $$;

-- Create index for agent_runs.org_id
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_id ON public.agent_runs(org_id) WHERE org_id IS NOT NULL;

-- =====================================================
-- Update RLS Policies for Organization-aware Access
-- =====================================================

-- Note: We're adding organization-aware policies alongside existing account-based policies
-- This allows both personal workspace access (via account_id) and organization access (via org_id)

-- --------------------
-- Threads Table Policies
-- --------------------

-- Drop existing thread policies to recreate with org support
DROP POLICY IF EXISTS thread_select_policy ON public.threads;
DROP POLICY IF EXISTS thread_insert_policy ON public.threads;
DROP POLICY IF EXISTS thread_update_policy ON public.threads;
DROP POLICY IF EXISTS thread_delete_policy ON public.threads;

-- Thread SELECT: User can view if they have account access OR organization membership
CREATE POLICY thread_select_policy ON public.threads
    FOR SELECT
    USING (
        -- Personal workspace access (via account)
        basejump.has_role_on_account(account_id) = true
        -- Organization access (viewer or higher)
        OR (org_id IS NOT NULL AND public.has_org_permission(org_id, 'viewer'))
        -- Project-based access
        OR EXISTS (
            SELECT 1 FROM projects
            WHERE projects.project_id = threads.project_id
            AND (
                projects.is_public = TRUE OR
                basejump.has_role_on_account(projects.account_id) = true
            )
        )
    );

-- Thread INSERT: User can create if they have account access OR organization member+ permission
CREATE POLICY thread_insert_policy ON public.threads
    FOR INSERT
    WITH CHECK (
        -- Personal workspace access
        basejump.has_role_on_account(account_id) = true
        -- Organization access (member or higher can create)
        OR (org_id IS NOT NULL AND public.has_org_permission(org_id, 'member'))
        -- Project-based access
        OR EXISTS (
            SELECT 1 FROM projects
            WHERE projects.project_id = threads.project_id
            AND basejump.has_role_on_account(projects.account_id) = true
        )
    );

-- Thread UPDATE: Same as insert
CREATE POLICY thread_update_policy ON public.threads
    FOR UPDATE
    USING (
        basejump.has_role_on_account(account_id) = true
        OR (org_id IS NOT NULL AND public.has_org_permission(org_id, 'member'))
        OR EXISTS (
            SELECT 1 FROM projects
            WHERE projects.project_id = threads.project_id
            AND basejump.has_role_on_account(projects.account_id) = true
        )
    );

-- Thread DELETE: User can delete own threads or org admin+ can delete org threads
CREATE POLICY thread_delete_policy ON public.threads
    FOR DELETE
    USING (
        basejump.has_role_on_account(account_id) = true
        OR (org_id IS NOT NULL AND public.has_org_permission(org_id, 'admin'))
        OR EXISTS (
            SELECT 1 FROM projects
            WHERE projects.project_id = threads.project_id
            AND basejump.has_role_on_account(projects.account_id) = true
        )
    );

-- --------------------
-- Agents Table Policies
-- --------------------

-- Drop existing agent policies to recreate with org support
DROP POLICY IF EXISTS agents_select_own ON public.agents;
DROP POLICY IF EXISTS agents_insert_own ON public.agents;
DROP POLICY IF EXISTS agents_update_own ON public.agents;
DROP POLICY IF EXISTS agents_delete_own ON public.agents;

-- Agents SELECT: User can view if they have account access OR organization membership
CREATE POLICY agents_select_policy ON public.agents
    FOR SELECT
    USING (
        -- Personal workspace access
        basejump.has_role_on_account(account_id)
        -- Organization access (viewer or higher)
        OR (org_id IS NOT NULL AND public.has_org_permission(org_id, 'viewer'))
    );

-- Agents INSERT: Owner can create in personal workspace, org members can create in org
CREATE POLICY agents_insert_policy ON public.agents
    FOR INSERT
    WITH CHECK (
        -- Personal workspace access (owner only)
        basejump.has_role_on_account(account_id, 'owner')
        -- Organization access (member or higher can create)
        OR (org_id IS NOT NULL AND public.has_org_permission(org_id, 'member'))
    );

-- Agents UPDATE: Owner can update in personal workspace, org members can update their own, admin+ can update any
CREATE POLICY agents_update_policy ON public.agents
    FOR UPDATE
    USING (
        -- Personal workspace access (owner only)
        basejump.has_role_on_account(account_id, 'owner')
        -- Organization access (admin or higher)
        OR (org_id IS NOT NULL AND public.has_org_permission(org_id, 'admin'))
    );

-- Agents DELETE: Owner can delete in personal workspace (non-default), org admin+ can delete in org
CREATE POLICY agents_delete_policy ON public.agents
    FOR DELETE
    USING (
        -- Personal workspace access (owner only, non-default)
        (basejump.has_role_on_account(account_id, 'owner') AND is_default = false)
        -- Organization access (admin or higher)
        OR (org_id IS NOT NULL AND public.has_org_permission(org_id, 'admin'))
    );

-- --------------------
-- Agent Runs Table Policies
-- --------------------

-- Drop existing agent_run policies to recreate with org support
DROP POLICY IF EXISTS agent_run_select_policy ON public.agent_runs;
DROP POLICY IF EXISTS agent_run_insert_policy ON public.agent_runs;
DROP POLICY IF EXISTS agent_run_update_policy ON public.agent_runs;
DROP POLICY IF EXISTS agent_run_delete_policy ON public.agent_runs;

-- Agent Runs SELECT: User can view if they have thread access OR organization membership
CREATE POLICY agent_run_select_policy ON public.agent_runs
    FOR SELECT
    USING (
        -- Organization direct access (viewer or higher)
        (org_id IS NOT NULL AND public.has_org_permission(org_id, 'viewer'))
        -- Thread-based access
        OR EXISTS (
            SELECT 1 FROM threads
            LEFT JOIN projects ON threads.project_id = projects.project_id
            WHERE threads.thread_id = agent_runs.thread_id
            AND (
                projects.is_public = TRUE OR
                basejump.has_role_on_account(threads.account_id) = true OR
                basejump.has_role_on_account(projects.account_id) = true OR
                (threads.org_id IS NOT NULL AND public.has_org_permission(threads.org_id, 'viewer'))
            )
        )
    );

-- Agent Runs INSERT: Can create if thread accessible and user is member+
CREATE POLICY agent_run_insert_policy ON public.agent_runs
    FOR INSERT
    WITH CHECK (
        -- Organization direct access (member or higher)
        (org_id IS NOT NULL AND public.has_org_permission(org_id, 'member'))
        -- Thread-based access
        OR EXISTS (
            SELECT 1 FROM threads
            LEFT JOIN projects ON threads.project_id = projects.project_id
            WHERE threads.thread_id = agent_runs.thread_id
            AND (
                basejump.has_role_on_account(threads.account_id) = true OR
                basejump.has_role_on_account(projects.account_id) = true OR
                (threads.org_id IS NOT NULL AND public.has_org_permission(threads.org_id, 'member'))
            )
        )
    );

-- Agent Runs UPDATE: Same as insert
CREATE POLICY agent_run_update_policy ON public.agent_runs
    FOR UPDATE
    USING (
        (org_id IS NOT NULL AND public.has_org_permission(org_id, 'member'))
        OR EXISTS (
            SELECT 1 FROM threads
            LEFT JOIN projects ON threads.project_id = projects.project_id
            WHERE threads.thread_id = agent_runs.thread_id
            AND (
                basejump.has_role_on_account(threads.account_id) = true OR
                basejump.has_role_on_account(projects.account_id) = true OR
                (threads.org_id IS NOT NULL AND public.has_org_permission(threads.org_id, 'member'))
            )
        )
    );

-- Agent Runs DELETE: Admin+ can delete in org, owner can delete personal
CREATE POLICY agent_run_delete_policy ON public.agent_runs
    FOR DELETE
    USING (
        (org_id IS NOT NULL AND public.has_org_permission(org_id, 'admin'))
        OR EXISTS (
            SELECT 1 FROM threads
            LEFT JOIN projects ON threads.project_id = projects.project_id
            WHERE threads.thread_id = agent_runs.thread_id
            AND (
                basejump.has_role_on_account(threads.account_id) = true OR
                basejump.has_role_on_account(projects.account_id) = true
            )
        )
    );

-- =====================================================
-- Helper Functions for Organization Context
-- =====================================================

-- Function to get threads for an organization
CREATE OR REPLACE FUNCTION public.get_org_threads(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user has access to the organization
    IF NOT public.has_org_permission(p_org_id, 'viewer') THEN
        RAISE EXCEPTION 'Access denied to organization';
    END IF;

    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'thread_id', t.thread_id,
                'account_id', t.account_id,
                'org_id', t.org_id,
                'project_id', t.project_id,
                'is_public', t.is_public,
                'created_at', t.created_at,
                'updated_at', t.updated_at
            )
            ORDER BY t.created_at DESC
        ), '[]'::json)
        FROM public.threads t
        WHERE t.org_id = p_org_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_threads(UUID) TO authenticated;

-- Function to get agents for an organization
CREATE OR REPLACE FUNCTION public.get_org_agents(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user has access to the organization
    IF NOT public.has_org_permission(p_org_id, 'viewer') THEN
        RAISE EXCEPTION 'Access denied to organization';
    END IF;

    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'agent_id', a.agent_id,
                'account_id', a.account_id,
                'org_id', a.org_id,
                'name', a.name,
                'description', a.description,
                'is_default', a.is_default,
                'created_at', a.created_at,
                'updated_at', a.updated_at
            )
            ORDER BY a.created_at DESC
        ), '[]'::json)
        FROM public.agents a
        WHERE a.org_id = p_org_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_agents(UUID) TO authenticated;

-- Function to get agent runs for an organization
CREATE OR REPLACE FUNCTION public.get_org_agent_runs(
    p_org_id UUID,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user has access to the organization
    IF NOT public.has_org_permission(p_org_id, 'viewer') THEN
        RAISE EXCEPTION 'Access denied to organization';
    END IF;

    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', ar.id,
                'thread_id', ar.thread_id,
                'org_id', ar.org_id,
                'status', ar.status,
                'started_at', ar.started_at,
                'completed_at', ar.completed_at,
                'error', ar.error,
                'created_at', ar.created_at
            )
            ORDER BY ar.created_at DESC
        ), '[]'::json)
        FROM public.agent_runs ar
        WHERE ar.org_id = p_org_id
        LIMIT p_limit
        OFFSET p_offset
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_agent_runs(UUID, INTEGER, INTEGER) TO authenticated;

COMMIT;
