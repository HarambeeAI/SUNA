BEGIN;

-- =====================================================
-- Plan Tiers and Usage Tracking Schema Migration
-- Part of US-006: Freemium plan tier schema
-- =====================================================

-- Create plan_tiers table with tier definitions
-- This stores the configuration for each plan tier
CREATE TABLE IF NOT EXISTS public.plan_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Tier identifier matching the plan_tier enum
    tier_name public.plan_tier UNIQUE NOT NULL,
    -- Display name for the tier
    display_name TEXT NOT NULL,
    -- Monthly price in cents (0 for free, NULL for custom/enterprise)
    monthly_price_cents INTEGER,
    -- Agent creation limit (NULL for unlimited)
    agent_limit INTEGER,
    -- Monthly run limit (NULL for unlimited)
    run_limit_monthly INTEGER,
    -- Additional features as JSON
    features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Whether this tier is active and available
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Tier sort order for display
    sort_order INTEGER NOT NULL DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.plan_tiers IS 'Plan tier definitions with limits and pricing for the freemium model';
COMMENT ON COLUMN public.plan_tiers.tier_name IS 'Tier identifier matching the plan_tier enum (free, pro, enterprise)';
COMMENT ON COLUMN public.plan_tiers.monthly_price_cents IS 'Monthly price in cents. 0 for free, NULL for custom pricing';
COMMENT ON COLUMN public.plan_tiers.agent_limit IS 'Maximum number of agents allowed. NULL for unlimited';
COMMENT ON COLUMN public.plan_tiers.run_limit_monthly IS 'Maximum monthly agent runs. NULL for unlimited';
COMMENT ON COLUMN public.plan_tiers.features_json IS 'Additional features and configuration for this tier';

-- Create indexes for plan_tiers
CREATE INDEX IF NOT EXISTS idx_plan_tiers_tier_name ON public.plan_tiers(tier_name);
CREATE INDEX IF NOT EXISTS idx_plan_tiers_sort_order ON public.plan_tiers(sort_order);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_plan_tiers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_plan_tiers_updated_at ON public.plan_tiers;
CREATE TRIGGER trigger_plan_tiers_updated_at
    BEFORE UPDATE ON public.plan_tiers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_plan_tiers_updated_at();

-- Enable RLS on plan_tiers table
ALTER TABLE public.plan_tiers ENABLE ROW LEVEL SECURITY;

-- Grant read access to all authenticated users (tiers are public info)
GRANT SELECT ON TABLE public.plan_tiers TO authenticated;
-- Grant full access to service role for admin management
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plan_tiers TO service_role;

-- Policy: All authenticated users can view plan tiers
DROP POLICY IF EXISTS plan_tiers_select ON public.plan_tiers;
CREATE POLICY plan_tiers_select ON public.plan_tiers
    FOR SELECT
    USING (is_active = true);

-- Policy: Service role can manage all plan tiers
DROP POLICY IF EXISTS plan_tiers_service_role ON public.plan_tiers;
CREATE POLICY plan_tiers_service_role ON public.plan_tiers
    FOR ALL
    USING (auth.role() = 'service_role');

-- Seed initial plan tier data
INSERT INTO public.plan_tiers (tier_name, display_name, monthly_price_cents, agent_limit, run_limit_monthly, features_json, sort_order)
VALUES
    (
        'free',
        'Free',
        0,
        3,
        100,
        '{
            "support_level": "community",
            "api_access": false,
            "custom_branding": false,
            "priority_execution": false,
            "sso": false,
            "audit_logs": false,
            "dedicated_support": false
        }'::jsonb,
        1
    ),
    (
        'pro',
        'Pro',
        4900,  -- $49.00
        NULL,  -- unlimited agents
        5000,
        '{
            "support_level": "email",
            "api_access": true,
            "custom_branding": false,
            "priority_execution": true,
            "sso": false,
            "audit_logs": true,
            "dedicated_support": false
        }'::jsonb,
        2
    ),
    (
        'enterprise',
        'Enterprise',
        NULL,  -- custom pricing
        NULL,  -- unlimited agents
        NULL,  -- unlimited runs (custom)
        '{
            "support_level": "dedicated",
            "api_access": true,
            "custom_branding": true,
            "priority_execution": true,
            "sso": true,
            "audit_logs": true,
            "dedicated_support": true,
            "custom_integrations": true,
            "sla_guarantee": true
        }'::jsonb,
        3
    )
ON CONFLICT (tier_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    agent_limit = EXCLUDED.agent_limit,
    run_limit_monthly = EXCLUDED.run_limit_monthly,
    features_json = EXCLUDED.features_json,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- =====================================================
-- Organization Usage Tracking
-- =====================================================

-- Create current_usage table to track organization usage per billing period
CREATE TABLE IF NOT EXISTS public.organization_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Organization this usage belongs to
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Billing period start (first day of the month)
    period_start DATE NOT NULL,
    -- Billing period end (last day of the month)
    period_end DATE NOT NULL,
    -- Number of agents created during this period
    agents_created INTEGER NOT NULL DEFAULT 0,
    -- Number of agent runs executed during this period
    runs_executed INTEGER NOT NULL DEFAULT 0,
    -- Total tokens used (for cost tracking)
    total_tokens_used BIGINT NOT NULL DEFAULT 0,
    -- Estimated cost in cents (for analytics)
    estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- Ensure one record per org per period
    CONSTRAINT unique_org_period UNIQUE (org_id, period_start)
);

COMMENT ON TABLE public.organization_usage IS 'Tracks monthly usage metrics per organization for plan limit enforcement';
COMMENT ON COLUMN public.organization_usage.period_start IS 'First day of the billing period (monthly)';
COMMENT ON COLUMN public.organization_usage.agents_created IS 'Number of agents created during this billing period';
COMMENT ON COLUMN public.organization_usage.runs_executed IS 'Number of agent runs executed during this billing period';

-- Create indexes for organization_usage
CREATE INDEX IF NOT EXISTS idx_org_usage_org_id ON public.organization_usage(org_id);
CREATE INDEX IF NOT EXISTS idx_org_usage_period ON public.organization_usage(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_org_usage_org_period ON public.organization_usage(org_id, period_start DESC);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_organization_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_organization_usage_updated_at ON public.organization_usage;
CREATE TRIGGER trigger_organization_usage_updated_at
    BEFORE UPDATE ON public.organization_usage
    FOR EACH ROW
    EXECUTE FUNCTION public.update_organization_usage_updated_at();

-- Enable RLS on organization_usage table
ALTER TABLE public.organization_usage ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users and service role
GRANT SELECT ON TABLE public.organization_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_usage TO service_role;

-- Policy: Users can view usage for organizations they belong to
DROP POLICY IF EXISTS org_usage_select ON public.organization_usage;
CREATE POLICY org_usage_select ON public.organization_usage
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = org_id
            AND basejump.has_role_on_account(o.account_id)
        )
    );

-- Policy: Service role can manage all usage records
DROP POLICY IF EXISTS org_usage_service_role ON public.organization_usage;
CREATE POLICY org_usage_service_role ON public.organization_usage
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to get current billing period boundaries
CREATE OR REPLACE FUNCTION public.get_current_billing_period()
RETURNS TABLE (period_start DATE, period_end DATE)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN QUERY SELECT
        date_trunc('month', CURRENT_DATE)::DATE,
        (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_billing_period() TO authenticated, service_role;

-- Function to get or create current usage record for an organization
CREATE OR REPLACE FUNCTION public.get_or_create_org_usage(p_org_id UUID)
RETURNS public.organization_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
    v_usage public.organization_usage;
BEGIN
    -- Get current billing period
    SELECT * INTO v_period_start, v_period_end FROM public.get_current_billing_period();

    -- Try to get existing record
    SELECT * INTO v_usage
    FROM public.organization_usage
    WHERE org_id = p_org_id AND period_start = v_period_start;

    -- Create if not exists
    IF v_usage IS NULL THEN
        INSERT INTO public.organization_usage (org_id, period_start, period_end)
        VALUES (p_org_id, v_period_start, v_period_end)
        ON CONFLICT (org_id, period_start) DO NOTHING
        RETURNING * INTO v_usage;

        -- Handle race condition by re-selecting
        IF v_usage IS NULL THEN
            SELECT * INTO v_usage
            FROM public.organization_usage
            WHERE org_id = p_org_id AND period_start = v_period_start;
        END IF;
    END IF;

    RETURN v_usage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_org_usage(UUID) TO service_role;

-- Function to increment agent count for an organization
CREATE OR REPLACE FUNCTION public.increment_org_agent_count(p_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
    v_new_count INTEGER;
BEGIN
    -- Get current billing period
    SELECT * INTO v_period_start, v_period_end FROM public.get_current_billing_period();

    -- Upsert and increment
    INSERT INTO public.organization_usage (org_id, period_start, period_end, agents_created)
    VALUES (p_org_id, v_period_start, v_period_end, 1)
    ON CONFLICT (org_id, period_start) DO UPDATE
    SET agents_created = organization_usage.agents_created + 1,
        updated_at = NOW()
    RETURNING agents_created INTO v_new_count;

    RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_org_agent_count(UUID) TO service_role;

-- Function to increment run count for an organization
CREATE OR REPLACE FUNCTION public.increment_org_run_count(
    p_org_id UUID,
    p_tokens_used BIGINT DEFAULT 0,
    p_cost_cents INTEGER DEFAULT 0
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
    v_new_count INTEGER;
BEGIN
    -- Get current billing period
    SELECT * INTO v_period_start, v_period_end FROM public.get_current_billing_period();

    -- Upsert and increment
    INSERT INTO public.organization_usage (org_id, period_start, period_end, runs_executed, total_tokens_used, estimated_cost_cents)
    VALUES (p_org_id, v_period_start, v_period_end, 1, COALESCE(p_tokens_used, 0), COALESCE(p_cost_cents, 0))
    ON CONFLICT (org_id, period_start) DO UPDATE
    SET runs_executed = organization_usage.runs_executed + 1,
        total_tokens_used = organization_usage.total_tokens_used + COALESCE(p_tokens_used, 0),
        estimated_cost_cents = organization_usage.estimated_cost_cents + COALESCE(p_cost_cents, 0),
        updated_at = NOW()
    RETURNING runs_executed INTO v_new_count;

    RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_org_run_count(UUID, BIGINT, INTEGER) TO service_role;

-- Function to get organization's current usage with limits
CREATE OR REPLACE FUNCTION public.get_org_usage_with_limits(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, basejump
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'org_id', o.id,
        'org_name', o.name,
        'plan_tier', o.plan_tier,
        'period_start', u.period_start,
        'period_end', u.period_end,
        'agents_created', COALESCE(u.agents_created, 0),
        'runs_executed', COALESCE(u.runs_executed, 0),
        'total_tokens_used', COALESCE(u.total_tokens_used, 0),
        'estimated_cost_cents', COALESCE(u.estimated_cost_cents, 0),
        'limits', json_build_object(
            'agent_limit', pt.agent_limit,
            'run_limit_monthly', pt.run_limit_monthly
        ),
        'usage_percentages', json_build_object(
            'agents_percent', CASE
                WHEN pt.agent_limit IS NULL THEN 0
                ELSE ROUND((COALESCE(u.agents_created, 0)::DECIMAL / pt.agent_limit) * 100, 1)
            END,
            'runs_percent', CASE
                WHEN pt.run_limit_monthly IS NULL THEN 0
                ELSE ROUND((COALESCE(u.runs_executed, 0)::DECIMAL / pt.run_limit_monthly) * 100, 1)
            END
        )
    )
    INTO v_result
    FROM public.organizations o
    JOIN public.plan_tiers pt ON pt.tier_name = o.plan_tier
    LEFT JOIN public.organization_usage u ON u.org_id = o.id
        AND u.period_start = date_trunc('month', CURRENT_DATE)::DATE
    WHERE o.id = p_org_id
    AND basejump.has_role_on_account(o.account_id);

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Organization not found or access denied';
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_usage_with_limits(UUID) TO authenticated, service_role;

-- Function to get plan tier details
CREATE OR REPLACE FUNCTION public.get_plan_tier(p_tier_name public.plan_tier)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'id', pt.id,
        'tier_name', pt.tier_name,
        'display_name', pt.display_name,
        'monthly_price_cents', pt.monthly_price_cents,
        'agent_limit', pt.agent_limit,
        'run_limit_monthly', pt.run_limit_monthly,
        'features', pt.features_json
    )
    INTO v_result
    FROM public.plan_tiers pt
    WHERE pt.tier_name = p_tier_name AND pt.is_active = true;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_plan_tier(public.plan_tier) TO authenticated, service_role;

-- Function to get all active plan tiers
CREATE OR REPLACE FUNCTION public.get_all_plan_tiers()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', pt.id,
                'tier_name', pt.tier_name,
                'display_name', pt.display_name,
                'monthly_price_cents', pt.monthly_price_cents,
                'agent_limit', pt.agent_limit,
                'run_limit_monthly', pt.run_limit_monthly,
                'features', pt.features_json
            ) ORDER BY pt.sort_order
        ), '[]'::json)
        FROM public.plan_tiers pt
        WHERE pt.is_active = true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_plan_tiers() TO authenticated, service_role;

-- =====================================================
-- Monthly Usage Reset Function (for pg_cron)
-- =====================================================

-- Function to reset usage counters for a new billing period
-- This doesn't delete old records - it just ensures new ones exist
-- Called by pg_cron at the start of each month
CREATE OR REPLACE FUNCTION public.reset_monthly_usage_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- Get current billing period (should be the new month)
    SELECT * INTO v_period_start, v_period_end FROM public.get_current_billing_period();

    -- Create new usage records for all active organizations
    -- This pre-creates records so we don't have race conditions on first usage
    INSERT INTO public.organization_usage (org_id, period_start, period_end)
    SELECT
        o.id,
        v_period_start,
        v_period_end
    FROM public.organizations o
    WHERE o.billing_status IN ('active', 'trialing')
    ON CONFLICT (org_id, period_start) DO NOTHING;

    -- Log the reset (for monitoring)
    RAISE NOTICE 'Monthly usage reset completed for period: % to %', v_period_start, v_period_end;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_monthly_usage_counters() TO service_role;

-- Schedule the monthly reset cron job (runs at 00:01 UTC on the 1st of each month)
-- Using pg_cron extension
DO $$
BEGIN
    -- Check if pg_cron extension is available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Unschedule existing job if present
        PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'reset_monthly_org_usage';

        -- Schedule the monthly reset
        PERFORM cron.schedule(
            'reset_monthly_org_usage',
            '1 0 1 * *',  -- At 00:01 on day 1 of every month
            $$SELECT public.reset_monthly_usage_counters()$$
        );

        RAISE NOTICE 'Monthly usage reset cron job scheduled successfully';
    ELSE
        RAISE NOTICE 'pg_cron extension not available - monthly reset will need to be triggered manually or via external scheduler';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not schedule cron job: %. Monthly reset will need to be triggered manually.', SQLERRM;
END;
$$;

COMMIT;
