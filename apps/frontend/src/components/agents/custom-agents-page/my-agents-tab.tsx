'use client';

import React, { useState, useMemo } from 'react';
import { Globe, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchBar } from './search-bar';
import { EmptyState } from '../empty-state';
import { AgentsGrid } from '../agents-grid';
import { LoadingState } from '../loading-state';
import { Pagination } from '../pagination';
import { UnifiedAgentCard } from '@/components/ui/unified-agent-card';
import { useActiveOrg } from '@/hooks/organizations';
import { useAuth } from '@/components/AuthProvider';

type AgentFilter = 'all' | 'templates' | 'my-agents' | 'team-agents';

interface MyAgentsTabProps {
  agentsSearchQuery: string;
  setAgentsSearchQuery: (value: string) => void;
  agentsLoading: boolean;
  agents: any[];
  agentsPagination: any;
  viewMode: 'grid' | 'list';
  onCreateAgent: () => void;
  onEditAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onToggleDefault: (agentId: string, currentDefault: boolean) => void;
  onClearFilters: () => void;
  deleteAgentMutation?: any;
  isDeletingAgent?: (agentId: string) => boolean;
  setAgentsPage: (page: number) => void;
  agentsPageSize: number;
  onAgentsPageSizeChange: (pageSize: number) => void;

  myTemplates: any[];
  templatesLoading: boolean;
  templatesError: any;
  templatesActioningId: string | null;
  templatesPagination?: {
    current_page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
  templatesPage: number;
  setTemplatesPage: (page: number) => void;
  templatesPageSize: number;
  onTemplatesPageSizeChange: (pageSize: number) => void;
  templatesSearchQuery: string;
  setTemplatesSearchQuery: (value: string) => void;
  onPublish: (template: any) => void;
  onUnpublish: (templateId: string, templateName: string) => void;
  getTemplateStyling: (template: any) => { color: string };

  onPublishAgent?: (agent: any) => void;
  publishingAgentId?: string | null;
}

// Filter options - will be dynamically determined based on org context
const getFilterOptions = (hasActiveOrg: boolean) => {
  if (hasActiveOrg) {
    return [
      { value: 'all', label: 'All Workers' },
      { value: 'my-agents', label: 'My Workers' },
      { value: 'team-agents', label: 'Team Workers' },
      { value: 'templates', label: 'Templates' },
    ];
  }
  return [
    { value: 'all', label: 'All Workers' },
    { value: 'templates', label: 'Templates' },
  ];
};

export const MyAgentsTab = ({
  agentsSearchQuery,
  setAgentsSearchQuery,
  agentsLoading,
  agents,
  agentsPagination,
  viewMode,
  onCreateAgent,
  onEditAgent,
  onDeleteAgent,
  onToggleDefault,
  onClearFilters,
  deleteAgentMutation,
  isDeletingAgent,
  setAgentsPage,
  agentsPageSize,
  onAgentsPageSizeChange,
  myTemplates,
  templatesLoading,
  templatesError,
  templatesActioningId,
  templatesPagination,
  templatesPage,
  setTemplatesPage,
  templatesPageSize,
  onTemplatesPageSizeChange,
  templatesSearchQuery,
  setTemplatesSearchQuery,
  onPublish,
  onUnpublish,
  getTemplateStyling,
  onPublishAgent,
  publishingAgentId
}: MyAgentsTabProps) => {
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');
  const { activeOrgId } = useActiveOrg();
  const { user } = useAuth();
  const hasActiveOrg = !!activeOrgId;

  // Get the appropriate filter options based on org context
  const filterOptions = useMemo(() => getFilterOptions(hasActiveOrg), [hasActiveOrg]);

  const templateAgentsCount = useMemo(() => {
    return myTemplates?.length || 0;
  }, [myTemplates]);

  // Split agents into "My Agents" and "Team Agents" when in org context
  const { myAgents, teamAgents } = useMemo(() => {
    if (!hasActiveOrg || !user?.id) {
      return { myAgents: agents, teamAgents: [] };
    }

    const my: typeof agents = [];
    const team: typeof agents = [];

    for (const agent of agents) {
      if (agent.account_id === user.id) {
        my.push(agent);
      } else {
        team.push(agent);
      }
    }

    return { myAgents: my, teamAgents: team };
  }, [agents, hasActiveOrg, user?.id]);

  // Determine which agents to show based on filter
  const displayAgents = useMemo(() => {
    if (!hasActiveOrg) {
      return agents;
    }

    switch (agentFilter) {
      case 'my-agents':
        return myAgents;
      case 'team-agents':
        return teamAgents;
      default:
        return agents; // 'all' shows all agents
    }
  }, [agents, myAgents, teamAgents, agentFilter, hasActiveOrg]);

  const handleClearFilters = () => {
    setAgentFilter('all');
    onClearFilters();
  };

  // Determine if user can delete a given agent (for UI feedback)
  const canDeleteAgent = (agent: any) => {
    if (!hasActiveOrg) {
      // Personal workspace - user can delete their own agents
      return agent.account_id === user?.id;
    }
    // In org context - handled by backend, but we can show indicator
    // Admins/owners can delete any, members can only delete their own
    return true; // Let backend handle actual permission check
  };

  const renderTemplates = () => {
    return (
      <>
        {templatesLoading ? (
          <LoadingState viewMode={viewMode} />
        ) : templatesError ? (
          <div className="text-center py-16">
            <p className="text-destructive">Failed to load templates</p>
          </div>
        ) : !myTemplates || myTemplates.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/10 rounded-3xl flex items-center justify-center mb-6">
              <Globe className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-3">No published templates yet</h3>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Publish your workers to the marketplace to share them with the community and track their usage.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {myTemplates.map((template) => {
                const isActioning = templatesActioningId === template.template_id;
                return (
                  <UnifiedAgentCard
                    key={template.template_id}
                    variant="template"
                    data={{
                      id: template.template_id,
                      name: template.name,
                      tags: template.tags,
                      created_at: template.created_at,
                      template_id: template.template_id,
                      is_public: template.is_public,
                      download_count: template.download_count,
                      icon_name: template.icon_name,
                      icon_color: template.icon_color,
                      icon_background: template.icon_background,
                    }}
                    state={{
                      isActioning: isActioning,
                    }}
                    actions={{
                      onPrimaryAction: template.is_public 
                        ? () => onUnpublish(template.template_id, template.name)
                        : () => onPublish(template),
                      onSecondaryAction: template.is_public ? () => {} : undefined,
                    }}
                  />
                );
              })}
            </div>
            {templatesPagination && (
              <Pagination
                currentPage={templatesPagination.current_page}
                totalPages={templatesPagination.total_pages}
                totalItems={templatesPagination.total_items}
                pageSize={templatesPageSize}
                onPageChange={setTemplatesPage}
                onPageSizeChange={onTemplatesPageSizeChange}
                isLoading={templatesLoading}
                showPageSizeSelector={true}
                showJumpToPage={true}
                showResultsInfo={true}
              />
            )}
          </>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6 mt-8 flex flex-col min-h-full">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <SearchBar
          placeholder="Search workers..."
          value={agentsSearchQuery}
          onChange={setAgentsSearchQuery}
        />
        <div className="flex items-center gap-3">
          <Select value={agentFilter} onValueChange={(value: AgentFilter) => setAgentFilter(value)}>
            <SelectTrigger className="w-[180px] h-12 rounded-xl">
              <SelectValue placeholder="Filter workers" />
            </SelectTrigger>
            <SelectContent className='rounded-xl'>
              {filterOptions.map((filter) => (
                <SelectItem key={filter.value} className='rounded-xl' value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex-1">
        {agentFilter === 'templates' ? (
          renderTemplates()
        ) : (
          <>
            {agentsLoading ? (
              <LoadingState viewMode={viewMode} />
            ) : displayAgents.length === 0 ? (
              <EmptyState
                hasAgents={(agentsPagination?.total_items || 0) > 0}
                onCreateAgent={onCreateAgent}
                onClearFilters={handleClearFilters}
              />
            ) : (
              <>
                {/* Show section headers when in org context with 'all' filter */}
                {hasActiveOrg && agentFilter === 'all' && myAgents.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      My Workers
                      <span className="text-sm text-muted-foreground font-normal">({myAgents.length})</span>
                    </h3>
                    <AgentsGrid
                      agents={myAgents}
                      onEditAgent={onEditAgent}
                      onDeleteAgent={onDeleteAgent}
                      onToggleDefault={onToggleDefault}
                      deleteAgentMutation={deleteAgentMutation}
                      isDeletingAgent={isDeletingAgent}
                      onPublish={onPublishAgent}
                      publishingId={publishingAgentId}
                    />
                  </div>
                )}

                {hasActiveOrg && agentFilter === 'all' && teamAgents.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Team Workers
                      <span className="text-sm text-muted-foreground font-normal">({teamAgents.length})</span>
                    </h3>
                    <AgentsGrid
                      agents={teamAgents}
                      onEditAgent={onEditAgent}
                      onDeleteAgent={onDeleteAgent}
                      onToggleDefault={onToggleDefault}
                      deleteAgentMutation={deleteAgentMutation}
                      isDeletingAgent={isDeletingAgent}
                      onPublish={onPublishAgent}
                      publishingId={publishingAgentId}
                      showCreatorInfo={true}
                    />
                  </div>
                )}

                {/* Show unified grid when not in org context, or when specific filter is selected */}
                {(!hasActiveOrg || agentFilter !== 'all') && (
                  <AgentsGrid
                    agents={displayAgents}
                    onEditAgent={onEditAgent}
                    onDeleteAgent={onDeleteAgent}
                    onToggleDefault={onToggleDefault}
                    deleteAgentMutation={deleteAgentMutation}
                    isDeletingAgent={isDeletingAgent}
                    onPublish={onPublishAgent}
                    publishingId={publishingAgentId}
                    showCreatorInfo={hasActiveOrg && agentFilter === 'team-agents'}
                  />
                )}
              </>
            )}
            
            {agentsPagination && (
              <Pagination
                currentPage={agentsPagination.current_page}
                totalPages={agentsPagination.total_pages}
                totalItems={agentsPagination.total_items}
                pageSize={agentsPageSize}
                onPageChange={setAgentsPage}
                onPageSizeChange={onAgentsPageSizeChange}
                isLoading={agentsLoading}
                showPageSizeSelector={true}
                showJumpToPage={true}
                showResultsInfo={true}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}; 