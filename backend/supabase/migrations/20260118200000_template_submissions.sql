-- Template Submissions Migration
-- Creates table and functions for user template submissions to the marketplace

BEGIN;

-- Create submission status enum
DO $$ BEGIN
    CREATE TYPE template_submission_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create template_submissions table
CREATE TABLE IF NOT EXISTS template_submissions (
    submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    submitter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Template metadata (captured at submission time)
    template_name VARCHAR(255) NOT NULL,
    template_description TEXT,
    category_id UUID REFERENCES template_categories(id),
    use_cases TEXT[], -- Array of example use cases

    -- Submission tracking
    status template_submission_status NOT NULL DEFAULT 'pending',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),

    -- Review feedback
    rejection_reason TEXT,
    admin_notes TEXT,

    -- The published template (set after approval)
    published_template_id UUID REFERENCES agent_templates(template_id),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_template_submissions_status ON template_submissions(status);
CREATE INDEX IF NOT EXISTS idx_template_submissions_submitter ON template_submissions(submitter_id);
CREATE INDEX IF NOT EXISTS idx_template_submissions_agent ON template_submissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_template_submissions_category ON template_submissions(category_id);
CREATE INDEX IF NOT EXISTS idx_template_submissions_submitted_at ON template_submissions(submitted_at DESC);

-- RLS policies
ALTER TABLE template_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
DROP POLICY IF EXISTS template_submissions_select_own ON template_submissions;
CREATE POLICY template_submissions_select_own ON template_submissions
    FOR SELECT
    USING (auth.uid() = submitter_id);

-- Admins can view all submissions
DROP POLICY IF EXISTS template_submissions_select_admin ON template_submissions;
CREATE POLICY template_submissions_select_admin ON template_submissions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- Users can insert submissions for their own agents
DROP POLICY IF EXISTS template_submissions_insert_own ON template_submissions;
CREATE POLICY template_submissions_insert_own ON template_submissions
    FOR INSERT
    WITH CHECK (
        auth.uid() = submitter_id
        AND EXISTS (
            SELECT 1 FROM agents
            WHERE agent_id = template_submissions.agent_id
            AND account_id = auth.uid()
        )
    );

-- Admins can update submissions (for approval/rejection)
DROP POLICY IF EXISTS template_submissions_update_admin ON template_submissions;
CREATE POLICY template_submissions_update_admin ON template_submissions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- Users can delete their own pending submissions
DROP POLICY IF EXISTS template_submissions_delete_own ON template_submissions;
CREATE POLICY template_submissions_delete_own ON template_submissions
    FOR DELETE
    USING (
        auth.uid() = submitter_id
        AND status = 'pending'
    );

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Create a template submission
CREATE OR REPLACE FUNCTION create_template_submission(
    p_agent_id UUID,
    p_submitter_id UUID,
    p_template_name VARCHAR(255),
    p_template_description TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_use_cases TEXT[] DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS template_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_submission template_submissions;
BEGIN
    -- Verify the agent belongs to the submitter
    IF NOT EXISTS (
        SELECT 1 FROM agents
        WHERE agent_id = p_agent_id
        AND account_id = p_submitter_id
    ) THEN
        RAISE EXCEPTION 'Agent not found or not owned by submitter';
    END IF;

    -- Check for existing pending submission for this agent
    IF EXISTS (
        SELECT 1 FROM template_submissions
        WHERE agent_id = p_agent_id
        AND status = 'pending'
    ) THEN
        RAISE EXCEPTION 'A pending submission already exists for this agent';
    END IF;

    -- Create the submission
    INSERT INTO template_submissions (
        agent_id,
        submitter_id,
        template_name,
        template_description,
        category_id,
        use_cases,
        metadata
    ) VALUES (
        p_agent_id,
        p_submitter_id,
        p_template_name,
        p_template_description,
        p_category_id,
        p_use_cases,
        p_metadata
    )
    RETURNING * INTO v_submission;

    RETURN v_submission;
END;
$$;

-- Get submissions for a user
CREATE OR REPLACE FUNCTION get_user_template_submissions(
    p_user_id UUID,
    p_status template_submission_status DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS SETOF template_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM template_submissions
    WHERE submitter_id = p_user_id
    AND (p_status IS NULL OR status = p_status)
    ORDER BY submitted_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Get all pending submissions (admin only)
CREATE OR REPLACE FUNCTION get_pending_template_submissions(
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS SETOF template_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- This should only be called by admins (verified at API level)
    RETURN QUERY
    SELECT *
    FROM template_submissions
    WHERE status = 'pending'
    ORDER BY submitted_at ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Approve a template submission (creates the template)
CREATE OR REPLACE FUNCTION approve_template_submission(
    p_submission_id UUID,
    p_reviewer_id UUID,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS template_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_submission template_submissions;
    v_agent RECORD;
    v_template_id UUID;
    v_config JSONB;
BEGIN
    -- Get the submission
    SELECT * INTO v_submission
    FROM template_submissions
    WHERE submission_id = p_submission_id
    AND status = 'pending'
    FOR UPDATE;

    IF v_submission IS NULL THEN
        RAISE EXCEPTION 'Submission not found or already reviewed';
    END IF;

    -- Get the agent and its current configuration
    SELECT a.*, av.system_prompt, av.configured_mcps, av.custom_mcps, av.agentpress_tools
    INTO v_agent
    FROM agents a
    JOIN agent_versions av ON a.current_version_id = av.version_id
    WHERE a.agent_id = v_submission.agent_id;

    IF v_agent IS NULL THEN
        RAISE EXCEPTION 'Agent not found';
    END IF;

    -- Build the template config
    v_config := jsonb_build_object(
        'system_prompt', COALESCE(v_agent.system_prompt, ''),
        'model', v_agent.model,
        'tools', jsonb_build_object(
            'agentpress', COALESCE(v_agent.agentpress_tools, '{}'),
            'mcp', COALESCE(v_agent.configured_mcps, '[]'),
            'custom_mcp', COALESCE(v_agent.custom_mcps, '[]')
        ),
        'metadata', jsonb_build_object(
            'avatar', v_agent.icon_name,
            'avatar_color', v_agent.icon_color,
            'avatar_background', v_agent.icon_background
        )
    );

    -- Create the template
    INSERT INTO agent_templates (
        template_id,
        creator_id,
        name,
        description,
        config,
        category_id,
        tags,
        is_public,
        is_kortix_team,
        marketplace_published_at,
        download_count,
        template_version,
        usage_examples
    ) VALUES (
        gen_random_uuid(),
        v_submission.submitter_id,
        v_submission.template_name,
        v_submission.template_description,
        v_config,
        v_submission.category_id,
        ARRAY[]::VARCHAR[],
        true,
        false,
        NOW(),
        0,
        1,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('role', 'user', 'content', uc))
             FROM unnest(v_submission.use_cases) AS uc),
            '[]'::jsonb
        )
    )
    RETURNING template_id INTO v_template_id;

    -- Update the submission
    UPDATE template_submissions
    SET
        status = 'approved',
        reviewed_at = NOW(),
        reviewed_by = p_reviewer_id,
        admin_notes = p_admin_notes,
        published_template_id = v_template_id,
        updated_at = NOW()
    WHERE submission_id = p_submission_id
    RETURNING * INTO v_submission;

    RETURN v_submission;
END;
$$;

-- Reject a template submission
CREATE OR REPLACE FUNCTION reject_template_submission(
    p_submission_id UUID,
    p_reviewer_id UUID,
    p_rejection_reason TEXT,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS template_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_submission template_submissions;
BEGIN
    UPDATE template_submissions
    SET
        status = 'rejected',
        reviewed_at = NOW(),
        reviewed_by = p_reviewer_id,
        rejection_reason = p_rejection_reason,
        admin_notes = p_admin_notes,
        updated_at = NOW()
    WHERE submission_id = p_submission_id
    AND status = 'pending'
    RETURNING * INTO v_submission;

    IF v_submission IS NULL THEN
        RAISE EXCEPTION 'Submission not found or already reviewed';
    END IF;

    RETURN v_submission;
END;
$$;

-- Get submission by ID
CREATE OR REPLACE FUNCTION get_template_submission(p_submission_id UUID)
RETURNS template_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_submission template_submissions;
BEGIN
    SELECT * INTO v_submission
    FROM template_submissions
    WHERE submission_id = p_submission_id;

    RETURN v_submission;
END;
$$;

-- Cancel a pending submission (by the submitter)
CREATE OR REPLACE FUNCTION cancel_template_submission(
    p_submission_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM template_submissions
    WHERE submission_id = p_submission_id
    AND submitter_id = p_user_id
    AND status = 'pending';

    RETURN FOUND;
END;
$$;

-- Get submission statistics (for admin dashboard)
CREATE OR REPLACE FUNCTION get_template_submission_stats()
RETURNS TABLE (
    total_submissions BIGINT,
    pending_count BIGINT,
    approved_count BIGINT,
    rejected_count BIGINT,
    submissions_this_week BIGINT,
    avg_review_time_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_submissions,
        COUNT(*) FILTER (WHERE status = 'pending')::BIGINT as pending_count,
        COUNT(*) FILTER (WHERE status = 'approved')::BIGINT as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected')::BIGINT as rejected_count,
        COUNT(*) FILTER (WHERE submitted_at > NOW() - INTERVAL '7 days')::BIGINT as submissions_this_week,
        ROUND(AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600) FILTER (WHERE reviewed_at IS NOT NULL), 2) as avg_review_time_hours
    FROM template_submissions;
END;
$$;

COMMIT;
