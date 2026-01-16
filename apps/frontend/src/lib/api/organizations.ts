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

// Organization member roles (more granular than basejump)
export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrganizationRole;
  invited_by: string | null;
  joined_at: string;
  email?: string;
  metadata?: Record<string, unknown>;
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

// ============================================================================
// Organization Members API Functions
// ============================================================================

export interface AddMemberRequest {
  user_id: string;
  role?: OrganizationRole;
}

export interface UpdateMemberRoleRequest {
  role: OrganizationRole;
}

/**
 * Get all members of an organization
 */
export const getOrganizationMembers = async (orgId: string): Promise<OrganizationMember[]> => {
  try {
    const response = await backendApi.get<OrganizationMember[]>(`/v1/organizations/${orgId}/members`, {
      showErrors: false,
    });

    if (response.error) {
      handleApiError(response.error, {
        operation: 'load organization members',
        resource: `organization ${orgId} members`
      });
      return [];
    }

    return response.data || [];
  } catch (err) {
    handleApiError(err, {
      operation: 'load organization members',
      resource: `organization ${orgId} members`
    });
    return [];
  }
};

/**
 * Add a member to an organization
 */
export const addOrganizationMember = async (
  orgId: string,
  data: AddMemberRequest
): Promise<OrganizationMember> => {
  const response = await backendApi.post<OrganizationMember>(
    `/v1/organizations/${orgId}/members`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, {
      operation: 'add organization member',
      resource: `organization ${orgId}`
    });
    throw new Error(response.error.message || 'Failed to add member');
  }

  if (!response.data) {
    throw new Error('Failed to add member');
  }

  return response.data;
};

/**
 * Update a member's role in an organization
 */
export const updateOrganizationMemberRole = async (
  orgId: string,
  userId: string,
  data: UpdateMemberRoleRequest
): Promise<void> => {
  const response = await backendApi.patch(
    `/v1/organizations/${orgId}/members/${userId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, {
      operation: 'update member role',
      resource: `organization ${orgId} member ${userId}`
    });
    throw new Error(response.error.message || 'Failed to update member role');
  }
};

/**
 * Remove a member from an organization
 */
export const removeOrganizationMember = async (
  orgId: string,
  userId: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/v1/organizations/${orgId}/members/${userId}`,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, {
      operation: 'remove organization member',
      resource: `organization ${orgId} member ${userId}`
    });
    throw new Error(response.error.message || 'Failed to remove member');
  }
};

// ============================================================================
// Plan Tiers and Usage Types
// ============================================================================

export interface PlanTierFeatures {
  support_level: 'community' | 'email' | 'dedicated';
  api_access: boolean;
  custom_branding: boolean;
  priority_execution: boolean;
  sso: boolean;
  audit_logs: boolean;
  dedicated_support: boolean;
  custom_integrations?: boolean;
  sla_guarantee?: boolean;
}

export interface PlanTierInfo {
  id: string;
  tier_name: PlanTier;
  display_name: string;
  monthly_price_cents: number | null;
  agent_limit: number | null;
  run_limit_monthly: number | null;
  features: PlanTierFeatures;
}

export interface UsageLimits {
  agent_limit: number | null;
  run_limit_monthly: number | null;
}

export interface UsagePercentages {
  agents_percent: number;
  runs_percent: number;
}

export interface OrganizationUsage {
  org_id: string;
  org_name: string;
  plan_tier: PlanTier;
  period_start: string;
  period_end: string;
  agents_created: number;
  runs_executed: number;
  total_tokens_used: number;
  estimated_cost_cents: number;
  limits: UsageLimits;
  usage_percentages: UsagePercentages;
}

export interface UsageRecord {
  id: string;
  org_id: string;
  period_start: string;
  period_end: string;
  agents_created: number;
  runs_executed: number;
  total_tokens_used: number;
  estimated_cost_cents: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Plan Tiers API Functions
// ============================================================================

/**
 * Get all available plan tiers
 */
export const getPlanTiers = async (): Promise<PlanTierInfo[]> => {
  try {
    const response = await backendApi.get<{ tiers: PlanTierInfo[] }>('/v1/plan-tiers', {
      showErrors: false,
    });

    if (response.error) {
      handleApiError(response.error, {
        operation: 'load plan tiers',
        resource: 'plan tiers'
      });
      return [];
    }

    return response.data?.tiers || [];
  } catch (err) {
    handleApiError(err, {
      operation: 'load plan tiers',
      resource: 'plan tiers'
    });
    return [];
  }
};

/**
 * Get a specific plan tier by name
 */
export const getPlanTier = async (tierName: PlanTier): Promise<PlanTierInfo | null> => {
  try {
    const response = await backendApi.get<PlanTierInfo>(`/v1/plan-tiers/${tierName}`, {
      showErrors: false,
    });

    if (response.error) {
      handleApiError(response.error, {
        operation: 'load plan tier',
        resource: `plan tier ${tierName}`
      });
      return null;
    }

    return response.data || null;
  } catch (err) {
    handleApiError(err, {
      operation: 'load plan tier',
      resource: `plan tier ${tierName}`
    });
    return null;
  }
};

// ============================================================================
// Organization Usage API Functions
// ============================================================================

/**
 * Get current usage for an organization (with limits)
 */
export const getOrganizationUsage = async (orgId: string): Promise<OrganizationUsage | null> => {
  try {
    const response = await backendApi.get<OrganizationUsage>(`/v1/organizations/${orgId}/usage`, {
      showErrors: false,
    });

    if (response.error) {
      handleApiError(response.error, {
        operation: 'load organization usage',
        resource: `organization ${orgId} usage`
      });
      return null;
    }

    return response.data || null;
  } catch (err) {
    handleApiError(err, {
      operation: 'load organization usage',
      resource: `organization ${orgId} usage`
    });
    return null;
  }
};

/**
 * Get usage history for an organization
 */
export const getOrganizationUsageHistory = async (
  orgId: string,
  limit: number = 12
): Promise<UsageRecord[]> => {
  try {
    const response = await backendApi.get<{ usage_records: UsageRecord[]; total_records: number }>(
      `/v1/organizations/${orgId}/usage/history?limit=${limit}`,
      { showErrors: false }
    );

    if (response.error) {
      handleApiError(response.error, {
        operation: 'load usage history',
        resource: `organization ${orgId} usage history`
      });
      return [];
    }

    return response.data?.usage_records || [];
  } catch (err) {
    handleApiError(err, {
      operation: 'load usage history',
      resource: `organization ${orgId} usage history`
    });
    return [];
  }
};

// ============================================================================
// Organization Billing API Functions
// ============================================================================

export interface CheckoutRequest {
  plan_tier: 'pro' | 'enterprise';
  success_url: string;
  cancel_url?: string;
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
  message: string;
}

export interface BillingPortalRequest {
  return_url: string;
}

export interface BillingPortalResponse {
  portal_url: string;
}

export interface SubscriptionStatusResponse {
  org_id: string;
  plan_tier: PlanTier;
  billing_status: BillingStatus;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  has_active_subscription: boolean;
}

/**
 * Create a Stripe checkout session for organization upgrade
 */
export const createOrgCheckoutSession = async (
  orgId: string,
  data: CheckoutRequest
): Promise<CheckoutResponse> => {
  const response = await backendApi.post<CheckoutResponse>(
    `/v1/organizations/${orgId}/billing/checkout`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, {
      operation: 'create checkout session',
      resource: `organization ${orgId}`
    });
    throw new Error(response.error.message || 'Failed to create checkout session');
  }

  if (!response.data) {
    throw new Error('Failed to create checkout session');
  }

  return response.data;
};

/**
 * Create a Stripe billing portal session for the organization
 */
export const createOrgBillingPortalSession = async (
  orgId: string,
  data: BillingPortalRequest
): Promise<BillingPortalResponse> => {
  const response = await backendApi.post<BillingPortalResponse>(
    `/v1/organizations/${orgId}/billing/portal`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, {
      operation: 'create billing portal session',
      resource: `organization ${orgId}`
    });
    throw new Error(response.error.message || 'Failed to create billing portal session');
  }

  if (!response.data) {
    throw new Error('Failed to create billing portal session');
  }

  return response.data;
};

/**
 * Get subscription status for an organization
 */
export const getOrgSubscriptionStatus = async (
  orgId: string
): Promise<SubscriptionStatusResponse | null> => {
  try {
    const response = await backendApi.get<SubscriptionStatusResponse>(
      `/v1/organizations/${orgId}/billing/status`,
      { showErrors: false }
    );

    if (response.error) {
      handleApiError(response.error, {
        operation: 'get subscription status',
        resource: `organization ${orgId}`
      });
      return null;
    }

    return response.data || null;
  } catch (err) {
    handleApiError(err, {
      operation: 'get subscription status',
      resource: `organization ${orgId}`
    });
    return null;
  }
};
