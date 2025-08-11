import { 
  Alert, 
  ParsedAlert, 
  GitHubSearchResult, 
  AlertRule,
  ContextOutput,
  Config 
} from '../types';
import { GitHubService } from './GitHubService';

export class AlertService {
  private githubService: GitHubService;
  private mockData: Record<string, AlertRule>;

  constructor(config: Config) {
    this.githubService = new GitHubService(config);
    this.mockData = this.setupMockData();
  }

  // Mock data based on known alerts (fallback when GitHub fails)
  private setupMockData(): Record<string, AlertRule> {
    return {
      "ContainerCPUThrotellingIsHigh": {
        name: "ContainerCPUThrotellingIsHigh",
        expression: "sum(increase(owner:container_cpu_cfs_throttled_periods_total{container!~\"mysqld.*|filebeat\"}[1m])) by (namespace,pod,container) / sum(increase(owner:container_cpu_cfs_periods_total{container!~\"mysqld.*|filebeat\"}[1m])) by (namespace,pod,container) * 100 > 25",
        duration: "10m",
        description: "The process in the container $labels.container on pod '$labels.pod' has $value% throttling of CPU",
        summary: "A process has been experienced elevated CPU throttling.",
        target: "slack",
        labels: { severity: "warning" },
        annotations: {
          summary: "A process has been experienced elevated CPU throttling.",
          description: "The process in the container $labels.container on pod '$labels.pod' has $value% throttling of CPU"
        }
      }
    };
  }

  parseAlert(alert: Alert): ParsedAlert {
    return {
      alertname: alert.details.alertname,
      status: alert.status,
      description: alert.description,
      labels: alert.details,
      rawAlert: alert,
    };
  }

  async searchForAlert(alertname: string): Promise<GitHubSearchResult> {
    console.log(`🔍 Searching for alert: ${alertname}`);
    
    // Try GitHub first
    try {
      const hasAccess = await this.githubService.testRepositoryAccess();
      
      if (hasAccess) {
        const searchResult = await this.githubService.searchForAlert(alertname);
        
        if (searchResult.found) {
          return searchResult;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`⚠️  GitHub search failed: ${errorMessage}`);
    }
    
    // Fallback to mock data
    console.log(`🔄 Falling back to mock data...`);
    const mockRule = this.mockData[alertname];
    if (mockRule) {
      console.log(`✅ Found alert in mock data: ${alertname}`);
      return {
        found: true,
        source: 'mock',
        file: 'default_alerts/k8s_alerts.yaml',
        url: `https://github.com/Connecteam/alerts/blob/main/default_alerts/k8s_alerts.yaml`,
        rule: mockRule,
      };
    }
    
    console.log(`❌ Alert '${alertname}' not found in GitHub or mock data`);
    return {
      found: false,
      message: `Alert rule '${alertname}' not found`,
      source: 'none',
    };
  }

  generateContext(parsedAlert: ParsedAlert, searchResult: GitHubSearchResult): ContextOutput {
    const statusEmoji = parsedAlert.status === "FIRING" ? "🔥" : "✅";
    
    let context = `\n${statusEmoji} Alert Context for ${parsedAlert.alertname}\n`;
    context += `${"-".repeat(50)}\n`;
    
    // Alert Status
    context += `📊 Status: ${parsedAlert.status}\n`;
    context += `📝 Description: ${parsedAlert.description}\n\n`;
    
    // Rule Information
    if (searchResult.found && searchResult.rule) {
      const rule = searchResult.rule;
      const sourceEmoji = searchResult.source === 'github' ? '🔗' : '💾';
      const severityEmoji = this.getSeverityEmoji(rule.labels?.severity);
      
      context += `${severityEmoji} Rule Definition (${sourceEmoji} ${searchResult.source}):\n`;
      context += `📁 File: ${searchResult.file}\n`;
      
      if (rule.expression) {
        const shortExpression = rule.expression.length > 120 ? 
          rule.expression.substring(0, 120) + '...' : 
          rule.expression;
        context += `• Query: ${shortExpression}\n`;
      }
      if (rule.duration) context += `• Duration: ${rule.duration}\n`;
      if (rule.labels?.severity) context += `• Severity: ${rule.labels.severity}\n`;
      if (rule.target) context += `• Target: ${rule.target}\n`;
      context += `\n`;
      
      if (rule.description || rule.summary) {
        context += `📚 Rule Details:\n`;
        if (rule.summary) context += `• Summary: ${rule.summary}\n`;
        if (rule.description) context += `• Description: ${rule.description}\n`;
        context += `\n`;
      }
      
      // GitHub link
      if (searchResult.url) {
        context += `🔗 GitHub: ${searchResult.url}\n\n`;
      }
    } else {
      context += `❌ ${searchResult.message}\n`;
      if (searchResult.searchedFiles) {
        context += `📊 Searched files: ${searchResult.searchedFiles.join(', ')}\n`;
      }
      context += `🔍 Search manually: https://github.com/Connecteam/alerts/search?q=${parsedAlert.alertname}\n\n`;
    }
    
    // Instance Details
    context += `🏷️ Instance Details:\n`;
    const instanceDetails: Record<string, string> = {};
    Object.entries(parsedAlert.labels).forEach(([key, value]) => {
      if (key !== 'alertname' && key !== 'target') {
        context += `• ${key}: ${value}\n`;
        instanceDetails[key] = value;
      }
    });
    
    return {
      alertname: parsedAlert.alertname,
      status: parsedAlert.status,
      description: parsedAlert.description,
      found: searchResult.found,
      source: searchResult.source !== 'none' ? searchResult.source : undefined,
      file: searchResult.file,
      url: searchResult.url,
      rule: searchResult.rule,
      instanceDetails,
      formattedContext: context,
    };
  }

  private getSeverityEmoji(severity?: string): string {
    const emojiMap: Record<string, string> = {
      'critical': '🚨',
      'warning': '⚠️',
      'info': 'ℹ️',
      'page': '📟',
    };
    return emojiMap[severity || ''] || '❓';
  }

  async processAlert(alert: Alert): Promise<ContextOutput> {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Processing Alert: ${alert.details.alertname}`);
    console.log(`${"=".repeat(60)}`);
    
    // Step 1: Parse the alert
    const parsedAlert = this.parseAlert(alert);
    console.log(`✅ Parsed alert: ${parsedAlert.alertname}`);
    
    // Step 2: Search for alert definition
    const searchResult = await this.searchForAlert(parsedAlert.alertname);
    
    // Step 3: Generate context
    const output = this.generateContext(parsedAlert, searchResult);
    
    // Step 4: Output formatted context
    console.log(output.formattedContext);
    
    return output;
  }
}
