/**
 * Organization API Keys API Client
 *
 * API functions for managing organization-level API keys with scopes.
 */

import { backendApi } from "./api";

// Scopes available for organization API keys
export type OrgApiKeyScope =
  | "read:agents"
  | "write:agents"
  | "execute:agents"
  | "read:templates";

export const ORG_API_KEY_SCOPES: { value: OrgApiKeyScope; label: string; description: string }[] = [
  {
    value: "read:agents",
    label: "Read Agents",
    description: "View agents and their configurations",
  },
  {
    value: "write:agents",
    label: "Write Agents",
    description: "Create, update, and delete agents",
  },
  {
    value: "execute:agents",
    label: "Execute Agents",
    description: "Start and stop agent runs",
  },
  {
    value: "read:templates",
    label: "Read Templates",
    description: "View agent templates",
  },
];

export type OrgApiKeyStatus = "active" | "revoked" | "expired";

// Request types
export interface OrgApiKeyCreateRequest {
  name: string;
  scopes: OrgApiKeyScope[];
  description?: string;
  expires_in_days?: number;
}

export interface OrgApiKeyUpdateRequest {
  name?: string;
  description?: string;
}

// Response types
export interface OrgApiKeyResponse {
  key_id: string;
  org_id: string;
  name: string;
  public_key_prefix: string;
  scopes: OrgApiKeyScope[];
  description: string | null;
  status: OrgApiKeyStatus;
  expires_at: string | null;
  last_used_at: string | null;
  created_by: string;
  created_at: string;
}

export interface OrgApiKeyCreateResponse {
  key_id: string;
  org_id: string;
  name: string;
  public_key: string;
  secret_key: string;
  scopes: OrgApiKeyScope[];
  description: string | null;
  status: OrgApiKeyStatus;
  expires_at: string | null;
  created_by: string;
  created_at: string;
}

export interface OrgApiKeyListResponse {
  api_keys: OrgApiKeyResponse[];
  total: number;
}

// API functions

/**
 * Create a new organization API key.
 * The secret key is only returned once upon creation.
 */
export async function createOrgApiKey(
  orgId: string,
  request: OrgApiKeyCreateRequest
): Promise<OrgApiKeyCreateResponse> {
  const response = await backendApi.post<OrgApiKeyCreateResponse>(
    `/organizations/${orgId}/api-keys`,
    request
  );
  return response.data;
}

/**
 * List all API keys for an organization.
 */
export async function listOrgApiKeys(
  orgId: string
): Promise<OrgApiKeyListResponse> {
  const response = await backendApi.get<OrgApiKeyListResponse>(
    `/organizations/${orgId}/api-keys`
  );
  return response.data;
}

/**
 * Get details of a specific API key.
 */
export async function getOrgApiKey(
  orgId: string,
  keyId: string
): Promise<OrgApiKeyResponse> {
  const response = await backendApi.get<OrgApiKeyResponse>(
    `/organizations/${orgId}/api-keys/${keyId}`
  );
  return response.data;
}

/**
 * Update an API key's name or description.
 */
export async function updateOrgApiKey(
  orgId: string,
  keyId: string,
  request: OrgApiKeyUpdateRequest
): Promise<OrgApiKeyResponse> {
  const response = await backendApi.patch<OrgApiKeyResponse>(
    `/organizations/${orgId}/api-keys/${keyId}`,
    request
  );
  return response.data;
}

/**
 * Revoke an API key. The key is deactivated but preserved for audit.
 */
export async function revokeOrgApiKey(
  orgId: string,
  keyId: string
): Promise<{ message: string }> {
  const response = await backendApi.post<{ message: string }>(
    `/organizations/${orgId}/api-keys/${keyId}/revoke`
  );
  return response.data;
}

/**
 * Permanently delete an API key.
 */
export async function deleteOrgApiKey(
  orgId: string,
  keyId: string
): Promise<{ message: string }> {
  const response = await backendApi.delete<{ message: string }>(
    `/organizations/${orgId}/api-keys/${keyId}`
  );
  return response.data;
}

/**
 * Format the full API key for use in requests.
 * Format: {public_key}:{secret_key}
 */
export function formatApiKeyForHeader(
  publicKey: string,
  secretKey: string
): string {
  return `${publicKey}:${secretKey}`;
}

/**
 * Get example curl command for using an API key.
 */
export function getExampleCurlCommand(
  publicKey: string,
  secretKey: string
): string {
  const apiKey = formatApiKeyForHeader(publicKey, secretKey);
  return `curl -H "X-API-Key: ${apiKey}" https://api.example.com/v1/agents`;
}
