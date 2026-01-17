'use client';

import React, { useState, useMemo } from 'react';
import { Globe, Wrench, MessageSquare, ChevronLeft, Search, FileText, Eye, Plus, Sparkles, Download, ExternalLink } from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateNewAgent, useCreateAgent } from '@/hooks/agents/use-agents';
import { useKortixTeamTemplates } from '@/hooks/secure-mcp/use-secure-mcp';
import { AgentCountLimitError } from '@/lib/api/errors';
import { toast } from '@/lib/toast';
import type { BaseAgentData } from '@/components/ui/unified-agent-card';
import type { MarketplaceTemplate } from './installation/types';
import { MarketplaceAgentPreviewDialog } from './marketplace-agent-preview-dialog';
import { useRouter } from 'next/navigation';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AgentAvatar } from '@/components/thread/content/agent-avatar';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { getTemplates, getTemplateCategories } from '@/lib/api/templates';
import type { AgentTemplate, TemplateCategory } from '@/lib/api/templates';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AgentCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (agentId: string) => void;
}

// Helper to convert API template to MarketplaceTemplate format
function convertToMarketplaceTemplate(template: AgentTemplate): MarketplaceTemplate {
  return {
    id: template.template_id,
    template_id: template.template_id,
    creator_id: template.creator_id,
    name: template.name,
    description: template.description || '',
    system_prompt: template.config?.system_prompt,
    tags: template.tags || [],
    download_count: template.download_count || 0,
    is_kortix_team: template.is_kortix_team || false,
    creator_name: '',
    created_at: template.created_at,
    icon_name: template.config?.metadata?.avatar,
    icon_color: template.config?.metadata?.avatar_color,
    icon_background: template.config?.metadata?.template_metadata?.background_color as string | undefined,
    mcp_requirements: [],
    agentpress_tools: template.config?.tools?.agentpress || {},
    model: undefined,
    marketplace_published_at: template.marketplace_published_at,
    usage_examples: template.usage_examples as MarketplaceTemplate['usage_examples'],
    config: template.config as MarketplaceTemplate['config'],
  };
}

export function AgentCreationModal({ open, onOpenChange, onSuccess }: AgentCreationModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'blank' | 'template'>('blank');
  const [selectedTemplate, setSelectedTemplate] = useState<MarketplaceTemplate | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showChatStep, setShowChatStep] = useState(false);
  const [chatDescription, setChatDescription] = useState('');

  // Template selection state
  const [selectedTemplateForCreation, setSelectedTemplateForCreation] = useState<AgentTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [agentName, setAgentName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const createNewAgentMutation = useCreateNewAgent();
  const createAgentMutation = useCreateAgent();

  // Fetch templates when modal is open and on template tab
  const { data: templatesResponse, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates', 'public', searchQuery, selectedCategory],
    queryFn: () => getTemplates({
      search: searchQuery || undefined,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      limit: 50
    }),
    enabled: open && activeTab === 'template',
    staleTime: 5 * 60 * 1000,
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['template-categories'],
    queryFn: getTemplateCategories,
    enabled: open && activeTab === 'template',
    staleTime: 10 * 60 * 1000,
  });

  // Filter templates based on search
  const filteredTemplates = useMemo(() => {
    const templates = templatesResponse?.templates || [];
    if (!searchQuery) return templates;
    const query = searchQuery.toLowerCase();
    return templates.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.tags?.some(tag => tag.toLowerCase().includes(query))
    );
  }, [templatesResponse?.templates, searchQuery]);

  const handleCreateBlankAgent = () => {
    createNewAgentMutation.mutate(undefined, {
      onSuccess: (newAgent) => {
        onOpenChange(false);
        router.push(`/agents/config/${newAgent.agent_id}`);
      },
      onError: (error) => {
        if (error instanceof AgentCountLimitError) {
          onOpenChange(false);
        } else {
          toast.error(error instanceof Error ? error.message : 'Failed to create Worker');
        }
      }
    });
  };

  const handleSelectTemplate = (template: AgentTemplate) => {
    setSelectedTemplateForCreation(template);
    setAgentName(template.name);
  };

  const handleViewFullTemplate = () => {
    if (!selectedTemplateForCreation) return;
    const marketplaceTemplate = convertToMarketplaceTemplate(selectedTemplateForCreation);
    setSelectedTemplate(marketplaceTemplate);
    setIsPreviewOpen(true);
  };

  const handleCreateFromTemplate = async () => {
    if (!selectedTemplateForCreation) return;

    setIsCreating(true);
    try {
      const { createAgentFromTemplate } = await import('@/lib/api/templates');
      const result = await createAgentFromTemplate(
        selectedTemplateForCreation.template_id,
        { name: agentName || selectedTemplateForCreation.name }
      );

      toast.success(`Created "${result.name}"!`);
      onOpenChange(false);
      router.push(`/agents/config/${result.agent_id}`);
    } catch (error: any) {
      if (error?.detail?.error_code === 'AGENT_LIMIT_EXCEEDED' || error instanceof AgentCountLimitError) {
        onOpenChange(false);
      } else {
        toast.error('Failed to create Worker from template');
        console.error('Error creating agent from template:', error);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleChatContinue = async () => {
    if (!chatDescription.trim()) {
      toast.error('Please describe what your Worker should be able to do');
      return;
    }

    try {
      const { setupAgentFromChat } = await import('@/lib/api/agents');

      toast.loading('Creating your worker with AI...', { id: 'agent-setup' });

      const result = await setupAgentFromChat({
        description: chatDescription
      });

      toast.success(`Created "${result.name}"!`, { id: 'agent-setup' });
      onOpenChange(false);
      router.push(`/agents/config/${result.agent_id}`);

    } catch (error: any) {
      toast.error('Failed to create Worker', { id: 'agent-setup' });
      if (error?.detail?.error_code === 'AGENT_LIMIT_EXCEEDED') {
        onOpenChange(false);
      } else {
        console.error('Error creating agent from chat:', error);
      }
    }
  };

  const handleBack = () => {
    setShowChatStep(false);
    setChatDescription('');
    setSelectedTemplateForCreation(null);
    setAgentName('');
  };

  const handleModalClose = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset state when closing
      setShowChatStep(false);
      setChatDescription('');
      setActiveTab('blank');
      setSelectedTemplateForCreation(null);
      setSearchQuery('');
      setSelectedCategory('all');
      setAgentName('');
    }
    onOpenChange(isOpen);
  };

  const handlePreviewInstall = () => {
    // When installing from preview, select that template for creation
    if (selectedTemplate) {
      const template: AgentTemplate = {
        template_id: selectedTemplate.template_id,
        creator_id: selectedTemplate.creator_id,
        name: selectedTemplate.name,
        description: selectedTemplate.description,
        config: {
          system_prompt: selectedTemplate.system_prompt || '',
          tools: {
            agentpress: selectedTemplate.agentpress_tools || {},
            mcp: [],
            custom_mcp: [],
          },
          metadata: {
            avatar: selectedTemplate.icon_name,
            avatar_color: selectedTemplate.icon_color,
          },
        },
        tags: selectedTemplate.tags,
        category_id: undefined,
        is_public: true,
        is_kortix_team: selectedTemplate.is_kortix_team || false,
        download_count: selectedTemplate.download_count,
        template_version: 1,
        created_at: selectedTemplate.created_at,
        updated_at: selectedTemplate.created_at,
      };
      setSelectedTemplateForCreation(template);
      setAgentName(template.name);
      setActiveTab('template');
    }
    setIsPreviewOpen(false);
    setSelectedTemplate(null);
  };

  // Render template card
  const TemplateCard = ({ template }: { template: AgentTemplate }) => {
    const isSelected = selectedTemplateForCreation?.template_id === template.template_id;
    const iconName = template.config?.metadata?.avatar;
    const iconColor = template.config?.metadata?.avatar_color;
    const iconBackground = template.config?.metadata?.template_metadata?.background_color as string | undefined;

    return (
      <button
        onClick={() => handleSelectTemplate(template)}
        className={cn(
          "w-full p-3 rounded-lg border text-left transition-all",
          "hover:border-primary/50 hover:bg-muted/30",
          isSelected
            ? "border-primary bg-primary/5 ring-1 ring-primary"
            : "border-border bg-card"
        )}
      >
        <div className="flex items-start gap-3">
          <AgentAvatar
            iconName={iconName}
            iconColor={iconColor}
            backgroundColor={iconBackground}
            agentName={template.name}
            size={40}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{template.name}</span>
              {template.is_kortix_team && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Official</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {template.description || 'No description'}
            </p>
            {template.tags && template.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {template.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden max-h-[90vh] sm:max-h-[85vh]" hideCloseButton>
          {!showChatStep ? (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex flex-col items-center text-center p-5 sm:p-6 pb-0">
                <div className="mb-3 p-2.5 rounded-xl bg-muted/50">
                  <KortixLogo size={32} variant="symbol" />
                </div>
                <DialogTitle className="text-xl font-semibold text-foreground">
                  Create a new Worker
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Start fresh or use a pre-built template
                </p>
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'blank' | 'template')} className="flex-1 flex flex-col min-h-0">
                <div className="px-5 sm:px-6 pt-4">
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="blank" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Blank Agent
                    </TabsTrigger>
                    <TabsTrigger value="template" className="gap-2">
                      <Globe className="h-4 w-4" />
                      From Template
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Blank Agent Tab */}
                <TabsContent value="blank" className="flex-1 p-5 sm:p-6 mt-0">
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-muted/20 p-6 text-center">
                      <Sparkles className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                      <h3 className="text-base font-medium mb-2">Start from Scratch</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Create a blank worker and configure everything yourself. Perfect for custom workflows.
                      </p>
                      <Button
                        onClick={handleCreateBlankAgent}
                        disabled={createNewAgentMutation.isPending}
                        className="w-full sm:w-auto"
                      >
                        {createNewAgentMutation.isPending ? (
                          <>
                            <KortixLoader customSize={16} className="mr-2" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Wrench className="h-4 w-4 mr-2" />
                            Create Blank Worker
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">or</span>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-muted/20 p-6 text-center">
                      <MessageSquare className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                      <h3 className="text-base font-medium mb-2">Configure with AI</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Describe what you want and let AI set up your worker automatically.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setShowChatStep(true)}
                        className="w-full sm:w-auto"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Describe Your Worker
                      </Button>
                    </div>
                  </div>

                  {/* Cancel button */}
                  <div className="mt-6">
                    <Button
                      variant="ghost"
                      onClick={() => handleModalClose(false)}
                      className="w-full h-9 text-sm text-muted-foreground"
                    >
                      Cancel
                    </Button>
                  </div>
                </TabsContent>

                {/* From Template Tab */}
                <TabsContent value="template" className="flex-1 flex flex-col min-h-0 mt-0">
                  {!selectedTemplateForCreation ? (
                    // Template Browser
                    <div className="flex-1 flex flex-col min-h-0 p-5 sm:p-6 pt-4">
                      {/* Search */}
                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search templates..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9"
                        />
                      </div>

                      {/* Category Filter */}
                      {categories && categories.length > 0 && (
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                          <Badge
                            variant={selectedCategory === 'all' ? 'default' : 'outline'}
                            className="cursor-pointer whitespace-nowrap"
                            onClick={() => setSelectedCategory('all')}
                          >
                            All
                          </Badge>
                          {categories.map((cat) => (
                            <Badge
                              key={cat.id}
                              variant={selectedCategory === cat.slug ? 'default' : 'outline'}
                              className="cursor-pointer whitespace-nowrap"
                              onClick={() => setSelectedCategory(cat.slug)}
                            >
                              {cat.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Templates Grid */}
                      <ScrollArea className="flex-1 -mx-1 px-1">
                        {templatesLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <KortixLoader customSize={24} />
                          </div>
                        ) : filteredTemplates.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Search className="h-8 w-8 text-muted-foreground/50 mb-3" />
                            <p className="text-sm text-muted-foreground">
                              {searchQuery ? 'No templates found matching your search' : 'No templates available'}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {filteredTemplates.map((template) => (
                              <TemplateCard key={template.template_id} template={template} />
                            ))}
                          </div>
                        )}
                      </ScrollArea>

                      {/* Browse All Link */}
                      <div className="mt-3 pt-3 border-t">
                        <Button
                          variant="ghost"
                          className="w-full text-sm text-muted-foreground"
                          onClick={() => {
                            handleModalClose(false);
                            router.push('/templates');
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Browse Full Template Marketplace
                        </Button>
                      </div>

                      {/* Cancel button */}
                      <div className="mt-2">
                        <Button
                          variant="ghost"
                          onClick={() => handleModalClose(false)}
                          className="w-full h-9 text-sm text-muted-foreground"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Template Selected - Configure Agent
                    <div className="flex-1 flex flex-col min-h-0 p-5 sm:p-6 pt-4">
                      {/* Selected Template Preview */}
                      <div className="rounded-xl border bg-muted/20 p-4 mb-4">
                        <div className="flex items-start gap-3">
                          <AgentAvatar
                            iconName={selectedTemplateForCreation.config?.metadata?.avatar}
                            iconColor={selectedTemplateForCreation.config?.metadata?.avatar_color}
                            backgroundColor={selectedTemplateForCreation.config?.metadata?.template_metadata?.background_color as string | undefined}
                            agentName={selectedTemplateForCreation.name}
                            size={48}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-medium">{selectedTemplateForCreation.name}</span>
                              {selectedTemplateForCreation.is_kortix_team && (
                                <Badge variant="secondary" className="text-xs">Official</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                              {selectedTemplateForCreation.description || 'No description'}
                            </p>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 mt-1 text-xs"
                              onClick={handleViewFullTemplate}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View Full Template
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Agent Name Input */}
                      <div className="space-y-2 mb-4">
                        <Label htmlFor="agent-name">Worker Name</Label>
                        <Input
                          id="agent-name"
                          value={agentName}
                          onChange={(e) => setAgentName(e.target.value)}
                          placeholder={selectedTemplateForCreation.name}
                        />
                        <p className="text-xs text-muted-foreground">
                          You can customize the name or keep the template default
                        </p>
                      </div>

                      {/* Template Config Preview */}
                      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto">
                        {/* System Prompt Preview */}
                        {selectedTemplateForCreation.config?.system_prompt && (
                          <div className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">System Prompt</span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-3">
                              {selectedTemplateForCreation.config.system_prompt}
                            </p>
                          </div>
                        )}

                        {/* Tools Preview */}
                        {selectedTemplateForCreation.config?.tools?.agentpress &&
                         Object.keys(selectedTemplateForCreation.config.tools.agentpress).filter(
                           k => selectedTemplateForCreation.config?.tools?.agentpress?.[k]
                         ).length > 0 && (
                          <div className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Wrench className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">Enabled Tools</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(selectedTemplateForCreation.config.tools.agentpress)
                                .filter(([_, enabled]) => enabled)
                                .slice(0, 6)
                                .map(([toolName]) => (
                                  <Badge key={toolName} variant="outline" className="text-[10px]">
                                    {toolName.replace(/_/g, ' ')}
                                  </Badge>
                                ))}
                              {Object.entries(selectedTemplateForCreation.config.tools.agentpress)
                                .filter(([_, enabled]) => enabled).length > 6 && (
                                <Badge variant="outline" className="text-[10px]">
                                  +{Object.entries(selectedTemplateForCreation.config.tools.agentpress)
                                    .filter(([_, enabled]) => enabled).length - 6} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-4 space-y-2">
                        <Button
                          onClick={handleCreateFromTemplate}
                          disabled={isCreating}
                          className="w-full"
                        >
                          {isCreating ? (
                            <>
                              <KortixLoader customSize={16} className="mr-2" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Create Worker
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={handleBack}
                          disabled={isCreating}
                          className="w-full text-muted-foreground"
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Back to Templates
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            // Chat Configuration Step
            <div className="p-5 sm:p-8 overflow-y-auto max-h-[85vh] sm:max-h-none">
              {/* Logo & Header */}
              <div className="flex flex-col items-center text-center mb-5 sm:mb-6">
                <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-muted/50">
                  <KortixLogo size={28} variant="symbol" className="sm:hidden" />
                  <KortixLogo size={36} variant="symbol" className="hidden sm:block" />
                </div>
                <DialogTitle className="text-xl sm:text-2xl font-semibold text-foreground">
                  Describe your Worker
                </DialogTitle>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 max-w-sm">
                  Tell us what your worker should be able to do
                </p>
              </div>

              {/* Textarea */}
              <div className="mb-4 sm:mb-6">
                <Textarea
                  value={chatDescription}
                  onChange={(e) => setChatDescription(e.target.value)}
                  placeholder="e.g., A worker that monitors competitor prices and sends me daily reports..."
                  className="min-h-[120px] sm:min-h-[160px] resize-none text-sm sm:text-base"
                  autoFocus
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:gap-3">
                <Button
                  onClick={handleChatContinue}
                  disabled={!chatDescription.trim() || createNewAgentMutation.isPending}
                  className="w-full h-9 sm:h-10 text-sm"
                >
                  {createNewAgentMutation.isPending ? 'Creating...' : 'Create Worker'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={createNewAgentMutation.isPending}
                  className="w-full h-9 sm:h-10 text-sm text-muted-foreground"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MarketplaceAgentPreviewDialog
        agent={selectedTemplate}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setSelectedTemplate(null);
        }}
        onInstall={handlePreviewInstall}
        isInstalling={false}
      />
    </>
  );
}
