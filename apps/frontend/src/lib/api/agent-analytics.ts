/**
 * Agent Analytics API Client
 *
 * Part of US-029: Agent performance monitoring.
 * Provides functions for fetching agent performance analytics data.
 */

import { backendApi } from '../api-client';

// Types

export interface AgentPerformanceStats {
  agent_id: string;
  agent_name: string;
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  stopped_runs: number;
  success_rate: number;
  avg_duration_seconds: number;
  total_cost_usd: number;
  total_tokens: number;
  total_tool_execution_ms: number;
}

export interface AgentRunTimelinePoint {
  date: string;
  total_runs: number;
  success_count: number;
  failure_count: number;
  stopped_count: number;
}

export interface AgentRunsTimelineResponse {
  agent_id: string;
  data: AgentRunTimelinePoint[];
  days: number;
}

export interface SlowToolStats {
  tool_name: string;
  execution_count: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  min_duration_ms: number;
  total_duration_ms: number;
  error_count: number;
}

export interface SlowestToolsResponse {
  agent_id: string;
  tools: SlowToolStats[];
  days: number;
}

export interface AgentRunLogEntry {
  run_id: string;
  thread_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  error: string | null;
  model_name: string | null;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  tool_execution_ms: number;
  metadata: Record<string, unknown>;
}

export interface AgentRunLogsExport {
  agent_id: string;
  agent_name: string;
  runs: AgentRunLogEntry[];
  total_count: number;
  exported_at: string;
  period_start: string | null;
  period_end: string | null;
}

export interface ToolExecutionDetail {
  id: string;
  agent_run_id: string;
  tool_name: string;
  tool_call_id: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  input_summary: string | null;
  output_summary: string | null;
  metadata: Record<string, unknown>;
}

export interface ToolExecutionsResponse {
  agent_id: string;
  executions: ToolExecutionDetail[];
  total_count: number;
  page: number;
  page_size: number;
}

export interface AgentAnalyticsDashboard {
  stats: AgentPerformanceStats;
  runs_timeline: AgentRunsTimelineResponse;
  slowest_tools: SlowestToolsResponse;
}

// Helper to build query string
function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );
  if (entries.length === 0) return '';
  const queryString = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `?${queryString}`;
}

// API Functions

/**
 * Get full analytics dashboard for an agent.
 */
export async function getAgentAnalyticsDashboard(
  agentId: string,
  days: number = 30
): Promise<AgentAnalyticsDashboard> {
  const query = buildQueryString({ days });
  return backendApi.get<AgentAnalyticsDashboard>(`/agents/${agentId}/analytics${query}`);
}

/**
 * Get performance statistics for an agent.
 */
export async function getAgentStats(
  agentId: string,
  days: number = 30
): Promise<AgentPerformanceStats> {
  const query = buildQueryString({ days });
  return backendApi.get<AgentPerformanceStats>(`/agents/${agentId}/analytics/stats${query}`);
}

/**
 * Get runs timeline chart data for an agent.
 */
export async function getAgentRunsTimeline(
  agentId: string,
  days: number = 30
): Promise<AgentRunsTimelineResponse> {
  const query = buildQueryString({ days });
  return backendApi.get<AgentRunsTimelineResponse>(`/agents/${agentId}/analytics/timeline${query}`);
}

/**
 * Get slowest tool executions for an agent.
 */
export async function getAgentSlowestTools(
  agentId: string,
  days: number = 30,
  limit: number = 10
): Promise<SlowestToolsResponse> {
  const query = buildQueryString({ days, limit });
  return backendApi.get<SlowestToolsResponse>(`/agents/${agentId}/analytics/tools${query}`);
}

/**
 * Export agent run logs as JSON for debugging.
 */
export async function exportAgentRunLogs(
  agentId: string,
  days: number = 30
): Promise<AgentRunLogsExport> {
  const query = buildQueryString({ days });
  return backendApi.get<AgentRunLogsExport>(`/agents/${agentId}/analytics/logs/export${query}`);
}

/**
 * Get detailed tool execution records for an agent.
 */
export async function getToolExecutions(
  agentId: string,
  days: number = 30,
  page: number = 1,
  pageSize: number = 50
): Promise<ToolExecutionsResponse> {
  const query = buildQueryString({ days, page, page_size: pageSize });
  return backendApi.get<ToolExecutionsResponse>(`/agents/${agentId}/analytics/tool-executions${query}`);
}

/**
 * Download agent run logs as a JSON file.
 */
export async function downloadAgentRunLogs(agentId: string, days: number = 30): Promise<void> {
  try {
    const data = await exportAgentRunLogs(agentId, days);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-runs-${data.agent_name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download agent run logs:', error);
    throw error;
  }
}
