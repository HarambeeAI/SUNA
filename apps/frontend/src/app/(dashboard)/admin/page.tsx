'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Users,
  Building2,
  Bot,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  Shield,
  FileText,
  UserX,
  UserCheck,
  TrendingUp,
  Database,
  Zap,
} from 'lucide-react';
import {
  getPlatformOverview,
  listOrganizationsAdmin,
  updateOrganizationPlanTier,
  listUsersAdmin,
  suspendUser,
  unsuspendUser,
  getSystemHealth,
  type PlatformOverviewStats,
  type OrganizationAdminSummary,
  type UserAdminSummary,
  type SystemHealthMetrics,
  type PlanTier,
} from '@/lib/api/admin-platform';
import {
  listAllSubmissions,
  getSubmissionStats,
  approveSubmission,
  rejectSubmission,
  type TemplateSubmission,
  type TemplateSubmissionStatsResponse,
} from '@/lib/api/template-submissions';

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  // Overview data
  const { data: overviewStats, isLoading: loadingOverview } = useQuery({
    queryKey: ['admin-platform-overview'],
    queryFn: getPlatformOverview,
    refetchInterval: 60000, // Refresh every minute
  });

  // System health
  const { data: systemHealth, isLoading: loadingHealth } = useQuery({
    queryKey: ['admin-system-health'],
    queryFn: getSystemHealth,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Template submission stats
  const { data: submissionStats } = useQuery({
    queryKey: ['admin-submission-stats'],
    queryFn: getSubmissionStats,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-platform-overview'] });
    queryClient.invalidateQueries({ queryKey: ['admin-system-health'] });
    queryClient.invalidateQueries({ queryKey: ['admin-submission-stats'] });
    toast.success('Dashboard refreshed');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Admin Dashboard
            </h1>
            <p className="text-md text-muted-foreground mt-2">
              Platform management and monitoring
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="submissions">
              Submissions
              {submissionStats && submissionStats.pending_count > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 px-1.5">
                  {submissionStats.pending_count}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="health">System Health</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <OverviewTab
              stats={overviewStats}
              health={systemHealth}
              submissionStats={submissionStats}
              loading={loadingOverview || loadingHealth}
            />
          </TabsContent>

          <TabsContent value="submissions" className="mt-6">
            <TemplateSubmissionsTab />
          </TabsContent>

          <TabsContent value="organizations" className="mt-6">
            <OrganizationsTab />
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <UsersTab />
          </TabsContent>

          <TabsContent value="health" className="mt-6">
            <SystemHealthTab health={systemHealth} loading={loadingHealth} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({
  stats,
  health,
  submissionStats,
  loading,
}: {
  stats?: PlatformOverviewStats;
  health?: SystemHealthMetrics;
  submissionStats?: TemplateSubmissionStatsResponse;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_users.toLocaleString() ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              +{stats?.new_users_today ?? 0} today, +{stats?.new_users_week ?? 0} this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_organizations.toLocaleString() ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              Multi-tenant workspaces
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_agents.toLocaleString() ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              AI agents deployed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Runs Today</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.runs_today.toLocaleString() ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.runs_this_week.toLocaleString() ?? 0} this week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Activity & Health */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active_users_today ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.active_users_week ?? 0} this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Submissions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{submissionStats?.pending_count ?? stats?.pending_template_submissions ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              Templates awaiting review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Runs</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health?.active_agent_runs ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              Currently executing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            {health?.api_healthy && health?.database_healthy && health?.redis_healthy ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health?.api_healthy && health?.database_healthy && health?.redis_healthy ? 'Healthy' : 'Degraded'}
            </div>
            <p className="text-xs text-muted-foreground">
              API, Database, Redis
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Template Submissions Tab Component
function TemplateSubmissionsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedSubmission, setSelectedSubmission] = useState<TemplateSubmission | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['admin-submissions', statusFilter, page],
    queryFn: () => listAllSubmissions({ status: statusFilter as 'pending' | 'approved' | 'rejected', page, page_size: 20 }),
  });

  const approveMutation = useMutation({
    mutationFn: (submissionId: string) => approveSubmission(submissionId),
    onSuccess: () => {
      toast.success('Template approved and published');
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-submission-stats'] });
      setSelectedSubmission(null);
    },
    onError: () => {
      toast.error('Failed to approve submission');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ submissionId, reason }: { submissionId: string; reason: string }) =>
      rejectSubmission(submissionId, { rejection_reason: reason }),
    onSuccess: () => {
      toast.success('Submission rejected');
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-submission-stats'] });
      setShowRejectDialog(false);
      setSelectedSubmission(null);
      setRejectReason('');
    },
    onError: () => {
      toast.error('Failed to reject submission');
    },
  });

  const handleApprove = (submission: TemplateSubmission) => {
    approveMutation.mutate(submission.submission_id);
  };

  const handleReject = () => {
    if (selectedSubmission && rejectReason.trim()) {
      rejectMutation.mutate({ submissionId: selectedSubmission.submission_id, reason: rejectReason });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Template Submissions</CardTitle>
            <CardDescription>Review and moderate template submissions from users</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : submissions?.submissions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No {statusFilter} submissions found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template Name</TableHead>
                <TableHead>Submitted By</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Submitted At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions?.submissions.map((submission) => (
                <TableRow key={submission.submission_id}>
                  <TableCell className="font-medium">{submission.template_name}</TableCell>
                  <TableCell>{submission.submitter_email || submission.submitter_id.slice(0, 8)}</TableCell>
                  <TableCell>{submission.category_name || '-'}</TableCell>
                  <TableCell>{new Date(submission.submitted_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        submission.status === 'approved'
                          ? 'default'
                          : submission.status === 'rejected'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {submission.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {submission.status === 'pending' && (
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(submission)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedSubmission(submission);
                            setShowRejectDialog(true);
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {submissions && submissions.total > 20 && (
          <div className="flex items-center justify-center gap-4 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {Math.ceil(submissions.total / 20)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!submissions.has_more}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting "{selectedSubmission?.template_name}". This will be sent to the submitter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection Reason</Label>
              <Input
                id="reject-reason"
                placeholder="Enter reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Organizations Tab Component
function OrganizationsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [selectedOrg, setSelectedOrg] = useState<OrganizationAdminSummary | null>(null);
  const [newPlanTier, setNewPlanTier] = useState<PlanTier>('free');
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false);

  const { data: organizations, isLoading } = useQuery({
    queryKey: ['admin-organizations', search, planFilter, page],
    queryFn: () => listOrganizationsAdmin({
      page,
      page_size: 20,
      search: search || undefined,
      plan_tier: planFilter as PlanTier || undefined,
    }),
  });

  const changePlanMutation = useMutation({
    mutationFn: ({ orgId, planTier }: { orgId: string; planTier: PlanTier }) =>
      updateOrganizationPlanTier(orgId, { plan_tier: planTier }),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-platform-overview'] });
      setShowChangePlanDialog(false);
      setSelectedOrg(null);
    },
    onError: () => {
      toast.error('Failed to update plan tier');
    },
  });

  const handleChangePlan = () => {
    if (selectedOrg) {
      changePlanMutation.mutate({ orgId: selectedOrg.id, planTier: newPlanTier });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Manage organization accounts and plan tiers</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search organizations..."
                className="pl-8 w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : organizations?.items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No organizations found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plan Tier</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Agents</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations?.items.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        org.plan_tier === 'enterprise'
                          ? 'default'
                          : org.plan_tier === 'pro'
                          ? 'secondary'
                          : 'outline'
                      }
                    >
                      {org.plan_tier}
                    </Badge>
                  </TableCell>
                  <TableCell>{org.member_count}</TableCell>
                  <TableCell>{org.agent_count}</TableCell>
                  <TableCell>{new Date(org.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedOrg(org);
                        setNewPlanTier(org.plan_tier as PlanTier);
                        setShowChangePlanDialog(true);
                      }}
                    >
                      Change Plan
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {organizations && organizations.total > 20 && (
          <div className="flex items-center justify-center gap-4 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={!organizations.has_previous}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {organizations.total_pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!organizations.has_next}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>

      {/* Change Plan Dialog */}
      <Dialog open={showChangePlanDialog} onOpenChange={setShowChangePlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan Tier</DialogTitle>
            <DialogDescription>
              Update the plan tier for "{selectedOrg?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Plan Tier</Label>
              <Select value={newPlanTier} onValueChange={(v) => setNewPlanTier(v as PlanTier)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangePlanDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePlan} disabled={changePlanMutation.isPending}>
              Update Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Users Tab Component
function UsersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchEmail, setSearchEmail] = useState('');
  const [suspensionFilter, setSuspensionFilter] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<UserAdminSummary | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showUnsuspendDialog, setShowUnsuspendDialog] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users', searchEmail, suspensionFilter, page],
    queryFn: () => listUsersAdmin({
      page,
      page_size: 20,
      search_email: searchEmail || undefined,
      is_suspended: suspensionFilter === 'suspended' ? true : suspensionFilter === 'active' ? false : undefined,
    }),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      suspendUser(userId, { reason }),
    onSuccess: () => {
      toast.success('User suspended');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowSuspendDialog(false);
      setSelectedUser(null);
      setSuspendReason('');
    },
    onError: () => {
      toast.error('Failed to suspend user');
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: (userId: string) => unsuspendUser(userId),
    onSuccess: () => {
      toast.success('User unsuspended');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowUnsuspendDialog(false);
      setSelectedUser(null);
    },
    onError: () => {
      toast.error('Failed to unsuspend user');
    },
  });

  const handleSuspend = () => {
    if (selectedUser && suspendReason.trim()) {
      suspendMutation.mutate({ userId: selectedUser.id, reason: suspendReason });
    }
  };

  const handleUnsuspend = () => {
    if (selectedUser) {
      unsuspendMutation.mutate(selectedUser.id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>User Accounts</CardTitle>
            <CardDescription>Manage user accounts and suspensions</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email..."
                className="pl-8 w-64"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
              />
            </div>
            <Select value={suspensionFilter} onValueChange={setSuspensionFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Users</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="suspended">Suspended Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : users?.items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No users found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email || user.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    {user.is_suspended ? (
                      <Badge variant="destructive">Suspended</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    {user.is_suspended ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedUser(user);
                          setShowUnsuspendDialog(true);
                        }}
                      >
                        <UserCheck className="h-4 w-4 mr-1" />
                        Unsuspend
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setSelectedUser(user);
                          setShowSuspendDialog(true);
                        }}
                      >
                        <UserX className="h-4 w-4 mr-1" />
                        Suspend
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {users && users.total > 20 && (
          <div className="flex items-center justify-center gap-4 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={!users.has_previous}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {users.total_pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!users.has_next}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>

      {/* Suspend Dialog */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend User</DialogTitle>
            <DialogDescription>
              Suspend the account for "{selectedUser?.email || selectedUser?.id.slice(0, 8)}". They will not be able to log in until unsuspended.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="suspend-reason">Suspension Reason</Label>
              <Input
                id="suspend-reason"
                placeholder="Enter reason for suspension..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuspendDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSuspend}
              disabled={!suspendReason.trim() || suspendMutation.isPending}
            >
              Suspend User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsuspend Confirmation */}
      <AlertDialog open={showUnsuspendDialog} onOpenChange={setShowUnsuspendDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsuspend User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unsuspend "{selectedUser?.email || selectedUser?.id.slice(0, 8)}"? They will be able to log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnsuspend} disabled={unsuspendMutation.isPending}>
              Unsuspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// System Health Tab Component
function SystemHealthTab({
  health,
  loading,
}: {
  health?: SystemHealthMetrics;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>Current status of platform services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* API Health */}
            <div className="flex items-center gap-4 p-4 rounded-lg border">
              <div className={`p-2 rounded-full ${health?.api_healthy ? 'bg-green-100' : 'bg-red-100'}`}>
                {health?.api_healthy ? (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-600" />
                )}
              </div>
              <div>
                <p className="font-medium">API Service</p>
                <p className="text-sm text-muted-foreground">
                  {health?.api_healthy ? 'Healthy' : 'Unhealthy'}
                </p>
              </div>
            </div>

            {/* Database Health */}
            <div className="flex items-center gap-4 p-4 rounded-lg border">
              <div className={`p-2 rounded-full ${health?.database_healthy ? 'bg-green-100' : 'bg-red-100'}`}>
                {health?.database_healthy ? (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-600" />
                )}
              </div>
              <div>
                <p className="font-medium">Database</p>
                <p className="text-sm text-muted-foreground">
                  {health?.database_healthy ? 'Connected' : 'Disconnected'}
                </p>
              </div>
            </div>

            {/* Redis Health */}
            <div className="flex items-center gap-4 p-4 rounded-lg border">
              <div className={`p-2 rounded-full ${health?.redis_healthy ? 'bg-green-100' : 'bg-red-100'}`}>
                {health?.redis_healthy ? (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-600" />
                )}
              </div>
              <div>
                <p className="font-medium">Redis Cache</p>
                <p className="text-sm text-muted-foreground">
                  {health?.redis_healthy ? 'Connected' : 'Disconnected'}
                </p>
              </div>
            </div>

            {/* Active Runs */}
            <div className="flex items-center gap-4 p-4 rounded-lg border">
              <div className="p-2 rounded-full bg-blue-100">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">Active Agent Runs</p>
                <p className="text-sm text-muted-foreground">
                  {health?.active_agent_runs ?? 0} running
                </p>
              </div>
            </div>

            {/* Background Jobs */}
            <div className="flex items-center gap-4 p-4 rounded-lg border">
              <div className="p-2 rounded-full bg-purple-100">
                <Clock className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-medium">Background Jobs</p>
                <p className="text-sm text-muted-foreground">
                  {health?.background_jobs_pending ?? 0} pending
                </p>
              </div>
            </div>

            {/* Response Time */}
            <div className="flex items-center gap-4 p-4 rounded-lg border">
              <div className="p-2 rounded-full bg-orange-100">
                <Zap className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="font-medium">Avg Response Time</p>
                <p className="text-sm text-muted-foreground">
                  {health?.avg_response_time_ms ? `${health.avg_response_time_ms.toFixed(0)}ms` : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
