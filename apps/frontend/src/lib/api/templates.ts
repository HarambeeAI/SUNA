/**
 * Agent Templates API
 *
 * Handles agent template and category management for the marketplace.
 */

import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface TemplateCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentTemplateConfig {
  system_prompt: string;
  tools: {
    agentpress: Record<string, unknown>;
    mcp: unknown[];
    custom_mcp: unknown[];
  };
  metadata: {
    avatar?: string;
    avatar_color?: string;
    template_metadata?: Record<string, unknown>;
  };
}

export interface AgentTemplate {
  template_id: string;
  creator_id: string;
  name: string;
  description?: string;
  config: AgentTemplateConfig;
  tags: string[];
  category_id?: string;
  category?: TemplateCategory;
  is_public: boolean;
  is_kortix_team: boolean;
  download_count: number;
  template_version: number;
  version_notes?: string;
  marketplace_published_at?: string;
  usage_examples?: unknown[];
  created_at: string;
  updated_at: string;
}

export interface AgentTemplateWithCategory extends AgentTemplate {
  category_name?: string;
  category_slug?: string;
}

export interface TemplateCategoriesResponse {
  categories: TemplateCategory[];
}

export interface AgentTemplatesResponse {
  templates: AgentTemplate[];
  pagination: {
    current_page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

export interface AgentTemplatesParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  tags?: string[];
}

export interface CreateAgentTemplateRequest {
  name: string;
  description?: string;
  config: AgentTemplateConfig;
  category_id?: string;
  tags?: string[];
  is_public?: boolean;
}

export interface UpdateAgentTemplateRequest {
  name?: string;
  description?: string;
  config?: AgentTemplateConfig;
  category_id?: string;
  tags?: string[];
  is_public?: boolean;
  version_notes?: string;
}

// ============================================================================
// Category API Functions
// ============================================================================

/**
 * Get all active template categories
 */
export async function getTemplateCategories(): Promise<TemplateCategory[]> {
  try {
    const response = await backendApi.get('/v1/templates/categories');
    return response.data.categories || response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Get a template category by slug
 */
export async function getTemplateCategoryBySlug(
  slug: string
): Promise<TemplateCategory | null> {
  try {
    const response = await backendApi.get(`/v1/templates/categories/${slug}`);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

// ============================================================================
// Template API Functions
// ============================================================================

/**
 * Get all public templates with optional filtering
 */
export async function getTemplates(
  params?: AgentTemplatesParams
): Promise<AgentTemplatesResponse> {
  try {
    const response = await backendApi.get('/v1/templates', { params });
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Get templates by category
 */
export async function getTemplatesByCategory(
  categorySlug: string,
  params?: Omit<AgentTemplatesParams, 'category'>
): Promise<AgentTemplatesResponse> {
  try {
    const response = await backendApi.get('/v1/templates', {
      params: { ...params, category: categorySlug },
    });
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Get a specific template by ID
 */
export async function getTemplate(templateId: string): Promise<AgentTemplate> {
  try {
    const response = await backendApi.get(`/v1/templates/${templateId}`);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Create a new template
 */
export async function createTemplate(
  data: CreateAgentTemplateRequest
): Promise<AgentTemplate> {
  try {
    const response = await backendApi.post('/v1/templates', data);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Update an existing template
 */
export async function updateTemplate(
  templateId: string,
  data: UpdateAgentTemplateRequest
): Promise<AgentTemplate> {
  try {
    const response = await backendApi.patch(`/v1/templates/${templateId}`, data);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  try {
    await backendApi.delete(`/v1/templates/${templateId}`);
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Search templates
 */
export async function searchTemplates(
  query: string,
  params?: Omit<AgentTemplatesParams, 'search'>
): Promise<AgentTemplatesResponse> {
  try {
    const response = await backendApi.get('/v1/templates', {
      params: { ...params, search: query },
    });
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}
