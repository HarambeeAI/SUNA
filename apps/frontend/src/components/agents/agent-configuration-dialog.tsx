'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  Wrench,
  Server,
  BookOpen,
  Zap,
  Download,
  Check,
  X,
  Edit3,
  Save,
  Brain,
  ChevronDown,
  Search,
  Info,
  Lock,
  Sparkles,
  Eye,
  Building2,
  Globe,
  Users,
  Share2,
  Copy,
  Loader2,
  Trash2,
  ExternalLink,
  Link2,
  Send,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { KortixLoader } from '@/components/ui/kortix-loader';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAccountState } from '@/hooks/billing';
import { usePricingModalStore } from '@/stores/pricing-modal-store';
import { isLocalMode } from '@/lib/config';

import { useAgentVersionData } from '@/hooks/agents';
import { useUpdateAgent, useAgents } from '@/hooks/agents/use-agents';
import { useActiveOrg } from '@/hooks/organizations';
import type { AgentVisibility } from '@/hooks/agents/utils';
import { useUpdateAgentMCPs } from '@/hooks/agents/use-update-agent-mcps';
import { useExportAgent } from '@/hooks/agents/use-agent-export-import';
import { ExpandableMarkdownEditor } from '@/components/ui/expandable-markdown-editor';
import { AgentModelSelector } from './config/model-selector';
import { GranularToolConfiguration } from './tools/granular-tool-configuration';
import { AgentMCPConfiguration } from './agent-mcp-configuration';
import { AgentKnowledgeBaseManager } from './knowledge-base/agent-kb-tree';
import { AgentTriggersConfiguration } from './triggers/agent-triggers-configuration';
import { AgentAvatar } from '../thread/content/agent-avatar';
import { AgentIconEditorDialog } from './config/agent-icon-editor-dialog';
import { AgentVersionSwitcher } from './agent-version-switcher';
import { Switch } from '@/components/ui/switch';
import {
  listShareLinks,
  createShareLink,
  deleteShareLink,
  revokeShareLink,
  getShareLinkUrl,
  type ShareLink,
} from '@/lib/api/share-links';
import {
  createTemplateSubmission,
  listMySubmissions,
  type TemplateSubmission,
} from '@/lib/api/template-submissions';
import { getTemplateCategories, type TemplateCategory } from '@/lib/api/templates';

interface AgentConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  initialTab?: 'instructions' | 'tools' | 'integrations' | 'knowledge' | 'triggers' | 'settings';
  onAgentChange?: (agentId: string) => void;
}

export function AgentConfigurationDialog({
  open,
  onOpenChange,
  agentId,
  initialTab = 'instructions',
  onAgentChange,
}: AgentConfigurationDialogProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { agent, versionData, isViewingOldVersion, isLoading, error } = useAgentVersionData({ agentId });
  const { data: agentsResponse, refetch: refetchAgents } = useAgents({}, { 
    enabled: !!onAgentChange,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always'
  });
  const agents = Array.isArray(agentsResponse?.agents) ? agentsResponse.agents : [];

  const updateAgentMutation = useUpdateAgent();
  const updateAgentMCPsMutation = useUpdateAgentMCPs();
  const exportMutation = useExportAgent();
  
  const { data: accountState } = useAccountState();
  const { openPricingModal } = usePricingModalStore();
  
  const isFreeTier = accountState && (
    accountState.subscription?.tier_key === 'free' ||
    accountState.tier?.name === 'free'
  ) && !isLocalMode();

  const [activeTab, setActiveTab] = useState(initialTab);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isIconEditorOpen, setIsIconEditorOpen] = useState(false);

  // Share links state
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isLoadingShareLinks, setIsLoadingShareLinks] = useState(false);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);
  const [isDeletingShareLink, setIsDeletingShareLink] = useState<string | null>(null);

  // Template submission state
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<TemplateSubmission | null>(null);
  const [templateCategories, setTemplateCategories] = useState<TemplateCategory[]>([]);
  const [submitForm, setSubmitForm] = useState({
    template_name: '',
    template_description: '',
    category_id: '',
    use_cases: ['', '', ''],
  });
  
  // Debug state changes
  useEffect(() => {
    console.log('Icon editor open state changed:', isIconEditorOpen);
  }, [isIconEditorOpen]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && initialTab) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Load share links when settings tab is active
  useEffect(() => {
    async function loadShareLinks() {
      if (activeTab !== 'settings' || !agentId) return;

      setIsLoadingShareLinks(true);
      try {
        const response = await listShareLinks(agentId);
        setShareLinks(response.share_links || []);
      } catch (error) {
        console.error('Failed to load share links:', error);
        setShareLinks([]);
      } finally {
        setIsLoadingShareLinks(false);
      }
    }

    loadShareLinks();
  }, [activeTab, agentId]);

  // Load template categories and check for pending submissions when settings tab is active
  useEffect(() => {
    async function loadTemplateData() {
      if (activeTab !== 'settings' || !agentId) return;

      try {
        // Load categories
        const categoriesResponse = await getTemplateCategories();
        setTemplateCategories(categoriesResponse || []);

        // Check for existing pending submission for this agent
        const submissionsResponse = await listMySubmissions({ status: 'pending' });
        const existingSubmission = submissionsResponse.submissions.find(
          (s: TemplateSubmission) => s.agent_id === agentId
        );
        setPendingSubmission(existingSubmission || null);
      } catch (error) {
        console.error('Failed to load template data:', error);
      }
    }

    loadTemplateData();
  }, [activeTab, agentId]);

  const [formData, setFormData] = useState({
    name: '',
    system_prompt: '',
    model: undefined as string | undefined,
    agentpress_tools: {} as Record<string, any>,
    configured_mcps: [] as any[],
    custom_mcps: [] as any[],
    is_default: false,
    icon_name: null as string | null,
    icon_color: '#000000',
    icon_background: '#e5e5e5',
    visibility: 'private' as AgentVisibility,
  });

  // Get organization context
  const { activeOrgId } = useActiveOrg();


  const [originalFormData, setOriginalFormData] = useState(formData);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;

    let configSource = agent;
    if (versionData) {
      configSource = {
        ...agent,
        ...versionData,
        icon_name: versionData.icon_name || agent.icon_name,
        icon_color: versionData.icon_color || agent.icon_color,
        icon_background: versionData.icon_background || agent.icon_background,
      };
    }

    const newFormData = {
      name: configSource.name || '',
      system_prompt: configSource.system_prompt || '',
      model: configSource.model || undefined,
      agentpress_tools: configSource.agentpress_tools || {},
      configured_mcps: configSource.configured_mcps || [],
      custom_mcps: configSource.custom_mcps || [],
      is_default: configSource.is_default || false,
      icon_name: configSource.icon_name || null,
      icon_color: configSource.icon_color || '#000000',
      icon_background: configSource.icon_background || '#e5e5e5',
      visibility: (configSource as any).visibility || 'private',
    };

    setFormData(newFormData);
    setOriginalFormData(newFormData);
    setEditName(configSource.name || '');
  }, [agent, versionData]);

  const isSunaAgent = agent?.metadata?.is_suna_default || false;
  const restrictions = agent?.metadata?.restrictions || {};
  const isNameEditable = !isViewingOldVersion && (restrictions.name_editable !== false) && !isSunaAgent;
  const isSystemPromptEditable = !isViewingOldVersion && (restrictions.system_prompt_editable !== false) && !isSunaAgent;
  const areToolsEditable = !isViewingOldVersion && (restrictions.tools_editable !== false) && !isSunaAgent;

  const hasChanges = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(originalFormData);
  }, [formData, originalFormData]);

  const handleSaveAll = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      const updateData: any = {
        agentId,
        name: formData.name,
        system_prompt: formData.system_prompt,
        agentpress_tools: formData.agentpress_tools,
      };

      if (formData.model !== undefined && formData.model !== null) updateData.model = formData.model;
      if (formData.icon_name !== undefined) updateData.icon_name = formData.icon_name;
      if (formData.icon_color !== undefined) updateData.icon_color = formData.icon_color;
      if (formData.icon_background !== undefined) updateData.icon_background = formData.icon_background;
      if (formData.is_default !== undefined) updateData.is_default = formData.is_default;
      if (formData.visibility !== undefined) updateData.visibility = formData.visibility;

      const updatedAgent = await updateAgentMutation.mutateAsync(updateData);

      const mcpsChanged =
        JSON.stringify(formData.configured_mcps) !== JSON.stringify(originalFormData.configured_mcps) ||
        JSON.stringify(formData.custom_mcps) !== JSON.stringify(originalFormData.custom_mcps);

      if (mcpsChanged) {
        await updateAgentMCPsMutation.mutateAsync({
          agentId,
          configured_mcps: formData.configured_mcps,
          custom_mcps: formData.custom_mcps,
          replace_mcps: true
        });
      }

      queryClient.invalidateQueries({ queryKey: ['versions', 'list', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });

      if (updatedAgent.current_version_id) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('version');
        const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
        router.push(newUrl);
      }

      setOriginalFormData(formData);
      toast.success('Worker configuration saved successfully');
    } catch (error) {
      console.error('Failed to save changes:', error);
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNameSave = () => {
    if (!editName.trim()) {
      setEditName(formData.name);
      setIsEditingName(false);
      return;
    }

    if (!isNameEditable) {
      if (isSunaAgent) {
        toast.error("Name cannot be edited", {
          description: "Kortix's name is managed centrally and cannot be changed.",
        });
      }
      setEditName(formData.name);
      setIsEditingName(false);
      return;
    }

    setFormData(prev => ({ ...prev, name: editName }));
    setIsEditingName(false);
  };

  const handleSystemPromptChange = (value: string) => {
    if (!isSystemPromptEditable) {
      if (isSunaAgent) {
        toast.error("System prompt cannot be edited", {
          description: "Kortix's system prompt is managed centrally.",
        });
      }
      return;
    }

    setFormData(prev => ({ ...prev, system_prompt: value }));
  };

  const handleModelChange = (model: string) => {
    setFormData(prev => ({ ...prev, model: model || undefined }));
  };

  const handleToolsChange = (tools: Record<string, boolean | { enabled: boolean; description: string }>) => {
    if (!areToolsEditable) {
      if (isSunaAgent) {
        toast.error("Tools cannot be edited", {
          description: "Kortix's tools are managed centrally.",
        });
      }
      return;
    }

    setFormData(prev => ({ ...prev, agentpress_tools: tools }));
  };

  const handleMCPChange = async (updates: { configured_mcps: any[]; custom_mcps: any[] }) => {
    // Update local state immediately
    setFormData(prev => ({
      ...prev,
      configured_mcps: updates.configured_mcps || [],
      custom_mcps: updates.custom_mcps || []
    }));

    // Save MCP changes immediately to backend
    try {
      await updateAgentMCPsMutation.mutateAsync({
        agentId,
        configured_mcps: updates.configured_mcps || [],
        custom_mcps: updates.custom_mcps || [],
        replace_mcps: true
      });

      // Update original form data to reflect the save
      setOriginalFormData(prev => ({
        ...prev,
        configured_mcps: updates.configured_mcps || [],
        custom_mcps: updates.custom_mcps || []
      }));

      toast.success('Integration settings updated');
    } catch (error) {
      console.error('Failed to save MCP changes:', error);
      toast.error('Failed to save integration changes');
    }
  };


  const handleIconChange = async (iconName: string | null, iconColor: string, iconBackground: string) => {
    // First update the local state
    setFormData(prev => ({
      ...prev,
      icon_name: iconName,
      icon_color: iconColor,
      icon_background: iconBackground,
    }));

    // Then immediately save to backend
    try {
      const updateData: any = {
        agentId,
        icon_name: iconName,
        icon_color: iconColor,
        icon_background: iconBackground,
      };

      await updateAgentMutation.mutateAsync(updateData);
      
      // Update original form data to reflect the save
      setOriginalFormData(prev => ({
        ...prev,
        icon_name: iconName,
        icon_color: iconColor,
        icon_background: iconBackground,
      }));

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      queryClient.invalidateQueries({ queryKey: ['versions', 'list', agentId] });
      
      toast.success('Worker icon updated successfully!');
    } catch (error) {
      console.error('Failed to update agent icon:', error);
      toast.error('Failed to update Worker icon. Please try again.');
      
      // Revert the local state on error
      setFormData(prev => ({
        ...prev,
        icon_name: originalFormData.icon_name,
        icon_color: originalFormData.icon_color,
        icon_background: originalFormData.icon_background,
      }));
    }
  };

  const handleExport = () => {
    exportMutation.mutate(agentId);
  };

  // Share link handlers
  const handleCreateShareLink = async () => {
    setIsCreatingShareLink(true);
    try {
      const newLink = await createShareLink(agentId);
      setShareLinks(prev => [newLink, ...prev]);
      toast.success('Share link created');

      // Copy the URL to clipboard
      const url = getShareLinkUrl(newLink.share_id);
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch (error) {
      console.error('Failed to create share link:', error);
      toast.error('Failed to create share link');
    } finally {
      setIsCreatingShareLink(false);
    }
  };

  const handleCopyShareLink = async (shareId: string) => {
    const url = getShareLinkUrl(shareId);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast.error('Failed to copy link');
    }
  };

  const handleDeleteShareLink = async (shareId: string) => {
    setIsDeletingShareLink(shareId);
    try {
      await deleteShareLink(shareId);
      setShareLinks(prev => prev.filter(link => link.share_id !== shareId));
      toast.success('Share link deleted');
    } catch (error) {
      console.error('Failed to delete share link:', error);
      toast.error('Failed to delete share link');
    } finally {
      setIsDeletingShareLink(null);
    }
  };

  const handleRevokeShareLink = async (shareId: string) => {
    setIsDeletingShareLink(shareId);
    try {
      const updatedLink = await revokeShareLink(shareId);
      setShareLinks(prev =>
        prev.map(link => (link.share_id === shareId ? updatedLink : link))
      );
      toast.success('Share link deactivated');
    } catch (error) {
      console.error('Failed to revoke share link:', error);
      toast.error('Failed to revoke share link');
    } finally {
      setIsDeletingShareLink(null);
    }
  };

  // Template submission handlers
  const handleOpenSubmitDialog = () => {
    setSubmitForm({
      template_name: formData.name || '',
      template_description: '',
      category_id: '',
      use_cases: ['', '', ''],
    });
    setIsSubmitDialogOpen(true);
  };

  const handleSubmitAsTemplate = async () => {
    if (!submitForm.template_name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsSubmittingTemplate(true);
    try {
      const useCases = submitForm.use_cases.filter(uc => uc.trim());
      const submission = await createTemplateSubmission({
        agent_id: agentId,
        template_name: submitForm.template_name.trim(),
        template_description: submitForm.template_description.trim() || undefined,
        category_id: submitForm.category_id || undefined,
        use_cases: useCases.length > 0 ? useCases : undefined,
      });

      setPendingSubmission(submission);
      setIsSubmitDialogOpen(false);
      toast.success('Template submitted for review!', {
        description: 'You will be notified when your template is approved.',
      });
    } catch (error: any) {
      console.error('Failed to submit template:', error);
      const message = error?.message || 'Failed to submit template for review';
      toast.error(message);
    } finally {
      setIsSubmittingTemplate(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open && hasChanges) {
      setFormData(originalFormData);
      setEditName(originalFormData.name);
    }
    onOpenChange(open);
  };

  if (error) {
    return null;
  }

  // Determine if visibility editing is allowed (only for org agents by the creator)
  const isOrgAgent = !!agent?.org_id;
  const isCreator = agent?.account_id === agent?.account_id; // Agent creator check would need user comparison
  const canEditVisibility = isOrgAgent && !isSunaAgent && !isViewingOldVersion;

  const tabItems = [
    // { id: 'general', label: 'General', icon: Settings, disabled: false },
    { id: 'instructions', label: 'Instructions', icon: Brain, disabled: false },
    { id: 'tools', label: 'Tools', icon: Wrench, disabled: false },
    { id: 'integrations', label: 'Integrations', icon: Server, disabled: false },
    { id: 'knowledge', label: 'Knowledge', icon: BookOpen, disabled: false },
    { id: 'triggers', label: 'Triggers', icon: Zap, disabled: false },
    { id: 'settings', label: 'Settings', icon: Settings, disabled: false },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-5xl h-[85vh] overflow-hidden p-0 gap-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex-shrink-0"
                >
                  {isSunaAgent ? (
                    <AgentAvatar
                      isSunaDefault={true}
                      agentName={formData.name}
                      size={40}
                      className="ring-1 ring-border"
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🎯 Icon clicked in config dialog - opening editor');
                        console.log('Current formData:', { 
                          icon_name: formData.icon_name, 
                          icon_color: formData.icon_color, 
                          icon_background: formData.icon_background 
                        });
                        setIsIconEditorOpen(true);
                      }}
                      className="cursor-pointer transition-all hover:scale-105 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg"
                      type="button"
                      title="Click to customize agent icon"
                    >
                      <AgentAvatar
                        iconName={formData.icon_name}
                        iconColor={formData.icon_color}
                        backgroundColor={formData.icon_background}
                        agentName={formData.name}
                        size={40}
                        className="ring-1 ring-border hover:ring-foreground/20 transition-all"
                      />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {isEditingName ? (
                      // Name editing mode (takes priority over everything)
                      <div className="flex items-center gap-2">
                        <Input
                          ref={nameInputRef}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleNameSave();
                            } else if (e.key === 'Escape') {
                              setEditName(formData.name);
                              setIsEditingName(false);
                            }
                          }}
                          className="h-8 w-64"
                          maxLength={50}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={handleNameSave}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditName(formData.name);
                            setIsEditingName(false);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : onAgentChange ? (
                      // When agent switching is enabled, show a sleek inline agent selector
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-2 hover:bg-muted/50 rounded-2xl px-2 py-1 transition-colors group">
                              <DialogTitle className="text-xl font-semibold truncate">
                                {isLoading ? 'Loading...' : formData.name || 'Worker'}
                              </DialogTitle>
                              <ChevronDown className="h-4 w-4 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent 
                            className="w-80 p-0" 
                            align="start"
                            sideOffset={4}
                          >
                            <div className="p-3 border-b">
                              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Search className="h-4 w-4" />
                                Switch Agent
                              </div>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                              {agents.map((agent: any) => (
                                <DropdownMenuItem
                                  key={agent.agent_id}
                                  onClick={() => onAgentChange(agent.agent_id)}
                                  className="p-3 flex items-center gap-3 cursor-pointer"
                                >
                                  <AgentAvatar
                                    iconName={agent.icon_name}
                                    iconColor={agent.icon_color}
                                    backgroundColor={agent.icon_background}
                                    agentName={agent.name}
                                    isSunaDefault={agent.metadata?.is_suna_default}
                                    size={24}
                                    className="flex-shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{agent.name}</div>
                                    {agent.description && (
                                      <div className="text-xs text-muted-foreground truncate">
                                        {agent.description}
                                      </div>
                                    )}
                                  </div>
                                  {agent.agent_id === agentId && (
                                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                                  )}
                                </DropdownMenuItem>
                              ))}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Add edit button for name editing when agent switching is enabled */}
                        {isNameEditable && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() => {
                              setIsEditingName(true);
                              setTimeout(() => {
                                nameInputRef.current?.focus();
                                nameInputRef.current?.select();
                              }, 0);
                            }}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      // Static title mode (no agent switching available)
                      <div className="flex items-center gap-2">
                        <DialogTitle className="text-xl font-semibold">
                          {isLoading ? 'Loading...' : formData.name || 'Worker'}
                        </DialogTitle>
                        {isNameEditable && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setIsEditingName(true);
                              setTimeout(() => {
                                nameInputRef.current?.focus();
                                nameInputRef.current?.select();
                              }, 0);
                            }}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AgentVersionSwitcher
                  agentId={agentId}
                  currentVersionId={agent?.current_version_id || null}
                  currentFormData={{
                    system_prompt: formData.system_prompt,
                    configured_mcps: formData.configured_mcps,
                    custom_mcps: formData.custom_mcps,
                    agentpress_tools: formData.agentpress_tools,
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExport}
                  disabled={exportMutation.isPending}
                >
                  {exportMutation.isPending ? (
                    <KortixLoader customSize={16} />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </DialogHeader>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <KortixLoader size="large" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="flex-1 flex flex-col min-h-0">
              <div className='flex items-center justify-center w-full'>
                <TabsList className="mt-4 w-[95%] flex-shrink-0">
                  {tabItems.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <TabsTrigger
                        key={tab.id}
                        value={tab.id}
                        disabled={tab.disabled}
                        className={cn(
                          tab.disabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>
              <div className="flex-1 overflow-auto">
                {/* <TabsContent value="general" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 gap-6">
                    <div className="flex-shrink-0">
                      <Label className="text-base font-semibold mb-3 block">Model</Label>
                      <AgentModelSelector
                        value={formData.model}
                        onChange={handleModelChange}
                        disabled={isViewingOldVersion}
                        variant="default"
                      />
                    </div>

                  </div>
                </TabsContent> */}

                <TabsContent value="instructions" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0">
                    {isSunaAgent && (
                      <Alert className="mb-4 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <AlertDescription className="text-sm text-blue-800 dark:text-blue-300">
                          You can't edit the main Kortix, but you can create a new AI Worker that you can modify as you wish.
                        </AlertDescription>
                      </Alert>
                    )}
                    <Label className="text-base font-semibold mb-3 block flex-shrink-0">System Prompt</Label>
                    <ExpandableMarkdownEditor
                      value={formData.system_prompt}
                      onSave={handleSystemPromptChange}
                      disabled={!isSystemPromptEditable}
                      placeholder="Define how your Worker should behave..."
                      className="flex-1 h-[90%]"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="tools" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0 h-full">
                    {isSunaAgent && (
                      <Alert className="mb-4 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <AlertDescription className="text-sm text-blue-800 dark:text-blue-300">
                          You can't edit the main Kortix, but you can create a new AI Worker that you can modify as you wish.
                        </AlertDescription>
                      </Alert>
                    )}
                    <GranularToolConfiguration
                      tools={formData.agentpress_tools}
                      onToolsChange={handleToolsChange}
                      disabled={!areToolsEditable}
                      isSunaAgent={isSunaAgent}
                      isLoading={isLoading}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="integrations" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0 h-full relative">
                    <AgentMCPConfiguration
                      configuredMCPs={formData.configured_mcps}
                      customMCPs={formData.custom_mcps}
                      onMCPChange={handleMCPChange}
                      agentId={agentId}
                      versionData={{
                        configured_mcps: formData.configured_mcps,
                        custom_mcps: formData.custom_mcps,
                        system_prompt: formData.system_prompt,
                        agentpress_tools: formData.agentpress_tools
                      }}
                      saveMode="callback"
                      isLoading={updateAgentMCPsMutation.isPending}
                    />
                    {isFreeTier && (
                      <div className="absolute inset-0 z-10">
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
                        <div className="relative h-full flex flex-col items-center justify-center px-8">
                          <div 
                            className="max-w-md w-full rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background p-8 cursor-pointer hover:border-primary/50 transition-all group shadow-lg"
                            onClick={() => openPricingModal()}
                          >
                            <div className="flex flex-col items-center text-center gap-4">
                              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                                <Server className="h-7 w-7 text-primary" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">Unlock Integrations</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  Connect Google Drive, Slack, Notion, and 100+ apps to supercharge your AI Workers
                                </p>
                              </div>
                              <Button 
                                variant="default"
                                className="mt-2 gap-2"
                                onClick={(e) => { e.stopPropagation(); openPricingModal(); }}
                              >
                                <Sparkles className="h-4 w-4" />
                                Upgrade to Unlock
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="knowledge" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0 h-full relative">
                    <AgentKnowledgeBaseManager agentId={agentId} agentName={formData.name || 'Worker'} />
                    {isFreeTier && (
                      <div className="absolute inset-0 z-10">
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
                        <div className="relative h-full flex flex-col items-center justify-center px-8">
                          <div 
                            className="max-w-md w-full rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background p-8 cursor-pointer hover:border-primary/50 transition-all group shadow-lg"
                            onClick={() => openPricingModal()}
                          >
                            <div className="flex flex-col items-center text-center gap-4">
                              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                                <Brain className="h-7 w-7 text-primary" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">Unlock Knowledge Base</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  Upload documents, PDFs, and files to give your AI Workers custom knowledge and context
                                </p>
                              </div>
                              <Button 
                                variant="default"
                                className="mt-2 gap-2"
                                onClick={(e) => { e.stopPropagation(); openPricingModal(); }}
                              >
                                <Sparkles className="h-4 w-4" />
                                Upgrade to Unlock
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="triggers" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col flex-1 min-h-0 h-full relative">
                    <AgentTriggersConfiguration agentId={agentId} />
                    {isFreeTier && (
                      <div className="absolute inset-0 z-10">
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
                        <div className="relative h-full flex flex-col items-center justify-center px-8">
                          <div
                            className="max-w-md w-full rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background p-8 cursor-pointer hover:border-primary/50 transition-all group shadow-lg"
                            onClick={() => openPricingModal()}
                          >
                            <div className="flex flex-col items-center text-center gap-4">
                              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                                <Zap className="h-7 w-7 text-primary" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">Unlock Automation Triggers</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  Set up scheduled tasks and event-based triggers to automate your AI Workers 24/7
                                </p>
                              </div>
                              <Button
                                variant="default"
                                className="mt-2 gap-2"
                                onClick={(e) => { e.stopPropagation(); openPricingModal(); }}
                              >
                                <Sparkles className="h-4 w-4" />
                                Upgrade to Unlock
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="settings" className="p-6 mt-0 flex flex-col h-full">
                  <div className="flex flex-col gap-6">
                    {/* Visibility Settings */}
                    <div className="space-y-4">
                      <div>
                        <Label className="text-base font-semibold mb-1 block">Visibility</Label>
                        <p className="text-sm text-muted-foreground mb-3">
                          Control who can see and use this Worker
                        </p>
                      </div>

                      {isOrgAgent ? (
                        <div className="space-y-3">
                          <Select
                            value={formData.visibility}
                            onValueChange={(value: AgentVisibility) =>
                              setFormData(prev => ({ ...prev, visibility: value }))
                            }
                            disabled={!canEditVisibility}
                          >
                            <SelectTrigger className="w-full max-w-md">
                              <SelectValue placeholder="Select visibility" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="private">
                                <div className="flex items-center gap-2">
                                  <Lock className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <div className="font-medium">Private</div>
                                    <div className="text-xs text-muted-foreground">Only you can see and use</div>
                                  </div>
                                </div>
                              </SelectItem>
                              <SelectItem value="org">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <div className="font-medium">Organization</div>
                                    <div className="text-xs text-muted-foreground">All team members can see and use</div>
                                  </div>
                                </div>
                              </SelectItem>
                              <SelectItem value="public" disabled>
                                <div className="flex items-center gap-2">
                                  <Globe className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <div className="font-medium">Public (Coming Soon)</div>
                                    <div className="text-xs text-muted-foreground">Listed in public marketplace</div>
                                  </div>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          {/* Visibility description */}
                          <div className="p-4 bg-muted/50 rounded-lg border">
                            {formData.visibility === 'private' && (
                              <div className="flex items-start gap-3">
                                <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div>
                                  <p className="font-medium">Private Worker</p>
                                  <p className="text-sm text-muted-foreground">
                                    Only you can see, edit, and use this Worker. Other organization members won&apos;t be able to find it.
                                  </p>
                                </div>
                              </div>
                            )}
                            {formData.visibility === 'org' && (
                              <div className="flex items-start gap-3">
                                <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div>
                                  <p className="font-medium">Shared with Organization</p>
                                  <p className="text-sm text-muted-foreground">
                                    All members of your organization can see and use this Worker. Only you and admins can edit it.
                                  </p>
                                </div>
                              </div>
                            )}
                            {formData.visibility === 'public' && (
                              <div className="flex items-start gap-3">
                                <Globe className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div>
                                  <p className="font-medium">Public Marketplace</p>
                                  <p className="text-sm text-muted-foreground">
                                    This Worker will be listed in the public marketplace where anyone can discover and use it.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-muted/50 rounded-lg border">
                          <div className="flex items-start gap-3">
                            <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="font-medium">Personal Worker</p>
                              <p className="text-sm text-muted-foreground">
                                This Worker is in your personal workspace and is private by default. To share with a team, create the Worker within an organization.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Public Share Links Section */}
                    <div className="space-y-4 border-t pt-6">
                      <div>
                        <Label className="text-base font-semibold mb-1 block">Public Share Links</Label>
                        <p className="text-sm text-muted-foreground mb-3">
                          Create shareable links to let anyone try this Worker without signing up
                        </p>
                      </div>

                      <div className="space-y-3">
                        <Button
                          onClick={handleCreateShareLink}
                          disabled={isCreatingShareLink || isSunaAgent}
                          variant="outline"
                          className="w-full max-w-md"
                        >
                          {isCreatingShareLink ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Creating link...
                            </>
                          ) : (
                            <>
                              <Link2 className="h-4 w-4 mr-2" />
                              Create New Share Link
                            </>
                          )}
                        </Button>

                        {isLoadingShareLinks ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : shareLinks.length > 0 ? (
                          <div className="space-y-2">
                            {shareLinks.map(link => (
                              <div
                                key={link.share_id}
                                className={cn(
                                  "flex items-center justify-between p-3 rounded-lg border",
                                  link.is_active ? "bg-card" : "bg-muted/50 opacity-60"
                                )}
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className={cn(
                                    "flex-shrink-0 w-2 h-2 rounded-full",
                                    link.is_active ? "bg-green-500" : "bg-red-500"
                                  )} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-mono truncate text-muted-foreground">
                                      {getShareLinkUrl(link.share_id)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {link.views_count} views &middot; {link.runs_count} runs
                                      {!link.is_active && ' (deactivated)'}
                                      {link.expires_at && ` &middot; Expires ${new Date(link.expires_at).toLocaleDateString()}`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleCopyShareLink(link.share_id)}
                                    title="Copy link"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => window.open(getShareLinkUrl(link.share_id), '_blank')}
                                    title="Open in new tab"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  {link.is_active ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-orange-500 hover:text-orange-600"
                                      onClick={() => handleRevokeShareLink(link.share_id)}
                                      disabled={isDeletingShareLink === link.share_id}
                                      title="Deactivate link"
                                    >
                                      {isDeletingShareLink === link.share_id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <X className="h-4 w-4" />
                                      )}
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteShareLink(link.share_id)}
                                      disabled={isDeletingShareLink === link.share_id}
                                      title="Delete link"
                                    >
                                      {isDeletingShareLink === link.share_id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 bg-muted/30 rounded-lg border border-dashed">
                            <div className="flex items-center gap-3">
                              <Share2 className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  No share links yet. Create one to let others try this Worker.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Submit as Template Section */}
                    <div className="space-y-4 border-t pt-6">
                      <div>
                        <Label className="text-base font-semibold mb-1 block">Submit to Marketplace</Label>
                        <p className="text-sm text-muted-foreground mb-3">
                          Share your Worker as a template for others to use
                        </p>
                      </div>

                      {pendingSubmission ? (
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-200 dark:border-yellow-800">
                          <div className="flex items-start gap-3">
                            <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                            <div>
                              <p className="font-medium text-yellow-800 dark:text-yellow-200">Submission Pending Review</p>
                              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                Your template &quot;{pendingSubmission.template_name}&quot; is waiting for admin approval.
                                Submitted on {new Date(pendingSubmission.submitted_at).toLocaleDateString()}.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <Button
                            onClick={handleOpenSubmitDialog}
                            disabled={isSunaAgent}
                            variant="outline"
                            className="w-full max-w-md"
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Submit as Template
                          </Button>

                          <div className="p-4 bg-muted/30 rounded-lg border border-dashed">
                            <div className="flex items-start gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  Submit this Worker as a template for the marketplace. Once approved,
                                  other users can discover and use your template to create their own Workers.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          )}

          <DialogFooter className="px-6 py-4 border-t bg-background flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={!hasChanges || isSaving}
            >
              {isSaving ? (
                <>
                  <KortixLoader customSize={16} className="mr-1" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentIconEditorDialog
        isOpen={isIconEditorOpen}
        onClose={() => {
          console.log('Icon editor dialog closing');
          setIsIconEditorOpen(false);
        }}
        currentIconName={formData.icon_name}
        currentIconColor={formData.icon_color}
        currentBackgroundColor={formData.icon_background}
        agentName={formData.name}
        agentDescription={agent?.description}
        onIconUpdate={handleIconChange}
      />

      {/* Template Submission Dialog */}
      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Submit as Template
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                value={submitForm.template_name}
                onChange={(e) => setSubmitForm(prev => ({ ...prev, template_name: e.target.value }))}
                placeholder="Enter a name for your template"
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={submitForm.template_description}
                onChange={(e) => setSubmitForm(prev => ({ ...prev, template_description: e.target.value }))}
                placeholder="Describe what your template does and who it's for..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-category">Category</Label>
              <Select
                value={submitForm.category_id}
                onValueChange={(value) => setSubmitForm(prev => ({ ...prev, category_id: value }))}
              >
                <SelectTrigger id="template-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {templateCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Example Use Cases (optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Add example prompts showing how users might use this template
              </p>
              <div className="space-y-2">
                {submitForm.use_cases.map((useCase, index) => (
                  <Input
                    key={index}
                    value={useCase}
                    onChange={(e) => {
                      const newUseCases = [...submitForm.use_cases];
                      newUseCases[index] = e.target.value;
                      setSubmitForm(prev => ({ ...prev, use_cases: newUseCases }));
                    }}
                    placeholder={`Example use case ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg border text-sm">
              <p className="text-muted-foreground">
                Your submission will be reviewed by our team. You&apos;ll receive an email when your template is approved.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSubmitDialogOpen(false)}
              disabled={isSubmittingTemplate}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitAsTemplate}
              disabled={isSubmittingTemplate || !submitForm.template_name.trim()}
            >
              {isSubmittingTemplate ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit for Review
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
