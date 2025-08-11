import { Alert, Config, ContextOutput } from '../types';
import { GitHubService } from './GitHubService';
import { OpenAIQueryService } from './OpenAIQueryService';
import { ElasticsearchService, LogEntry } from './ElasticsearchService';

/**
 * Simple Alert Service - Just GitHub expression enrichment
 */
export class SimpleAlertService {
  private githubService: GitHubService;
  private openaiService: OpenAIQueryService;
  private elasticsearchService: ElasticsearchService;

  constructor(config: Config) {
    this.githubService = new GitHubService(config);
    this.openaiService = new OpenAIQueryService(config);
    this.elasticsearchService = new ElasticsearchService(config);
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
    const podName = alert.details?.pod;
    if (podName && this.elasticsearchService.isEnabled()) {
      try {
        // Fetch general logs, error logs, and TIME_DEBUGGER logs in parallel
        [logs, errorLogs, timeDebuggerLogs] = await Promise.all([
          this.elasticsearchService.getLastLogsForPod(podName, 100),
          this.elasticsearchService.getLastLogsForPod(podName, 100, 'ERROR'),
          this.elasticsearchService.getLastLogsForPod(podName, 100, undefined, '[TIME_DEBUGGER]')
        ]);
      } catch (error) {
        console.warn('⚠️  Failed to fetch logs from Elasticsearch:', error);
      }
    }
    
    // Get AI analysis of alert + logs if we have data
    let aiAnalysis: string | undefined;
    if (aiExplanation && this.openaiService.isEnabled() && (logs.length > 0 || errorLogs.length > 0 || timeDebuggerLogs.length > 0)) {
      try {
        aiAnalysis = await this.openaiService.analyzeAlertWithLogs(
          alertname,
          aiExplanation,
          logs,
          errorLogs,
          timeDebuggerLogs
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
      formattedContext: this.formatContext(alertname, githubResult, alert, aiExplanation, logs, errorLogs, timeDebuggerLogs, aiAnalysis)
    };

    return context;
  }

  /**
   * Format the context as a readable string
   */
  private formatContext(alertname: string, githubResult: any, alert: Alert, aiExplanation?: string, logs?: LogEntry[], errorLogs?: LogEntry[], timeDebuggerLogs?: LogEntry[], aiAnalysis?: string): string {
    let text = `🚨 Alert Context for ${alertname}\n`;
    text += `${'─'.repeat(50)}\n`;
    text += `📊 Status: ${alert.status}\n`;
    text += `📝 Description: ${alert.description || alert.alert}\n\n`;

    if (githubResult.found && githubResult.rule) {
      text += `⚡ Expression Details:\n`;
      text += `• Query: ${githubResult.rule.expression}\n`;
      text += `• Duration: ${githubResult.rule.duration}\n`;
      text += `• Severity: ${githubResult.rule.labels?.severity || 'unknown'}\n`;
      text += `• File: ${githubResult.file}\n`;
      if (githubResult.url) {
        text += `• URL: ${githubResult.url}\n`;
      }
      
      // Add AI explanation if available
      if (aiExplanation) {
        text += `\n🤖 AI Explanation:\n`;
        text += aiExplanation.split('\n').map(line => `${line}`).join('\n');
        text += `\n`;
      }
    } else {
      text += `❌ No expression found in GitHub repository\n`;
    }

    // Add logs section if available
    if (logs && logs.length > 0) {
      text += `\n📋 Recent Logs (Last ${logs.length}):\n`;
      
      // Show first 5 logs as summary
      const recentLogs = logs.slice(0, 5);
      recentLogs.forEach((log, index) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const levelIcon = this.getLogLevelIcon(log.level);
        const truncatedMessage = log.message.length > 80 
          ? log.message.substring(0, 80) + '...' 
          : log.message;
        text += `${levelIcon} [${time}] ${truncatedMessage}\n`;
      });
      
      if (logs.length > 5) {
        text += `... and ${logs.length - 5} more log entries\n`;
      }
      
      // Summary by log level
      const logLevels = this.summarizeLogLevels(logs);
      text += `\n📊 Log Summary: ${logLevels}\n`;
    } else if (alert.details?.pod) {
      text += `\n📋 Recent Logs: No logs found for pod ${alert.details.pod}\n`;
    }

    // Add error logs section if available
    if (errorLogs && errorLogs.length > 0) {
      text += `\n🔴 Recent ERROR Logs (Last ${errorLogs.length}):\n`;
      
      // Show first 10 error logs (more important than general logs)
      const recentErrors = errorLogs.slice(0, 10);
      recentErrors.forEach((log, index) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const truncatedMessage = log.message.length > 100 
          ? log.message.substring(0, 100) + '...' 
          : log.message;
        text += `🔴 [${time}] ${truncatedMessage}\n`;
      });
      
      if (errorLogs.length > 10) {
        text += `... and ${errorLogs.length - 10} more error entries\n`;
      }
    } else if (alert.details?.pod && logs && logs.length > 0) {
      text += `\n🔴 Recent ERROR Logs: No error logs found for pod ${alert.details.pod}\n`;
    }

    // Add TIME_DEBUGGER logs section if available
    if (timeDebuggerLogs && timeDebuggerLogs.length > 0) {
      text += `\n⏱️ TIME_DEBUGGER Logs (Last ${timeDebuggerLogs.length}):\n`;
      
      // Show first 10 time debugger logs
      const recentTimeDebugger = timeDebuggerLogs.slice(0, 10);
      recentTimeDebugger.forEach((log, index) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const truncatedMessage = log.message.length > 120 
          ? log.message.substring(0, 120) + '...' 
          : log.message;
        // Use clock emoji for time debugger logs
        text += `⏱️ [${time}] ${truncatedMessage}\n`;
      });
      
      if (timeDebuggerLogs.length > 10) {
        text += `... and ${timeDebuggerLogs.length - 10} more TIME_DEBUGGER entries\n`;
      }
    } else if (alert.details?.pod && logs && logs.length > 0) {
      text += `\n⏱️ TIME_DEBUGGER Logs: No TIME_DEBUGGER logs found for pod ${alert.details.pod}\n`;
    }

    // Add AI analysis section if available
    if (aiAnalysis) {
      text += `\n🤖 AI Analysis & Recommendations:\n`;
      text += `${'─'.repeat(40)}\n`;
      text += aiAnalysis + '\n';
    }

    text += `\n🏷️ Instance Details:\n`;
    const details = alert.details || {};
    for (const [key, value] of Object.entries(details)) {
      if (value) {
        text += `• ${key}: ${value}\n`;
      }
    }

    return text;
  }

  /**
   * Test GitHub connectivity
   */
  async healthCheck(): Promise<boolean> {
    return await this.githubService.testRepositoryAccess();
  }

  /**
   * Test all services (GitHub + OpenAI + Elasticsearch)
   */
  async fullHealthCheck(): Promise<{ github: boolean; openai: boolean; elasticsearch: boolean }> {
    const [github, openai, elasticsearch] = await Promise.all([
      this.githubService.testRepositoryAccess(),
      this.openaiService.healthCheck(),
      this.elasticsearchService.healthCheck()
    ]);

    return { github, openai, elasticsearch };
  }

  /**
   * Get icon for log level
   */
  private getLogLevelIcon(level: string): string {
    switch (level.toLowerCase()) {
      case 'error':
      case 'err':
        return '🔴';
      case 'warn':
      case 'warning':
        return '🟡';
      case 'info':
      case 'information':
        return '🔵';
      case 'debug':
        return '🟣';
      default:
        return '⚪';
    }
  }

  /**
   * Summarize log levels
   */
  private summarizeLogLevels(logs: LogEntry[]): string {
    const counts: Record<string, number> = {};
    
    logs.forEach(log => {
      const level = log.level.toLowerCase();
      counts[level] = (counts[level] || 0) + 1;
    });

    const summary = Object.entries(counts)
      .map(([level, count]) => `${count} ${level}`)
      .join(', ');

    return summary || 'No log levels detected';
  }
}
