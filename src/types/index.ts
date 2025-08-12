import type { GrafanaMetricData } from '../services/GrafanaService';
// Type definitions for the Alert Context Agent

export interface AlertDetails {
  alertname: string;
  container: string;
  ct_cluster: string;
  namespace: string;
  pod: string;
  target: string;
  team: string;
  [key: string]: string; // Allow additional dynamic properties
}

export interface Alert {
  status: 'FIRING' | 'RESOLVED';
  alertTitle: string;
  alert: string;
  description: string;
  details: AlertDetails;
}

export interface ParsedAlert {
  alertname: string;
  status: 'FIRING' | 'RESOLVED';
  description: string;
  labels: AlertDetails;
  rawAlert: Alert;
}

export interface AlertRule {
  name: string;
  expression: string;
  duration: string;
  description: string;
  summary: string;
  target: string;
  labels: {
    severity?: 'critical' | 'warning' | 'info';
    [key: string]: string | undefined;
  };
  annotations: {
    summary?: string;
    description?: string;
    runbook_url?: string;
    dashboard_url?: string;
    [key: string]: string | undefined;
  };
}

export interface GitHubSearchResult {
  found: boolean;
  source: 'github' | 'mock' | 'error' | 'none';
  file?: string;
  url?: string;
  rule?: AlertRule;
  message?: string;
  error?: string;
  searchedFiles?: string[];
  total_count?: number;
}

export interface GitHubFileResult {
  content: string;
  url: string;
  path: string;
}

export interface GitHubApiResponse {
  content: string;
  encoding: string;
  html_url: string;
  path: string;
}

export interface GitHubSearchApiResponse {
  total_count: number;
  items: GitHubSearchItem[];
}

export interface GitHubSearchItem {
  name: string;
  path: string;
  html_url: string;
  repository: {
    name: string;
    full_name: string;
  };
}

export interface Config {
  github: {
    owner: string;
    repo: string;
    token?: string;
  };
  openai: {
    apiKey?: string;
  };
  elasticsearch: {
    url?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    indexPattern: string;
    timeout: number;
  };
  grafana?: {
    url?: string;
    apiKey?: string;
    timeout: number;
  };
  knownAlertFiles: string[];
}

export interface ContextOutput {
  alertname: string;
  status: 'FIRING' | 'RESOLVED';
  description: string;
  found: boolean;
  source?: 'github' | 'mock' | 'error' | 'none';
  file?: string;
  url?: string;
  rule?: AlertRule;
  instanceDetails: Record<string, string>;
  // Structured fields for GUI consumption
  lastLogs?: ElasticLogEntry[];
  lastErrorLogs?: ElasticLogEntry[];
  lastTimeDebuggerLogs?: ElasticLogEntry[];
  lastSlowRequestLogs?: ElasticLogEntry[];
  alertExpressionExplanation?: string;
  analysisText?: string;
  // Backward-compatibility for legacy CLI/demo printing
  formattedContext?: string;
}

// Simple types only - no complex pipeline types

// Utility types
export type SeverityLevel = 'critical' | 'warning' | 'info';
export type AlertStatus = 'FIRING' | 'RESOLVED';
export type SearchSource = 'github' | 'mock' | 'error' | 'none';

// Grafana/Prometheus types (moved to GrafanaService.ts)
// Re-export for backwards compatibility
export type { MetricValue, MetricSeries, PrometheusQueryResult, GrafanaMetricData } from '../services/GrafanaService';

export interface MetricsContext {
  alertMetric?: GrafanaMetricData;
  relatedMetrics: GrafanaMetricData[];
  timeframe: {
    start: Date;
    end: Date;
    duration: string;
  };
}

// Log entry shape for UI consumption
export interface ElasticLogEntry {
  timestamp: string;
  level: string;
  message: string;
  pod?: string;
  container?: string;
  namespace?: string;
  source?: string;
  service?: string;
  module?: string;
  environment?: string;
  applicationName?: string;
  [key: string]: any;
}

// Shared config types for API and services
export interface ElasticSettings {
  timeframeMinutes: number;
  documentLimit: number;
  slowRequestThreshold: number;
}

export interface LogTypes {
  general: boolean;
  error: boolean;
  slow: boolean;
  timeDebugger: boolean;
}
