BEGIN;

-- =====================================================
-- Add Agent Visibility Feature
-- Part of US-019: Agent sharing permissions
-- =====================================================

-- Create visibility enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_visibility') THEN
        CREATE TYPE agent_visibility AS ENUM ('private', 'org', 'public');
    END IF;
END $$;

-- Add visibility column to agents table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='agents' AND column_name='visibility' AND table_schema='public') THEN
        ALTER TABLE public.agents
        ADD COLUMN visibility agent_visibility NOT NULL DEFAULT 'private';

        COMMENT ON COLUMN public.agents.visibility IS 'Agent visibility: private (creator only), org (organization members), public (marketplace)';
    END IF;
END $$;

-- Create index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_agents_visibility ON public.agents(visibility);

-- Create composite index for org agents by visibility
CREATE INDEX IF NOT EXISTS idx_agents_org_visibility ON public.agents(org_id, visibility) WHERE org_id IS NOT NULL;

-- =====================================================
-- Update RLS Policies for Visibility-based Access
-- =====================================================

-- Drop existing agent policies
DROP POLICY IF EXISTS agents_select_policy ON public.agents;
DROP POLICY IF EXISTS agents_insert_policy ON public.agents;
DROP POLICY IF EXISTS agents_update_policy ON public.agents;
DROP POLICY IF EXISTS agents_delete_policy ON public.agents;

-- Agents SELECT: Visibility-aware access control
-- - Private: only creator can see
-- - Org: all organization members can see (viewer+)
-- - Public: anyone authenticated can see (future marketplace)
CREATE POLICY agents_select_policy ON public.agents
    FOR SELECT
    USING (
        -- Creator can always see their own agents
        basejump.has_role_on_account(account_id)
        -- Org visibility: organization members can see
        OR (
            visibility = 'org'
            AND org_id IS NOT NULL
            AND public.has_org_permission(org_id, 'viewer')
        )
        -- Public visibility: any authenticated user can see (future marketplace)
        OR (
            visibility = 'public'
            AND auth.uid() IS NOT NULL
        )
    );

-- Agents INSERT: Same as before
CREATE POLICY agents_insert_policy ON public.agents
    FOR INSERT
    WITH CHECK (
        -- Personal workspace access (owner only)
        basejump.has_role_on_account(account_id, 'owner')
        -- Organization access (member or higher can create)
        OR (org_id IS NOT NULL AND public.has_org_permission(org_id, 'member'))
    );

-- Agents UPDATE: Creator can update own agents, org admins can update org agents with org visibility
CREATE POLICY agents_update_policy ON public.agents
    FOR UPDATE
    USING (
        -- Creator can always update their own agents
        basejump.has_role_on_account(account_id, 'owner')
        -- Organization admins can update org-visible agents in their org
        OR (
            org_id IS NOT NULL
            AND visibility IN ('org', 'public')
            AND public.has_org_permission(org_id, 'admin')
        )
    );

-- Agents DELETE: Creator can delete own agents, org admin+ can delete org-visible agents
CREATE POLICY agents_delete_policy ON public.agents
    FOR DELETE
    USING (
        -- Personal workspace access (owner only, non-default)
        (basejump.has_role_on_account(account_id, 'owner') AND is_default = false)
        -- Organization access: admin can delete org-visible agents
        OR (
            org_id IS NOT NULL
            AND visibility IN ('org', 'public')
            AND public.has_org_permission(org_id, 'admin')
            AND is_default = false
        )
    );

-- =====================================================
-- Update Existing Agents with Default Visibility
-- =====================================================

-- Set visibility based on context:
-- - Agents with org_id: default to 'org' (visible to team)
-- - Agents without org_id (personal): default to 'private'
UPDATE public.agents
SET visibility = CASE
    WHEN org_id IS NOT NULL THEN 'org'::agent_visibility
    ELSE 'private'::agent_visibility
END
WHERE visibility IS NULL OR visibility = 'private';

-- Actually, for the migration, we need to update org agents to be 'org' visibility
UPDATE public.agents
SET visibility = 'org'::agent_visibility
WHERE org_id IS NOT NULL AND visibility = 'private';

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to get visible agents for a user in an organization
CREATE OR REPLACE FUNCTION public.get_visible_org_agents(
    p_org_id UUID,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_account_id UUID;
BEGIN
    -- Get the user's account ID
    SELECT id INTO v_user_account_id
    FROM basejump.accounts
    WHERE primary_owner_user_id = p_user_id
    LIMIT 1;

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
                'visibility', a.visibility,
                'is_default', a.is_default,
                'icon_name', a.icon_name,
                'icon_color', a.icon_color,
                'icon_background', a.icon_background,
                'created_at', a.created_at,
                'updated_at', a.updated_at,
                'is_mine', CASE WHEN a.account_id = v_user_account_id THEN true ELSE false END
            )
            ORDER BY
                CASE WHEN a.account_id = v_user_account_id THEN 0 ELSE 1 END,
                a.created_at DESC
        ), '[]'::json)
        FROM public.agents a
        WHERE a.org_id = p_org_id
        AND (
            -- User can see their own agents (any visibility)
            a.account_id = v_user_account_id
            -- Or org/public visibility agents
            OR a.visibility IN ('org', 'public')
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_org_agents(UUID, UUID) TO authenticated;

-- Function to update agent visibility
CREATE OR REPLACE FUNCTION public.update_agent_visibility(
    p_agent_id UUID,
    p_visibility agent_visibility,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agent RECORD;
    v_user_account_id UUID;
BEGIN
    -- Get the user's account ID
    SELECT id INTO v_user_account_id
    FROM basejump.accounts
    WHERE primary_owner_user_id = p_user_id
    LIMIT 1;

    -- Get the agent
    SELECT * INTO v_agent FROM public.agents WHERE agent_id = p_agent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent not found';
    END IF;

    -- Check if user can update this agent's visibility
    -- Only the creator can change visibility
    IF v_agent.account_id != v_user_account_id THEN
        RAISE EXCEPTION 'Only the agent creator can change visibility';
    END IF;

    -- Validate visibility based on context
    -- If agent is in personal workspace (no org_id), only 'private' is allowed
    IF v_agent.org_id IS NULL AND p_visibility != 'private' THEN
        RAISE EXCEPTION 'Personal workspace agents can only be private';
    END IF;

    -- Update the visibility
    UPDATE public.agents
    SET visibility = p_visibility, updated_at = NOW()
    WHERE agent_id = p_agent_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_agent_visibility(UUID, agent_visibility, UUID) TO authenticated;

COMMIT;
