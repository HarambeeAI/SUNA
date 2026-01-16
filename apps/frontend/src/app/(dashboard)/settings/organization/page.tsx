'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Building2,
  CreditCard,
  Edit2,
  Check,
  X,
  ArrowUpRight,
  AlertCircle,
  Loader2,
  BarChart3
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getOrganization,
  getOrganizationUsage,
  updateOrganization,
  createOrgCheckoutSession,
  createOrgBillingPortalSession,
  Organization,
  OrganizationUsage,
  PlanTier,
  BillingStatus,
} from '@/lib/api/organizations';

// Helper to format plan tier for display
const formatPlanTier = (tier: PlanTier): string => {
  switch (tier) {
    case 'free':
      return 'Free';
    case 'pro':
      return 'Pro';
    case 'enterprise':
      return 'Enterprise';
    default:
      return tier;
  }
};

// Helper to get badge color for plan tier
const getPlanTierBadgeColor = (tier: PlanTier): string => {
  switch (tier) {
    case 'free':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'pro':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'enterprise':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

// Helper to get badge for billing status
const getBillingStatusBadge = (status: BillingStatus) => {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
    case 'trialing':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Trialing</Badge>;
    case 'past_due':
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Past Due</Badge>;
    case 'canceled':
      return <Badge className="bg-red-100 text-red-800 border-red-200">Canceled</Badge>;
    case 'unpaid':
      return <Badge className="bg-red-100 text-red-800 border-red-200">Unpaid</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

// Helper to format usage percentage with color
const getUsageColor = (percent: number): string => {
  if (percent >= 100) return 'text-red-600';
  if (percent >= 80) return 'text-yellow-600';
  return 'text-green-600';
};

const getProgressColor = (percent: number): string => {
  if (percent >= 100) return 'bg-red-500';
  if (percent >= 80) return 'bg-yellow-500';
  return 'bg-green-500';
};

export default function OrganizationSettingsPage() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get('org');

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const queryClient = useQueryClient();

  // Fetch organization data
  const {
    data: organization,
    isLoading: orgLoading,
    error: orgError
  } = useQuery({
    queryKey: ['organization', orgId],
    queryFn: () => getOrganization(orgId!),
    enabled: !!orgId,
  });

  // Fetch usage data
  const {
    data: usage,
    isLoading: usageLoading
  } = useQuery({
    queryKey: ['organization-usage', orgId],
    queryFn: () => getOrganizationUsage(orgId!),
    enabled: !!orgId,
  });

  // Update organization mutation
  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; settings?: Record<string, unknown> }) =>
      updateOrganization(orgId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      toast.success('Organization updated successfully');
      setIsEditingName(false);
    },
    onError: () => {
      toast.error('Failed to update organization');
    },
  });

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: () =>
      createOrgCheckoutSession(orgId!, {
        plan_tier: 'pro',
        success_url: `${window.location.origin}/settings/organization?org=${orgId}&checkout=success`,
        cancel_url: `${window.location.origin}/settings/organization?org=${orgId}&checkout=canceled`,
      }),
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      window.location.href = data.checkout_url;
    },
    onError: () => {
      toast.error('Failed to start checkout');
    },
  });

  // Billing portal mutation
  const billingPortalMutation = useMutation({
    mutationFn: () =>
      createOrgBillingPortalSession(orgId!, {
        return_url: `${window.location.origin}/settings/organization?org=${orgId}`,
      }),
    onSuccess: (data) => {
      // Redirect to Stripe billing portal
      window.location.href = data.portal_url;
    },
    onError: () => {
      toast.error('Failed to open billing portal');
    },
  });

  const handleSaveName = () => {
    if (editedName.trim() && editedName !== organization?.name) {
      updateMutation.mutate({ name: editedName.trim() });
    } else {
      setIsEditingName(false);
    }
  };

  const handleStartEdit = () => {
    setEditedName(organization?.name || '');
    setIsEditingName(true);
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditedName('');
  };

  // Show message if no org is selected
  if (!orgId) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <Card>
          <CardContent className="p-6 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No organization selected</h3>
            <p className="text-muted-foreground">
              Please select an organization from the navigation to view settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (orgLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  // Error state
  if (orgError || !organization) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <Card className="border-red-200">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Failed to load organization</h3>
            <p className="text-muted-foreground">
              {orgError instanceof Error ? orgError.message : 'An unexpected error occurred.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isFreeUser = organization.plan_tier === 'free';
  const isPaidUser = organization.plan_tier === 'pro' || organization.plan_tier === 'enterprise';

  return (
    <div className="container mx-auto max-w-6xl px-6 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-medium">Organization Settings</h1>
            <Badge className={getPlanTierBadgeColor(organization.plan_tier)}>
              {formatPlanTier(organization.plan_tier)}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Manage your organization&apos;s settings, plan, and billing
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Organization Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Organization Details
              </CardTitle>
              <CardDescription>
                Basic information about your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Organization Name */}
              <div className="space-y-2">
                <Label>Organization Name</Label>
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="Organization name"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveName}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={updateMutation.isPending}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{organization.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleStartEdit}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Organization Slug */}
              <div className="space-y-2">
                <Label>Organization Slug</Label>
                <div className="text-sm text-muted-foreground font-mono">
                  {organization.slug}
                </div>
              </div>

              {/* Billing Status */}
              <div className="space-y-2">
                <Label>Billing Status</Label>
                <div>{getBillingStatusBadge(organization.billing_status)}</div>
              </div>

              {/* Created Date */}
              <div className="space-y-2">
                <Label>Created</Label>
                <div className="text-sm text-muted-foreground">
                  {new Date(organization.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Plan & Billing Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Plan & Billing
              </CardTitle>
              <CardDescription>
                Manage your subscription and payment methods
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Plan */}
              <div className="space-y-2">
                <Label>Current Plan</Label>
                <div className="flex items-center gap-2">
                  <Badge className={getPlanTierBadgeColor(organization.plan_tier)}>
                    {formatPlanTier(organization.plan_tier)}
                  </Badge>
                  {organization.plan_tier === 'free' && (
                    <span className="text-sm text-muted-foreground">
                      3 agents, 100 runs/month
                    </span>
                  )}
                  {organization.plan_tier === 'pro' && (
                    <span className="text-sm text-muted-foreground">
                      Unlimited agents, 5000 runs/month
                    </span>
                  )}
                  {organization.plan_tier === 'enterprise' && (
                    <span className="text-sm text-muted-foreground">
                      Custom limits
                    </span>
                  )}
                </div>
              </div>

              {/* Billing Actions */}
              <div className="pt-2 space-y-3">
                {isFreeUser && (
                  <Button
                    className="w-full"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                  >
                    {checkoutMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 mr-2" />
                    )}
                    Upgrade to Pro - $49/month
                  </Button>
                )}

                {isPaidUser && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => billingPortalMutation.mutate()}
                    disabled={billingPortalMutation.isPending}
                  >
                    {billingPortalMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-2" />
                    )}
                    Manage Billing
                  </Button>
                )}

                {organization.billing_status === 'past_due' && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>Action required:</strong> Your payment method needs to be updated.
                      Please update your billing information to continue using Pro features.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Stats Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Usage This Month
            </CardTitle>
            <CardDescription>
              Track your organization&apos;s resource consumption
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usageLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : usage ? (
              <div className="grid gap-6 md:grid-cols-2">
                {/* Agents Usage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Agents Created</Label>
                    <span className={`text-sm font-medium ${getUsageColor(usage.usage_percentages.agents_percent)}`}>
                      {usage.agents_created} / {usage.limits.agent_limit === null ? 'Unlimited' : usage.limits.agent_limit}
                    </span>
                  </div>
                  {usage.limits.agent_limit !== null && (
                    <>
                      <Progress
                        value={Math.min(usage.usage_percentages.agents_percent, 100)}
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {usage.usage_percentages.agents_percent.toFixed(0)}% of limit used
                      </p>
                    </>
                  )}
                </div>

                {/* Runs Usage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Agent Runs</Label>
                    <span className={`text-sm font-medium ${getUsageColor(usage.usage_percentages.runs_percent)}`}>
                      {usage.runs_executed} / {usage.limits.run_limit_monthly === null ? 'Unlimited' : usage.limits.run_limit_monthly}
                    </span>
                  </div>
                  {usage.limits.run_limit_monthly !== null && (
                    <>
                      <Progress
                        value={Math.min(usage.usage_percentages.runs_percent, 100)}
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {usage.usage_percentages.runs_percent.toFixed(0)}% of limit used
                      </p>
                    </>
                  )}
                </div>

                {/* Billing Period */}
                <div className="md:col-span-2 pt-4 border-t">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Billing Period: {new Date(usage.period_start).toLocaleDateString()} - {new Date(usage.period_end).toLocaleDateString()}
                    </span>
                    {usage.usage_percentages.agents_percent >= 80 || usage.usage_percentages.runs_percent >= 80 ? (
                      <span className="text-yellow-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        Approaching limit
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                No usage data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
