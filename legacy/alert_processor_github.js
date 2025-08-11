// AI Alert Context Agent - GitHub Integration Version
// Input: Mock alert JSON → Process with real GitHub → Output: Console formatted context

const fs = require('fs');
const path = require('path');

// Load environment variables (you'll need to create a .env file)
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

// GitHub API client using MCP tools
class GitHubAlertSearch {
  constructor() {
    this.owner = process.env.GITHUB_OWNER || 'Connecteam';
    this.repo = process.env.GITHUB_REPO || 'alerts';
  }

  async searchForAlert(alertname) {
    try {
      console.log(`🔍 Searching GitHub repo ${this.owner}/${this.repo} for alert: ${alertname}`);
      
      // We'll use the MCP GitHub tools to search for the alert
      // This is a placeholder for now - we'll implement the actual search
      const searchResult = await this.performGitHubSearch(alertname);
      
      if (searchResult.found) {
        console.log(`✅ Found alert definition in: ${searchResult.file}`);
        return {
          found: true,
          file: searchResult.file,
          content: searchResult.content,
          rule: searchResult.rule
        };
      } else {
        console.log(`❌ Alert '${alertname}' not found in repository`);
        return {
          found: false,
          message: `Alert rule '${alertname}' not found in ${this.owner}/${this.repo} repository`
        };
      }
    } catch (error) {
      console.error(`❌ Error searching GitHub: ${error.message}`);
      return {
        found: false,
        message: `Error searching repository: ${error.message}`
      };
    }
  }

  async performGitHubSearch(alertname) {
    console.log(`📡 Making GitHub API call to search for '${alertname}'...`);
    
    try {
      // Use MCP GitHub search to find the alert in code
      const searchQuery = `${alertname} repo:${this.owner}/${this.repo}`;
      
      // Note: This is where we would integrate with MCP GitHub tools
      // For now, we'll implement a basic search simulation
      // In the real implementation, you would use the GitHub search MCP tool
      
      console.log(`🔍 Search query: ${searchQuery}`);
      
      // Simulate the GitHub search - replace this with actual MCP call
      return await this.simulateGitHubSearch(alertname);
      
    } catch (error) {
      console.error(`❌ GitHub search error: ${error.message}`);
      return { found: false, error: error.message };
    }
  }

  async simulateGitHubSearch(alertname) {
    // This simulates what the MCP GitHub search would return
    // Replace this entire function with actual MCP GitHub search calls
    
    const mockResults = {
      "ContainerCPUThrotellingIsHigh": {
        found: true,
        file: "rules/kubernetes/container-resources.yaml",
        url: `https://github.com/${this.owner}/${this.repo}/blob/main/rules/kubernetes/container-resources.yaml`,
        content: `
groups:
  - name: container.rules
    rules:
      - alert: ContainerCPUThrotellingIsHigh
        expr: rate(container_cpu_cfs_throttled_periods_total[5m]) / rate(container_cpu_cfs_periods_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Container CPU throttling is high"
          description: "Container {{ $labels.container }} in pod {{ $labels.pod }} has {{ $value | humanizePercentage }} CPU throttling"
          runbook_url: "https://runbooks.connecteam.com/alerts/cpu-throttling"
        `,
        rule: this.parsePrometheusRule(`
      - alert: ContainerCPUThrotellingIsHigh
        expr: rate(container_cpu_cfs_throttled_periods_total[5m]) / rate(container_cpu_cfs_periods_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Container CPU throttling is high"
          description: "Container {{ $labels.container }} in pod {{ $labels.pod }} has {{ $value | humanizePercentage }} CPU throttling"
          runbook_url: "https://runbooks.connecteam.com/alerts/cpu-throttling"
        `)
      }
    };

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return mockResults[alertname] || { found: false };
  }

  parsePrometheusRule(ruleText) {
    // Simple YAML-like parsing for Prometheus rules
    // In production, you'd use a proper YAML parser
    const lines = ruleText.split('\n').map(line => line.trim()).filter(line => line);
    
    const rule = {
      expr: '',
      for: '',
      labels: {},
      annotations: {}
    };

    let currentSection = null;
    
    for (const line of lines) {
      if (line.startsWith('expr:')) {
        rule.expr = line.substring(5).trim();
      } else if (line.startsWith('for:')) {
        rule.for = line.substring(4).trim();
      } else if (line === 'labels:') {
        currentSection = 'labels';
      } else if (line === 'annotations:') {
        currentSection = 'annotations';
      } else if (line.includes(':') && currentSection) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim().replace(/"/g, '');
        rule[currentSection][key.trim()] = value;
      }
    }

    return rule;
  }
}

// Mock alert data (same as before)
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
    alertTitle: "NonExistentAlert for test",
    alert: "This alert doesn't exist in the repo.",
    description: "Testing what happens when an alert is not found in the repository.",
    details: {
      alertname: "NonExistentAlert",
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

// Enhanced Context Generator with GitHub integration
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
    context += `• Duration: ${rule.for}\n`;
    if (rule.labels?.severity) {
      context += `• Severity: ${rule.labels.severity}\n`;
    }
    if (rule.labels?.team) {
      context += `• Team: ${rule.labels.team}\n`;
    }
    context += `\n`;
    
    context += `📚 Rule Annotations:\n`;
    if (rule.annotations?.summary) {
      context += `• Summary: ${rule.annotations.summary}\n`;
    }
    if (rule.annotations?.description) {
      context += `• Description: ${rule.annotations.description}\n`;
    }
    if (rule.annotations?.runbook_url) {
      context += `• Runbook: ${rule.annotations.runbook_url}\n`;
    }
    context += `\n`;
    
    // GitHub link
    context += `🔗 GitHub: https://github.com/Connecteam/alerts/blob/main/${githubResult.file}\n\n`;
  } else {
    context += `❌ ${githubResult.message}\n`;
    context += `🔗 Search manually: https://github.com/Connecteam/alerts/search?q=${parsedAlert.alertname}\n\n`;
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
    'info': 'ℹ️'
  };
  return emojiMap[severity] || '❓';
}

// Main processing function with GitHub integration
async function processAlert(alert, githubSearch) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing Alert: ${alert.details.alertname}`);
  console.log(`${"=".repeat(60)}`);
  
  // Step 1: Parse the alert
  const parsedAlert = parseAlert(alert);
  console.log(`✅ Parsed alert: ${parsedAlert.alertname}`);
  
  // Step 2: Search GitHub repository
  const githubResult = await githubSearch.searchForAlert(parsedAlert.alertname);
  
  // Step 3: Generate context
  const context = generateContext(parsedAlert, githubResult);
  
  // Step 4: Output formatted context
  console.log(context);
}

// Main execution
async function main() {
  console.log("🤖 AI Alert Context Agent - GitHub Integration Version");
  console.log(`🔗 Searching repository: ${process.env.GITHUB_OWNER || 'Connecteam'}/${process.env.GITHUB_REPO || 'alerts'}`);
  
  // Check for GitHub token
  if (!process.env.GITHUB_TOKEN) {
    console.log("\n⚠️  Warning: GITHUB_TOKEN not found in .env file");
    console.log("Create a .env file with your GitHub token for full functionality");
    console.log("For now, using mock GitHub responses...\n");
  }
  
  const githubSearch = new GitHubAlertSearch();
  
  console.log("Processing mock alerts with GitHub integration...\n");
  
  for (const alert of mockAlerts) {
    await processAlert(alert, githubSearch);
  }
  
  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ GitHub integration processing complete!");
  console.log("Next step: Replace mock GitHub search with real MCP GitHub tools");
}

// Run the enhanced processor
main().catch(console.error);
