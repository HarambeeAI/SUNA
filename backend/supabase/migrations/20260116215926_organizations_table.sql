BEGIN;

-- =====================================================
-- Organizations/Multi-tenant Schema Migration
-- Part of US-001: Multi-tenant database schema
-- =====================================================

-- Create plan_tier enum for organization billing tiers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t
                   JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'plan_tier' AND n.nspname = 'public') THEN
        CREATE TYPE public.plan_tier AS ENUM ('free', 'pro', 'enterprise');
    END IF;
END $$;

-- Create billing_status enum for organization billing state
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t
                   JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'billing_status' AND n.nspname = 'public') THEN
        CREATE TYPE public.billing_status AS ENUM ('active', 'past_due', 'canceled', 'trialing', 'unpaid');
    END IF;
END $$;

-- Create organizations table for multi-tenant workspace management
-- This extends the basejump accounts system with SaaS-specific features
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Organization display name
    name TEXT NOT NULL,
    -- URL-friendly unique identifier
    slug TEXT UNIQUE NOT NULL,
    -- Current subscription tier
    plan_tier public.plan_tier NOT NULL DEFAULT 'free',
    -- Current billing status
    billing_status public.billing_status NOT NULL DEFAULT 'active',
    -- Link to basejump account for authentication/membership
    account_id UUID UNIQUE REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    -- Stripe customer ID for billing
    stripe_customer_id TEXT,
    -- Stripe subscription ID
    stripe_subscription_id TEXT,
    -- Organization settings/metadata
    settings JSONB DEFAULT '{}'::jsonb,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comment for documentation
COMMENT ON TABLE public.organizations IS 'Multi-tenant organizations for SaaS workspace management. Links to basejump.accounts for auth.';
COMMENT ON COLUMN public.organizations.plan_tier IS 'Current subscription tier: free, pro, or enterprise';
COMMENT ON COLUMN public.organizations.billing_status IS 'Current billing status for the organization';
COMMENT ON COLUMN public.organizations.account_id IS 'Link to basejump account for authentication and membership management';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_plan_tier ON public.organizations(plan_tier);
CREATE INDEX IF NOT EXISTS idx_organizations_billing_status ON public.organizations(billing_status);
CREATE INDEX IF NOT EXISTS idx_organizations_account_id ON public.organizations(account_id);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON public.organizations(created_at);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id ON public.organizations(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_organizations_updated_at ON public.organizations;
CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_organizations_updated_at();

-- Enable RLS on organizations table
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO authenticated, service_role;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS organizations_select ON public.organizations;
DROP POLICY IF EXISTS organizations_insert ON public.organizations;
DROP POLICY IF EXISTS organizations_update ON public.organizations;
DROP POLICY IF EXISTS organizations_delete ON public.organizations;

-- Policy for users to see organizations they are members of (via linked account)
CREATE POLICY organizations_select ON public.organizations
    FOR SELECT
    USING (
        basejump.has_role_on_account(account_id)
        OR account_id IS NULL -- Allow viewing orgs not yet linked to accounts
    );

-- Policy for users to insert organizations (must be owner of linked account)
CREATE POLICY organizations_insert ON public.organizations
    FOR INSERT
    WITH CHECK (
        account_id IS NULL -- Allow creating org before linking account
        OR basejump.has_role_on_account(account_id, 'owner')
    );

-- Policy for users to update their organizations (owner only)
CREATE POLICY organizations_update ON public.organizations
    FOR UPDATE
    USING (basejump.has_role_on_account(account_id, 'owner'));

-- Policy for users to delete their organizations (owner only)
CREATE POLICY organizations_delete ON public.organizations
    FOR DELETE
    USING (basejump.has_role_on_account(account_id, 'owner'));

-- Function to create organization and link to basejump account
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

    RETURN new_org_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'An organization with that slug already exists';
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, public.plan_tier) TO authenticated;

-- Function to get organization by ID with membership check
CREATE OR REPLACE FUNCTION public.get_organization(org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, basejump
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', o.id,
        'name', o.name,
        'slug', o.slug,
        'plan_tier', o.plan_tier,
        'billing_status', o.billing_status,
        'account_id', o.account_id,
        'settings', o.settings,
        'created_at', o.created_at,
        'updated_at', o.updated_at
    )
    INTO result
    FROM public.organizations o
    WHERE o.id = get_organization.org_id
      AND basejump.has_role_on_account(o.account_id);

    IF result IS NULL THEN
        RAISE EXCEPTION 'Organization not found or access denied';
    END IF;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization(UUID) TO authenticated;

-- Function to get organization by slug
CREATE OR REPLACE FUNCTION public.get_organization_by_slug(org_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, basejump
AS $$
DECLARE
    org_id UUID;
BEGIN
    SELECT id INTO org_id
    FROM public.organizations
    WHERE slug = get_organization_by_slug.org_slug;

    IF org_id IS NULL THEN
        RAISE EXCEPTION 'Organization not found';
    END IF;

    RETURN public.get_organization(org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_by_slug(TEXT) TO authenticated;

-- Function to list user's organizations
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, basejump
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', o.id,
                'name', o.name,
                'slug', o.slug,
                'plan_tier', o.plan_tier,
                'billing_status', o.billing_status,
                'account_id', o.account_id,
                'created_at', o.created_at,
                'role', au.account_role
            )
        ), '[]'::json)
        FROM public.organizations o
        JOIN basejump.account_user au ON au.account_id = o.account_id
        WHERE au.user_id = auth.uid()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_organizations() TO authenticated;

COMMIT;
