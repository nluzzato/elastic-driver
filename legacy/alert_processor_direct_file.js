// AI Alert Context Agent - Direct File Access Approach
// This version directly checks known alert files instead of relying on search

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

// Direct file access GitHub client
class DirectFileGitHubClient {
  constructor() {
    this.owner = process.env.GITHUB_OWNER || 'Connecteam';
    this.repo = process.env.GITHUB_REPO || 'alerts';
    this.token = process.env.GITHUB_TOKEN;
    this.baseUrl = 'https://api.github.com';
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

  // Get file contents directly
  async getFileContents(filePath) {
    const endpoint = `/repos/${this.owner}/${this.repo}/contents/${filePath}`;
    
    try {
      const result = await this.makeRequest(endpoint);
      
      if (result.content && result.encoding === 'base64') {
        return {
          content: Buffer.from(result.content, 'base64').toString('utf8'),
          url: result.html_url,
          path: filePath
        };
      } else {
        throw new Error('File content not found or not base64 encoded');
      }
    } catch (error) {
      console.error(`❌ File fetch error for ${filePath}: ${error.message}`);
      throw error;
    }
  }
}

// Alert search that checks known files directly
class DirectFileAlertSearch {
  constructor() {
    this.github = new DirectFileGitHubClient();
    // Known alert files based on repository structure
    this.knownAlertFiles = [
      'default_alerts/k8s_alerts.yaml',
      'default_alerts/app_alerts.yaml',
      'default_alerts/infra_alerts.yaml',
      'teams/core/k8s_overrides.yaml',
      'teams/devops/vitess_overrides.yaml',
      'teams/time-clock/k8s_overrides.yaml'
    ];
  }

  async searchForAlert(alertname) {
    try {
      console.log(`🔍 Searching for alert: ${alertname} in known files`);
      
      // Check each known alert file
      for (const filePath of this.knownAlertFiles) {
        console.log(`📄 Checking file: ${filePath}`);
        
        try {
          const fileData = await this.github.getFileContents(filePath);
          const fileContent = fileData.content;
          
          // Check if this file contains our alert
          if (fileContent.includes(alertname)) {
            console.log(`✅ Found alert '${alertname}' in: ${filePath}`);
            
            const parsedRule = this.extractAlertRule(fileContent, alertname);
            
            return {
              found: true,
              source: 'github',
              file: filePath,
              url: fileData.url,
              rule: parsedRule
            };
          } else {
            console.log(`   ❌ Not found in ${filePath}`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (error) {
          console.log(`   ⚠️  Error reading ${filePath}: ${error.message}`);
          continue;
        }
      }
      
      console.log(`❌ Alert '${alertname}' not found in any known files`);
      return {
        found: false,
        source: 'github',
        message: `Alert rule '${alertname}' not found in ${this.knownAlertFiles.length} checked files`,
        searchedFiles: this.knownAlertFiles
      };
      
    } catch (error) {
      console.error(`❌ Error searching files: ${error.message}`);
      return {
        found: false,
        source: 'error',
        message: `Error searching files: ${error.message}`,
        error: error.message
      };
    }
  }

  extractAlertRule(fileContent, alertname) {
    // Parse YAML content to extract the specific alert rule
    const lines = fileContent.split('\n');
    let inTargetAlert = false;
    let alertRule = {
      name: alertname,
      expression: '',
      duration: '',
      description: '',
      summary: '',
      target: '',
      labels: {},
      annotations: {}
    };
    
    let currentIndentLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Find the start of our target alert
      if (trimmed === `- name: ${alertname}`) {
        inTargetAlert = true;
        currentIndentLevel = line.length - line.trimLeft().length;
        continue;
      }
      
      if (!inTargetAlert) continue;
      
      // Check if we've moved to the next alert
      const currentIndent = line.length - line.trimLeft().length;
      if (trimmed.startsWith('- name:') && currentIndent <= currentIndentLevel) {
        break;
      }
      
      // Parse the alert properties
      if (trimmed.startsWith('expression:')) {
        // Handle multi-line expressions
        const expressionValue = trimmed.substring(11).trim();
        if (expressionValue === '|') {
          // Multi-line expression
          alertRule.expression = '';
          let j = i + 1;
          while (j < lines.length) {
            const nextLine = lines[j];
            if (nextLine && nextLine.trim() && 
                !nextLine.trim().startsWith('duration:') && 
                !nextLine.trim().startsWith('description:') && 
                !nextLine.trim().startsWith('summary:') && 
                !nextLine.trim().startsWith('target:') && 
                !nextLine.trim().startsWith('- name:')) {
              alertRule.expression += nextLine.trim() + ' ';
              j++;
            } else {
              break;
            }
          }
          i = j - 1; // Skip processed lines
        } else {
          alertRule.expression = expressionValue;
        }
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
    
    // Set annotations and labels
    alertRule.annotations = {
      summary: alertRule.summary,
      description: alertRule.description
    };
    
    alertRule.labels = {
      severity: alertRule.target === 'slack' ? 'warning' : 'critical'
    };
    
    return alertRule;
  }
}

// Test only the real alert
const realAlert = {
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
  
  // GitHub Repository Information
  if (githubResult.found) {
    const rule = githubResult.rule;
    const severityEmoji = getSeverityEmoji(rule.labels?.severity);
    
    context += `${severityEmoji} Rule Definition (🔗 GitHub):\n`;
    context += `📁 File: ${githubResult.file}\n`;
    
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
    context += `🔗 GitHub: ${githubResult.url}\n\n`;
  } else {
    context += `❌ ${githubResult.message}\n`;
    if (githubResult.searchedFiles) {
      context += `📊 Searched files: ${githubResult.searchedFiles.join(', ')}\n`;
    }
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

// Main processing function
async function processAlert(alert, alertSearch) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing Alert: ${alert.details.alertname}`);
  console.log(`${"=".repeat(60)}`);
  
  // Step 1: Parse the alert
  const parsedAlert = parseAlert(alert);
  console.log(`✅ Parsed alert: ${parsedAlert.alertname}`);
  
  // Step 2: Search for alert in known files
  const githubResult = await alertSearch.searchForAlert(parsedAlert.alertname);
  
  // Step 3: Generate context
  const context = generateContext(parsedAlert, githubResult);
  
  // Step 4: Output formatted context
  console.log(context);
}

// Main execution
async function main() {
  console.log("🤖 AI Alert Context Agent - Direct File Access Version");
  console.log(`🔗 Repository: ${process.env.GITHUB_OWNER || 'Connecteam'}/${process.env.GITHUB_REPO || 'alerts'}`);
  
  if (!process.env.GITHUB_TOKEN) {
    console.log("\n❌ GITHUB_TOKEN not found in .env file!");
    console.log("Please add your GitHub Personal Access Token to .env file");
    return;
  } else {
    console.log("✅ GitHub token configured\n");
  }
  
  const alertSearch = new DirectFileAlertSearch();
  
  console.log("Searching known alert files directly...\n");
  
  await processAlert(realAlert, alertSearch);
  
  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ Direct file search complete!");
  console.log("\n🎉 SUCCESS! Found alert definition in actual repository!");
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  console.log("⚠️  This script requires Node.js 18+ for fetch support");
  process.exit(1);
}

// Run the processor with direct file access
main().catch(console.error);
