import { Alert } from '../types';
export * from './http';

/**
 * Utility functions for the Alert Context Agent
 */

export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export const formatDuration = (duration: string): string => {
  // Convert durations like "10m" to "10 minutes"
  const match = duration.match(/(\d+)([a-z]+)/);
  if (!match) return duration;
  
  const [, value, unit] = match;
  const unitMap: Record<string, string> = {
    's': 'second',
    'm': 'minute', 
    'h': 'hour',
    'd': 'day',
  };
  
  const unitName = unitMap[unit] || unit;
  const plural = parseInt(value) !== 1 ? 's' : '';
  
  return `${value} ${unitName}${plural}`;
};

export const createMockAlert = (alertname: string, overrides: Partial<Alert> = {}): Alert => {
  return {
    status: 'FIRING',
    alertTitle: `${alertname} for`,
    alert: 'Mock alert for testing',
    description: 'This is a mock alert generated for testing purposes',
    details: {
      alertname,
      container: 'test-container',
      ct_cluster: 'test.production',
      namespace: 'default',
      pod: 'test-pod-12345',
      target: 'slack',
      team: 'test-team',
    },
    ...overrides,
  };
};

export const validateAlert = (alert: any): alert is Alert => {
  if (!alert || typeof alert !== 'object') return false;
  
  const requiredFields = ['status', 'alertTitle', 'alert', 'description', 'details'];
  for (const field of requiredFields) {
    if (!(field in alert)) return false;
  }
  
  if (!alert.details || typeof alert.details !== 'object') return false;
  if (!alert.details.alertname || typeof alert.details.alertname !== 'string') return false;
  
  return true;
};

export const extractAlertNameFromTitle = (title: string): string | null => {
  // Extract alert name from titles like "[FIRING:1] AlertName for something"
  const match = title.match(/\[(?:FIRING|RESOLVED)(?::\d+)?\]\s*(\w+)/);
  return match ? match[1] : null;
};

export const logWithTimestamp = (message: string): void => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
};

export const formatBytes = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export const sanitizeForMarkdown = (text: string): string => {
  // Escape markdown special characters
  return text.replace(/[*_`~\[\]()]/g, '\\$&');
};

export default {
  delay,
  truncateText,
  formatDuration,
  createMockAlert,
  validateAlert,
  extractAlertNameFromTitle,
  logWithTimestamp,
  formatBytes,
  sanitizeForMarkdown,
};
