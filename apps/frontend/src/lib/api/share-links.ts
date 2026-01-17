/**
 * Agent Share Links API
 *
 * Handles public sharing of agents via unique share tokens.
 */

import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface ShareLinkSettings {
  rate_limit_per_hour?: number;
  allow_file_access?: boolean;
  custom_greeting?: string;
}

export interface ShareLinkCreateRequest {
  expires_in_days?: number;
  settings?: ShareLinkSettings;
}

export interface ShareLinkAgentInfo {
  agent_id: string;
  name: string;
  description?: string;
  icon_name?: string;
  icon_color?: string;
  icon_background?: string;
}

export interface ShareLink {
  share_id: string;
  agent_id: string;
  created_at: string;
  expires_at?: string;
  is_active: boolean;
  views_count: number;
  runs_count: number;
  last_viewed_at?: string;
  last_run_at?: string;
  settings?: ShareLinkSettings;
}

export interface ShareLinksListResponse {
  share_links: ShareLink[];
}

export interface PublicShareLink {
  share_id: string;
  agent: ShareLinkAgentInfo;
  views_count: number;
  settings?: ShareLinkSettings;
}

export interface ShareLinkError {
  error: string;
  code: 'LINK_DEACTIVATED' | 'LINK_EXPIRED' | 'LINK_NOT_FOUND' | 'AGENT_NOT_FOUND';
}

export interface ShareLinkUpdateRequest {
  is_active?: boolean;
  settings?: ShareLinkSettings;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a new share link for an agent
 */
export async function createShareLink(
  agentId: string,
  request: ShareLinkCreateRequest = {}
): Promise<ShareLink> {
  try {
    const response = await backendApi.post(`/agents/${agentId}/share-links`, request);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * List all share links for an agent
 */
export async function listShareLinks(agentId: string): Promise<ShareLinksListResponse> {
  try {
    const response = await backendApi.get(`/agents/${agentId}/share-links`);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Get public share link details (no auth required)
 */
export async function getPublicShareLink(shareId: string): Promise<PublicShareLink> {
  try {
    const response = await backendApi.get(`/share/${shareId}`);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Update a share link
 */
export async function updateShareLink(
  shareId: string,
  request: ShareLinkUpdateRequest
): Promise<ShareLink> {
  try {
    const response = await backendApi.patch(`/share-links/${shareId}`, request);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Delete a share link permanently
 */
export async function deleteShareLink(shareId: string): Promise<void> {
  try {
    await backendApi.delete(`/share-links/${shareId}`);
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Revoke (deactivate) a share link
 */
export async function revokeShareLink(shareId: string): Promise<ShareLink> {
  try {
    const response = await backendApi.post(`/share-links/${shareId}/revoke`);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

/**
 * Generate the public URL for a share link
 */
export function getShareLinkUrl(shareId: string): string {
  // Get the base URL from the current window location
  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : '';
  return `${baseUrl}/share/agent/${shareId}`;
}
