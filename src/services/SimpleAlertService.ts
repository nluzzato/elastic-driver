import { Alert, Config, ContextOutput } from '../types';
import { GitHubService } from './GitHubService';
import { OpenAIQueryService } from './OpenAIQueryService';
import { ElasticsearchService, LogEntry } from './ElasticsearchService';
import { GrafanaService } from './GrafanaService';
import { PresetBehavior } from '../config/application';

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
   * Supports special behaviors like reset investigation
   */
  async processAlert(
    alert: Alert, 
    elasticSettings?: { timeframeMinutes: number; documentLimit: number; slowRequestThreshold: number },
    logTypes?: { general: boolean; error: boolean; slow: boolean; timeDebugger: boolean },
    specialBehavior?: PresetBehavior
  ): Promise<ContextOutput> {
    const alertname = alert.details?.alertname || 'Unknown';
    
    console.log(`🔍 Processing alert: ${alertname}`);
    
    // Get GitHub expression data
    const githubResult = await this.githubService.searchForAlert(alertname);
    
    // Get OpenAI explanation if we found a rule and OpenAI is enabled
    let aiExplanation: string | undefined;
    if (alertname && alertname !== 'Unknown' && alertname !== '' && githubResult.found && githubResult.rule && this.openaiService.isEnabled()) {
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
    } else if (!alertname || alertname === 'Unknown' || alertname === '') {
      aiExplanation = 'No alert data provided';
    }
    
    // Handle special behaviors
    let resetInvestigationData: any = null;
    const podName = alert.details?.pod;
    
    if (specialBehavior === PresetBehavior.RESET_INVESTIGATION && podName) {
      resetInvestigationData = await this.performResetInvestigation(podName, elasticSettings);
    }
    
    // Get logs from Elasticsearch if enabled and we have a pod name
    let logs: LogEntry[] = [];
    let errorLogs: LogEntry[] = [];
    let timeDebuggerLogs: LogEntry[] = [];
    let slowRequestLogs: LogEntry[] = [];
    
    if (podName && this.elasticsearchService.isEnabled()) {
      try {
        const limit = elasticSettings?.documentLimit || 100;
        const slowThreshold = elasticSettings?.slowRequestThreshold || 1;
        const timeframeMinutes = elasticSettings?.timeframeMinutes;
        
        console.log(`📊 Using Elasticsearch settings: ${limit} docs, ${slowThreshold}s slow threshold, ${timeframeMinutes || 'no'} timeframe`);
        
        // Fetch general logs, error logs, TIME_DEBUGGER logs, and slow request logs in parallel
        [logs, errorLogs, timeDebuggerLogs, slowRequestLogs] = await Promise.all([
          this.elasticsearchService.getLastLogsForPod(podName, limit, undefined, undefined, timeframeMinutes),
          this.elasticsearchService.getLastLogsForPod(podName, limit, 'ERROR', undefined, timeframeMinutes),
          this.elasticsearchService.getLastLogsForPod(podName, limit, undefined, '[TIME_DEBUGGER] [SLOW]', timeframeMinutes),
          this.elasticsearchService.getLastSlowRequestLogsForPod(podName, limit, slowThreshold, timeframeMinutes)
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
   * Get all logs for a specific request ID (public wrapper)
   */
  async getRequestTrace(requestId: string, maxDocs: number = 1000): Promise<any[]> {
    return await this.elasticsearchService.getAllLogsByRequestId(requestId, maxDocs);
  }

  /**
   * Generate contextual debugging prompt (public wrapper)
   */
  async generateDebugPrompt(requestId: string, documents: any[], customPrompt?: string): Promise<string> {
    return await this.openaiService.generateContextualDebugPrompt(requestId, documents, customPrompt);
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

  /**
   * Perform reset investigation: find Git commit logs and get logs since pod initialization
   */
  private async performResetInvestigation(podName: string, elasticSettings?: { timeframeMinutes: number; documentLimit: number; slowRequestThreshold: number }) {
    console.log(`🔄 Starting reset investigation for pod: ${podName}`);
    
    try {
      // Step 1: Search for Git commit logs
      const timeframeMinutes = elasticSettings?.timeframeMinutes || 240;
      const commitLogs = await this.elasticsearchService.findGitCommitLogs(podName, timeframeMinutes);
      
      if (commitLogs.length === 0) {
        console.warn(`⚠️  No Git commit logs found for pod ${podName} in last ${timeframeMinutes} minutes`);
        return {
          found: false,
          message: `No Git commit logs found for pod ${podName} in the specified timeframe`,
          logs: [],
          commitInfo: null
        };
      }
      
      // Step 2: Use the first (most recent) or second commit timestamp as start time
      const targetCommit = commitLogs[0]; // Use most recent commit
      const startTimestamp = targetCommit.timestamp;
      const commitHash = targetCommit.commitHash;
      
      console.log(`📍 Using commit ${commitHash} at ${startTimestamp} as reset investigation start point`);
      
      // Step 3: Get GitHub commit details
      let commitInfo = null;
      if (this.githubService.isEnabled() && commitHash) {
        commitInfo = await this.githubService.getCommitDetails(commitHash);
      }
      
      // Step 4: Get all logs since that timestamp
      const limit = elasticSettings?.documentLimit || 500;
      const logsSinceReset = await this.elasticsearchService.getLogsSinceTimestamp(podName, startTimestamp, limit);
      
      console.log(`✅ Reset investigation complete: ${logsSinceReset.length} logs since commit ${commitHash}`);
      
      return {
        found: true,
        startTimestamp,
        commitHash,
        commitInfo,
        logs: logsSinceReset,
        logCount: logsSinceReset.length,
        message: `Found ${logsSinceReset.length} logs since pod initialization (commit ${commitHash})`
      };
      
    } catch (error) {
      console.error('❌ Error during reset investigation:', error);
      return {
        found: false,
        error: error.message,
        logs: [],
        commitInfo: null
      };
    }
  }
}
