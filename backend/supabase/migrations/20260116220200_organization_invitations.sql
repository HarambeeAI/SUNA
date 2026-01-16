BEGIN;

-- =====================================================
-- Organization Invitations Table Migration
-- Part of US-003: Team member invitation system
-- =====================================================

-- Create invitation_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t
                   JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'invitation_status' AND n.nspname = 'public') THEN
        CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
    END IF;
END $$;

-- Create organization_invitations table
CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Reference to the organization
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Email of the invitee (may not be a user yet)
    email TEXT NOT NULL,
    -- Role to assign when invitation is accepted
    role public.organization_role NOT NULL DEFAULT 'member',
    -- Unique invitation token for accept/decline links
    token UUID NOT NULL DEFAULT gen_random_uuid(),
    -- User who sent the invitation
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Invitation status
    status public.invitation_status NOT NULL DEFAULT 'pending',
    -- When the invitation was created
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- When the invitation expires (7 days from creation by default)
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days') NOT NULL,
    -- When the invitation was accepted (if applicable)
    accepted_at TIMESTAMPTZ,
    -- User ID who accepted (if they existed or created account)
    accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    -- Ensure unique token
    CONSTRAINT unique_invitation_token UNIQUE (token),
    -- Prevent duplicate pending invitations to the same email for the same org
    CONSTRAINT unique_pending_invitation UNIQUE (org_id, email, status)
        DEFERRABLE INITIALLY DEFERRED
);

-- Add comments for documentation
COMMENT ON TABLE public.organization_invitations IS 'Stores organization membership invitations';
COMMENT ON COLUMN public.organization_invitations.email IS 'Email address of the person being invited';
COMMENT ON COLUMN public.organization_invitations.token IS 'Unique token for invitation URL (accept/decline)';
COMMENT ON COLUMN public.organization_invitations.role IS 'Role to assign when invitation is accepted';
COMMENT ON COLUMN public.organization_invitations.expires_at IS 'Invitations expire after 7 days by default';
COMMENT ON COLUMN public.organization_invitations.status IS 'Status: pending, accepted, expired, revoked';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON public.organization_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON public.organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON public.organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON public.organization_invitations(status);
CREATE INDEX IF NOT EXISTS idx_org_invitations_invited_by ON public.organization_invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_org_invitations_expires_at ON public.organization_invitations(expires_at) WHERE status = 'pending';

-- Enable RLS on organization_invitations table
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_invitations TO authenticated, service_role;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS org_invitations_select ON public.organization_invitations;
DROP POLICY IF EXISTS org_invitations_insert ON public.organization_invitations;
DROP POLICY IF EXISTS org_invitations_update ON public.organization_invitations;
DROP POLICY IF EXISTS org_invitations_delete ON public.organization_invitations;

-- Policy for org members to see invitations for their organization
CREATE POLICY org_invitations_select ON public.organization_invitations
    FOR SELECT
    USING (
        -- Org members can see invitations
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_invitations.org_id
              AND om.user_id = auth.uid()
        )
        -- Invitees can see their own invitations by email (for users who are logged in)
        OR EXISTS (
            SELECT 1 FROM auth.users u
            WHERE u.id = auth.uid()
              AND u.email = organization_invitations.email
        )
    );

-- Policy for owners/admins to create invitations
CREATE POLICY org_invitations_insert ON public.organization_invitations
    FOR INSERT
    WITH CHECK (
        -- User must be owner or admin of the organization
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_invitations.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('owner', 'admin')
        )
    );

-- Policy for updating invitations (accept, expire, revoke)
CREATE POLICY org_invitations_update ON public.organization_invitations
    FOR UPDATE
    USING (
        -- Org owners/admins can update (revoke)
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_invitations.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('owner', 'admin')
        )
        -- Invitees can accept their own invitations
        OR EXISTS (
            SELECT 1 FROM auth.users u
            WHERE u.id = auth.uid()
              AND u.email = organization_invitations.email
        )
    );

-- Policy for owners to delete invitations
CREATE POLICY org_invitations_delete ON public.organization_invitations
    FOR DELETE
    USING (
        -- Only owners can delete invitations
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_invitations.org_id
              AND om.user_id = auth.uid()
              AND om.role = 'owner'
        )
    );


-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to create an invitation
CREATE OR REPLACE FUNCTION public.create_org_invitation(
    p_org_id UUID,
    p_email TEXT,
    p_role public.organization_role DEFAULT 'member'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_invitation_id UUID;
    caller_role public.organization_role;
    existing_member_id UUID;
BEGIN
    -- Get caller's role
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid();

    -- Only owners and admins can send invitations
    IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only owners and admins can send invitations';
    END IF;

    -- Admins cannot invite as owner or admin
    IF caller_role = 'admin' AND p_role IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Admins cannot invite users as owner or admin';
    END IF;

    -- Check if user is already a member (by email)
    SELECT om.id INTO existing_member_id
    FROM public.organization_members om
    JOIN auth.users u ON u.id = om.user_id
    WHERE om.org_id = p_org_id AND u.email = p_email;

    IF existing_member_id IS NOT NULL THEN
        RAISE EXCEPTION 'User is already a member of this organization';
    END IF;

    -- Expire any existing pending invitations for this email/org combo
    UPDATE public.organization_invitations
    SET status = 'expired'
    WHERE org_id = p_org_id
      AND email = p_email
      AND status = 'pending';

    -- Create the new invitation
    INSERT INTO public.organization_invitations (org_id, email, role, invited_by, status)
    VALUES (p_org_id, p_email, p_role, auth.uid(), 'pending')
    RETURNING id INTO new_invitation_id;

    RETURN new_invitation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_org_invitation(UUID, TEXT, public.organization_role) TO authenticated;


-- Function to accept an invitation by token
CREATE OR REPLACE FUNCTION public.accept_org_invitation(p_token UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    invitation RECORD;
    new_member_id UUID;
    user_email TEXT;
BEGIN
    -- Get the current user's email
    SELECT email INTO user_email
    FROM auth.users
    WHERE id = auth.uid();

    IF user_email IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;

    -- Get the invitation
    SELECT * INTO invitation
    FROM public.organization_invitations
    WHERE token = p_token;

    IF invitation IS NULL THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    -- Check if invitation is still pending
    IF invitation.status != 'pending' THEN
        RAISE EXCEPTION 'Invitation is no longer valid (status: %)', invitation.status;
    END IF;

    -- Check if invitation has expired
    IF invitation.expires_at < NOW() THEN
        -- Mark as expired
        UPDATE public.organization_invitations
        SET status = 'expired'
        WHERE id = invitation.id;

        RAISE EXCEPTION 'Invitation has expired';
    END IF;

    -- Check if the email matches
    IF LOWER(invitation.email) != LOWER(user_email) THEN
        RAISE EXCEPTION 'This invitation was sent to a different email address';
    END IF;

    -- Check if user is already a member
    IF EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE org_id = invitation.org_id AND user_id = auth.uid()
    ) THEN
        -- Mark invitation as accepted anyway
        UPDATE public.organization_invitations
        SET status = 'accepted',
            accepted_at = NOW(),
            accepted_by_user_id = auth.uid()
        WHERE id = invitation.id;

        RAISE EXCEPTION 'You are already a member of this organization';
    END IF;

    -- Add user as member
    INSERT INTO public.organization_members (org_id, user_id, role, invited_by, joined_at)
    VALUES (invitation.org_id, auth.uid(), invitation.role, invitation.invited_by, NOW())
    RETURNING id INTO new_member_id;

    -- Mark invitation as accepted
    UPDATE public.organization_invitations
    SET status = 'accepted',
        accepted_at = NOW(),
        accepted_by_user_id = auth.uid()
    WHERE id = invitation.id;

    RETURN new_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(UUID) TO authenticated;


-- Function to revoke an invitation
CREATE OR REPLACE FUNCTION public.revoke_org_invitation(p_invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    invitation RECORD;
    caller_role public.organization_role;
BEGIN
    -- Get the invitation
    SELECT * INTO invitation
    FROM public.organization_invitations
    WHERE id = p_invitation_id;

    IF invitation IS NULL THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    -- Get caller's role
    SELECT role INTO caller_role
    FROM public.organization_members
    WHERE org_id = invitation.org_id AND user_id = auth.uid();

    -- Only owners and admins can revoke invitations
    IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only owners and admins can revoke invitations';
    END IF;

    -- Can only revoke pending invitations
    IF invitation.status != 'pending' THEN
        RAISE EXCEPTION 'Cannot revoke invitation with status: %', invitation.status;
    END IF;

    -- Revoke the invitation
    UPDATE public.organization_invitations
    SET status = 'revoked'
    WHERE id = p_invitation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_org_invitation(UUID) TO authenticated;


-- Function to get organization invitations
CREATE OR REPLACE FUNCTION public.get_org_invitations(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user is a member of the organization
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE org_id = p_org_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You must be a member of the organization to view invitations';
    END IF;

    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', oi.id,
                'org_id', oi.org_id,
                'email', oi.email,
                'role', oi.role,
                'status', oi.status,
                'invited_by', oi.invited_by,
                'created_at', oi.created_at,
                'expires_at', oi.expires_at,
                'accepted_at', oi.accepted_at,
                'metadata', oi.metadata
            )
            ORDER BY oi.created_at DESC
        ), '[]'::json)
        FROM public.organization_invitations oi
        WHERE oi.org_id = p_org_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_invitations(UUID) TO authenticated;


-- Function to get invitation details by token (public, for invitation acceptance page)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    invitation RECORD;
BEGIN
    -- Get invitation with organization name
    SELECT
        oi.id,
        oi.org_id,
        oi.email,
        oi.role,
        oi.status,
        oi.created_at,
        oi.expires_at,
        o.name as org_name,
        o.slug as org_slug
    INTO invitation
    FROM public.organization_invitations oi
    JOIN public.organizations o ON o.id = oi.org_id
    WHERE oi.token = p_token;

    IF invitation IS NULL THEN
        RETURN NULL;
    END IF;

    -- Check if expired but not marked yet
    IF invitation.status = 'pending' AND invitation.expires_at < NOW() THEN
        -- Mark as expired
        UPDATE public.organization_invitations
        SET status = 'expired'
        WHERE token = p_token;

        invitation.status := 'expired';
    END IF;

    RETURN json_build_object(
        'id', invitation.id,
        'org_id', invitation.org_id,
        'org_name', invitation.org_name,
        'org_slug', invitation.org_slug,
        'email', invitation.email,
        'role', invitation.role,
        'status', invitation.status,
        'created_at', invitation.created_at,
        'expires_at', invitation.expires_at
    );
END;
$$;

-- This function is public so users can view invitation details before logging in
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(UUID) TO anon, authenticated;


-- =====================================================
-- Cron job to expire old invitations
-- =====================================================

-- Function to expire old pending invitations (called by cron)
CREATE OR REPLACE FUNCTION public.expire_old_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE public.organization_invitations
        SET status = 'expired'
        WHERE status = 'pending'
          AND expires_at < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO expired_count FROM expired;

    RETURN expired_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_old_invitations() TO service_role;


COMMIT;
