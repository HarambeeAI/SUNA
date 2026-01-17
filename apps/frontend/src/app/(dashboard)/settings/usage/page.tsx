'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  Bot,
  Download,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getUsageDashboard,
  downloadUsageCsv,
  type DashboardResponse,
} from '@/lib/api/organizations';

// Helper functions for color-coded usage indicators
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

const getUsageWarning = (percent: number): { level: 'info' | 'warning' | 'error'; message: string } | null => {
  if (percent >= 100) {
    return { level: 'error', message: 'You have reached your plan limit. Upgrade to continue.' };
  }
  if (percent >= 80) {
    return { level: 'warning', message: 'You are approaching your plan limit.' };
  }
  return null;
};

export default function UsageDashboardPage() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get('org');
  const [isExporting, setIsExporting] = useState(false);

  // Fetch dashboard data
  const { data: dashboard, isLoading, error } = useQuery<DashboardResponse | null>({
    queryKey: ['usage-dashboard', orgId],
    queryFn: () => (orgId ? getUsageDashboard(orgId) : Promise.resolve(null)),
    enabled: !!orgId,
    refetchInterval: 60000, // Refresh every minute
  });

  const handleExportCsv = async () => {
    if (!orgId) return;
    setIsExporting(true);
    try {
      await downloadUsageCsv(orgId);
    } finally {
      setIsExporting(false);
    }
  };

  if (!orgId) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Organization Selected</AlertTitle>
          <AlertDescription>
            Please select an organization to view usage analytics.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Dashboard</AlertTitle>
          <AlertDescription>
            Failed to load usage data. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { stats, runs_timeline, top_agents, active_users } = dashboard;

  // Format timeline data for chart
  const timelineData = runs_timeline.data.map((point) => ({
    date: format(new Date(point.date), 'MMM d'),
    runs: point.run_count,
    success: point.success_count,
    failure: point.failure_count,
  }));

  // Format agent data for chart
  const agentData = top_agents.agents.map((agent) => ({
    name: agent.agent_name.length > 15 ? `${agent.agent_name.substring(0, 15)}...` : agent.agent_name,
    fullName: agent.agent_name,
    runs: agent.run_count,
    successRate: agent.success_rate ?? 100,
  }));

  // Check for usage warnings
  const agentsWarning = getUsageWarning(stats.agents_percent);
  const runsWarning = getUsageWarning(stats.runs_percent);

  return (
    <div className="container mx-auto max-w-6xl px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{stats.org_name} - Usage Dashboard</h1>
          <p className="text-muted-foreground">
            {stats.period_start && stats.period_end && (
              <>
                Billing period: {format(new Date(stats.period_start), 'MMM d, yyyy')} -{' '}
                {format(new Date(stats.period_end), 'MMM d, yyyy')}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {stats.plan_display_name}
          </Badge>
          <Button onClick={handleExportCsv} disabled={isExporting} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Warnings */}
      {(agentsWarning || runsWarning) && (
        <div className="space-y-2">
          {agentsWarning && (
            <Alert variant={agentsWarning.level === 'error' ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Agent Limit {agentsWarning.level === 'error' ? 'Reached' : 'Warning'}</AlertTitle>
              <AlertDescription>{agentsWarning.message}</AlertDescription>
            </Alert>
          )}
          {runsWarning && (
            <Alert variant={runsWarning.level === 'error' ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Run Limit {runsWarning.level === 'error' ? 'Reached' : 'Warning'}</AlertTitle>
              <AlertDescription>{runsWarning.message}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Agents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_agents}</div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className={getUsageColor(stats.agents_percent)}>
                  {stats.agents_percent.toFixed(1)}% of limit
                </span>
                <span>{stats.agent_limit === null ? 'Unlimited' : `${stats.total_agents}/${stats.agent_limit}`}</span>
              </div>
              <Progress
                value={Math.min(stats.agents_percent, 100)}
                className={`h-1 ${getProgressColor(stats.agents_percent)}`}
              />
            </div>
          </CardContent>
        </Card>

        {/* Active Agents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active_agents}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Used in last 30 days
            </p>
          </CardContent>
        </Card>

        {/* Total Runs This Month */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Runs This Month</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_runs_month.toLocaleString()}</div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className={getUsageColor(stats.runs_percent)}>
                  {stats.runs_percent.toFixed(1)}% of limit
                </span>
                <span>
                  {stats.run_limit_monthly === null
                    ? 'Unlimited'
                    : `${stats.total_runs_month.toLocaleString()}/${stats.run_limit_monthly.toLocaleString()}`}
                </span>
              </div>
              <Progress
                value={Math.min(stats.runs_percent, 100)}
                className={`h-1 ${getProgressColor(stats.runs_percent)}`}
              />
            </div>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{active_users.users.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              With runs in last 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Runs Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Agent Runs Over Time
            </CardTitle>
            <CardDescription>Daily runs for the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="runs"
                    name="Total Runs"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="success"
                    name="Successful"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="failure"
                    name="Failed"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Agents Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Top 10 Most Active Agents
            </CardTitle>
            <CardDescription>Agents by run count (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {agentData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No agent activity in this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 10 }}
                      width={100}
                    />
                    <Tooltip
                      formatter={(value, name, props) => [
                        value,
                        name === 'runs' ? 'Runs' : 'Success Rate %',
                      ]}
                      labelFormatter={(label) => {
                        const agent = agentData.find((a) => a.name === label);
                        return agent?.fullName || label;
                      }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                      }}
                    />
                    <Bar dataKey="runs" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Most Active Users
          </CardTitle>
          <CardDescription>Team members by run count (last 30 days)</CardDescription>
        </CardHeader>
        <CardContent>
          {active_users.users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No user activity in this period
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                  <TableHead className="text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active_users.users.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell className="font-mono text-xs">
                      {user.user_id.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {user.run_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.success_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {user.last_active
                        ? format(new Date(user.last_active), 'MMM d, h:mm a')
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
