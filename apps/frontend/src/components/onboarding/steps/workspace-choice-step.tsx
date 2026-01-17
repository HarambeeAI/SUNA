'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, User, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StepWrapper } from '../shared/step-wrapper';
import { updateUserContext, userContext } from '../shared/context';
import { createOrganization } from '@/lib/api/organizations';
import { cn } from '@/lib/utils';

export const WorkspaceChoiceStep = () => {
  const [choice, setChoice] = useState<'personal' | 'organization' | null>(
    userContext.userType === 'company' ? 'organization' :
    userContext.userType === 'individual' ? 'personal' : null
  );
  const [orgName, setOrgName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgCreated, setOrgCreated] = useState(false);

  const handleChoiceSelect = (selected: 'personal' | 'organization') => {
    setChoice(selected);
    setError(null);

    if (selected === 'personal') {
      updateUserContext({
        userType: 'individual',
        createdOrgId: undefined
      });
    } else {
      updateUserContext({ userType: 'company' });
    }
  };

  const handleCreateOrganization = async () => {
    if (!orgName.trim()) {
      setError('Please enter an organization name');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Generate slug from name
      const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const org = await createOrganization({
        name: orgName.trim(),
        slug: slug || `org-${Date.now()}`,
      });

      updateUserContext({
        userType: 'company',
        createdOrgId: org.id
      });

      setOrgCreated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <StepWrapper>
      <div className="space-y-8 max-w-3xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl font-medium mb-3">Choose Your Workspace</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            You can start with a personal workspace or create an organization to collaborate with your team.
          </p>
        </motion.div>

        {/* Choice cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid md:grid-cols-2 gap-4"
        >
          {/* Personal Workspace */}
          <Card
            className={cn(
              "cursor-pointer transition-all duration-200 hover:border-primary/50",
              choice === 'personal' && "border-primary bg-primary/5"
            )}
            onClick={() => handleChoiceSelect('personal')}
          >
            <CardHeader className="text-center">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors",
                choice === 'personal' ? "bg-primary/20" : "bg-muted"
              )}>
                <User className={cn(
                  "h-8 w-8",
                  choice === 'personal' ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <CardTitle className="flex items-center justify-center gap-2">
                Personal Workspace
                {choice === 'personal' && <CheckCircle2 className="h-5 w-5 text-primary" />}
              </CardTitle>
              <CardDescription>
                Start with your own private workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Quick start - no setup needed
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Create agents for personal use
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Create organization later anytime
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Organization */}
          <Card
            className={cn(
              "cursor-pointer transition-all duration-200 hover:border-primary/50",
              choice === 'organization' && "border-primary bg-primary/5"
            )}
            onClick={() => handleChoiceSelect('organization')}
          >
            <CardHeader className="text-center">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors",
                choice === 'organization' ? "bg-primary/20" : "bg-muted"
              )}>
                <Building2 className={cn(
                  "h-8 w-8",
                  choice === 'organization' ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <CardTitle className="flex items-center justify-center gap-2">
                Create Organization
                {choice === 'organization' && <CheckCircle2 className="h-5 w-5 text-primary" />}
              </CardTitle>
              <CardDescription>
                Set up a shared workspace for your team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Invite team members
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Share agents and workflows
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Usage analytics dashboard
                </li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        {/* Organization creation form */}
        {choice === 'organization' && !orgCreated && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
            className="space-y-4 p-6 border rounded-lg bg-muted/20"
          >
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="e.g., Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground">
                You can change this later in organization settings
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <Button
              onClick={handleCreateOrganization}
              disabled={isCreating || !orgName.trim()}
            >
              {isCreating ? (
                <>Creating...</>
              ) : (
                <>
                  Create Organization
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </motion.div>
        )}

        {/* Success message for org creation */}
        {orgCreated && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 border border-green-500/30 rounded-lg bg-green-500/10 text-center"
          >
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1">Organization Created!</h3>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{orgName}</span> is ready to use.
              You can invite team members after completing the setup.
            </p>
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
            {choice === 'personal'
              ? "Click 'Continue' to proceed with your personal workspace"
              : orgCreated
                ? "Click 'Continue' to set up your first agent"
                : "Create your organization or click 'Continue' to skip for now"}
          </p>
        </motion.div>
      </div>
    </StepWrapper>
  );
};
