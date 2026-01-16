-- Migration: US-012 Agent template schema and storage
-- Adds template_categories table and versioning support to agent_templates

BEGIN;

-- =====================================================
-- 1. TEMPLATE CATEGORIES TABLE
-- =====================================================
-- Stores categories for organizing agent templates in the marketplace

CREATE TABLE IF NOT EXISTS template_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50), -- Icon name (e.g., 'headphones', 'briefcase', 'search')
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for template_categories
CREATE INDEX IF NOT EXISTS idx_template_categories_slug ON template_categories(slug);
CREATE INDEX IF NOT EXISTS idx_template_categories_sort_order ON template_categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_template_categories_is_active ON template_categories(is_active);

-- Updated_at trigger for template_categories
DROP TRIGGER IF EXISTS trigger_template_categories_updated_at ON template_categories;
CREATE TRIGGER trigger_template_categories_updated_at
    BEFORE UPDATE ON template_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_timestamp();

-- =====================================================
-- 2. ADD CATEGORY TO AGENT_TEMPLATES
-- =====================================================
-- Add category_id foreign key to agent_templates

ALTER TABLE agent_templates
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES template_categories(id) ON DELETE SET NULL;

-- Index for category lookups
CREATE INDEX IF NOT EXISTS idx_agent_templates_category_id ON agent_templates(category_id);

-- =====================================================
-- 3. ADD TEMPLATE VERSIONING
-- =====================================================
-- Add template_version column for tracking template updates

ALTER TABLE agent_templates
ADD COLUMN IF NOT EXISTS template_version INTEGER DEFAULT 1;

ALTER TABLE agent_templates
ADD COLUMN IF NOT EXISTS version_notes TEXT;

-- Index for version queries
CREATE INDEX IF NOT EXISTS idx_agent_templates_template_version ON agent_templates(template_version);

-- =====================================================
-- 4. SEED INITIAL CATEGORIES
-- =====================================================
-- Insert the initial template categories

INSERT INTO template_categories (name, slug, description, icon, sort_order) VALUES
    ('Customer Service', 'customer-service', 'Templates for handling support tickets, FAQ lookup, and customer interactions', 'headphones', 1),
    ('Sales', 'sales', 'Templates for sales research, lead enrichment, and prospect outreach', 'briefcase', 2),
    ('Research', 'research', 'Templates for data research, information gathering, and analysis', 'search', 3),
    ('Content Creation', 'content-creation', 'Templates for creating blog posts, social media content, and marketing materials', 'pen-tool', 4),
    ('Data Analysis', 'data-analysis', 'Templates for CSV analysis, data visualization, and report generation', 'bar-chart', 5)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- =====================================================
-- Enable RLS and add policies for template_categories

ALTER TABLE template_categories ENABLE ROW LEVEL SECURITY;

-- Everyone can read active categories
DROP POLICY IF EXISTS template_categories_select_policy ON template_categories;
CREATE POLICY template_categories_select_policy ON template_categories
    FOR SELECT
    USING (is_active = true);

-- Only admins can modify categories (service_role)
DROP POLICY IF EXISTS template_categories_insert_policy ON template_categories;
CREATE POLICY template_categories_insert_policy ON template_categories
    FOR INSERT
    WITH CHECK (false); -- Only service_role can insert

DROP POLICY IF EXISTS template_categories_update_policy ON template_categories;
CREATE POLICY template_categories_update_policy ON template_categories
    FOR UPDATE
    USING (false); -- Only service_role can update

DROP POLICY IF EXISTS template_categories_delete_policy ON template_categories;
CREATE POLICY template_categories_delete_policy ON template_categories
    FOR DELETE
    USING (false); -- Only service_role can delete

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Function to get all active categories
CREATE OR REPLACE FUNCTION get_template_categories()
RETURNS SETOF template_categories
SECURITY DEFINER
LANGUAGE sql
AS $$
    SELECT * FROM template_categories
    WHERE is_active = true
    ORDER BY sort_order, name;
$$;

-- Function to get category by slug
CREATE OR REPLACE FUNCTION get_template_category_by_slug(p_slug VARCHAR(100))
RETURNS template_categories
SECURITY DEFINER
LANGUAGE sql
AS $$
    SELECT * FROM template_categories
    WHERE slug = p_slug AND is_active = true
    LIMIT 1;
$$;

-- Function to get templates by category
CREATE OR REPLACE FUNCTION get_templates_by_category(
    p_category_slug VARCHAR(100),
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    template_id UUID,
    creator_id UUID,
    name VARCHAR(255),
    description TEXT,
    config JSONB,
    tags TEXT[],
    category_id UUID,
    category_name VARCHAR(100),
    category_slug VARCHAR(100),
    is_public BOOLEAN,
    is_kortix_team BOOLEAN,
    download_count INTEGER,
    template_version INTEGER,
    marketplace_published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.template_id,
        t.creator_id,
        t.name,
        t.description,
        t.config,
        t.tags,
        t.category_id,
        c.name as category_name,
        c.slug as category_slug,
        t.is_public,
        t.is_kortix_team,
        t.download_count,
        t.template_version,
        t.marketplace_published_at,
        t.created_at,
        t.updated_at
    FROM agent_templates t
    LEFT JOIN template_categories c ON t.category_id = c.id
    WHERE t.is_public = true
    AND (p_category_slug IS NULL OR c.slug = p_category_slug)
    ORDER BY t.download_count DESC, t.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to increment template version
CREATE OR REPLACE FUNCTION increment_template_version(
    p_template_id UUID,
    p_version_notes TEXT DEFAULT NULL
)
RETURNS INTEGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_version INTEGER;
BEGIN
    UPDATE agent_templates
    SET
        template_version = template_version + 1,
        version_notes = p_version_notes,
        updated_at = NOW()
    WHERE template_id = p_template_id
    RETURNING template_version INTO v_new_version;

    RETURN v_new_version;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_template_categories() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_template_category_by_slug(VARCHAR) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_templates_by_category(VARCHAR, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_template_version(UUID, TEXT) TO authenticated;

-- Grant table access
GRANT SELECT ON TABLE template_categories TO authenticated, anon;
GRANT ALL PRIVILEGES ON TABLE template_categories TO service_role;

COMMIT;
