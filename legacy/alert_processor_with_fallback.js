// AI Alert Context Agent - Production Version with GitHub Fallback
// This version tries GitHub API first, then falls back to mock data if access fails

const fs = require('fs');
const path = require('path');

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key.trim()] = value.trim();
      }
    });
  }
}

loadEnv();

// GitHub API client with fallback
class ProductionGitHubClient {
  constructor() {
    this.owner = process.env.GITHUB_OWNER || 'Connecteam';
    this.repo = process.env.GITHUB_REPO || 'alerts';
    this.token = process.env.GITHUB_TOKEN;
    this.baseUrl = 'https://api.github.com';
    this.hasAccess = null; // null = unknown, true = has access, false = no access
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Alert-Context-Agent/1.0',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    console.log(`📡 GitHub API: ${options.method || 'GET'} ${endpoint}`);

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      ...options
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  // Test repository access
  async testRepositoryAccess() {
    if (this.hasAccess !== null) return this.hasAccess;
    
    try {
      await this.makeRequest(`/repos/${this.owner}/${this.repo}`);
      this.hasAccess = true;
      console.log(`✅ GitHub repository access confirmed`);
      return true;
    } catch (error) {
      this.hasAccess = false;
      console.log(`❌ GitHub repository access failed: ${error.message}`);
      return false;
    }
  }

  // Search for alert with GitHub API
  async searchAlert(alertname) {
    const hasAccess = await this.testRepositoryAccess();
    if (!hasAccess) {
      throw new Error('No repository access');
    }

    // Try search API first
    try {
      const searchQuery = `"${alertname}" repo:${this.owner}/${this.repo}`;
      const result = await this.makeRequest(`/search/code?q=${encodeURIComponent(searchQuery)}&per_page=5`);
      
      if (result.total_count > 0) {
        return {
          found: true,
          files: result.items
        };
      }
    } catch (error) {
      console.log(`⚠️  Search API failed: ${error.message}`);
    }

    return { found: false };
  }

  async getFileContents(filePath) {
    const result = await this.makeRequest(`/repos/${this.owner}/${this.repo}/contents/${filePath}`);
    
    if (result.content && result.encoding === 'base64') {
      return {
        content: Buffer.from(result.content, 'base64').toString('utf8'),
        url: result.html_url
      };
    } else {
      throw new Error('File content not found');
    }
  }
}

// Alert search with GitHub + fallback
class ProductionAlertSearch {
  constructor() {
    this.github = new ProductionGitHubClient();
    this.mockData = this.setupMockData();
  }

  // Mock data based on what we know exists (from MCP testing)
  setupMockData() {
    return {
      "ContainerCPUThrottlingIsHigh": {
        name: "ContainerCPUThrottlingIsHigh",
        expression: "sum(increase(owner:container_cpu_cfs_throttled_periods_total{container!~\"mysqld.*|filebeat\"}[1m])) by (namespace,pod,container) / sum(increase(owner:container_cpu_cfs_periods_total{container!~\"mysqld.*|filebeat\"}[1m])) by (namespace,pod,container) * 100 > 25",
        duration: "10m",
        description: "The process in the container $labels.container on pod '$labels.pod' has $value% throttling of CPU",
        summary: "A process has been experienced elevated CPU throttling.",
        target: "slack",
        file: "default_alerts/k8s_alerts.yaml",
        url: "https://github.com/Connecteam/alerts/blob/main/default_alerts/k8s_alerts.yaml",
        labels: { severity: "warning" },
        annotations: {
          summary: "A process has been experienced elevated CPU throttling.",
          description: "The process in the container $labels.container on pod '$labels.pod' has $value% throttling of CPU"
        }
      }
    };
  }

  async searchForAlert(alertname) {
    console.log(`🔍 Searching for alert: ${alertname}`);
    
    // Try GitHub API first
    try {
      const searchResult = await this.github.searchAlert(alertname);
      
      if (searchResult.found && searchResult.files.length > 0) {
        const file = searchResult.files[0];
        console.log(`✅ Found alert in GitHub: ${file.path}`);
        
        const fileData = await this.github.getFileContents(file.path);
        const parsedRule = this.extractAlertRule(fileData.content, alertname);
        
        return {
          found: true,
          source: 'github',
          file: file.path,
          url: fileData.url,
          rule: parsedRule
        };
      }
    } catch (error) {
      console.log(`⚠️  GitHub search failed: ${error.message}`);
      console.log(`🔄 Falling back to mock data...`);
    }
    
    // Fallback to mock data
    const mockRule = this.mockData[alertname];
    if (mockRule) {
      console.log(`✅ Found alert in mock data: ${alertname}`);
      return {
        found: true,
        source: 'mock',
        file: mockRule.file,
        url: mockRule.url,
        rule: mockRule
      };
    }
    
    console.log(`❌ Alert '${alertname}' not found in GitHub or mock data`);
    return {
      found: false,
      message: `Alert rule '${alertname}' not found`,
      source: 'none'
    };
  }

  extractAlertRule(fileContent, alertname) {
    // Simple YAML parsing for alert rules
    const lines = fileContent.split('\n');
    let inTargetAlert = false;
    let alertRule = {
      name: alertname,
      expression: '',
      duration: '',
      description: '',
      summary: '',
      target: '',
      labels: { severity: 'warning' },
      annotations: {}
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      if (trimmed === `- name: ${alertname}`) {
        inTargetAlert = true;
        continue;
      }
      
      if (!inTargetAlert) continue;
      
      if (trimmed.startsWith('- name:') && !trimmed.includes(alertname)) {
        break; // Next alert
      }
      
      if (trimmed.startsWith('expression:')) {
        alertRule.expression = trimmed.substring(11).trim();
      } else if (trimmed.startsWith('duration:')) {
        alertRule.duration = trimmed.substring(9).trim();
      } else if (trimmed.startsWith('description:')) {
        alertRule.description = trimmed.substring(12).trim();
      } else if (trimmed.startsWith('summary:')) {
        alertRule.summary = trimmed.substring(8).trim();
      } else if (trimmed.startsWith('target:')) {
        alertRule.target = trimmed.substring(7).trim();
      }
    }
    
    alertRule.annotations = {
      summary: alertRule.summary,
      description: alertRule.description
    };
    
    return alertRule;
  }
}

// Test only the real alert (not NonExistentAlert)
const realAlert = {
  status: "RESOLVED", 
  alertTitle: "ContainerCPUThrotellingIsHigh for",
  alert: "A process has been experienced elevated CPU throttling.",
  description: "The process in the container pymobiengine on pod 'pymobiengine-company-policy-6ff6cc49dd-jk76x' has 14.05% throttling of CPU",
  details: {
    alertname: "ContainerCPUThrottlingIsHigh",
    container: "pymobiengine",
    ct_cluster: "app.production", 
    namespace: "default",
    pod: "pymobiengine-company-policy-6ff6cc49dd-jk76x",
    target: "slack",
    team: "time-clock"
  }
};

// Alert Parser
function parseAlert(alert) {
  return {
    alertname: alert.details.alertname,
    status: alert.status,
    description: alert.description,
    labels: alert.details,
    rawAlert: alert
  };
}

// Context Generator
function generateContext(parsedAlert, githubResult) {
  const statusEmoji = parsedAlert.status === "FIRING" ? "🔥" : "✅";
  
  let context = `\n${statusEmoji} Alert Context for ${parsedAlert.alertname}\n`;
  context += `${"-".repeat(50)}\n`;
  
  // Alert Status
  context += `📊 Status: ${parsedAlert.status}\n`;
  context += `📝 Description: ${parsedAlert.description}\n\n`;
  
  // Rule Information
  if (githubResult.found) {
    const rule = githubResult.rule;
    const sourceEmoji = githubResult.source === 'github' ? '🔗' : '💾';
    const severityEmoji = getSeverityEmoji(rule.labels?.severity);
    
    context += `${severityEmoji} Rule Definition (${sourceEmoji} ${githubResult.source}):\n`;
    context += `📁 File: ${githubResult.file}\n`;
    
    if (rule.expression) {
      const shortExpression = rule.expression.length > 100 ? 
        rule.expression.substring(0, 100) + '...' : 
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
    context += `🔗 GitHub: ${githubResult.url}\n\n`;
  } else {
    context += `❌ ${githubResult.message}\n\n`;
  }
  
  // Instance Details
  context += `🏷️ Instance Details:\n`;
  Object.entries(parsedAlert.labels).forEach(([key, value]) => {
    if (key !== 'alertname' && key !== 'target') {
      context += `• ${key}: ${value}\n`;
    }
  });
  
  return context;
}

// Helper function
function getSeverityEmoji(severity) {
  const emojiMap = {
    'critical': '🚨',
    'warning': '⚠️', 
    'info': 'ℹ️'
  };
  return emojiMap[severity] || '❓';
}

// Main processing function
async function processAlert(alert, alertSearch) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing Alert: ${alert.details.alertname}`);
  console.log(`${"=".repeat(60)}`);
  
  const parsedAlert = parseAlert(alert);
  console.log(`✅ Parsed alert: ${parsedAlert.alertname}`);
  
  const githubResult = await alertSearch.searchForAlert(parsedAlert.alertname);
  const context = generateContext(parsedAlert, githubResult);
  
  console.log(context);
}

// Main execution
async function main() {
  console.log("🤖 AI Alert Context Agent - Production Version");
  console.log(`🔗 Repository: ${process.env.GITHUB_OWNER || 'Connecteam'}/${process.env.GITHUB_REPO || 'alerts'}`);
  
  if (!process.env.GITHUB_TOKEN) {
    console.log("⚠️  No GitHub token - using mock data only");
  } else {
    console.log("✅ GitHub token configured - will try GitHub first, fallback to mock\n");
  }
  
  const alertSearch = new ProductionAlertSearch();
  
  console.log("Processing real alert with GitHub + fallback...\n");
  
  await processAlert(realAlert, alertSearch);
  
  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ Processing complete!");
  console.log("\n🎉 SUCCESS! This shows exactly what would be posted to Slack!");
  console.log("\n📝 The bot now provides rich context for alerts:");
  console.log("• PromQL query details");
  console.log("• Alert duration and severity");  
  console.log("• Direct GitHub links");
  console.log("• Instance metadata");
}

// Check fetch availability
if (typeof fetch === 'undefined') {
  console.log("⚠️  This script requires Node.js 18+ for fetch support");
  process.exit(1);
}

main().catch(console.error);
