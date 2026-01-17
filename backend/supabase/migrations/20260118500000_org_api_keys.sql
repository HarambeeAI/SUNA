BEGIN;

-- =====================================================
-- ORGANIZATION API KEYS TABLE MIGRATION
-- =====================================================
-- Organization-level API keys with scopes for programmatic access
-- Required scopes: read:agents, write:agents, execute:agents, read:templates

-- Enum for API key scopes
DO $$ BEGIN
    CREATE TYPE org_api_key_scope AS ENUM (
        'read:agents',
        'write:agents',
        'execute:agents',
        'read:templates'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum for org API key status
DO $$ BEGIN
    CREATE TYPE org_api_key_status AS ENUM ('active', 'revoked', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create organization API keys table
CREATE TABLE IF NOT EXISTS org_api_keys (
    key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Key identification
    name VARCHAR(255) NOT NULL,
    public_key VARCHAR(64) NOT NULL UNIQUE,
    secret_key_hash VARCHAR(64) NOT NULL,

    -- Scopes (stored as array of enum values)
    scopes org_api_key_scope[] NOT NULL DEFAULT '{}',

    -- Metadata
    description TEXT,
    status org_api_key_status DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,

    -- Audit
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT org_api_keys_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT org_api_keys_public_key_format CHECK (public_key ~ '^opk_[a-zA-Z0-9]{32}$'),
    CONSTRAINT org_api_keys_has_scopes CHECK (array_length(scopes, 1) > 0)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_org_api_keys_org_id ON org_api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_org_api_keys_public_key ON org_api_keys(public_key);
CREATE INDEX IF NOT EXISTS idx_org_api_keys_status ON org_api_keys(status);
CREATE INDEX IF NOT EXISTS idx_org_api_keys_created_by ON org_api_keys(created_by);

-- Enable RLS
ALTER TABLE org_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS policy: Organization admins and owners can manage API keys
CREATE POLICY "org_api_keys_select_policy" ON org_api_keys
    FOR SELECT USING (
        -- User must be admin or owner of the organization
        public.has_org_permission(auth.uid(), org_id, 'admin')
    );

CREATE POLICY "org_api_keys_insert_policy" ON org_api_keys
    FOR INSERT WITH CHECK (
        -- User must be admin or owner of the organization
        public.has_org_permission(auth.uid(), org_id, 'admin')
        AND created_by = auth.uid()
    );

CREATE POLICY "org_api_keys_update_policy" ON org_api_keys
    FOR UPDATE USING (
        -- User must be admin or owner of the organization
        public.has_org_permission(auth.uid(), org_id, 'admin')
    );

CREATE POLICY "org_api_keys_delete_policy" ON org_api_keys
    FOR DELETE USING (
        -- User must be admin or owner of the organization
        public.has_org_permission(auth.uid(), org_id, 'admin')
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON org_api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON org_api_keys TO service_role;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to create an org API key (key generation happens in application code)
CREATE OR REPLACE FUNCTION create_org_api_key(
    p_org_id UUID,
    p_name VARCHAR(255),
    p_public_key VARCHAR(64),
    p_secret_key_hash VARCHAR(64),
    p_scopes org_api_key_scope[],
    p_description TEXT DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS org_api_keys
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result org_api_keys;
BEGIN
    -- Verify user has admin permission
    IF NOT public.has_org_permission(auth.uid(), p_org_id, 'admin') THEN
        RAISE EXCEPTION 'Permission denied: requires admin role';
    END IF;

    INSERT INTO org_api_keys (
        org_id,
        name,
        public_key,
        secret_key_hash,
        scopes,
        description,
        expires_at,
        created_by
    ) VALUES (
        p_org_id,
        p_name,
        p_public_key,
        p_secret_key_hash,
        p_scopes,
        p_description,
        p_expires_at,
        auth.uid()
    )
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- Function to get API key by public key (for validation)
-- This returns the full key data including hash for validation
CREATE OR REPLACE FUNCTION get_org_api_key_by_public_key(p_public_key VARCHAR(64))
RETURNS TABLE (
    key_id UUID,
    org_id UUID,
    name VARCHAR(255),
    scopes org_api_key_scope[],
    status org_api_key_status,
    expires_at TIMESTAMPTZ,
    secret_key_hash VARCHAR(64)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        k.key_id,
        k.org_id,
        k.name,
        k.scopes,
        k.status,
        k.expires_at,
        k.secret_key_hash
    FROM org_api_keys k
    WHERE k.public_key = p_public_key;
END;
$$;

-- Function to list org API keys
CREATE OR REPLACE FUNCTION list_org_api_keys(p_org_id UUID)
RETURNS SETOF org_api_keys
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify user has admin permission
    IF NOT public.has_org_permission(auth.uid(), p_org_id, 'admin') THEN
        RAISE EXCEPTION 'Permission denied: requires admin role';
    END IF;

    RETURN QUERY
    SELECT *
    FROM org_api_keys
    WHERE org_id = p_org_id
    ORDER BY created_at DESC;
END;
$$;

-- Function to revoke an org API key
CREATE OR REPLACE FUNCTION revoke_org_api_key(p_key_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get org_id from key
    SELECT org_id INTO v_org_id FROM org_api_keys WHERE key_id = p_key_id;

    IF v_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verify user has admin permission
    IF NOT public.has_org_permission(auth.uid(), v_org_id, 'admin') THEN
        RAISE EXCEPTION 'Permission denied: requires admin role';
    END IF;

    UPDATE org_api_keys
    SET status = 'revoked', updated_at = NOW()
    WHERE key_id = p_key_id;

    RETURN FOUND;
END;
$$;

-- Function to delete an org API key
CREATE OR REPLACE FUNCTION delete_org_api_key(p_key_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get org_id from key
    SELECT org_id INTO v_org_id FROM org_api_keys WHERE key_id = p_key_id;

    IF v_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verify user has admin permission
    IF NOT public.has_org_permission(auth.uid(), v_org_id, 'admin') THEN
        RAISE EXCEPTION 'Permission denied: requires admin role';
    END IF;

    DELETE FROM org_api_keys WHERE key_id = p_key_id;

    RETURN FOUND;
END;
$$;

-- Function to update last_used_at (called during validation)
CREATE OR REPLACE FUNCTION update_org_api_key_last_used(p_key_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE org_api_keys
    SET last_used_at = NOW()
    WHERE key_id = p_key_id;
END;
$$;

-- Function to check if API key has specific scope
CREATE OR REPLACE FUNCTION org_api_key_has_scope(p_key_id UUID, p_scope org_api_key_scope)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_scope BOOLEAN;
BEGIN
    SELECT p_scope = ANY(scopes) INTO v_has_scope
    FROM org_api_keys
    WHERE key_id = p_key_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW());

    RETURN COALESCE(v_has_scope, FALSE);
END;
$$;

COMMIT;
