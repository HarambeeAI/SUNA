'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, AlertCircle, CheckCircle2, XCircle, StopCircle, Clock, DollarSign, Zap, Activity } from 'lucide-react';
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
import {
  getAgentAnalyticsDashboard,
  downloadAgentRunLogs,
  type AgentAnalyticsDashboard,
} from '@/lib/api/agent-analytics';
import { toast } from '@/lib/toast';

interface AnalyticsScreenProps {
  agentId: string;
}

export function AnalyticsScreen({ agentId }: AnalyticsScreenProps) {
  const [days, setDays] = useState(30);
  const [isExporting, setIsExporting] = useState(false);

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['agent-analytics', agentId, days],
    queryFn: () => getAgentAnalyticsDashboard(agentId, days),
    refetchInterval: 60000, // Refresh every minute
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadAgentRunLogs(agentId, days);
      toast.success('Run logs exported successfully');
    } catch (err) {
      toast.error('Failed to export run logs');
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading analytics</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load analytics data'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No data available</AlertTitle>
          <AlertDescription>
            No analytics data is available for this agent yet. Run the agent to start collecting data.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { stats, runs_timeline, slowest_tools } = dashboard;

  // Format timeline data for chart
  const timelineChartData = runs_timeline.data.map((point) => ({
    date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    success: point.success_count,
    failed: point.failure_count,
    stopped: point.stopped_count,
    total: point.total_runs,
  }));

  // Format tool data for chart
  const toolsChartData = slowest_tools.tools.map((tool) => ({
    name: tool.tool_name.length > 20 ? tool.tool_name.slice(0, 20) + '...' : tool.tool_name,
    fullName: tool.tool_name,
    avgDuration: tool.avg_duration_ms,
    executions: tool.execution_count,
    errors: tool.error_count,
  }));

  return (
    <div className="flex-1 overflow-y-auto p-1 space-y-6">
      {/* Header with filters and export */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Performance Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Monitor runs, success rates, and identify bottlenecks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export JSON'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total Runs"
          value={stats.total_runs}
          icon={<Activity className="h-4 w-4" />}
          description={`${stats.completed_runs} completed`}
        />
        <StatsCard
          title="Success Rate"
          value={`${stats.success_rate.toFixed(1)}%`}
          icon={
            stats.success_rate >= 90 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : stats.success_rate >= 70 ? (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )
          }
          description={`${stats.failed_runs} failed, ${stats.stopped_runs} stopped`}
          valueColor={
            stats.success_rate >= 90
              ? 'text-green-600'
              : stats.success_rate >= 70
                ? 'text-yellow-600'
                : 'text-red-600'
          }
        />
        <StatsCard
          title="Avg Duration"
          value={formatDuration(stats.avg_duration_seconds)}
          icon={<Clock className="h-4 w-4" />}
          description={`${formatDuration(stats.total_tool_execution_ms / 1000)} in tools`}
        />
        <StatsCard
          title="Total Cost"
          value={`$${stats.total_cost_usd.toFixed(4)}`}
          icon={<DollarSign className="h-4 w-4" />}
          description={`${formatTokens(stats.total_tokens)} tokens`}
        />
      </div>

      {/* Runs Timeline Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runs Over Time</CardTitle>
          <CardDescription>
            Daily run counts with success/failure breakdown
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timelineChartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No run data available for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="success"
                  stroke="#22c55e"
                  strokeWidth={2}
                  name="Success"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="Failed"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="stopped"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Stopped"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Slowest Tools Table & Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Slowest Tool Executions
          </CardTitle>
          <CardDescription>
            Tools sorted by average execution time - identify bottlenecks
          </CardDescription>
        </CardHeader>
        <CardContent>
          {toolsChartData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              No tool execution data available. Tool tracking starts after running the agent.
            </div>
          ) : (
            <>
              {/* Bar Chart */}
              <div className="mb-6">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={toolsChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value.toFixed(0)}ms`, 'Avg Duration']}
                      labelFormatter={(label: string, payload) => {
                        if (payload && payload[0]) {
                          return payload[0].payload.fullName;
                        }
                        return label;
                      }}
                    />
                    <Bar dataKey="avgDuration" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool Name</TableHead>
                    <TableHead className="text-right">Executions</TableHead>
                    <TableHead className="text-right">Avg Duration</TableHead>
                    <TableHead className="text-right">Max Duration</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slowest_tools.tools.map((tool) => (
                    <TableRow key={tool.tool_name}>
                      <TableCell className="font-mono text-sm">{tool.tool_name}</TableCell>
                      <TableCell className="text-right">{tool.execution_count}</TableCell>
                      <TableCell className="text-right">{tool.avg_duration_ms.toFixed(0)}ms</TableCell>
                      <TableCell className="text-right">{tool.max_duration_ms}ms</TableCell>
                      <TableCell className="text-right">
                        {tool.error_count > 0 ? (
                          <Badge variant="destructive">{tool.error_count}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Summary Alerts */}
      {stats.total_runs > 0 && (
        <div className="space-y-3">
          {stats.success_rate < 70 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Low Success Rate</AlertTitle>
              <AlertDescription>
                Your agent has a success rate of {stats.success_rate.toFixed(1)}%. Consider reviewing
                the error logs and adjusting instructions.
              </AlertDescription>
            </Alert>
          )}
          {slowest_tools.tools.some((t) => t.avg_duration_ms > 10000) && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertTitle>Slow Tools Detected</AlertTitle>
              <AlertDescription>
                Some tools are averaging over 10 seconds. This may impact user experience.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

// Stats Card Component
interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  valueColor?: string;
}

function StatsCard({ title, value, icon, description, valueColor }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{title}</span>
          {icon}
        </div>
        <div className={`text-2xl font-bold mt-2 ${valueColor || ''}`}>{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Skeleton Loading State
function AnalyticsSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-1 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-24 mt-2" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

// Helper functions
function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}
