/**
 * API client for template submissions.
 */

import { backendApi } from '../api-client';

// Types

export type TemplateSubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface TemplateSubmissionCreateRequest {
  agent_id: string;
  template_name: string;
  template_description?: string;
  category_id?: string;
  use_cases?: string[];
}

export interface TemplateSubmission {
  submission_id: string;
  agent_id: string;
  submitter_id: string;
  template_name: string;
  template_description?: string;
  category_id?: string;
  use_cases?: string[];
  status: TemplateSubmissionStatus;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  rejection_reason?: string;
  published_template_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined fields
  agent_name?: string;
  submitter_email?: string;
  category_name?: string;
}

export interface TemplateSubmissionsListResponse {
  submissions: TemplateSubmission[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface TemplateSubmissionStatsResponse {
  total_submissions: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  submissions_this_week: number;
  avg_review_time_hours?: number;
}

export interface ApproveSubmissionRequest {
  admin_notes?: string;
}

export interface RejectSubmissionRequest {
  rejection_reason: string;
  admin_notes?: string;
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

// User API functions

export async function createTemplateSubmission(
  request: TemplateSubmissionCreateRequest
): Promise<TemplateSubmission> {
  const response = await backendApi.post<TemplateSubmission>('/template-submissions', request);
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to create template submission');
  }
  return response.data;
}

export async function listMySubmissions(params?: {
  status?: TemplateSubmissionStatus;
  page?: number;
  page_size?: number;
}): Promise<TemplateSubmissionsListResponse> {
  const queryString = buildQueryString(params ?? {});
  const response = await backendApi.get<TemplateSubmissionsListResponse>(
    `/template-submissions${queryString}`
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to list submissions');
  }
  return response.data;
}

export async function getSubmission(submissionId: string): Promise<TemplateSubmission> {
  const response = await backendApi.get<TemplateSubmission>(
    `/template-submissions/${submissionId}`
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to get submission');
  }
  return response.data;
}

export async function cancelSubmission(
  submissionId: string
): Promise<{ message: string }> {
  const response = await backendApi.delete<{ message: string }>(
    `/template-submissions/${submissionId}`
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to cancel submission');
  }
  return response.data;
}

// Admin API functions

export async function listAllSubmissions(params?: {
  status?: TemplateSubmissionStatus;
  page?: number;
  page_size?: number;
}): Promise<TemplateSubmissionsListResponse> {
  const queryString = buildQueryString(params ?? {});
  const response = await backendApi.get<TemplateSubmissionsListResponse>(
    `/admin/template-submissions${queryString}`
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to list all submissions');
  }
  return response.data;
}

export async function getSubmissionStats(): Promise<TemplateSubmissionStatsResponse> {
  const response = await backendApi.get<TemplateSubmissionStatsResponse>(
    '/admin/template-submissions/stats'
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to get submission stats');
  }
  return response.data;
}

export async function approveSubmission(
  submissionId: string,
  request?: ApproveSubmissionRequest
): Promise<TemplateSubmission> {
  const response = await backendApi.post<TemplateSubmission>(
    `/admin/template-submissions/${submissionId}/approve`,
    request ?? {}
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to approve submission');
  }
  return response.data;
}

export async function rejectSubmission(
  submissionId: string,
  request: RejectSubmissionRequest
): Promise<TemplateSubmission> {
  const response = await backendApi.post<TemplateSubmission>(
    `/admin/template-submissions/${submissionId}/reject`,
    request
  );
  if (!response.success || !response.data) {
    throw response.error || new Error('Failed to reject submission');
  }
  return response.data;
}
