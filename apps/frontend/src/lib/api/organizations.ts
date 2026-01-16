/**
 * Organizations API
 *
 * Handles multi-tenant organization management for the SaaS platform.
 */

import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export type PlanTier = 'free' | 'pro' | 'enterprise';

export type BillingStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'unpaid';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan_tier: PlanTier;
  billing_status: BillingStatus;
  account_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrganizationWithRole extends Organization {
  role: 'owner' | 'member';
}

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
  plan_tier?: PlanTier;
}

export interface UpdateOrganizationRequest {
  name?: string;
  settings?: Record<string, unknown>;
}

export interface OrganizationsResponse {
  organizations: OrganizationWithRole[];
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get all organizations the current user is a member of
 */
export const getOrganizations = async (): Promise<OrganizationWithRole[]> => {
  try {
    const response = await backendApi.get<OrganizationsResponse>('/v1/organizations', {
      showErrors: false,
    });

    if (response.error) {
      handleApiError(response.error, {
        operation: 'load organizations',
        resource: 'organizations'
      });
      return [];
    }

    return response.data?.organizations || [];
  } catch (err) {
    handleApiError(err, {
      operation: 'load organizations',
      resource: 'organizations'
    });
    return [];
  }
};

/**
 * Get a single organization by ID
 */
export const getOrganization = async (orgId: string): Promise<Organization> => {
  const response = await backendApi.get<Organization>(`/v1/organizations/${orgId}`, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, {
      operation: 'load organization',
      resource: `organization ${orgId}`
    });
    throw new Error(response.error.message || 'Failed to load organization');
  }

  if (!response.data) {
    throw new Error('Organization not found');
  }

  return response.data;
};

/**
 * Get a single organization by slug
 */
export const getOrganizationBySlug = async (slug: string): Promise<Organization> => {
  const response = await backendApi.get<Organization>(`/v1/organizations/by-slug/${slug}`, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, {
      operation: 'load organization',
      resource: `organization ${slug}`
    });
    throw new Error(response.error.message || 'Failed to load organization');
  }

  if (!response.data) {
    throw new Error('Organization not found');
  }

  return response.data;
};

/**
 * Create a new organization
 */
export const createOrganization = async (data: CreateOrganizationRequest): Promise<Organization> => {
  const response = await backendApi.post<Organization>('/v1/organizations', data, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, {
      operation: 'create organization',
      resource: 'organization'
    });
    throw new Error(response.error.message || 'Failed to create organization');
  }

  if (!response.data) {
    throw new Error('Failed to create organization');
  }

  return response.data;
};

/**
 * Update an organization
 */
export const updateOrganization = async (
  orgId: string,
  data: UpdateOrganizationRequest
): Promise<Organization> => {
  const response = await backendApi.patch<Organization>(`/v1/organizations/${orgId}`, data, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, {
      operation: 'update organization',
      resource: `organization ${orgId}`
    });
    throw new Error(response.error.message || 'Failed to update organization');
  }

  if (!response.data) {
    throw new Error('Failed to update organization');
  }

  return response.data;
};

/**
 * Delete an organization
 */
export const deleteOrganization = async (orgId: string): Promise<void> => {
  const response = await backendApi.delete(`/v1/organizations/${orgId}`, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, {
      operation: 'delete organization',
      resource: `organization ${orgId}`
    });
    throw new Error(response.error.message || 'Failed to delete organization');
  }
};
