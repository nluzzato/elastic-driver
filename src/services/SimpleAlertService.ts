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
    specialBehavior?: PresetBehavior,
    presetConfig?: { gitHubRepo?: string }
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
      console.log(`🔄 Triggering reset investigation for pod: ${podName} with behavior: ${specialBehavior}`);
      console.log(`🔄 Using GitHub repo: ${presetConfig?.gitHubRepo || 'default'}`);
      resetInvestigationData = await this.performResetInvestigation(podName, elasticSettings, presetConfig);
      console.log(`🔄 Reset investigation result:`, resetInvestigationData?.found ? 'SUCCESS' : 'FAILED');
      if (!resetInvestigationData?.found) {
        console.log(`🔄 Reset investigation details:`, {
          found: resetInvestigationData?.found,
          message: resetInvestigationData?.message,
          error: resetInvestigationData?.error,
          logCount: resetInvestigationData?.logs?.length || 0
        });
      }
    } else {
      console.log(`ℹ️  Standard processing - behavior: ${specialBehavior}, pod: ${podName}`);
    }
    
    // Get logs from Elasticsearch if enabled and we have a pod name
    let logs: LogEntry[] = [];
    let errorLogs: LogEntry[] = [];
    let timeDebuggerLogs: LogEntry[] = [];
    let slowRequestLogs: LogEntry[] = [];
    
    if (podName && this.elasticsearchService.isEnabled()) {
      try {
        // For reset investigation, use the logs from the reset investigation
        if (specialBehavior === PresetBehavior.RESET_INVESTIGATION && resetInvestigationData?.found) {
          console.log(`🔄 Using reset investigation logs: ${resetInvestigationData.logs.length} logs since commit ${resetInvestigationData.commitHash}`);
          logs = resetInvestigationData.logs;
          // For reset investigation, we focus on general and error logs from the reset data
          errorLogs = resetInvestigationData.logs.filter((log: LogEntry) => log.level === 'ERROR');
          timeDebuggerLogs = []; // Not needed for reset investigation
          slowRequestLogs = []; // Not needed for reset investigation
        } else {
          // Standard log fetching for other presets (honor logTypes)
          const limit = elasticSettings?.documentLimit || 100;
          const slowThreshold = elasticSettings?.slowRequestThreshold || 1;
          const timeframeMinutes = elasticSettings?.timeframeMinutes;

          console.log(`📊 Using Elasticsearch settings: ${limit} docs, ${slowThreshold}s slow threshold, ${timeframeMinutes || 'no'} timeframe`);

          const logPromises: Array<{ type: 'general'|'error'|'timeDebugger'|'slow'; promise: Promise<LogEntry[]> }> = [];
          if (!logTypes || logTypes.general) {
            logPromises.push({ type: 'general', promise: this.elasticsearchService.getLastLogsForPod(podName, limit, undefined, undefined, timeframeMinutes) });
          }
          if (!logTypes || logTypes.error) {
            logPromises.push({ type: 'error', promise: this.elasticsearchService.getLastLogsForPod(podName, limit, 'ERROR', undefined, timeframeMinutes) });
          }
          if (!logTypes || logTypes.timeDebugger) {
            logPromises.push({ type: 'timeDebugger', promise: this.elasticsearchService.getLastLogsForPod(podName, limit, undefined, '[TIME_DEBUGGER] [SLOW]', timeframeMinutes) });
          }
          if (!logTypes || logTypes.slow) {
            logPromises.push({ type: 'slow', promise: this.elasticsearchService.getLastSlowRequestLogsForPod(podName, limit, slowThreshold, timeframeMinutes) });
          }

          const results = await Promise.all(logPromises.map(p => p.promise));
          const logResults: Record<'general'|'error'|'timeDebugger'|'slow', LogEntry[]> = {
            general: [],
            error: [],
            timeDebugger: [],
            slow: []
          };
          logPromises.forEach((item, index) => {
            logResults[item.type] = results[index];
          });
          logs = logResults.general;
          errorLogs = logResults.error;
          timeDebuggerLogs = logResults.timeDebugger;
          slowRequestLogs = logResults.slow;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn('⚠️  Failed to fetch logs from Elasticsearch:', message);
      }
    }
    
    // Get AI analysis of logs if we have data (with or without alert explanation)
    let aiAnalysis: string | undefined;
    console.log(`🤖 AI Analysis check: OpenAI enabled: ${this.openaiService.isEnabled()}, logs: ${logs.length}, errors: ${errorLogs.length}, time: ${timeDebuggerLogs.length}, slow: ${slowRequestLogs.length}`);
    
    // For reset investigation, always try to provide analysis even with 0 logs since the commit/PR info is valuable
    const hasLogsOrIsResetInvestigation = (logs.length > 0 || errorLogs.length > 0 || timeDebuggerLogs.length > 0 || slowRequestLogs.length > 0) || 
                                          (specialBehavior === PresetBehavior.RESET_INVESTIGATION && resetInvestigationData?.found);
    
    if (this.openaiService.isEnabled() && hasLogsOrIsResetInvestigation) {
      try {
        // For reset investigation, include commit and PR information in the analysis
        if (specialBehavior === PresetBehavior.RESET_INVESTIGATION && resetInvestigationData?.found) {
          let commitContext = `Reset Investigation Context:\n- Pod restarted after commit: ${resetInvestigationData.commitHash}`;
          
          if (resetInvestigationData.commitInfo) {
            commitContext += `\n- Commit: "${resetInvestigationData.commitInfo.title}" by ${resetInvestigationData.commitInfo.author}`;
          }
          
          if (resetInvestigationData.prInfo) {
            commitContext += `\n- Pull Request: #${resetInvestigationData.prInfo.prNumber} - "${resetInvestigationData.prInfo.title}"`;
            commitContext += `\n- PR URL: ${resetInvestigationData.prInfo.url}`;
            commitContext += `\n\nCode Changes (PR Diff):\n\`\`\`diff\n${resetInvestigationData.prInfo.diff.substring(0, 8000)}\n\`\`\``;
            if (resetInvestigationData.prInfo.diff.length > 8000) {
              commitContext += `\n\n(Diff truncated - showing first 8000 characters)`;
            }
          }
          
          commitContext += `\n- Analyzing ${resetInvestigationData.logCount} logs since ${resetInvestigationData.startTimestamp}`;
          
          aiAnalysis = await this.openaiService.analyzeAlertWithLogs(
            'Pod Reset Investigation',
            commitContext, // Use enhanced commit context with PR diff
            logs,
            errorLogs,
            timeDebuggerLogs,
            slowRequestLogs
          );
        } else {
          // Standard analysis for other presets
          aiAnalysis = await this.openaiService.analyzeAlertWithLogs(
            alertname,
            aiExplanation, // Can be undefined if no alert found
            logs,
            errorLogs,
            timeDebuggerLogs,
            slowRequestLogs
          );
        }
      } catch (error) {
        console.warn('⚠️  Failed to get OpenAI analysis:', error);
      }
    } else {
      console.log(`ℹ️  Skipping AI analysis: enabled=${this.openaiService.isEnabled()}, hasLogs=${hasLogsOrIsResetInvestigation}`);
    }
    
    console.log(`📦 Creating context output...`);
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
  private async performResetInvestigation(
    podName: string, 
    elasticSettings?: { timeframeMinutes: number; documentLimit: number; slowRequestThreshold: number },
    presetConfig?: { gitHubRepo?: string }
  ) {
    console.log(`🔄 Starting reset investigation for pod: ${podName}`);
    console.log(`🔄 Elasticsearch enabled:`, this.elasticsearchService.isEnabled());
    
    try {
      // Step 1: Search for Git commit logs
      const timeframeMinutes = elasticSettings?.timeframeMinutes || 240;
      console.log(`🔄 Searching for Git commit logs in last ${timeframeMinutes} minutes`);
      const commitLogs = await this.elasticsearchService.findGitCommitLogs(podName, timeframeMinutes);
      console.log(`🔄 Found ${commitLogs.length} Git commit log entries`);
      
      if (commitLogs.length === 0) {
        console.warn(`⚠️  No Git commit logs found for pod ${podName} in last ${timeframeMinutes} minutes`);
        
                  return {
          found: false,
          message: `No Git commit logs found for pod ${podName} in the specified timeframe of ${timeframeMinutes} minutes. Check if your application logs contain "Git info: commit" messages.`,
          logs: [],
          commitInfo: null,
          prInfo: null
        };
      }
      
      // Step 2: Use the first (most recent) or second commit timestamp as start time
      const targetCommit = commitLogs[0]; // Use most recent commit
      const commitTimestamp = targetCommit.timestamp;
      const commitHash = targetCommit.commitHash;
      
      // Start fetching logs from 1 second before the commit to include the commit log in results
      const commitDate = new Date(commitTimestamp);
      const startDate = new Date(commitDate.getTime() - 1000); // 1 second before
      const startTimestamp = startDate.toISOString();
      
      console.log(`📍 Using commit ${commitHash} at ${commitTimestamp} as reset investigation reference point`);
      console.log(`📍 Fetching logs starting from ${startTimestamp} (1 second before commit) to include commit log`);
      
      // Step 3: Get GitHub commit details and PR information (use preset-specific repo if configured)
      let commitInfo = null;
      let prInfo = null;
      if (this.githubService.isEnabled() && commitHash) {
        const repoToUse = presetConfig?.gitHubRepo;
        if (repoToUse) {
          console.log(`🔍 Fetching commit and PR details from repository: ${repoToUse}`);
        }
        
        // Get commit details and PR information in parallel
        [commitInfo, prInfo] = await Promise.all([
          this.githubService.getCommitDetails(commitHash, repoToUse),
          this.githubService.getPullRequestForCommit(commitHash, repoToUse)
        ]);
      }
      
      // Step 4: Get all logs since that timestamp (1 second before commit)
      const limit = elasticSettings?.documentLimit || 500;
      const logsSinceReset = await this.elasticsearchService.getLogsSinceTimestamp(podName, startTimestamp, limit);
      
      console.log(`✅ Reset investigation complete: ${logsSinceReset.length} logs since commit ${commitHash}`);
      
      return {
        found: true,
        startTimestamp,
        commitHash,
        commitInfo,
        prInfo,
        logs: logsSinceReset,
        logCount: logsSinceReset.length,
        message: `Found ${logsSinceReset.length} logs since pod initialization (commit ${commitHash})`
      };
      
    } catch (error) {
      console.error('❌ Error during reset investigation:', error);
              return {
          found: false,
          error: error instanceof Error ? error.message : 'Unknown error during reset investigation',
          logs: [],
          commitInfo: null,
          prInfo: null
        };
    }
  }
}
