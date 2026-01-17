-- Migration: User Onboarding State
-- Description: Add columns to track user onboarding progress
-- This enables the onboarding flow to be resumable and dismissible

BEGIN;

-- ============================================================================
-- Add onboarding columns to user_org_preferences
-- We use this table since it already has user preferences and RLS policies
-- ============================================================================

-- Add onboarding completion timestamp
ALTER TABLE public.user_org_preferences
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Add current onboarding step (for resume functionality)
-- -1 = not started, 0-N = step index, NULL = completed or dismissed
ALTER TABLE public.user_org_preferences
ADD COLUMN IF NOT EXISTS onboarding_current_step INTEGER DEFAULT -1;

-- Add flag for whether onboarding was dismissed (skipped)
ALTER TABLE public.user_org_preferences
ADD COLUMN IF NOT EXISTS onboarding_dismissed BOOLEAN DEFAULT FALSE;

-- Add onboarding data (stores user choices during onboarding)
ALTER TABLE public.user_org_preferences
ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}';

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function: Check if user has completed onboarding
CREATE OR REPLACE FUNCTION public.has_user_completed_onboarding(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_completed BOOLEAN;
BEGIN
    SELECT (onboarding_completed_at IS NOT NULL OR onboarding_dismissed = TRUE) INTO v_completed
    FROM user_org_preferences
    WHERE user_id = p_user_id;

    -- If no record exists, user hasn't completed onboarding
    IF v_completed IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN v_completed;
END;
$$;

-- Function: Update user onboarding progress
CREATE OR REPLACE FUNCTION public.update_user_onboarding_progress(
    p_user_id UUID,
    p_current_step INTEGER,
    p_data JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_org_preferences (user_id, onboarding_current_step, onboarding_data, updated_at)
    VALUES (p_user_id, p_current_step, COALESCE(p_data, '{}'), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
        onboarding_current_step = p_current_step,
        onboarding_data = COALESCE(p_data, user_org_preferences.onboarding_data),
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- Function: Complete user onboarding
CREATE OR REPLACE FUNCTION public.complete_user_onboarding(
    p_user_id UUID,
    p_data JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_org_preferences (
        user_id,
        onboarding_completed_at,
        onboarding_current_step,
        onboarding_data,
        updated_at
    )
    VALUES (p_user_id, NOW(), NULL, COALESCE(p_data, '{}'), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
        onboarding_completed_at = NOW(),
        onboarding_current_step = NULL,
        onboarding_data = COALESCE(p_data, user_org_preferences.onboarding_data),
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- Function: Dismiss user onboarding (skip without completing)
CREATE OR REPLACE FUNCTION public.dismiss_user_onboarding(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_org_preferences (
        user_id,
        onboarding_dismissed,
        onboarding_current_step,
        updated_at
    )
    VALUES (p_user_id, TRUE, NULL, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
        onboarding_dismissed = TRUE,
        onboarding_current_step = NULL,
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- Function: Reset user onboarding (for Help menu "Resume Onboarding")
CREATE OR REPLACE FUNCTION public.reset_user_onboarding(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_org_preferences (
        user_id,
        onboarding_completed_at,
        onboarding_dismissed,
        onboarding_current_step,
        onboarding_data,
        updated_at
    )
    VALUES (p_user_id, NULL, FALSE, 0, '{}', NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
        onboarding_completed_at = NULL,
        onboarding_dismissed = FALSE,
        onboarding_current_step = 0,
        onboarding_data = '{}',
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- Function: Get user onboarding state
CREATE OR REPLACE FUNCTION public.get_user_onboarding_state(p_user_id UUID)
RETURNS TABLE (
    completed_at TIMESTAMPTZ,
    current_step INTEGER,
    dismissed BOOLEAN,
    data JSONB,
    should_show_onboarding BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        uop.onboarding_completed_at as completed_at,
        uop.onboarding_current_step as current_step,
        COALESCE(uop.onboarding_dismissed, FALSE) as dismissed,
        COALESCE(uop.onboarding_data, '{}') as data,
        (uop.onboarding_completed_at IS NULL AND COALESCE(uop.onboarding_dismissed, FALSE) = FALSE) as should_show_onboarding
    FROM user_org_preferences uop
    WHERE uop.user_id = p_user_id;

    -- If no record found, return defaults indicating onboarding should show
    IF NOT FOUND THEN
        RETURN QUERY SELECT
            NULL::TIMESTAMPTZ as completed_at,
            -1 as current_step,
            FALSE as dismissed,
            '{}'::JSONB as data,
            TRUE as should_show_onboarding;
    END IF;
END;
$$;

COMMIT;
