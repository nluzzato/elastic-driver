import OpenAI from 'openai';
import { Config } from '../types';
import { prometheusAlertPrompt, aiAnalysisPrompt, contextualDebugPrompt } from '../config/application';

/**
 * OpenAI Query Service - Explains Prometheus queries in human language
 */
export class OpenAIQueryService {
  private openai: OpenAI | null = null;
  private enabled: boolean = false;

  constructor(config: Config) {
    if (config.openai.apiKey) {
      this.openai = new OpenAI({
        apiKey: config.openai.apiKey,
      });
      this.enabled = true;
      console.log('✅ OpenAI service initialized');
    } else {
      console.warn('⚠️  OpenAI API key not found - query explanations disabled');
    }
  }

  /**
   * Explain a Prometheus query in human-readable language
   */
  async explainPrometheusQuery(query: string, alertName: string, alertContext?: any): Promise<string> {
    if (!this.enabled || !this.openai) {
      return 'OpenAI service not available - cannot explain query';
    }

    try {
      console.log('🤖 Asking OpenAI to explain Prometheus query...');

      const prompt = this.buildPrompt(query, alertName, alertContext);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Using the faster, cheaper model
        messages: [
          {
            role: 'system',
            content: prometheusAlertPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.3, // Lower temperature for more consistent, factual responses
      });

      const explanation = completion.choices[0]?.message?.content?.trim();
      
      if (!explanation) {
        return 'Could not generate explanation';
      }

      console.log('✅ OpenAI explanation generated');
      return explanation;

    } catch (error) {
      console.error('❌ OpenAI API error:', error);
      return 'Error generating explanation - OpenAI API failed';
    }
  }

  /**
   * Build the prompt for OpenAI
   */
  private buildPrompt(query: string, alertName: string, alertContext?: any): string {
    let prompt = `Please explain this Prometheus alert query in simple terms:\n\n`;
    prompt += `Alert Name: ${alertName}\n`;
    prompt += `Query: ${query}\n\n`;
    
    if (alertContext?.duration) {
      prompt += `Duration: ${alertContext.duration}\n`;
    }
    
    if (alertContext?.severity) {
      prompt += `Severity: ${alertContext.severity}\n`;
    }

    prompt += `\nPlease explain:\n`;
    prompt += `1. What this query is measuring\n`;
    prompt += `2. When this alert would trigger\n`;
    prompt += `3. What it means for the system/application\n`;
    prompt += `4. Keep it simple and avoid technical jargon where possible\n`;

    return prompt;
  }

  /**
   * Test if OpenAI service is working
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled || !this.openai) {
      return false;
    }

    try {
      // Simple test query
      const testCompletion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: 'Say "OpenAI service is working" in exactly those words.'
          }
        ],
        max_tokens: 10,
      });

      const response = testCompletion.choices[0]?.message?.content?.trim();
      return response?.includes('OpenAI service is working') || false;
      
    } catch (error) {
      console.error('OpenAI health check failed:', error);
      return false;
    }
  }

  /**
   * Analyze alert with logs to identify potential issues
   */
  async analyzeAlertWithLogs(
    alertname: string,
    alertExplanation: string | undefined,
    generalLogs: any[],
    errorLogs: any[],
    timeDebuggerLogs: any[],
    slowRequestLogs?: any[]
  ): Promise<string> {
    if (!this.enabled || !this.openai) {
      return 'OpenAI service not available - cannot perform analysis';
    }

    try {
      console.log('🔍 Asking OpenAI to analyze alert with logs...');

      let prompt = `You are an expert SRE analyzing production logs and potential issues. `;
      
      if (alertExplanation) {
        prompt += `Given the alert explanation and recent logs, analyze if there's something wrong and provide actionable insights.

ALERT: ${alertname}

ALERT EXPLANATION:
${alertExplanation}`;
      } else {
        prompt += `Analyze the recent logs to identify patterns, issues, or anomalies that might need attention.

SYSTEM/POD: ${alertname}

No specific alert triggered - performing general log analysis.`;
      }

      prompt += `

RECENT GENERAL LOGS (last 5):
${generalLogs.slice(0, 5).map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.level}: ${log.message}`).join('\n')}

RECENT ERROR LOGS (last 10):
${errorLogs.slice(0, 10).map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`).join('\n')}

RECENT PERFORMANCE LOGS (last 10):
${timeDebuggerLogs.slice(0, 10).map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`).join('\n')}`;

      // Add slow request logs if provided
      if (slowRequestLogs && slowRequestLogs.length > 0) {
        prompt += `

RECENT SLOW REQUEST LOGS (>1s, last 10):
${slowRequestLogs.slice(0, 10).map(log => {
  const requestTime = log.requestTime ? ` (${log.requestTime}s)` : '';
  return `[${new Date(log.timestamp).toLocaleTimeString()}]${requestTime} ${log.message}`;
}).join('\n')}`;
      }

      if (alertExplanation) {
        prompt += `

Please analyze:
1. Is there evidence of issues in the logs that correlate with the alert?
2. What are the potential root causes?
3. What should the team investigate first?
4. Are there patterns or anomalies in the timing/performance data?`;
      } else {
        prompt += `

Please analyze:
1. Are there any error patterns or anomalies in the logs?
2. What potential issues or bottlenecks can you identify?
3. What should the team investigate or monitor?
4. Are there performance optimizations to consider?`;
      }

      prompt += `

Provide a clear assessment and actionable recommendations. Format your response using markdown with:
- ## headers for main sections
- **bold** for important points
- bullet points for lists
- \`code blocks\` for technical details or log snippets
- Clear, structured analysis that's easy to scan`;

      const completion = await this.openai.chat.completions.create({
        model: 'o3-mini',
        messages: [
          {
            role: 'system',
            content: aiAnalysisPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: 2500,
      });

      const analysis = completion.choices[0]?.message?.content?.trim();
      
      if (!analysis) {
        return 'Could not generate analysis';
      }

      console.log('✅ OpenAI alert analysis generated');
      return analysis;

    } catch (error) {
      console.error('❌ OpenAI analysis error:', error);
      return 'Error generating analysis - OpenAI API failed';
    }
  }

  /**
   * Generate contextual debugging prompt for coding agents
   */
  async generateContextualDebugPrompt(
    requestId: string,
    documents: any[],
    customPrompt?: string
  ): Promise<string> {
    if (!this.enabled || !this.openai) {
      return 'OpenAI service not available - cannot generate debug prompt';
    }

    try {
      console.log(`🔍 Generating contextual debug prompt for request ${requestId} with ${documents.length} documents...`);

      // Build the user prompt with all documents
      let userPrompt = `Request ID: ${requestId}\n\nDocuments (${documents.length} total):\n\n`;

      documents.forEach((doc, index) => {
        userPrompt += `--- Document ${index + 1} ---\n`;
        userPrompt += `Timestamp: ${doc['@timestamp']}\n`;
        userPrompt += `Level: ${doc.json?.levelname || 'unknown'}\n`;
        userPrompt += `Message: ${doc.json?.message || 'no message'}\n`;
        userPrompt += `Pod: ${doc.json?.hostname || 'unknown'}\n`;
        
        // Include other relevant fields
        if (doc.json?.service_name) userPrompt += `Service: ${doc.json.service_name}\n`;
        if (doc.json?.module) userPrompt += `Module: ${doc.json.module}\n`;
        if (doc.json?.extra?.request_time) userPrompt += `Request Time: ${doc.json.extra.request_time}s\n`;
        if (doc.json?.stack_trace) userPrompt += `Stack Trace: ${doc.json.stack_trace}\n`;
        if (doc.json?.exception) userPrompt += `Exception: ${doc.json.exception}\n`;
        
        // Include full JSON for comprehensive context
        userPrompt += `Full Document: ${JSON.stringify(doc, null, 2)}\n\n`;
      });

      const completion = await this.openai.chat.completions.create({
        model: 'o3-mini', // Using reasoning model for complex analysis
        messages: [
          {
            role: 'system',
            content: customPrompt || contextualDebugPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        max_completion_tokens: 3000,
        // Note: o3-mini doesn't support temperature parameter
      });

      const debugPrompt = completion.choices[0]?.message?.content?.trim();
      
      if (!debugPrompt) {
        return 'Could not generate debug prompt';
      }

      console.log('✅ Contextual debug prompt generated');
      return debugPrompt;

    } catch (error) {
      console.error('❌ OpenAI debug prompt generation error:', error);
      return 'Error generating debug prompt - OpenAI API failed';
    }
  }

  /**
   * Check if the service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
