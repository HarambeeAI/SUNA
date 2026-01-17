'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Sparkles, Download, X, ChevronRight, Users } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';

import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentAvatar } from '@/components/thread/content/agent-avatar';

import {
  getTemplates,
  getTemplateCategories,
  createAgentFromTemplate,
  AgentTemplate,
  TemplateCategory,
  AgentTemplatesResponse,
} from '@/lib/api/templates';

// ============================================================================
// Types
// ============================================================================

interface UsageExample {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================================
// Helper Components
// ============================================================================

const CategoryIcon: React.FC<{ icon?: string; className?: string }> = ({ icon, className }) => {
  const iconMap: Record<string, string> = {
    'headphones': 'headphones',
    'briefcase': 'briefcase',
    'search': 'search',
    'pen-tool': 'pen-tool',
    'bar-chart': 'bar-chart-2',
    'calendar': 'calendar',
  };

  const iconName = icon ? iconMap[icon] || icon : 'folder';

  return (
    <DynamicIcon
      name={iconName as any}
      className={cn('h-4 w-4', className)}
    />
  );
};

const TemplateCard: React.FC<{
  template: AgentTemplate;
  onSelect: () => void;
  onUseTemplate: () => void;
}> = ({ template, onSelect, onUseTemplate }) => {
  const categoryName = template.category?.name || 'Uncategorized';

  return (
    <Card
      className="group relative bg-card rounded-2xl overflow-hidden transition-all duration-300 border cursor-pointer flex flex-col border-border/50 hover:border-primary/20 hover:shadow-md"
      onClick={onSelect}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="relative p-5 flex flex-col flex-1">
        {/* Header with icon and category badge */}
        <div className="flex items-start justify-between mb-3">
          <AgentAvatar
            iconName={template.config?.metadata?.avatar || 'bot'}
            iconColor={template.config?.metadata?.avatar_color || '#6366F1'}
            backgroundColor={template.config?.metadata?.avatar_color ? `${template.config.metadata.avatar_color}20` : '#EEF2FF'}
            agentName={template.name}
            size={44}
          />
          <Badge variant="secondary" className="text-xs">
            {categoryName}
          </Badge>
        </div>

        {/* Name and description */}
        <h3 className="text-base font-semibold text-foreground mb-1.5 line-clamp-1">
          {template.name}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
          {template.description || 'No description available'}
        </p>

        {/* Tags */}
        {template.tags && template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {template.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs border-border/50">
                {tag}
              </Badge>
            ))}
            {template.tags.length > 3 && (
              <Badge variant="outline" className="text-xs border-border/50">
                +{template.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Footer with download count and action */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Download className="h-3 w-3" />
            <span>{template.download_count || 0} uses</span>
          </div>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onUseTemplate();
            }}
            className="h-8"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Use Template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const TemplateDetailModal: React.FC<{
  template: AgentTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onUseTemplate: () => void;
}> = ({ template, isOpen, onClose, onUseTemplate }) => {
  if (!template) return null;

  const usageExamples = (template.usage_examples || []) as UsageExample[];
  const categoryName = template.category?.name || 'Uncategorized';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-start gap-4">
            <AgentAvatar
              iconName={template.config?.metadata?.avatar || 'bot'}
              iconColor={template.config?.metadata?.avatar_color || '#6366F1'}
              backgroundColor={template.config?.metadata?.avatar_color ? `${template.config.metadata.avatar_color}20` : '#EEF2FF'}
              agentName={template.name}
              size={56}
            />
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl mb-1">{template.name}</DialogTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{categoryName}</Badge>
                <span className="flex items-center gap-1">
                  <Download className="h-3 w-3" />
                  {template.download_count || 0} uses
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-200px)] px-6">
          <div className="space-y-5 pb-4">
            {/* Description */}
            <div>
              <h4 className="text-sm font-medium mb-2">Description</h4>
              <p className="text-sm text-muted-foreground">
                {template.description || 'No description available'}
              </p>
            </div>

            {/* Tags */}
            {template.tags && template.tags.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Usage Examples */}
            {usageExamples.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Example Prompts</h4>
                <div className="space-y-3">
                  {usageExamples.slice(0, 3).map((example, index) => (
                    <div
                      key={index}
                      className={cn(
                        'p-3 rounded-lg text-sm',
                        example.role === 'user'
                          ? 'bg-primary/5 border border-primary/10'
                          : 'bg-muted'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {example.role === 'user' ? 'You' : 'Agent'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">{example.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Configuration Info */}
            <div>
              <h4 className="text-sm font-medium mb-2">Configuration</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Version: {template.template_version || 1}</p>
                {template.version_notes && (
                  <p>Notes: {template.version_notes}</p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onUseTemplate}>
            <Sparkles className="h-4 w-4 mr-2" />
            Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const UseTemplateDialog: React.FC<{
  template: AgentTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  isCreating: boolean;
}> = ({ template, isOpen, onClose, onConfirm, isCreating }) => {
  const [agentName, setAgentName] = useState('');

  useEffect(() => {
    if (template && isOpen) {
      setAgentName(template.name);
    }
  }, [template, isOpen]);

  if (!template) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Agent from Template</DialogTitle>
          <DialogDescription>
            You're about to create a new agent based on "{template.name}".
            Give it a name to get started.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="agent-name">Agent Name</Label>
            <Input
              id="agent-name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Enter agent name"
              disabled={isCreating}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(agentName)}
            disabled={!agentName.trim() || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Create Agent
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// Loading Skeleton
// ============================================================================

const TemplateCardSkeleton: React.FC = () => (
  <Card className="bg-card rounded-2xl overflow-hidden">
    <CardContent className="p-5 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-2/3 rounded" />
      <div className="flex gap-1 pt-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <Skeleton className="h-4 w-16 rounded" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
    </CardContent>
  </Card>
);

// ============================================================================
// Main Page Component
// ============================================================================

export default function TemplateMarketplacePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Queries
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['template-categories'],
    queryFn: getTemplateCategories,
  });

  const { data: templatesData, isLoading: templatesLoading, error: templatesError } = useQuery({
    queryKey: ['templates', selectedCategory, debouncedSearch],
    queryFn: () =>
      getTemplates({
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        search: debouncedSearch || undefined,
        limit: 50,
      }),
  });

  // Mutations
  const createAgentMutation = useMutation({
    mutationFn: ({ templateId, name }: { templateId: string; name: string }) =>
      createAgentFromTemplate(templateId, { name }),
    onSuccess: (data) => {
      toast.success('Agent created!', {
        description: 'Redirecting to your new agent...',
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      // Navigate to agent thread/configuration
      router.push(`/agents/config/${data.agent_id}`);
    },
    onError: (error: any) => {
      const message = error.message || 'Failed to create agent';
      if (error.status === 402) {
        toast.error('Agent limit reached', {
          description: 'Upgrade your plan to create more agents.',
        });
      } else {
        toast.error('Failed to create agent', {
          description: message,
        });
      }
    },
  });

  // Handlers
  const handleSelectTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setShowDetailModal(true);
  };

  const handleUseTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setShowDetailModal(false);
    setShowCreateDialog(true);
  };

  const handleCreateAgent = (name: string) => {
    if (!selectedTemplate) return;
    createAgentMutation.mutate({
      templateId: selectedTemplate.template_id,
      name,
    });
  };

  const handleCreateSuccess = () => {
    setShowCreateDialog(false);
    setSelectedTemplate(null);
  };

  // Close create dialog on success
  useEffect(() => {
    if (createAgentMutation.isSuccess) {
      handleCreateSuccess();
    }
  }, [createAgentMutation.isSuccess]);

  // Data
  const categories = categoriesData || [];
  const templates = templatesData?.templates || [];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Agent Templates</h1>
          <p className="text-muted-foreground">
            Browse and deploy pre-configured agents for common workflows
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-50">
        <div className="absolute inset-0 backdrop-blur-md" style={{
          maskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)'
        }}></div>
        <div className="relative bg-gradient-to-b from-background/95 via-background/70 to-transparent">
          <div className="container mx-auto max-w-7xl px-4 py-4">
            <div className="flex flex-col gap-4">
              {/* Category Tabs */}
              <Tabs
                value={selectedCategory}
                onValueChange={setSelectedCategory}
                className="w-full"
              >
                <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
                  <TabsTrigger
                    value="all"
                    className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    All Templates
                  </TabsTrigger>
                  {categories.map((category) => (
                    <TabsTrigger
                      key={category.slug}
                      value={category.slug}
                      className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      <CategoryIcon icon={category.icon} className="mr-1.5" />
                      {category.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Search Bar */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 h-10 rounded-full"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto max-w-7xl px-4 py-6">
        {templatesLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <TemplateCardSkeleton key={i} />
            ))}
          </div>
        ) : templatesError ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Failed to load templates. Please try again later.
            </p>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {debouncedSearch
                ? `No templates found matching "${debouncedSearch}". Try adjusting your search.`
                : selectedCategory !== 'all'
                ? 'No templates available in this category yet.'
                : 'No templates available yet.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.template_id}
                template={template}
                onSelect={() => handleSelectTemplate(template)}
                onUseTemplate={() => handleUseTemplate(template)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <TemplateDetailModal
        template={selectedTemplate}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedTemplate(null);
        }}
        onUseTemplate={() => {
          if (selectedTemplate) {
            handleUseTemplate(selectedTemplate);
          }
        }}
      />

      <UseTemplateDialog
        template={selectedTemplate}
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setSelectedTemplate(null);
        }}
        onConfirm={handleCreateAgent}
        isCreating={createAgentMutation.isPending}
      />
    </div>
  );
}
