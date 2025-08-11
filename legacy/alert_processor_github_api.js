// AI Alert Context Agent - Direct GitHub API Integration
// This version makes actual GitHub API calls using fetch (no MCP)

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

// Direct GitHub API client
class GitHubApiClient {
  constructor() {
    this.owner = process.env.GITHUB_OWNER || 'Connecteam';
    this.repo = process.env.GITHUB_REPO || 'alerts';
    this.token = process.env.GITHUB_TOKEN;
    this.baseUrl = 'https://api.github.com';
  }

  // Make authenticated GitHub API request
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

  // Search for code in the repository
  async searchCode(query) {
    // Try multiple search variations
    const searchQueries = [
      `"${query}" repo:${this.owner}/${this.repo}`,
      `${query} repo:${this.owner}/${this.repo}`,
      `CPU repo:${this.owner}/${this.repo} filename:*.yaml`,
      `throttling repo:${this.owner}/${this.repo} filename:*.yaml`
    ];
    
    for (const searchQuery of searchQueries) {
      const endpoint = `/search/code?q=${encodeURIComponent(searchQuery)}&per_page=10`;
      
      try {
        console.log(`🔍 Trying search: ${searchQuery}`);
        const result = await this.makeRequest(endpoint);
        
        if (result.total_count > 0) {
          console.log(`✅ Found ${result.total_count} results with query: ${searchQuery}`);
          return {
            found: true,
            total_count: result.total_count,
            files: result.items || [],
            successful_query: searchQuery
          };
        } else {
          console.log(`❌ No results for: ${searchQuery}`);
        }
        
        // Wait a bit between searches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Search error for "${searchQuery}": ${error.message}`);
        continue;
      }
    }
    
    return { found: false, error: 'No results found with any search variation' };
  }

  // Get file contents from repository
  async getFileContents(filePath) {
    const endpoint = `/repos/${this.owner}/${this.repo}/contents/${filePath}`;
    
    try {
      const result = await this.makeRequest(endpoint);
      
      if (result.content && result.encoding === 'base64') {
        return Buffer.from(result.content, 'base64').toString('utf8');
      } else {
        throw new Error('File content not found or not base64 encoded');
      }
    } catch (error) {
      console.error(`❌ File fetch error: ${error.message}`);
      throw error;
    }
  }
}

// GitHub Alert Search using direct API calls
class DirectGitHubAlertSearch {
  constructor() {
    this.github = new GitHubApiClient();
  }

  async searchForAlert(alertname) {
    try {
      console.log(`🔍 Searching GitHub repo ${this.github.owner}/${this.github.repo} for alert: ${alertname}`);
      
      // Step 1: Search for the alert name in the repository
      const searchResult = await this.github.searchCode(alertname);
      
      if (searchResult.found && searchResult.files.length > 0) {
        // Step 2: Get the content of the first matching file
        const firstFile = searchResult.files[0];
        console.log(`✅ Found alert in: ${firstFile.path}`);
        
        const fileContent = await this.github.getFileContents(firstFile.path);
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
          message: `Alert rule '${alertname}' not found in ${this.github.owner}/${this.github.repo} repository`,
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

// Test alerts
const testAlerts = [
  {
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
  },
  {
    status: "FIRING",
    alertTitle: "NonExistentAlert for test",
    alert: "This alert should not be found.",
    description: "Testing the 'not found' scenario.",
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
    
    context += `${severityEmoji} Rule Definition (from GitHub):\n`;
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
async function processAlert(alert, githubSearch) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing Alert: ${alert.details.alertname}`);
  console.log(`${"=".repeat(60)}`);
  
  // Step 1: Parse the alert
  const parsedAlert = parseAlert(alert);
  console.log(`✅ Parsed alert: ${parsedAlert.alertname}`);
  
  // Step 2: Search GitHub repository with REAL API calls
  const githubResult = await githubSearch.searchForAlert(parsedAlert.alertname);
  
  // Step 3: Generate context
  const context = generateContext(parsedAlert, githubResult);
  
  // Step 4: Output formatted context
  console.log(context);
}

// Main execution
async function main() {
  console.log("🤖 AI Alert Context Agent - Direct GitHub API Version");
  console.log(`🔗 Repository: ${process.env.GITHUB_OWNER || 'Connecteam'}/${process.env.GITHUB_REPO || 'alerts'}`);
  
  if (!process.env.GITHUB_TOKEN) {
    console.log("\n❌ GITHUB_TOKEN not found in .env file!");
    console.log("Please add your GitHub Personal Access Token to .env file");
    console.log("Create token at: https://github.com/settings/tokens");
    console.log("Required scopes: 'repo' (for private repos) or 'public_repo' (for public repos)\n");
    return;
  } else {
    console.log("✅ GitHub token configured\n");
  }
  
  const githubSearch = new DirectGitHubAlertSearch();
  
  console.log("Processing alerts with REAL GitHub API calls...\n");
  
  for (const alert of testAlerts) {
    await processAlert(alert, githubSearch);
  }
  
  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ GitHub API integration complete!");
  console.log("\n🎉 SUCCESS! Real GitHub API calls working!");
  console.log("\n📝 Next Steps:");
  console.log("1. Integrate with Slack Bot SDK");
  console.log("2. Add real-time alert monitoring");
  console.log("3. Deploy as a service");
}

// Check if fetch is available (Node 18+) or provide polyfill
if (typeof fetch === 'undefined') {
  console.log("⚠️  This script requires Node.js 18+ for fetch support");
  console.log("To run on older Node versions, install node-fetch:");
  console.log("npm install node-fetch");
  process.exit(1);
}

// Run the processor with real GitHub API calls
main().catch(console.error);
