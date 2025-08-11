import OpenAI from 'openai';
import { Config } from '../types';

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
            content: 'You are a Prometheus and observability expert. Explain Prometheus queries in clear, simple language that anyone can understand. Focus on what the query measures, when it would trigger, and what it means for the system.'
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
    alertExplanation: string,
    generalLogs: any[],
    errorLogs: any[],
    timeDebuggerLogs: any[]
  ): Promise<string> {
    if (!this.enabled || !this.openai) {
      return 'OpenAI service not available - cannot perform analysis';
    }

    try {
      console.log('🔍 Asking OpenAI to analyze alert with logs...');

      const prompt = `You are an expert SRE analyzing a production alert. Given the alert explanation and recent logs, analyze if there's something wrong and provide actionable insights.

ALERT: ${alertname}

ALERT EXPLANATION:
${alertExplanation}

RECENT GENERAL LOGS (last 5):
${generalLogs.slice(0, 5).map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.level}: ${log.message}`).join('\n')}

RECENT ERROR LOGS (last 10):
${errorLogs.slice(0, 10).map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`).join('\n')}

RECENT PERFORMANCE LOGS (last 10):
${timeDebuggerLogs.slice(0, 10).map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`).join('\n')}

Please analyze:
1. Is there evidence of issues in the logs that correlate with the alert?
2. What are the potential root causes?
3. What should the team investigate first?
4. Are there patterns or anomalies in the timing/performance data?

Provide a clear assessment and actionable recommendations.`;

      const completion = await this.openai.chat.completions.create({
        model: 'o3-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert Site Reliability Engineer with deep knowledge of distributed systems, performance analysis, and incident response. Analyze alerts and logs to identify root causes and provide actionable insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: 800,
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
   * Check if the service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
