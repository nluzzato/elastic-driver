import { Config } from '../types';
import { httpFetch } from '@/utils';

export interface MetricValue {
  timestamp: number;
  value: string;
}

// For Prometheus array format [timestamp, value]
export type PrometheusValue = [number, string];

export interface MetricSeries {
  metric: Record<string, string>;
  values?: PrometheusValue[];
  value?: PrometheusValue;
}

export interface PrometheusQueryResult {
  status: 'success' | 'error';
  data: {
    resultType: 'matrix' | 'vector' | 'scalar' | 'string';
    result: MetricSeries[];
  };
  error?: string;
}

export interface GrafanaMetricData {
  query: string;
  currentValue?: number;
  threshold?: number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  percentageChange?: number;
  dashboardUrl?: string;
}

/**
 * Grafana Service - Fetches metrics and dashboard context via Grafana API
 */
export class GrafanaService {
  private enabled: boolean = false;
  private config: Config['grafana'];

  constructor(config: Config) {
    this.config = config.grafana;
    
    if (this.config?.url && this.config?.apiKey) {
      this.enabled = true;
      console.log('✅ Grafana service initialized');
    } else {
      console.warn('⚠️  Grafana URL or API key not configured - metrics fetching disabled');
    }
  }

  /**
   * Query Prometheus metrics via Grafana proxy
   */
  async queryMetric(query: string, datasourceId: string = '1'): Promise<PrometheusQueryResult> {
    if (!this.enabled) {
      throw new Error('Grafana service not available');
    }

    try {
      console.log(`🔍 Querying Grafana metric: ${query}`);

      const url = `${this.config!.url}/api/datasources/proxy/${datasourceId}/api/v1/query`;
      const response = await httpFetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config!.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          query: query,
          time: Math.floor(Date.now() / 1000).toString()
        }),
        timeoutMs: this.config!.timeout,
      });

      if (!response.ok) {
        throw new Error(`Grafana API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ Grafana metric query successful`);
      return result;

    } catch (error) {
      console.error('❌ Grafana metric query failed:', error);
      throw error;
    }
  }

  /**
   * Query Prometheus range data via Grafana proxy
   */
  async queryRange(
    query: string, 
    startTime: Date, 
    endTime: Date, 
    step: string = '60s',
    datasourceId: string = '1'
  ): Promise<PrometheusQueryResult> {
    if (!this.enabled) {
      throw new Error('Grafana service not available');
    }

    try {
      console.log(`🔍 Querying Grafana range data: ${query}`);

      const url = `${this.config!.url}/api/datasources/proxy/${datasourceId}/api/v1/query_range`;
      const response = await httpFetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config!.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          query: query,
          start: Math.floor(startTime.getTime() / 1000).toString(),
          end: Math.floor(endTime.getTime() / 1000).toString(),
          step: step
        }),
        timeoutMs: this.config!.timeout,
      });

      if (!response.ok) {
        throw new Error(`Grafana API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ Grafana range query successful`);
      return result;

    } catch (error) {
      console.error('❌ Grafana range query failed:', error);
      throw error;
    }
  }

  /**
   * Get alert metric current value and related context
   */
  async getAlertMetricData(
    alertExpression: string, 
    podName: string,
    alertName: string
  ): Promise<GrafanaMetricData> {
    if (!this.enabled) {
      return {
        query: alertExpression,
        dashboardUrl: undefined
      };
    }

    try {
      console.log(`🔍 Getting alert metric data for: ${alertName}`);

      // Query current value
      const currentResult = await this.queryMetric(alertExpression);
      
      let currentValue: number | undefined;
      if (currentResult.status === 'success' && currentResult.data.result.length > 0) {
        const value = currentResult.data.result[0].value?.[1];
        currentValue = value ? parseFloat(value) : undefined;
      }

      // Query historical data for trend (last 30 minutes)
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 30 * 60 * 1000); // 30 minutes ago
      
      let trend: 'up' | 'down' | 'stable' | undefined;
      let percentageChange: number | undefined;

      try {
        const rangeResult = await this.queryRange(alertExpression, startTime, endTime, '5m');
        
        if (rangeResult.status === 'success' && rangeResult.data.result.length > 0) {
          const values = rangeResult.data.result[0].values;
          if (values && values.length >= 2) {
            const firstValue = parseFloat(values[0][1]);
            const lastValue = parseFloat(values[values.length - 1][1]);
            
            if (lastValue > firstValue * 1.1) {
              trend = 'up';
            } else if (lastValue < firstValue * 0.9) {
              trend = 'down';
            } else {
              trend = 'stable';
            }
            
            percentageChange = ((lastValue - firstValue) / firstValue) * 100;
          }
        }
      } catch (error) {
        console.warn('⚠️  Could not get trend data:', error);
      }

      // Generate dashboard URL (generic for now)
      const dashboardUrl = this.generateDashboardUrl(podName, alertName);

      return {
        query: alertExpression,
        currentValue,
        trend,
        percentageChange,
        dashboardUrl
      };

    } catch (error) {
      console.error('❌ Failed to get alert metric data:', error);
      return {
        query: alertExpression,
        dashboardUrl: undefined
      };
    }
  }

  /**
   * Get related metrics for a pod (CPU, memory, network, etc.)
   */
  async getRelatedMetrics(podName: string, namespace: string = 'default'): Promise<GrafanaMetricData[]> {
    if (!this.enabled) {
      return [];
    }

    const metrics = [
      {
        name: 'CPU Usage',
        query: `rate(container_cpu_usage_seconds_total{pod="${podName}", namespace="${namespace}"}[5m]) * 100`,
        unit: '%'
      },
      {
        name: 'Memory Usage',
        query: `container_memory_usage_bytes{pod="${podName}", namespace="${namespace}"} / 1024 / 1024`,
        unit: 'MB'
      },
      {
        name: 'Network RX',
        query: `rate(container_network_receive_bytes_total{pod="${podName}", namespace="${namespace}"}[5m]) / 1024`,
        unit: 'KB/s'
      },
      {
        name: 'Network TX',
        query: `rate(container_network_transmit_bytes_total{pod="${podName}", namespace="${namespace}"}[5m]) / 1024`,
        unit: 'KB/s'
      }
    ];

    const results: GrafanaMetricData[] = [];

    for (const metric of metrics) {
      try {
        const result = await this.queryMetric(metric.query);
        
        let currentValue: number | undefined;
        if (result.status === 'success' && result.data.result.length > 0) {
          const value = result.data.result[0].value?.[1];
          currentValue = value ? parseFloat(value) : undefined;
        }

        results.push({
          query: metric.query,
          currentValue,
          unit: metric.unit,
          dashboardUrl: this.generateDashboardUrl(podName, metric.name)
        });

      } catch (error) {
        console.warn(`⚠️  Could not get ${metric.name}:`, error);
        results.push({
          query: metric.query,
          unit: metric.unit,
          dashboardUrl: undefined
        });
      }
    }

    return results;
  }

  /**
   * Generate dashboard URL for a pod/metric
   */
  private generateDashboardUrl(podName: string, context: string): string {
    // This is a generic implementation - customize based on your Grafana setup
    const baseUrl = this.config!.url;
    const encodedPod = encodeURIComponent(podName);
    
    // Example dashboard URL pattern - adjust based on your Grafana dashboards
    return `${baseUrl}/d/pod-overview?var-pod=${encodedPod}&from=now-30m&to=now`;
  }

  /**
   * Test Grafana connectivity and permissions
   * TODO: Need to determine correct API endpoints for this Grafana instance
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const headers = { 'Authorization': `Bearer ${this.config!.apiKey}` };
      const endpoints = ['/api/health', '/api/search', '/api/datasources'];
      for (const ep of endpoints) {
        const resp = await httpFetch(`${this.config!.url}${ep}`, { headers, timeoutMs: 5000 });
        if (resp.ok) {
          console.log(`✅ Grafana health check passed via ${ep}`);
          return true;
        }
        console.warn(`⚠️  Grafana health probe ${ep} returned ${resp.status}`);
      }
      console.error('❌ Grafana health check failed: all probes unsuccessful');
      return false;

    } catch (error) {
      console.error('❌ Grafana connectivity failed:', error);
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
