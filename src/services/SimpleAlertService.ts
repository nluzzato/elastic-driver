import { Alert, Config, ContextOutput } from '../types';
import { GitHubService } from './GitHubService';
import { OpenAIQueryService } from './OpenAIQueryService';
import { ElasticsearchService, LogEntry } from './ElasticsearchService';
import { GrafanaService } from './GrafanaService';

/**
 * Simple Alert Service - Just GitHub expression enrichment
 */
export class SimpleAlertService {
  private githubService: GitHubService;
  private openaiService: OpenAIQueryService;
  private elasticsearchService: ElasticsearchService;
  private grafanaService: GrafanaService;

  constructor(config: Config) {
    this.githubService = new GitHubService(config);
    this.openaiService = new OpenAIQueryService(config);
    this.elasticsearchService = new ElasticsearchService(config);
    this.grafanaService = new GrafanaService(config);
  }

  /**
   * Process an alert and enrich it with GitHub expression data
   */
  async processAlert(alert: Alert): Promise<ContextOutput> {
    const alertname = alert.details?.alertname || 'Unknown';
    
    console.log(`🔍 Processing alert: ${alertname}`);
    
    // Get GitHub expression data
    const githubResult = await this.githubService.searchForAlert(alertname);
    
    // Get OpenAI explanation if we found a rule and OpenAI is enabled
    let aiExplanation: string | undefined;
    if (githubResult.found && githubResult.rule && this.openaiService.isEnabled()) {
      try {
        aiExplanation = await this.openaiService.explainPrometheusQuery(
          githubResult.rule.expression,
          alertname,
          {
            duration: githubResult.rule.duration,
            severity: githubResult.rule.labels?.severity,
            description: githubResult.rule.description
          }
        );
      } catch (error) {
        console.warn('⚠️  Failed to get OpenAI explanation:', error);
      }
    }
    
    // Get logs from Elasticsearch if enabled and we have a pod name
    let logs: LogEntry[] = [];
    let errorLogs: LogEntry[] = [];
    let timeDebuggerLogs: LogEntry[] = [];
    let slowRequestLogs: LogEntry[] = [];
    const podName = alert.details?.pod;
    if (podName && this.elasticsearchService.isEnabled()) {
      try {
        // Fetch general logs, error logs, TIME_DEBUGGER logs, and slow request logs in parallel
        [logs, errorLogs, timeDebuggerLogs, slowRequestLogs] = await Promise.all([
          this.elasticsearchService.getLastLogsForPod(podName, 100),
          this.elasticsearchService.getLastLogsForPod(podName, 100, 'ERROR'),
          this.elasticsearchService.getLastLogsForPod(podName, 100, undefined, '[TIME_DEBUGGER] [SLOW]'),
          this.elasticsearchService.getLastSlowRequestLogsForPod(podName, 100, 1)
        ]);
      } catch (error) {
        console.warn('⚠️  Failed to fetch logs from Elasticsearch:', error);
      }
    }
    
    // Get AI analysis of logs if we have data (with or without alert explanation)
    let aiAnalysis: string | undefined;
    if (this.openaiService.isEnabled() && (logs.length > 0 || errorLogs.length > 0 || timeDebuggerLogs.length > 0 || slowRequestLogs.length > 0)) {
      try {
        aiAnalysis = await this.openaiService.analyzeAlertWithLogs(
          alertname,
          aiExplanation, // Can be undefined if no alert found
          logs,
          errorLogs,
          timeDebuggerLogs,
          slowRequestLogs
        );
      } catch (error) {
        console.warn('⚠️  Failed to get OpenAI analysis:', error);
      }
    }
    
    // Create context output
    const context: ContextOutput = {
      alertname,
      status: alert.status as 'FIRING' | 'RESOLVED',
      description: alert.description || alert.alert || 'No description',
      found: githubResult.found,
      source: githubResult.source,
      file: githubResult.file,
      url: githubResult.url,
      rule: githubResult.rule,
      instanceDetails: alert.details || {},

      lastLogs: logs,
      lastErrorLogs: errorLogs,
      lastTimeDebuggerLogs: timeDebuggerLogs,
      lastSlowRequestLogs: slowRequestLogs,
      alertExpressionExplanation: aiExplanation,
      analysisText: aiAnalysis
    };

    return context;
  }



  /**
   * Test GitHub connectivity
   */
  async healthCheck(): Promise<boolean> {
    return await this.githubService.testRepositoryAccess();
  }

  /**
   * Test all services (GitHub + OpenAI + Elasticsearch + Grafana)
   */
  async fullHealthCheck(): Promise<{ github: boolean; openai: boolean; elasticsearch: boolean; grafana: boolean }> {
    const [github, openai, elasticsearch, grafana] = await Promise.all([
      this.githubService.testRepositoryAccess(),
      this.openaiService.healthCheck(),
      this.elasticsearchService.healthCheck(),
      this.grafanaService.healthCheck()
    ]);

    return { github, openai, elasticsearch, grafana };
  }


}
