-- Migration: User Organization Preferences
-- Description: Add table for tracking user's active organization context
-- This enables users to switch between personal workspace and organizations

BEGIN;

-- ============================================================================
-- Table: user_org_preferences
-- Stores user preferences for organization context
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_org_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    active_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each user can only have one preference record
    CONSTRAINT user_org_preferences_user_id_key UNIQUE (user_id)
);

-- Index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_org_preferences_user_id
ON user_org_preferences(user_id);

-- Index for looking up users in an org
CREATE INDEX IF NOT EXISTS idx_user_org_preferences_active_org_id
ON user_org_preferences(active_org_id);

-- ============================================================================
-- RLS Policies for user_org_preferences
-- ============================================================================

ALTER TABLE user_org_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see their own preferences
CREATE POLICY "user_org_preferences_select_own" ON user_org_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own preferences
CREATE POLICY "user_org_preferences_insert_own" ON user_org_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only update their own preferences
CREATE POLICY "user_org_preferences_update_own" ON user_org_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own preferences
CREATE POLICY "user_org_preferences_delete_own" ON user_org_preferences
    FOR DELETE
    USING (auth.uid() = user_id);


-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function: Get user's active organization ID
CREATE OR REPLACE FUNCTION public.get_user_active_org_id(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT active_org_id INTO v_org_id
    FROM user_org_preferences
    WHERE user_id = p_user_id;

    RETURN v_org_id;
END;
$$;

-- Function: Set user's active organization
-- Also validates that user is a member of the organization
CREATE OR REPLACE FUNCTION public.set_user_active_org(
    p_user_id UUID,
    p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_member BOOLEAN;
BEGIN
    -- If org_id is NULL, allow switching to personal workspace
    IF p_org_id IS NULL THEN
        INSERT INTO user_org_preferences (user_id, active_org_id, updated_at)
        VALUES (p_user_id, NULL, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
            active_org_id = NULL,
            updated_at = NOW();
        RETURN TRUE;
    END IF;

    -- Verify user is a member of the organization
    SELECT EXISTS(
        SELECT 1 FROM organization_members
        WHERE user_id = p_user_id AND org_id = p_org_id
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RAISE EXCEPTION 'User is not a member of this organization';
    END IF;

    -- Upsert the preference
    INSERT INTO user_org_preferences (user_id, active_org_id, updated_at)
    VALUES (p_user_id, p_org_id, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
        active_org_id = p_org_id,
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- Function: Get user's auth context (active org + available orgs)
CREATE OR REPLACE FUNCTION public.get_user_auth_context(p_user_id UUID)
RETURNS TABLE (
    active_org_id UUID,
    org_id UUID,
    org_name TEXT,
    org_slug TEXT,
    org_plan_tier TEXT,
    user_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        uop.active_org_id,
        o.id as org_id,
        o.name as org_name,
        o.slug as org_slug,
        o.plan_tier::text as org_plan_tier,
        om.role::text as user_role
    FROM organization_members om
    INNER JOIN organizations o ON o.id = om.org_id
    LEFT JOIN user_org_preferences uop ON uop.user_id = p_user_id
    WHERE om.user_id = p_user_id
    ORDER BY o.created_at DESC;
END;
$$;

COMMIT;
