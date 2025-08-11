import { 
  GitHubApiResponse, 
  GitHubFileResult, 
  GitHubSearchResult, 
  AlertRule,
  Config 
} from '../types';

export class GitHubService {
  private readonly baseUrl = 'https://api.github.com';
  private readonly owner: string;
  private readonly repo: string;
  private readonly token?: string;
  private readonly knownAlertFiles: string[];

  constructor(config: Config) {
    this.owner = config.github.owner;
    this.repo = config.github.repo;
    this.token = config.github.token;
    this.knownAlertFiles = config.knownAlertFiles;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Alert-Context-Agent/1.0',
    };

    // Add any additional headers from options
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    console.log(`📡 GitHub API: ${options.method || 'GET'} ${endpoint}`);

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      ...options,
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Search for code within the repository using GitHub Search API
   * This is more efficient than searching file by file
   */
  async searchCodeInRepository(alertname: string): Promise<GitHubSearchResult> {
    try {
      // According to GitHub Search API docs, we can search for code in a specific repository
      // Try multiple search strategies for better results
      const queries = [
        `"${alertname}" repo:${this.owner}/${this.repo} filename:*.yaml`,
        `${alertname} repo:${this.owner}/${this.repo} extension:yaml`,
        `"name: ${alertname}" repo:${this.owner}/${this.repo}`,
        `${alertname} repo:${this.owner}/${this.repo} path:alerts`
      ];
      
      for (const query of queries) {
        try {
          console.log(`🔍 Trying search query: ${query}`);
          const encodedQuery = encodeURIComponent(query);
          const endpoint = `/search/code?q=${encodedQuery}&per_page=10`;
          
          const searchResponse = await this.makeRequest(endpoint);
          
          if (searchResponse.total_count > 0) {
            console.log(`✅ Found ${searchResponse.total_count} results in GitHub Search`);
            
            // Get the first result (most relevant)
            const firstResult = searchResponse.items[0];
            const filePath = firstResult.path;
            
            console.log(`📄 Found in file: ${filePath}`);
            
            // Fetch the file content to extract the rule
            const fileData = await this.getFileContents(filePath);
            const parsedRule = this.extractAlertRule(fileData.content, alertname);
            
            return {
              found: true,
              source: 'github',
              file: filePath,
              url: firstResult.html_url,
              rule: parsedRule
            };
          } else {
            console.log(`❌ No results found for query: ${query}`);
          }
        } catch (queryError) {
          console.log(`⚠️  Query failed: ${query} - ${queryError}`);
          // Continue to next query
        }
      }
      
      // If we get here, none of the queries found results
      console.log(`❌ No results found in GitHub Search for: ${alertname}`);
      return {
        found: false,
        source: 'github'
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`⚠️  GitHub Search API failed: ${errorMessage}`);
      
      // Return not found so we can fallback to file-by-file search
      return {
        found: false,
        source: 'github'
      };
    }
  }

  async testRepositoryAccess(): Promise<boolean> {
    try {
      await this.makeRequest(`/repos/${this.owner}/${this.repo}`);
      console.log(`✅ GitHub repository access confirmed for ${this.owner}/${this.repo}`);
      return true;
    } catch (error) {
      console.log(`❌ GitHub repository access failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  async getFileContents(filePath: string): Promise<GitHubFileResult> {
    const endpoint = `/repos/${this.owner}/${this.repo}/contents/${filePath}`;
    
    try {
      const result: GitHubApiResponse = await this.makeRequest(endpoint);
      
      if (result.content && result.encoding === 'base64') {
        return {
          content: Buffer.from(result.content, 'base64').toString('utf8'),
          url: result.html_url,
          path: filePath,
        };
      } else {
        throw new Error('File content not found or not base64 encoded');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ File fetch error for ${filePath}: ${errorMessage}`);
      throw error;
    }
  }

  async searchForAlert(alertname: string): Promise<GitHubSearchResult> {
    try {
      console.log(`🔍 Searching for alert: ${alertname} using GitHub Search API`);
      
      // First try GitHub Search API for faster searching
      const searchResult = await this.searchCodeInRepository(alertname);
      if (searchResult.found) {
        return searchResult;
      }
      
      // Fallback to file-by-file search if Search API doesn't find anything
      console.log(`🔄 Search API didn't find '${alertname}', falling back to file-by-file search`);
      
      // Check each known alert file
      for (const filePath of this.knownAlertFiles) {
        console.log(`📄 Checking file: ${filePath}`);
        
        try {
          const fileData = await this.getFileContents(filePath);
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
              rule: parsedRule,
            };
          } else {
            console.log(`   ❌ Not found in ${filePath}`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log(`   ⚠️  Error reading ${filePath}: ${errorMessage}`);
          continue;
        }
      }
      
      console.log(`❌ Alert '${alertname}' not found in any known files`);
      return {
        found: false,
        source: 'github',
        message: `Alert rule '${alertname}' not found in ${this.knownAlertFiles.length} checked files`,
        searchedFiles: this.knownAlertFiles,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error searching files: ${errorMessage}`);
      return {
        found: false,
        source: 'error',
        message: `Error searching files: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  private extractAlertRule(fileContent: string, alertname: string): AlertRule {
    // Parse YAML content to extract the specific alert rule
    const lines = fileContent.split('\n');
    let inTargetAlert = false;
    const alertRule: AlertRule = {
      name: alertname,
      expression: '',
      duration: '',
      description: '',
      summary: '',
      target: '',
      labels: {},
      annotations: {},
    };
    
    let currentIndentLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Find the start of our target alert
      if (trimmed === `- name: ${alertname}`) {
        inTargetAlert = true;
        currentIndentLevel = line.length - line.trimStart().length;
        continue;
      }
      
      if (!inTargetAlert) continue;
      
      // Check if we've moved to the next alert
      const currentIndent = line.length - line.trimStart().length;
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
      description: alertRule.description,
    };
    
    alertRule.labels = {
      severity: alertRule.target === 'slack' ? 'warning' : 'critical',
    };
    
    return alertRule;
  }

  /**
   * Check if the service is enabled (has token)
   */
  isEnabled(): boolean {
    return !!this.token;
  }

  /**
   * Get commit details by commit hash
   * Used for reset investigation to get commit info from logs
   */
  async getCommitDetails(commitHash: string): Promise<{ title: string; message: string; author: string; date: string } | null> {
    if (!this.isEnabled()) {
      console.warn('⚠️  GitHub service not enabled - cannot fetch commit details');
      return null;
    }

    try {
      console.log(`🔍 Fetching commit details for: ${commitHash}`);
      
      const endpoint = `/repos/${this.owner}/${this.repo}/commits/${commitHash}`;
      const data = await this.makeRequest(endpoint);
      
      const commitInfo = {
        title: data.commit?.message?.split('\n')[0] || 'No commit message',
        message: data.commit?.message || 'No commit message',
        author: data.commit?.author?.name || data.author?.login || 'Unknown',
        date: data.commit?.author?.date || data.commit?.committer?.date || 'Unknown'
      };
      
      console.log(`✅ Found commit: "${commitInfo.title}" by ${commitInfo.author}`);
      return commitInfo;
    } catch (error) {
      console.error(`❌ Error fetching commit ${commitHash}:`, error);
      return null;
    }
  }
}
