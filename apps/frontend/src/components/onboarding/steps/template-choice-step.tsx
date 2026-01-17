'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, Plus, Search, CheckCircle2, Star, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StepWrapper } from '../shared/step-wrapper';
import { updateUserContext, userContext } from '../shared/context';
import { getTemplates, AgentTemplate } from '@/lib/api/templates';
import { cn } from '@/lib/utils';
import { AgentAvatar } from '@/components/thread/content/agent-avatar';

export const TemplateChoiceStep = () => {
  const [choice, setChoice] = useState<'template' | 'blank' | null>(null);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch featured templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await getTemplates({ limit: 6, search: '' });
        setTemplates(response.templates || []);
      } catch (err) {
        console.error('Failed to fetch templates:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleChoiceSelect = (selected: 'template' | 'blank') => {
    setChoice(selected);

    if (selected === 'blank') {
      setSelectedTemplate(null);
      updateUserContext({
        selectedTemplateId: undefined,
        selectedTemplateName: undefined,
        createBlankAgent: true
      });
    }
  };

  const handleTemplateSelect = (template: AgentTemplate) => {
    setChoice('template');
    setSelectedTemplate(template);
    updateUserContext({
      selectedTemplateId: template.template_id,
      selectedTemplateName: template.name,
      createBlankAgent: false
    });
  };

  return (
    <StepWrapper>
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl font-medium mb-3">Create Your First Agent</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Choose from our featured templates to get started quickly, or create a blank agent from scratch.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid md:grid-cols-2 gap-6"
        >
          {/* Template option */}
          <div className="space-y-4">
            <Card
              className={cn(
                "cursor-pointer transition-all duration-200 hover:border-primary/50",
                (choice === 'template' || selectedTemplate) && "border-primary bg-primary/5"
              )}
              onClick={() => handleChoiceSelect('template')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="h-5 w-5 text-primary" />
                    Start from Template
                  </CardTitle>
                  <Badge variant="secondary">Recommended</Badge>
                </div>
                <CardDescription>
                  Pre-configured agents for common use cases
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Template search and grid */}
            {(choice === 'template' || selectedTemplate) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-3"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <ScrollArea className="h-[280px] pr-3">
                  <div className="grid gap-2">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-20 text-muted-foreground">
                        Loading templates...
                      </div>
                    ) : filteredTemplates.length === 0 ? (
                      <div className="flex items-center justify-center h-20 text-muted-foreground">
                        No templates found
                      </div>
                    ) : (
                      filteredTemplates.map((template) => (
                        <Card
                          key={template.template_id}
                          className={cn(
                            "cursor-pointer transition-all hover:bg-muted/50",
                            selectedTemplate?.template_id === template.template_id &&
                              "border-primary bg-primary/10"
                          )}
                          onClick={() => handleTemplateSelect(template)}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <AgentAvatar
                              iconName={template.config?.metadata?.avatar}
                              iconColor={template.config?.metadata?.avatar_color}
                              size={32}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-sm truncate">{template.name}</h4>
                                {selectedTemplate?.template_id === template.template_id && (
                                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {template.description}
                              </p>
                            </div>
                            {template.download_count > 0 && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Download className="h-3 w-3" />
                                {template.download_count}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </motion.div>
            )}
          </div>

          {/* Blank agent option */}
          <Card
            className={cn(
              "cursor-pointer transition-all duration-200 hover:border-primary/50 h-fit",
              choice === 'blank' && "border-primary bg-primary/5"
            )}
            onClick={() => handleChoiceSelect('blank')}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create Blank Agent
                </CardTitle>
                {choice === 'blank' && <CheckCircle2 className="h-5 w-5 text-primary" />}
              </div>
              <CardDescription>
                Start with a blank canvas and build your own
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  Full customization control
                </li>
                <li className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  Configure your own tools
                </li>
                <li className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  Write custom system prompts
                </li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        {/* Selected template preview */}
        {selectedTemplate && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 border rounded-lg bg-primary/5 border-primary/20"
          >
            <div className="flex items-center gap-3">
              <AgentAvatar
                iconName={selectedTemplate.config?.metadata?.avatar}
                iconColor={selectedTemplate.config?.metadata?.avatar_color}
                size={48}
              />
              <div className="flex-1">
                <h3 className="font-medium">Selected: {selectedTemplate.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {selectedTemplate.description}
                </p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
          </motion.div>
        )}

        {/* Help text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <p className="text-sm text-muted-foreground">
            {selectedTemplate
              ? `Click 'Continue' to create your agent from the ${selectedTemplate.name} template`
              : choice === 'blank'
                ? "Click 'Continue' to create a blank agent"
                : "Select a template or create a blank agent to continue"}
          </p>
        </motion.div>
      </div>
    </StepWrapper>
  );
};
