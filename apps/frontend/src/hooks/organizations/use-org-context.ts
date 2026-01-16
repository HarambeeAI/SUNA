import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import {
  getAuthContext,
  switchOrganization,
  createOrganization,
  AuthContextResponse,
  OrganizationSummary,
  CreateOrganizationRequest,
  Organization
} from '@/lib/api/organizations';

export const ORG_CONTEXT_QUERY_KEY = ['org-context'];

/**
 * Hook to get the current organization context
 */
export const useOrgContext = (options?: Partial<UseQueryOptions<AuthContextResponse | null>>) => {
  return useQuery<AuthContextResponse | null>({
    queryKey: ORG_CONTEXT_QUERY_KEY,
    queryFn: getAuthContext,
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...options,
  });
};

/**
 * Hook to switch organization context
 */
export const useSwitchOrg = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orgId: string | null) => switchOrganization(orgId),
    onSuccess: () => {
      // Invalidate org context to refetch
      queryClient.invalidateQueries({ queryKey: ORG_CONTEXT_QUERY_KEY });
      // Also invalidate threads since they depend on org context
      queryClient.invalidateQueries({ queryKey: ['user-threads'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
};

/**
 * Hook to create a new organization
 */
export const useCreateOrg = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOrganizationRequest) => createOrganization(data),
    onSuccess: () => {
      // Invalidate org context to refetch the updated list
      queryClient.invalidateQueries({ queryKey: ORG_CONTEXT_QUERY_KEY });
    },
  });
};

/**
 * Get the currently active organization from context
 */
export const useActiveOrg = (options?: Partial<UseQueryOptions<AuthContextResponse | null>>) => {
  const { data, ...rest } = useOrgContext(options);

  return {
    activeOrg: data?.active_org ?? null,
    activeOrgId: data?.active_org_id ?? null,
    availableOrgs: data?.available_organizations ?? [],
    ...rest,
  };
};
