/**
 * API client for platform admin dashboard.
 */

import { backendApi } from '../api-client';

// Types

export interface PlatformOverviewStats {
  total_users: number;
  total_organizations: number;
  total_agents: number;
  runs_today: number;
  runs_this_week: number;
  active_users_today: number;
  active_users_week: number;
  pending_template_submissions: number;
  new_users_today: number;
  new_users_week: number;
}

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface OrganizationAdminSummary {
  id: string;
  name: string;
  slug: string;
  plan_tier: string;
  billing_status?: string;
  member_count: number;
  agent_count: number;
  runs_this_month: number;
  created_at: string;
  owner_email?: string;
}

export interface OrganizationsListResponse {
  items: OrganizationAdminSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface UpdateOrgPlanTierRequest {
  plan_tier: PlanTier;
  reason?: string;
}

export interface UpdateOrgPlanTierResponse {
  success: boolean;
  message: string;
  org_id: string;
  old_tier: string;
  new_tier: string;
}

export interface UserAdminSummary {
  id: string;
  email?: string;
  created_at: string;
  is_suspended: boolean;
  suspension_reason?: string;
  suspended_at?: string;
  last_activity?: string;
  agent_count: number;
  runs_count: number;
}

export interface UsersListResponse {
  items: UserAdminSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface SuspendUserRequest {
  reason: string;
}

export interface SystemHealthMetrics {
  api_healthy: boolean;
  database_healthy: boolean;
  redis_healthy: boolean;
  avg_response_time_ms?: number;
  error_rate_percent?: number;
  active_agent_runs: number;
  background_jobs_pending: number;
}

// Helper to build query strings
function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

// Platform Overview API

export async function getPlatformOverview(): Promise<PlatformOverviewStats> {
  const response = await backendApi.get<PlatformOverviewStats>('/admin/platform/overview');
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to fetch platform overview');
  }
  return response.data;
}

// Organizations Admin API

export async function listOrganizationsAdmin(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  plan_tier?: PlanTier;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}): Promise<OrganizationsListResponse> {
  const queryString = buildQueryString(params ?? {});
  const response = await backendApi.get<OrganizationsListResponse>(
    `/admin/platform/organizations${queryString}`
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to list organizations');
  }
  return response.data;
}

export async function updateOrganizationPlanTier(
  orgId: string,
  request: UpdateOrgPlanTierRequest
): Promise<UpdateOrgPlanTierResponse> {
  const response = await backendApi.patch<UpdateOrgPlanTierResponse>(
    `/admin/platform/organizations/${orgId}/plan-tier`,
    request
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to update organization plan tier');
  }
  return response.data;
}

// Users Admin API

export async function listUsersAdmin(params?: {
  page?: number;
  page_size?: number;
  search_email?: string;
  is_suspended?: boolean;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}): Promise<UsersListResponse> {
  const queryString = buildQueryString(params ?? {});
  const response = await backendApi.get<UsersListResponse>(
    `/admin/platform/users${queryString}`
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to list users');
  }
  return response.data;
}

export async function suspendUser(
  userId: string,
  request: SuspendUserRequest
): Promise<{ success: boolean; message: string; user_id: string; reason: string }> {
  const response = await backendApi.post<{ success: boolean; message: string; user_id: string; reason: string }>(
    `/admin/platform/users/${userId}/suspend`,
    request
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to suspend user');
  }
  return response.data;
}

export async function unsuspendUser(
  userId: string
): Promise<{ success: boolean; message: string; user_id: string }> {
  const response = await backendApi.post<{ success: boolean; message: string; user_id: string }>(
    `/admin/platform/users/${userId}/unsuspend`,
    {}
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to unsuspend user');
  }
  return response.data;
}

// System Health API

export async function getSystemHealth(): Promise<SystemHealthMetrics> {
  const response = await backendApi.get<SystemHealthMetrics>('/admin/platform/health');
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to fetch system health');
  }
  return response.data;
}
