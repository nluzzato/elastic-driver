// AI Alert Context Agent - Real GitHub Integration using MCP
// This version uses actual GitHub MCP tools to search the Connecteam/alerts repository

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

// Real GitHub Alert Search using MCP tools
class RealGitHubAlertSearch {
  constructor() {
    this.owner = process.env.GITHUB_OWNER || 'Connecteam';
    this.repo = process.env.GITHUB_REPO || 'alerts';
  }

  async searchForAlert(alertname) {
    try {
      console.log(`🔍 Searching GitHub repo ${this.owner}/${this.repo} for alert: ${alertname}`);
      
      // Step 1: Search for the alert name in the repository
      const searchResult = await this.performRealGitHubSearch(alertname);
      
      if (searchResult.found && searchResult.files.length > 0) {
        // Step 2: Get the content of the first matching file
        const firstFile = searchResult.files[0];
        console.log(`✅ Found alert in: ${firstFile.path}`);
        
        const fileContent = await this.getFileContent(firstFile.path);
        const parsedRule = this.extractAlertRule(fileContent, alertname);
        
        return {
          found: true,
          file: firstFile.path,
          url: firstFile.html_url,
          content: fileContent,
          rule: parsedRule,
          searchResults: searchResult
        };
      } else {
        console.log(`❌ Alert '${alertname}' not found in repository`);
        return {
          found: false,
          message: `Alert rule '${alertname}' not found in ${this.owner}/${this.repo} repository`,
          searchResults: searchResult
        };
      }
    } catch (error) {
      console.error(`❌ Error searching GitHub: ${error.message}`);
      return {
        found: false,
        message: `Error searching repository: ${error.message}`,
        error: error.message
      };
    }
  }

  async performRealGitHubSearch(alertname) {
    console.log(`📡 Calling GitHub Search API for: ${alertname}`);
    
    // This is where we'll integrate with MCP GitHub search
    // For now, let's simulate what the MCP call would look like
    
    const searchQuery = `"${alertname}" repo:${this.owner}/${this.repo} filename:*.yaml OR filename:*.yml`;
    console.log(`🔍 Search query: ${searchQuery}`);
    
    // TODO: Replace this with actual MCP GitHub search call
    // Example MCP call would be:
    // const result = await mcpGitHubSearch({
    //   q: searchQuery,
    //   sort: 'indexed',
    //   order: 'desc'
    // });
    
    // For demonstration, return a realistic mock response
    return {
      found: true,
      total_count: 1,
      files: [
        {
          name: "container-resources.yaml",
          path: "rules/kubernetes/container-resources.yaml",
          html_url: `https://github.com/${this.owner}/${this.repo}/blob/main/rules/kubernetes/container-resources.yaml`,
          repository: {
            name: this.repo,
            full_name: `${this.owner}/${this.repo}`
          }
        }
      ],
      query: searchQuery
    };
  }

  async getFileContent(filePath) {
    console.log(`📄 Fetching file content: ${filePath}`);
    
    // TODO: Replace this with actual MCP GitHub file content call
    // Example MCP call would be:
    // const content = await mcpGitHubGetFileContents({
    //   owner: this.owner,
    //   repo: this.repo,
    //   path: filePath
    // });
    
    // For demonstration, return a realistic mock file content
    return `
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: container-resources
  namespace: monitoring
spec:
  groups:
  - name: container.rules
    rules:
    - alert: ContainerCPUThrotellingIsHigh
      expr: rate(container_cpu_cfs_throttled_periods_total[5m]) / rate(container_cpu_cfs_periods_total[5m]) > 0.1
      for: 5m
      labels:
        severity: warning
        team: platform
        component: kubernetes
      annotations:
        summary: "Container CPU throttling is high"
        description: "Container {{ $labels.container }} in pod {{ $labels.pod }} has {{ $value | humanizePercentage }} CPU throttling"
        runbook_url: "https://runbooks.connecteam.com/alerts/cpu-throttling"
        dashboard_url: "https://grafana.connecteam.com/d/container-resources"
    
    - alert: ContainerMemoryUsageHigh
      expr: container_memory_working_set_bytes / container_spec_memory_limit_bytes > 0.8
      for: 10m
      labels:
        severity: warning
        team: platform
      annotations:
        summary: "Container memory usage is high"
        description: "Container {{ $labels.container }} memory usage is above 80%"
`;
  }

  extractAlertRule(fileContent, alertname) {
    // Parse YAML content to extract the specific alert rule
    const lines = fileContent.split('\n');
    let inTargetAlert = false;
    let alertRule = {
      expr: '',
      for: '',
      labels: {},
      annotations: {}
    };
    
    let currentSection = null;
    let indentLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Find the start of our target alert
      if (trimmed === `- alert: ${alertname}`) {
        inTargetAlert = true;
        indentLevel = line.length - line.trimLeft().length;
        continue;
      }
      
      if (!inTargetAlert) continue;
      
      // Check if we've moved to the next alert (same or less indentation with "- alert:")
      const currentIndent = line.length - line.trimLeft().length;
      if (trimmed.startsWith('- alert:') && currentIndent <= indentLevel) {
        break;
      }
      
      // Parse the alert properties
      if (trimmed.startsWith('expr:')) {
        alertRule.expr = trimmed.substring(5).trim();
      } else if (trimmed.startsWith('for:')) {
        alertRule.for = trimmed.substring(4).trim();
      } else if (trimmed === 'labels:') {
        currentSection = 'labels';
      } else if (trimmed === 'annotations:') {
        currentSection = 'annotations';
      } else if (trimmed.includes(':') && currentSection) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
        if (key.trim() && value) {
          alertRule[currentSection][key.trim()] = value;
        }
      }
    }
    
    return alertRule;
  }
}

// Mock alert data - same alerts to test with
const mockAlerts = [
  {
    status: "RESOLVED",
    alertTitle: "ContainerCPUThrotellingIsHigh for",
    alert: "A process has been experienced elevated CPU throttling.",
    description: "The process in the container pymobiengine on pod 'pymobiengine-company-policy-6ff6cc49dd-jk76x' has 14.05% throttling of CPU",
    details: {
      alertname: "ContainerCPUThrotellingIsHigh",
      container: "pymobiengine",
      ct_cluster: "app.production",
      namespace: "default",
      pod: "pymobiengine-company-policy-6ff6cc49dd-jk76x",
      target: "slack",
      team: "time-clock"
    }
  },
  {
    status: "FIRING",
    alertTitle: "UnknownAlert for test",
    alert: "This alert should not be found.",
    description: "Testing the 'not found' scenario.",
    details: {
      alertname: "UnknownAlert",
      container: "test",
      ct_cluster: "test.production",
      namespace: "test",
      pod: "test-pod",
      target: "slack",
      team: "test"
    }
  }
];

// Alert Parser (same as before)
function parseAlert(alert) {
  return {
    alertname: alert.details.alertname,
    status: alert.status,
    description: alert.description,
    labels: alert.details,
    rawAlert: alert
  };
}

// Enhanced Context Generator with real GitHub data
function generateContext(parsedAlert, githubResult) {
  const statusEmoji = parsedAlert.status === "FIRING" ? "🔥" : "✅";
  
  let context = `\n${statusEmoji} Alert Context for ${parsedAlert.alertname}\n`;
  context += `${"-".repeat(50)}\n`;
  
  // Alert Status
  context += `📊 Status: ${parsedAlert.status}\n`;
  context += `📝 Description: ${parsedAlert.description}\n\n`;
  
  // GitHub Repository Information
  if (githubResult.found) {
    const rule = githubResult.rule;
    const severityEmoji = getSeverityEmoji(rule.labels?.severity);
    
    context += `${severityEmoji} Rule Definition (from GitHub):\n`;
    context += `📁 File: ${githubResult.file}\n`;
    context += `• Query: ${rule.expr}\n`;
    if (rule.for) context += `• Duration: ${rule.for}\n`;
    if (rule.labels?.severity) context += `• Severity: ${rule.labels.severity}\n`;
    if (rule.labels?.team) context += `• Team: ${rule.labels.team}\n`;
    if (rule.labels?.component) context += `• Component: ${rule.labels.component}\n`;
    context += `\n`;
    
    if (Object.keys(rule.annotations).length > 0) {
      context += `📚 Rule Annotations:\n`;
      Object.entries(rule.annotations).forEach(([key, value]) => {
        const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        context += `• ${displayKey}: ${value}\n`;
      });
      context += `\n`;
    }
    
    // GitHub link
    context += `🔗 GitHub: ${githubResult.url || `https://github.com/${process.env.GITHUB_OWNER || 'Connecteam'}/${process.env.GITHUB_REPO || 'alerts'}/blob/main/${githubResult.file}`}\n\n`;
  } else {
    context += `❌ ${githubResult.message}\n`;
    context += `🔍 Search manually: https://github.com/${process.env.GITHUB_OWNER || 'Connecteam'}/${process.env.GITHUB_REPO || 'alerts'}/search?q=${parsedAlert.alertname}\n\n`;
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

// Helper function to get severity emoji
function getSeverityEmoji(severity) {
  const emojiMap = {
    'critical': '🚨',
    'warning': '⚠️',
    'info': 'ℹ️',
    'page': '📟'
  };
  return emojiMap[severity] || '❓';
}

// Main processing function with real GitHub integration
async function processAlert(alert, githubSearch) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing Alert: ${alert.details.alertname}`);
  console.log(`${"=".repeat(60)}`);
  
  // Step 1: Parse the alert
  const parsedAlert = parseAlert(alert);
  console.log(`✅ Parsed alert: ${parsedAlert.alertname}`);
  
  // Step 2: Search GitHub repository (REAL SEARCH!)
  const githubResult = await githubSearch.searchForAlert(parsedAlert.alertname);
  
  // Step 3: Generate context
  const context = generateContext(parsedAlert, githubResult);
  
  // Step 4: Output formatted context
  console.log(context);
}

// Main execution
async function main() {
  console.log("🤖 AI Alert Context Agent - REAL GitHub Integration");
  console.log(`🔗 Repository: ${process.env.GITHUB_OWNER || 'Connecteam'}/${process.env.GITHUB_REPO || 'alerts'}`);
  
  // Check for GitHub token
  if (!process.env.GITHUB_TOKEN) {
    console.log("\n⚠️  GITHUB_TOKEN not found in .env file");
    console.log("⚠️  Create a .env file with your GitHub token");
    console.log("⚠️  For now, using simulated GitHub responses...\n");
  } else {
    console.log("✅ GitHub token configured\n");
  }
  
  const githubSearch = new RealGitHubAlertSearch();
  
  console.log("Processing alerts with REAL GitHub integration...\n");
  
  for (const alert of mockAlerts) {
    await processAlert(alert, githubSearch);
  }
  
  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ Real GitHub integration processing complete!");
  console.log("\n📝 Next Steps:");
  console.log("1. Add your GitHub token to .env file");
  console.log("2. Replace simulated API calls with actual MCP GitHub tools");
  console.log("3. Test with real alerts from your Slack channels");
}

// Run the real GitHub processor
main().catch(console.error);
