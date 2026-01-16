BEGIN;

-- =====================================================
-- Organization Members Table Migration
-- Part of US-001: Multi-tenant database schema
-- =====================================================

-- Create organization_role enum for organization-specific roles
-- This extends basejump's basic owner/member with more granular roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t
                   JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'organization_role' AND n.nspname = 'public') THEN
        CREATE TYPE public.organization_role AS ENUM ('owner', 'admin', 'member', 'viewer');
    END IF;
END $$;

-- Create organization_members table to track organization membership
-- This table stores additional metadata beyond basejump.account_user
-- and provides organization-specific role granularity
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Reference to the organization
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Reference to the user
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Organization-specific role (more granular than basejump)
    role public.organization_role NOT NULL DEFAULT 'member',
    -- Who invited this member (null for org creators)
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- When the member joined the organization
    joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    -- Ensure unique membership per user per organization
    CONSTRAINT unique_org_member UNIQUE (org_id, user_id)
);

-- Add comments for documentation
COMMENT ON TABLE public.organization_members IS 'Tracks organization membership with extended role support';
COMMENT ON COLUMN public.organization_members.role IS 'Member role: owner (full control), admin (manage members/agents), member (create/manage own), viewer (read-only)';
COMMENT ON COLUMN public.organization_members.invited_by IS 'User who invited this member, null for organization creators';
COMMENT ON COLUMN public.organization_members.joined_at IS 'Timestamp when the user joined the organization';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON public.organization_members(role);
CREATE INDEX IF NOT EXISTS idx_org_members_invited_by ON public.organization_members(invited_by) WHERE invited_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_members_joined_at ON public.organization_members(joined_at);

-- Enable RLS on organization_members table
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_members TO authenticated, service_role;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS org_members_select ON public.organization_members;
DROP POLICY IF EXISTS org_members_insert ON public.organization_members;
DROP POLICY IF EXISTS org_members_update ON public.organization_members;
DROP POLICY IF EXISTS org_members_delete ON public.organization_members;

-- Policy for users to see members of organizations they belong to
CREATE POLICY org_members_select ON public.organization_members
    FOR SELECT
    USING (
        -- User can see members if they are also a member of the same organization
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_members.org_id
              AND om.user_id = auth.uid()
        )
    );

-- Policy for owners/admins to add members
CREATE POLICY org_members_insert ON public.organization_members
    FOR INSERT
    WITH CHECK (
        -- User must be owner or admin of the organization to add members
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_members.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('owner', 'admin')
        )
        -- OR this is the first member (org creator)
        OR NOT EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_members.org_id
        )
    );

-- Policy for owners/admins to update member roles
CREATE POLICY org_members_update ON public.organization_members
    FOR UPDATE
    USING (
        -- User must be owner or admin to update members
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_members.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('owner', 'admin')
        )
        -- Owners cannot be downgraded by admins
        AND NOT (
            organization_members.role = 'owner'
            AND NOT EXISTS (
                SELECT 1 FROM public.organization_members om
                WHERE om.org_id = organization_members.org_id
                  AND om.user_id = auth.uid()
                  AND om.role = 'owner'
            )
        )
    );

-- Policy for owners to remove members (admins can remove members/viewers)
CREATE POLICY org_members_delete ON public.organization_members
    FOR DELETE
    USING (
        -- Owners can delete any member except themselves if they're the last owner
        (
            EXISTS (
                SELECT 1 FROM public.organization_members om
                WHERE om.org_id = organization_members.org_id
                  AND om.user_id = auth.uid()
                  AND om.role = 'owner'
            )
            -- Prevent deleting the last owner
            AND NOT (
                organization_members.role = 'owner'
                AND organization_members.user_id = auth.uid()
                AND (
                    SELECT COUNT(*) FROM public.organization_members om
                    WHERE om.org_id = organization_members.org_id
                      AND om.role = 'owner'
                ) = 1
            )
        )
        -- Admins can delete members and viewers (not owners or other admins)
        OR (
            EXISTS (
                SELECT 1 FROM public.organization_members om
                WHERE om.org_id = organization_members.org_id
                  AND om.user_id = auth.uid()
                  AND om.role = 'admin'
            )
            AND organization_members.role IN ('member', 'viewer')
        )
        -- Users can remove themselves (leave org) unless they're the last owner
        OR (
            organization_members.user_id = auth.uid()
            AND NOT (
                organization_members.role = 'owner'
                AND (
                    SELECT COUNT(*) FROM public.organization_members om
                    WHERE om.org_id = organization_members.org_id
                      AND om.role = 'owner'
                ) = 1
            )
        )
    );

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to check if a user has a specific role in an organization
CREATE OR REPLACE FUNCTION public.has_org_role(
    p_org_id UUID,
    p_role public.organization_role DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.org_id = p_org_id
          AND om.user_id = auth.uid()
          AND (p_role IS NULL OR om.role = p_role)
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, public.organization_role) TO authenticated, service_role;

-- Function to check if user has at least a certain permission level
-- Hierarchy: owner > admin > member > viewer
CREATE OR REPLACE FUNCTION public.has_org_permission(
    p_org_id UUID,
    p_min_role public.organization_role
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.org_id = p_org_id
          AND om.user_id = auth.uid()
          AND CASE
              WHEN p_min_role = 'viewer' THEN om.role IN ('owner', 'admin', 'member', 'viewer')
              WHEN p_min_role = 'member' THEN om.role IN ('owner', 'admin', 'member')
              WHEN p_min_role = 'admin' THEN om.role IN ('owner', 'admin')
              WHEN p_min_role = 'owner' THEN om.role = 'owner'
              ELSE FALSE
          END
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_org_permission(UUID, public.organization_role) TO authenticated, service_role;

-- Function to get user's role in an organization
CREATE OR REPLACE FUNCTION public.get_org_role(p_org_id UUID)
RETURNS public.organization_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT om.role
    FROM public.organization_members om
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_org_role(UUID) TO authenticated, service_role;

-- Function to add a member to an organization
CREATE OR REPLACE FUNCTION public.add_org_member(
    p_org_id UUID,
    p_user_id UUID,
    p_role public.organization_role DEFAULT 'member'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_member_id UUID;
    caller_role public.organization_role;
BEGIN
    -- Get caller's role
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid();

    -- Only owners and admins can add members
    IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only owners and admins can add members';
    END IF;

    -- Admins cannot add owners or other admins
    IF caller_role = 'admin' AND p_role IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Admins cannot add owners or other admins';
    END IF;

    -- Insert the new member
    INSERT INTO public.organization_members (org_id, user_id, role, invited_by, joined_at)
    VALUES (p_org_id, p_user_id, p_role, auth.uid(), NOW())
    RETURNING id INTO new_member_id;

    RETURN new_member_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'User is already a member of this organization';
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_org_member(UUID, UUID, public.organization_role) TO authenticated;

-- Function to get organization members
CREATE OR REPLACE FUNCTION public.get_org_members(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Check if user is a member of the organization
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE org_id = p_org_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You must be a member of the organization to view members';
    END IF;

    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', om.id,
                'org_id', om.org_id,
                'user_id', om.user_id,
                'role', om.role,
                'invited_by', om.invited_by,
                'joined_at', om.joined_at,
                'email', u.email,
                'metadata', om.metadata
            )
            ORDER BY
                CASE om.role
                    WHEN 'owner' THEN 1
                    WHEN 'admin' THEN 2
                    WHEN 'member' THEN 3
                    WHEN 'viewer' THEN 4
                END,
                om.joined_at
        ), '[]'::json)
        FROM public.organization_members om
        JOIN auth.users u ON u.id = om.user_id
        WHERE om.org_id = p_org_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_members(UUID) TO authenticated;

-- Function to update member role
CREATE OR REPLACE FUNCTION public.update_org_member_role(
    p_org_id UUID,
    p_user_id UUID,
    p_new_role public.organization_role
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role public.organization_role;
    target_role public.organization_role;
    owner_count INTEGER;
BEGIN
    -- Get caller's role
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid();

    -- Get target's current role
    SELECT role INTO target_role
    FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = p_user_id;

    IF target_role IS NULL THEN
        RAISE EXCEPTION 'User is not a member of this organization';
    END IF;

    -- Only owners can change roles
    IF caller_role IS NULL OR caller_role <> 'owner' THEN
        RAISE EXCEPTION 'Only owners can change member roles';
    END IF;

    -- Prevent removing the last owner
    IF target_role = 'owner' AND p_new_role <> 'owner' THEN
        SELECT COUNT(*) INTO owner_count
        FROM public.organization_members
        WHERE org_id = p_org_id AND role = 'owner';

        IF owner_count <= 1 THEN
            RAISE EXCEPTION 'Cannot demote the last owner';
        END IF;
    END IF;

    -- Update the role
    UPDATE public.organization_members
    SET role = p_new_role
    WHERE org_id = p_org_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_org_member_role(UUID, UUID, public.organization_role) TO authenticated;

-- Function to remove member from organization
CREATE OR REPLACE FUNCTION public.remove_org_member(
    p_org_id UUID,
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role public.organization_role;
    target_role public.organization_role;
    owner_count INTEGER;
BEGIN
    -- Get caller's role
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid();

    -- Get target's role
    SELECT role INTO target_role
    FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = p_user_id;

    IF target_role IS NULL THEN
        RAISE EXCEPTION 'User is not a member of this organization';
    END IF;

    -- Users can remove themselves (leave)
    IF p_user_id = auth.uid() THEN
        -- Cannot leave if you're the last owner
        IF target_role = 'owner' THEN
            SELECT COUNT(*) INTO owner_count
            FROM public.organization_members
            WHERE org_id = p_org_id AND role = 'owner';

            IF owner_count <= 1 THEN
                RAISE EXCEPTION 'Cannot leave: you are the last owner. Transfer ownership first.';
            END IF;
        END IF;
    ELSE
        -- Removing someone else
        IF caller_role IS NULL THEN
            RAISE EXCEPTION 'You are not a member of this organization';
        END IF;

        -- Owners can remove anyone (except the last owner which is handled above)
        IF caller_role = 'owner' THEN
            -- Can remove anyone
            IF target_role = 'owner' THEN
                SELECT COUNT(*) INTO owner_count
                FROM public.organization_members
                WHERE org_id = p_org_id AND role = 'owner';

                IF owner_count <= 1 THEN
                    RAISE EXCEPTION 'Cannot remove the last owner';
                END IF;
            END IF;
        ELSIF caller_role = 'admin' THEN
            -- Admins can only remove members and viewers
            IF target_role NOT IN ('member', 'viewer') THEN
                RAISE EXCEPTION 'Admins can only remove members and viewers';
            END IF;
        ELSE
            RAISE EXCEPTION 'You do not have permission to remove members';
        END IF;
    END IF;

    -- Perform the deletion
    DELETE FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_org_member(UUID, UUID) TO authenticated;

-- =====================================================
-- Sync trigger with create_organization function
-- =====================================================

-- Update create_organization to also add the creator as owner in organization_members
CREATE OR REPLACE FUNCTION public.create_organization(
    org_name TEXT,
    org_slug TEXT,
    initial_plan_tier public.plan_tier DEFAULT 'free'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, basejump
AS $$
DECLARE
    new_account_id UUID;
    new_org_id UUID;
BEGIN
    -- Create a team account in basejump
    INSERT INTO basejump.accounts (name, slug, personal_account)
    VALUES (org_name, org_slug, false)
    RETURNING id INTO new_account_id;

    -- Create the organization linked to the account
    INSERT INTO public.organizations (name, slug, plan_tier, account_id)
    VALUES (org_name, org_slug, initial_plan_tier, new_account_id)
    RETURNING id INTO new_org_id;

    -- Add the creator as owner in organization_members
    INSERT INTO public.organization_members (org_id, user_id, role, invited_by, joined_at)
    VALUES (new_org_id, auth.uid(), 'owner', NULL, NOW());

    RETURN new_org_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'An organization with that slug already exists';
END;
$$;

COMMIT;
