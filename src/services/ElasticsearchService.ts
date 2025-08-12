import { Config } from '../types';
import { httpFetch } from '@/utils';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  pod?: string;
  container?: string;
  namespace?: string;
  source?: string;
  service?: string;
  module?: string;
  environment?: string;
  applicationName?: string;
  [key: string]: any;
}

/**
 * Elasticsearch Service - Fetches logs related to alerts
 */
export class ElasticsearchService {
  private enabled: boolean = false;
  private config: Config['elasticsearch'];

  constructor(config: Config) {
    this.config = config.elasticsearch;
    
    if (this.config.url) {
      this.enabled = true;
      console.log('✅ Elasticsearch service initialized');
    } else {
      console.warn('⚠️  Elasticsearch URL not configured - log fetching disabled');
    }
  }

  /**
   * Get the last logs for a specific pod within a timeframe
   */
  async getLastLogsForPod(podName: string, limit: number = 100, logLevel?: string, messageFilter?: string, timeframeMinutes?: number): Promise<LogEntry[]> {
    if (!this.enabled) {
      console.warn('⚠️  Elasticsearch not available - cannot fetch logs');
      return [];
    }

    try {
      const levelFilter = logLevel ? ` (${logLevel} level)` : '';
      const msgFilter = messageFilter ? ` (containing "${messageFilter}")` : '';
      const timeFilter = timeframeMinutes ? ` (last ${timeframeMinutes}min)` : '';
      console.log(`🔍 Fetching last ${limit}${levelFilter}${msgFilter}${timeFilter} logs for pod: ${podName}`);

      const mustFilters: any[] = [
        {
          bool: {
            should: [
              {
                term: {
                  'json.hostname.keyword': podName
                }
              },
              {
                term: {
                  'json.hostname': podName
                }
              }
            ],
            minimum_should_match: 1
          }
        }
      ];

      // Add timeframe filter if specified
      if (timeframeMinutes) {
        const startTime = new Date(Date.now() - timeframeMinutes * 60 * 1000);
        mustFilters.push({
          range: {
            '@timestamp': {
              gte: startTime.toISOString()
            }
          }
        });
      }

      // Add log level filter if specified
      if (logLevel) {
        mustFilters.push({
          term: {
            'json.levelname.keyword': logLevel
          }
        });
      }

      // Add message filter if specified
      if (messageFilter) {
        mustFilters.push({
          match: {
            'json.message': messageFilter
          }
        });
      }

      const searchBody = {
        query: {
          bool: {
            must: mustFilters
          }
        },
        sort: [
          {
            '@timestamp': {
              order: 'desc' as const
            }
          }
        ],
        size: limit,
        _source: [
          '@timestamp',
          'json.levelname',
          'json.message',
          'json.hostname',
          'json.service_name',
          'json.module',
          'json.environment',
          'applicationName',
          'ct_deployment',
          'ct_feature',
          'ct_kind',
          'json.request_id'
        ]
      };

      console.log(`📡 Elasticsearch query:`, JSON.stringify(searchBody, null, 2));

      // Make direct HTTP request to /search/_search
      const searchUrl = `${this.config.url}/_search`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.config.username && this.config.password) {
        headers['Authorization'] = `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
      } else if (this.config.apiKey) {
        headers['Authorization'] = `ApiKey ${this.config.apiKey}`;
      }

      const httpResponse = await httpFetch(searchUrl, {
        method: 'POST',
        headers,
        body: searchBody,
        timeoutMs: this.config.timeout,
      });

      if (!httpResponse.ok) {
        throw new Error(`HTTP ${httpResponse.status}: ${await httpResponse.text()}`);
      }

      const response = await httpResponse.json();
      
      if (!response.hits || !response.hits.hits) {
        console.warn('⚠️  No logs found or unexpected response format');
        return [];
      }

      const logs: LogEntry[] = response.hits.hits.map((hit: any) => {
        const source = hit._source;
        return {
          timestamp: source['@timestamp'] || new Date().toISOString(),
          level: source.json?.levelname || 'info',
          message: source.json?.message || 'No message',
          pod: source.json?.hostname || podName,
          container: source.ct_deployment,
          namespace: source.ct_feature,
          source: 'elasticsearch',
          service: source.json?.service_name,
          module: source.json?.module,
          environment: source.json?.environment,
          applicationName: source.applicationName,
          requestId: source.json?.request_id
        };
      });

      console.log(`✅ Found ${logs.length} log entries for pod ${podName}`);
      return logs;

    } catch (error: any) {
      console.error('❌ Elasticsearch query failed:', error);
      
      // Check if this is a 404 which might mean no results found
      if (error.meta?.statusCode === 404) {
        console.log('ℹ️  404 response - this might indicate no matching documents were found');
        return [];
      }
      
      // Return empty array instead of throwing to allow graceful degradation
      return [];
    }
  }

  /**
   * Get the last logs with slow request times (json.extra.request_time > threshold) within a timeframe
   */
  async getLastSlowRequestLogsForPod(podName: string, limit: number = 100, thresholdSeconds: number = 1, timeframeMinutes?: number): Promise<LogEntry[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const timeFilter = timeframeMinutes ? ` (last ${timeframeMinutes}min)` : '';
      console.log(`🔍 Fetching last ${limit} slow request logs (>${thresholdSeconds}s)${timeFilter} for pod: ${podName}`);

      const mustFilters: any[] = [
        // Pod name filter (exact match)
        {
          bool: {
            should: [
              {
                term: {
                  'json.hostname.keyword': podName
                }
              },
              {
                term: {
                  'json.hostname': podName
                }
              }
            ],
            minimum_should_match: 1
          }
        },
        // Request time filter (greater than threshold)
        {
          range: {
            'json.extra.request_time': {
              gt: thresholdSeconds
            }
          }
        },
        // Make sure json.extra.request_time field exists
        {
          exists: {
            field: 'json.extra.request_time'
          }
        }
      ];

      // Add timeframe filter if specified
      if (timeframeMinutes) {
        const startTime = new Date(Date.now() - timeframeMinutes * 60 * 1000);
        mustFilters.push({
          range: {
            '@timestamp': {
              gte: startTime.toISOString()
            }
          }
        });
      }

      const searchQuery = {
        query: {
          bool: {
            must: mustFilters
          }
        },
        sort: [
          {
            '@timestamp': {
              order: 'desc'
            }
          }
        ],
        size: limit,
        _source: [
          '@timestamp',
          'json.levelname',
          'json.message',
          'json.hostname',
          'json.service_name',
          'json.module',
          'json.environment',
          'json.extra.request_time',
          'json.request_id',
          'applicationName',
          'ct_deployment',
          'ct_feature',
          'ct_kind'
        ]
      };

      console.log('📡 Elasticsearch query:', JSON.stringify(searchQuery, null, 2));

      const response = await httpFetch(`${this.config.url}/${this.config.indexPattern}/_search`, {
        method: 'POST',
        headers: this.buildAuthHeaders(),
        body: searchQuery,
        timeoutMs: this.config.timeout,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Elasticsearch error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const hits = data.hits?.hits || [];

      const logs: LogEntry[] = hits.map((hit: any) => {
        const source = hit._source;
        return {
          timestamp: source['@timestamp'] || new Date().toISOString(),
          level: source.json?.levelname || 'info',
          message: source.json?.message || 'No message',
          pod: source.json?.hostname || podName,
          container: source.ct_deployment,
          namespace: source.ct_feature,
          source: 'elasticsearch',
          service: source.json?.service_name,
          module: source.json?.module,
          environment: source.json?.environment,
          applicationName: source.applicationName,
          requestTime: source.json?.extra?.request_time, // Include request time for display
          requestId: source.json?.request_id
        };
      });

      console.log(`✅ Found ${logs.length} slow request log entries for pod ${podName}`);
      return logs;

    } catch (error: any) {
      console.error('❌ Elasticsearch slow request query failed:', error);
      
      // Check if this is a 404 which might mean no results found
      if (error.meta?.statusCode === 404) {
        console.log('ℹ️  404 response - this might indicate no matching documents were found');
        return [];
      }
      
      // Return empty array instead of throwing to allow graceful degradation
      return [];
    }
  }

  /**
   * Search for Git commit info logs to find pod initialization timestamp
   * Returns the most recent "Git info: commit" entries for reset investigation
   */
  async findGitCommitLogs(podName: string, timeframeMinutes: number = 240): Promise<{ timestamp: string; commitHash: string; fullMessage: string }[]> {
    if (!this.enabled) {
      console.warn('⚠️  Elasticsearch not available - cannot search Git commit logs');
      return [];
    }

    try {
      console.log(`🔍 Searching for Git commit logs for pod: ${podName} (last ${timeframeMinutes}min)`);
      
      const timeFrom = new Date(Date.now() - timeframeMinutes * 60 * 1000).toISOString();
      
      const searchQuery = {
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    {
                      term: {
                        'json.hostname.keyword': podName
                      }
                    },
                    {
                      term: {
                        'json.hostname': podName
                      }
                    }
                  ],
                  minimum_should_match: 1
                }
              },
              {
                match: {
                  'json.message': 'Git info: commit'
                }
              },
              {
                range: {
                  '@timestamp': {
                    gte: timeFrom
                  }
                }
              }
            ]
          }
        },
        sort: [
          {
            '@timestamp': {
              order: 'desc' // Most recent first
            }
          }
        ],
        size: 5, // Get up to 5 recent commits
        _source: ['@timestamp', 'json.message', 'json.hostname']
      };

      const response = await httpFetch(`${this.config.url}/_search`, {
        method: 'POST',
        headers: this.buildAuthHeaders(),
        body: searchQuery,
        timeoutMs: this.config.timeout,
      });

      if (!response.ok) {
        throw new Error(`Elasticsearch search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const hits = data.hits?.hits || [];
      
      console.log(`📊 Found ${hits.length} Git commit log entries`);

      const commitLogs = hits.map((hit: any) => {
        const source = hit._source;
        const message = source.json?.message || '';
        const hostname = source.json?.hostname || 'unknown';
        

        
        // Extract commit hash from message like "Git info: commit a1b2c3d4"
        const commitHashMatch = message.match(/Git info: commit ([a-f0-9]{8})/);
        const commitHash = commitHashMatch ? commitHashMatch[1] : '';
        
        return {
          timestamp: source['@timestamp'],
          commitHash,
          fullMessage: message
        };
      }).filter((log: { timestamp: string; commitHash: string; fullMessage: string }) => log.commitHash); // Only return logs with valid commit hashes

      console.log(`✅ Found ${commitLogs.length} valid Git commit entries`);
      return commitLogs;
    } catch (error) {
      console.error('❌ Error searching Git commit logs:', error);
      return [];
    }
  }

  /**
   * Get all logs for a pod since a specific timestamp
   * Used for reset investigation to get logs since pod initialization
   */
  async getLogsSinceTimestamp(podName: string, sinceTimestamp: string, limit: number = 500): Promise<LogEntry[]> {
    if (!this.enabled) {
      console.warn('⚠️  Elasticsearch not available - cannot fetch logs since timestamp');
      return [];
    }

    try {
      console.log(`🔍 Fetching logs for pod ${podName} since ${sinceTimestamp} (limit: ${limit})`);
      
      const searchQuery = {
        query: {
          bool: {
            must: [
              {
                term: {
                  'json.hostname': podName
                }
              },
              {
                range: {
                  '@timestamp': {
                    gte: sinceTimestamp
                  }
                }
              }
            ]
          }
        },
        sort: [
          {
            '@timestamp': {
              order: 'asc' // Chronological order for reset analysis
            }
          }
        ],
        size: limit,
        _source: ['@timestamp', 'json.levelname', 'json.message', 'json.hostname', 'json.service_name', 'json.module', 'json.request_id']
      };

      const response = await httpFetch(`${this.config.url}/${this.config.indexPattern}/_search`, {
        method: 'POST',
        headers: this.buildAuthHeaders(),
        body: searchQuery,
        timeoutMs: this.config.timeout,
      });

      if (!response.ok) {
        throw new Error(`Elasticsearch search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const hits = data.hits?.hits || [];
      
      console.log(`📊 Found ${hits.length} logs since timestamp`);

      const logs = hits.map((hit: any) => {
        const source = hit._source;
        return {
          timestamp: source['@timestamp'],
          level: source.json?.levelname || 'INFO',
          message: source.json?.message || '',
          pod: source.json?.hostname || podName,
          service: source.json?.service_name,
          module: source.json?.module,
          requestId: source.json?.request_id
        };
      });

      console.log(`✅ Retrieved ${logs.length} logs since pod initialization`);
      return logs;
    } catch (error) {
      console.error('❌ Error fetching logs since timestamp:', error);
      return [];
    }
  }

  /**
   * Get all logs for a specific request ID across all pods and timeframes
   * Used for request flow analysis and debugging
   */
  async getAllLogsByRequestId(requestId: string, maxDocs: number = 1000): Promise<any[]> {
    if (!this.enabled) {
      console.log('ℹ️  Elasticsearch not enabled, skipping request trace');
      return [];
    }

    try {
      console.log(`🔍 Fetching all logs for request ID: ${requestId}`);

      const searchQuery = {
        query: {
          bool: {
            must: [
              {
                term: {
                  'json.request_id.keyword': requestId
                }
              }
            ]
          }
        },
        sort: [
          {
            '@timestamp': {
              order: 'asc' // Chronological order for request flow
            }
          }
        ],
        size: maxDocs,
        _source: '*' // Get all fields for comprehensive context
      };

      console.log(`📡 Request trace query:`, JSON.stringify(searchQuery, null, 2));

      const response = await fetch(`${this.config.url}/${this.config.indexPattern}/_search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`
        },
        body: JSON.stringify(searchQuery)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Elasticsearch request trace error response:', errorText);
        throw new Error(`Elasticsearch query failed with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const hits = data.hits?.hits || [];

      console.log(`✅ Found ${hits.length} documents for request ID ${requestId}`);
      
      // Return the full documents for AI analysis
      return hits.map((hit: any) => ({
        ...hit._source,
        _id: hit._id,
        _index: hit._index
      }));

    } catch (error: any) {
      console.error('❌ Request trace query failed:', error);
      throw error; // Re-throw for caller to handle
    }
  }

  /**
   * Get logs around a specific time window (useful for alert correlation)
   */
  async getLogsAroundTime(podName: string, alertTime: Date, windowMinutes: number = 10): Promise<LogEntry[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const startTime = new Date(alertTime.getTime() - windowMinutes * 60 * 1000);
      const endTime = new Date(alertTime.getTime() + windowMinutes * 60 * 1000);

      console.log(`🔍 Fetching logs for pod ${podName} around alert time (±${windowMinutes}min)`);

      const searchQuery = {
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    {
                      term: {
                        'json.hostname.keyword': podName
                      }
                    },
                    {
                      term: {
                        'json.hostname': podName
                      }
                    }
                  ],
                  minimum_should_match: 1
                }
              },
              {
                range: {
                  '@timestamp': {
                    gte: startTime.toISOString(),
                    lte: endTime.toISOString()
                  }
                }
              }
            ]
          }
        },
        sort: [
          {
            '@timestamp': {
              order: 'desc' as const
            }
          }
        ],
        size: 50
      };

      // Make direct HTTP request to /search/_search
      const searchUrl = `${this.config.url}/_search`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.config.username && this.config.password) {
        headers['Authorization'] = `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
      } else if (this.config.apiKey) {
        headers['Authorization'] = `ApiKey ${this.config.apiKey}`;
      }

      const httpResponse = await fetch(searchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(searchQuery)
      });

      if (!httpResponse.ok) {
        throw new Error(`HTTP ${httpResponse.status}: ${await httpResponse.text()}`);
      }

      const response = await httpResponse.json();
      
      if (!response.hits?.hits) {
        return [];
      }

      const logs: LogEntry[] = response.hits.hits.map((hit: any) => {
        const source = hit._source;
        return {
          timestamp: source['@timestamp'] || new Date().toISOString(),
          level: source.level || source['log.level'] || 'info',
          message: source.message || source.log || 'No message',
          pod: source['kubernetes.pod.name'] || podName,
          container: source['kubernetes.container.name'],
          namespace: source['kubernetes.namespace'],
          source: 'elasticsearch'
        };
      });

      console.log(`✅ Found ${logs.length} logs around alert time`);
      return logs;

    } catch (error) {
      console.error('❌ Time-based Elasticsearch query failed:', error);
      return [];
    }
  }

  /**
   * Test Elasticsearch connectivity
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      // Test the actual search endpoint we'll be using
      const healthUrl = `${this.config.url}/_search`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.config.username && this.config.password) {
        headers['Authorization'] = `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
      } else if (this.config.apiKey) {
        headers['Authorization'] = `ApiKey ${this.config.apiKey}`;
      }

      const response = await httpFetch(healthUrl, {
        method: 'POST',
        headers,
        body: {
          query: { match_all: {} },
          size: 0
        },
        timeoutMs: this.config.timeout,
      });

      if (response.ok) {
        console.log('✅ Elasticsearch health check passed');
        return true;
      } else {
        console.error(`❌ Elasticsearch health check failed: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Elasticsearch health check failed:', error);
      return false;
    }
  }

  /**
   * Check if the service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  private buildAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.config.apiKey && { 'Authorization': `ApiKey ${this.config.apiKey}` }),
      ...(this.config.username && this.config.password && {
        'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`
      })
    };
  }
}
