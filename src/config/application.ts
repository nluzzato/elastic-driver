// Centralized Application Configuration
// All configurable prompts, settings, and constants

export const ApplicationConfiguration = {
  // ===== AI PROMPTS =====
  
  // Prometheus Alert Explanation Prompt
  prometheusAlertPrompt: `You are an expert Site Reliability Engineer. Explain this Prometheus alert expression in clear, practical terms.

Focus on:
- What the metric measures in simple terms
- What conditions trigger the alert
- What this means for the application/infrastructure
- Potential causes and symptoms users might see

Be concise but informative. Avoid overly technical jargon.

Expression to explain:`,

  // AI Analysis Prompt for Log Correlation (system message)
  aiAnalysisPrompt: `You are an expert Site Reliability Engineer analyzing production logs and alerts. 

Your task:
1. Analyze the provided logs for patterns, anomalies, and potential root causes
2. Correlate findings with any alert information provided  
3. Provide actionable recommendations for investigation and resolution
4. Focus on practical next steps for the engineering team

Provide your analysis in markdown format with clear sections:
- **Key Findings**: Most important observations
- **Potential Root Causes**: Likely causes based on log patterns
- **Recommended Actions**: Specific next steps
- **Additional Investigation**: Areas to explore further

Be concise but thorough. Focus on actionable insights.`,

  // Contextual Debug Prompt (for request tracing)
  contextualDebugPrompt: `You are an expert debugging assistant. Analyze all these log documents from a single request trace and create a comprehensive debugging prompt for a coding agent.

Your task:
1. Extract all relevant filenames, function names, and code locations mentioned in the logs
2. Identify HTTP parameters, request data, and interesting values that might be relevant
3. Look for performance bottlenecks, errors, or unusual patterns
4. Create a focused prompt that a coding agent (like Cursor) can use to investigate issues

Output format:
Create a prompt that includes:
- **Files to examine**: List specific files and functions to investigate
- **Key parameters**: HTTP parameters, request IDs, and data that might be relevant
- **Investigation focus**: What to look for (performance, bugs, logic issues)
- **Context**: Brief summary of what the request was trying to do

Make the prompt actionable and specific - it should guide a coding agent to exactly the right parts of the codebase.

Request trace documents:`,

  // ===== UI SETTINGS =====
  
  // Default Elasticsearch Settings
  defaultElasticSettings: {
    timeframeMinutes: 60,
    documentLimit: 100,
    slowRequestThreshold: 1.0
  },

  // ===== PRESET SYSTEM =====
  
  // Investigation presets for different problem-solving scenarios
  presets: [
    {
      id: 'general',
      name: 'General Investigation',
      description: 'Standard investigation with all log types and moderate timeframe',
      icon: '🔍',
      elasticSettings: {
        timeframeMinutes: 60,
        documentLimit: 100,
        slowRequestThreshold: 1.0
      },
      logTypes: {
        general: true,
        error: true,
        slow: true,
        timeDebugger: true
      },
      defaultPrompt: 'Analyze this alert and related logs to understand the issue and provide actionable recommendations.',
      tags: ['default', 'comprehensive'],
      specialBehavior: PresetBehavior.STANDARD
    },
    {
      id: 'reset-investigation',
      name: 'Reset Investigation',
      description: 'Investigate pod resets by analyzing logs since last pod initialization',
      icon: '🔄',
      elasticSettings: {
        timeframeMinutes: 240, // 4 hours initial search window
        documentLimit: 500,    // More logs since we're looking at full pod lifecycle
        slowRequestThreshold: 2.0
      },
      logTypes: {
        general: true,
        error: true,
        slow: false,  // Focus on errors and general logs for reset analysis
        timeDebugger: false
      },
      defaultPrompt: 'We are investigating a reset scenario. These are all the logs since the pod\'s last initialization. Do you see something that can indicate a problem that will cause this container to reset?',
      tags: ['reset', 'pod-lifecycle', 'debugging'],
      specialBehavior: PresetBehavior.RESET_INVESTIGATION
    }
  ],

  // Default AI Settings
  defaultAiSettings: {
    temperature: 0.3,
    maxTokens: 2500,
    model: {
      explanation: 'gpt-4o-mini',
      analysis: 'o3-mini',
      contextual: 'o3-mini'
    }
  },

  // ===== REQUEST TRACING =====
  
  // Settings for request flow analysis
  requestTracing: {
    maxDocuments: 1000,           // Max docs to fetch for a single request trace
    searchTimeframe: '24h',       // How far back to search for related docs
    includeAllFields: true        // Whether to fetch all fields (*) for context generation
  },

  // ===== LOG DISPLAY =====
  
  // Log table virtualization settings
  logDisplay: {
    virtualizeThreshold: 200,     // Start virtualizing tables at this many rows
    rowHeight: 40,                // Height of each log row in pixels
    overscan: 10                  // Number of extra rows to render for smooth scrolling
  },

  // ===== API SETTINGS =====
  
  // Timeout settings for various operations
  timeouts: {
    elasticsearch: 30000,         // 30 seconds
    openai: 60000,               // 60 seconds for AI operations
    github: 15000,               // 15 seconds
    grafana: 30000               // 30 seconds
  },

  // ===== HEALTH CHECK =====
  
  // Health check intervals and settings
  healthCheck: {
    intervalMs: 30000,           // How often to check service health
    retryAttempts: 3,            // Number of retry attempts for failed health checks
    retryDelayMs: 5000           // Delay between retry attempts
  }
};

// Export individual sections for easier imports
export const { 
  prometheusAlertPrompt, 
  aiAnalysisPrompt, 
  contextualDebugPrompt,
  defaultElasticSettings,
  defaultAiSettings,
  presets,
  requestTracing,
  logDisplay,
  timeouts,
  healthCheck
} = ApplicationConfiguration;

// Type definitions for configuration
export type ElasticSettings = typeof defaultElasticSettings;
export type AiSettings = typeof defaultAiSettings;
export type RequestTracingConfig = typeof requestTracing;

// Special behavior types for presets
export enum PresetBehavior {
  STANDARD = 'standard',
  RESET_INVESTIGATION = 'reset-investigation',
  PERFORMANCE_ANALYSIS = 'performance-analysis',
  SECURITY_AUDIT = 'security-audit',
  CAPACITY_PLANNING = 'capacity-planning',
  ERROR_CORRELATION = 'error-correlation'
}

// Preset type definitions
export interface Preset {
  id: string;
  name: string;
  description: string;
  icon: string;
  elasticSettings: {
    timeframeMinutes: number;
    documentLimit: number;
    slowRequestThreshold: number;
  };
  logTypes: {
    general: boolean;
    error: boolean;
    slow: boolean;
    timeDebugger: boolean;
  };
  defaultPrompt: string;
  tags: string[];
  specialBehavior?: PresetBehavior; // Enum for type-safe special handling
}

// Preset helper functions
export const getPresetById = (id: string): Preset | undefined => {
  return presets.find(preset => preset.id === id);
};

export const getDefaultPreset = (): Preset => {
  return presets[0]; // General Investigation
};

export const getPresetsByTag = (tag: string): Preset[] => {
  return presets.filter(preset => preset.tags.includes(tag));
};

export const getPresetsByBehavior = (behavior: PresetBehavior): Preset[] => {
  return presets.filter(preset => preset.specialBehavior === behavior);
};

export const hasSpecialBehavior = (preset: Preset): boolean => {
  return preset.specialBehavior !== undefined && preset.specialBehavior !== PresetBehavior.STANDARD;
};
