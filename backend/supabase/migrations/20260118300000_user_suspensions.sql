-- Migration: Add user suspensions table for admin user management
-- Part of US-028: Admin panel for platform management

BEGIN;

-- Create user_suspensions table to track suspended accounts
CREATE TABLE IF NOT EXISTS user_suspensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    suspended_by UUID REFERENCES auth.users(id),
    suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    unsuspended_by UUID REFERENCES auth.users(id),
    unsuspended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_suspensions_user_id ON user_suspensions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_suspensions_is_active ON user_suspensions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_suspensions_suspended_at ON user_suspensions(suspended_at DESC);

-- Unique constraint: only one active suspension per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_suspensions_user_active
ON user_suspensions(user_id) WHERE is_active = true;

-- Enable RLS
ALTER TABLE user_suspensions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admins can read/write
CREATE POLICY user_suspensions_admin_select ON user_suspensions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY user_suspensions_admin_insert ON user_suspensions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY user_suspensions_admin_update ON user_suspensions
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'super_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'super_admin')
        )
    );

-- Helper function to check if a user is suspended
CREATE OR REPLACE FUNCTION is_user_suspended(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_suspensions
        WHERE user_id = p_user_id
        AND is_active = true
    );
END;
$$;

-- Helper function to get user suspension details
CREATE OR REPLACE FUNCTION get_user_suspension(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    reason TEXT,
    suspended_by UUID,
    suspended_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.reason,
        s.suspended_by,
        s.suspended_at
    FROM user_suspensions s
    WHERE s.user_id = p_user_id
    AND s.is_active = true
    LIMIT 1;
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_suspensions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_suspensions_updated_at_trigger
    BEFORE UPDATE ON user_suspensions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_suspensions_updated_at();

COMMIT;
