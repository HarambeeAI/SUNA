BEGIN;

-- =====================================================
-- Agent Share Links Table
-- Part of US-026: Public agent sharing links
-- =====================================================

-- Create agent_share_links table for public sharing of agents
CREATE TABLE IF NOT EXISTS public.agent_share_links (
    share_id VARCHAR(32) PRIMARY KEY,  -- Unique share token
    agent_id UUID NOT NULL REFERENCES public.agents(agent_id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- Optional expiration date
    is_active BOOLEAN DEFAULT true,  -- Can be deactivated without deleting
    views_count INTEGER DEFAULT 0,
    runs_count INTEGER DEFAULT 0,  -- Track public runs (separate from org limits)
    last_viewed_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}'::jsonb,  -- Settings like rate limits, allowed features
    metadata JSONB DEFAULT '{}'::jsonb   -- Additional metadata
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_agent_share_links_agent_id ON public.agent_share_links(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_share_links_created_by ON public.agent_share_links(created_by);
CREATE INDEX IF NOT EXISTS idx_agent_share_links_active ON public.agent_share_links(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_share_links_created_at ON public.agent_share_links(created_at DESC);

-- Enable RLS
ALTER TABLE public.agent_share_links ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies
-- =====================================================

-- Anyone can view share links (for public access page)
CREATE POLICY "Share links are publicly viewable"
    ON public.agent_share_links FOR SELECT
    USING (true);

-- Agent creators can create share links for their agents
CREATE POLICY "Agent creators can create share links"
    ON public.agent_share_links FOR INSERT
    WITH CHECK (
        created_by IN (
            SELECT a.account_id
            FROM basejump.accounts a
            WHERE a.primary_owner_user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.agents
            WHERE agent_id = agent_share_links.agent_id
            AND account_id = agent_share_links.created_by
        )
    );

-- Share link creators can update their links
CREATE POLICY "Share link creators can update their links"
    ON public.agent_share_links FOR UPDATE
    USING (
        created_by IN (
            SELECT a.account_id
            FROM basejump.accounts a
            WHERE a.primary_owner_user_id = auth.uid()
        )
    );

-- Share link creators can delete their links
CREATE POLICY "Share link creators can delete their links"
    ON public.agent_share_links FOR DELETE
    USING (
        created_by IN (
            SELECT a.account_id
            FROM basejump.accounts a
            WHERE a.primary_owner_user_id = auth.uid()
        )
    );

-- =====================================================
-- Helper Functions
-- =====================================================

-- Generate a unique share token
CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS VARCHAR(32)
LANGUAGE plpgsql
AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    token VARCHAR(32) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..32 LOOP
        token := token || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN token;
END;
$$;

-- Create a share link for an agent
CREATE OR REPLACE FUNCTION public.create_agent_share_link(
    p_agent_id UUID,
    p_expires_in_days INTEGER DEFAULT NULL,
    p_settings JSONB DEFAULT '{}'::jsonb,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_id UUID;
    v_agent RECORD;
    v_share_id VARCHAR(32);
    v_expires_at TIMESTAMPTZ;
    v_result RECORD;
BEGIN
    -- Get the user's account ID
    SELECT id INTO v_account_id
    FROM basejump.accounts
    WHERE primary_owner_user_id = p_user_id
    LIMIT 1;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'User account not found';
    END IF;

    -- Check agent exists and user owns it
    SELECT * INTO v_agent FROM public.agents WHERE agent_id = p_agent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent not found';
    END IF;

    IF v_agent.account_id != v_account_id THEN
        RAISE EXCEPTION 'Only the agent creator can create share links';
    END IF;

    -- Generate unique share token
    LOOP
        v_share_id := public.generate_share_token();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agent_share_links WHERE share_id = v_share_id);
    END LOOP;

    -- Calculate expiration date
    IF p_expires_in_days IS NOT NULL THEN
        v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;
    END IF;

    -- Insert the share link
    INSERT INTO public.agent_share_links (
        share_id, agent_id, created_by, expires_at, settings
    )
    VALUES (
        v_share_id, p_agent_id, v_account_id, v_expires_at, p_settings
    )
    RETURNING * INTO v_result;

    RETURN jsonb_build_object(
        'share_id', v_result.share_id,
        'agent_id', v_result.agent_id,
        'created_at', v_result.created_at,
        'expires_at', v_result.expires_at,
        'is_active', v_result.is_active,
        'settings', v_result.settings
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_agent_share_link(UUID, INTEGER, JSONB, UUID) TO authenticated;

-- Get share link by token (includes agent info)
CREATE OR REPLACE FUNCTION public.get_agent_share_link(
    p_share_id VARCHAR(32)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link RECORD;
    v_agent RECORD;
BEGIN
    -- Get the share link
    SELECT * INTO v_link FROM public.agent_share_links WHERE share_id = p_share_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Check if link is active and not expired
    IF NOT v_link.is_active THEN
        RETURN jsonb_build_object(
            'error', 'This share link has been deactivated',
            'code', 'LINK_DEACTIVATED'
        );
    END IF;

    IF v_link.expires_at IS NOT NULL AND v_link.expires_at < NOW() THEN
        RETURN jsonb_build_object(
            'error', 'This share link has expired',
            'code', 'LINK_EXPIRED'
        );
    END IF;

    -- Get the agent
    SELECT * INTO v_agent FROM public.agents WHERE agent_id = v_link.agent_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'Agent not found',
            'code', 'AGENT_NOT_FOUND'
        );
    END IF;

    -- Increment view count
    UPDATE public.agent_share_links
    SET views_count = views_count + 1, last_viewed_at = NOW()
    WHERE share_id = p_share_id;

    RETURN jsonb_build_object(
        'share_id', v_link.share_id,
        'agent', jsonb_build_object(
            'agent_id', v_agent.agent_id,
            'name', v_agent.name,
            'description', v_agent.description,
            'icon_name', v_agent.icon_name,
            'icon_color', v_agent.icon_color,
            'icon_background', v_agent.icon_background
        ),
        'created_at', v_link.created_at,
        'views_count', v_link.views_count + 1,
        'settings', v_link.settings
    );
END;
$$;

-- Allow anon and authenticated users to get share links
GRANT EXECUTE ON FUNCTION public.get_agent_share_link(VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION public.get_agent_share_link(VARCHAR) TO authenticated;

-- Revoke (deactivate) a share link
CREATE OR REPLACE FUNCTION public.revoke_agent_share_link(
    p_share_id VARCHAR(32),
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_id UUID;
    v_link RECORD;
BEGIN
    -- Get the user's account ID
    SELECT id INTO v_account_id
    FROM basejump.accounts
    WHERE primary_owner_user_id = p_user_id
    LIMIT 1;

    -- Get the share link
    SELECT * INTO v_link FROM public.agent_share_links WHERE share_id = p_share_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Share link not found';
    END IF;

    IF v_link.created_by != v_account_id THEN
        RAISE EXCEPTION 'Only the link creator can revoke it';
    END IF;

    -- Deactivate the link
    UPDATE public.agent_share_links
    SET is_active = false
    WHERE share_id = p_share_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_agent_share_link(VARCHAR, UUID) TO authenticated;

-- Delete a share link completely
CREATE OR REPLACE FUNCTION public.delete_agent_share_link(
    p_share_id VARCHAR(32),
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_id UUID;
    v_link RECORD;
BEGIN
    -- Get the user's account ID
    SELECT id INTO v_account_id
    FROM basejump.accounts
    WHERE primary_owner_user_id = p_user_id
    LIMIT 1;

    -- Get the share link
    SELECT * INTO v_link FROM public.agent_share_links WHERE share_id = p_share_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Share link not found';
    END IF;

    IF v_link.created_by != v_account_id THEN
        RAISE EXCEPTION 'Only the link creator can delete it';
    END IF;

    -- Delete the link
    DELETE FROM public.agent_share_links WHERE share_id = p_share_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_agent_share_link(VARCHAR, UUID) TO authenticated;

-- Get all share links for an agent
CREATE OR REPLACE FUNCTION public.get_agent_share_links(
    p_agent_id UUID,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_id UUID;
    v_agent RECORD;
BEGIN
    -- Get the user's account ID
    SELECT id INTO v_account_id
    FROM basejump.accounts
    WHERE primary_owner_user_id = p_user_id
    LIMIT 1;

    -- Check agent exists and user owns it
    SELECT * INTO v_agent FROM public.agents WHERE agent_id = p_agent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent not found';
    END IF;

    IF v_agent.account_id != v_account_id THEN
        RAISE EXCEPTION 'Only the agent creator can view share links';
    END IF;

    RETURN (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'share_id', sl.share_id,
                'agent_id', sl.agent_id,
                'created_at', sl.created_at,
                'expires_at', sl.expires_at,
                'is_active', sl.is_active,
                'views_count', sl.views_count,
                'runs_count', sl.runs_count,
                'last_viewed_at', sl.last_viewed_at,
                'last_run_at', sl.last_run_at,
                'settings', sl.settings
            )
            ORDER BY sl.created_at DESC
        ), '[]'::jsonb)
        FROM public.agent_share_links sl
        WHERE sl.agent_id = p_agent_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agent_share_links(UUID, UUID) TO authenticated;

-- Increment run count for a share link (called when public run is executed)
CREATE OR REPLACE FUNCTION public.increment_share_link_run(
    p_share_id VARCHAR(32)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.agent_share_links
    SET runs_count = runs_count + 1, last_run_at = NOW()
    WHERE share_id = p_share_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_share_link_run(VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_share_link_run(VARCHAR) TO authenticated;

COMMIT;
