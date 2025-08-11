import * as dotenv from 'dotenv';
import { Config } from '../types';

// Load environment variables
dotenv.config();

export const config: Config = {
  github: {
    owner: process.env.GITHUB_OWNER || 'Connecteam',
    repo: process.env.GITHUB_REPO || 'alerts',
    token: process.env.GITHUB_TOKEN,
  },
  openai: {
    apiKey: process.env.OPEN_AI_KEY,
  },
  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL,
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
    apiKey: process.env.ELASTICSEARCH_API_KEY,
    indexPattern: process.env.ELASTICSEARCH_INDEX_PATTERN || 'app-logs*',
    timeout: parseInt(process.env.ELASTICSEARCH_TIMEOUT || '30000')
  },
  grafana: {
    url: process.env.GRAFANA_URL,
    apiKey: process.env.GRAFANA_API_KEY,
    timeout: parseInt(process.env.GRAFANA_TIMEOUT || '30000')
  },
  knownAlertFiles: [
    'default_alerts/k8s_alerts.yaml',
    'default_alerts/app_alerts.yaml',
    'default_alerts/infra_alerts.yaml',
    'teams/core/k8s_overrides.yaml',
    'teams/devops/vitess_overrides.yaml',
    'teams/time-clock/k8s_overrides.yaml',
  ],
};

export const validateConfig = (): void => {
  if (!config.github.token) {
    console.warn('⚠️  GITHUB_TOKEN not found in environment variables');
    console.warn('   The agent will use fallback mock data when GitHub access fails');
  }

  if (!config.openai.apiKey) {
    console.warn('⚠️  OPEN_AI_KEY not found in environment variables');
    console.warn('   Query explanations will be disabled');
  }

  if (!config.elasticsearch.url) {
    console.warn('⚠️  ELASTICSEARCH_URL not found in environment variables');
    console.warn('   Log fetching will be disabled');
  }

  // Grafana is optional for now
  if (!config.grafana || !config.grafana.url || !config.grafana.apiKey) {
    console.warn('⚠️  GRAFANA_URL or GRAFANA_API_KEY not found in environment variables');
    console.warn('   Metrics fetching will be disabled');
  }

  if (config.knownAlertFiles.length === 0) {
    throw new Error('No alert files configured');
  }
};

export default config;
