import { Config } from '../types';

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
   * Get the last 100 logs for a specific pod
   */
  async getLastLogsForPod(podName: string, limit: number = 100, logLevel?: string, messageFilter?: string): Promise<LogEntry[]> {
    if (!this.enabled) {
      console.warn('⚠️  Elasticsearch not available - cannot fetch logs');
      return [];
    }

    try {
      const levelFilter = logLevel ? ` (${logLevel} level)` : '';
      const msgFilter = messageFilter ? ` (containing "${messageFilter}")` : '';
      console.log(`🔍 Fetching last ${limit}${levelFilter}${msgFilter} logs for pod: ${podName}`);

      const mustFilters: any[] = [
        {
          match: {
            'json.hostname': podName
          }
        }
      ];

      // Add log level filter if specified
      if (logLevel) {
        mustFilters.push({
          match: {
            'json.levelname': logLevel
          }
        });
      }

      // Add message filter if specified
      if (messageFilter) {
        mustFilters.push({
          match_phrase: {
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
          'ct_kind'
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

      const httpResponse = await fetch(searchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(searchBody)
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
          applicationName: source.applicationName
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
                match: {
                  'json.hostname': podName
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

      const response = await fetch(healthUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: { match_all: {} },
          size: 0 // Just test connectivity, don't return data
        })
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
}
