/**
 * Example showing how to integrate with Slack
 * This demonstrates how you would use the AlertService in a Slack bot
 */

import { AlertService } from '../src/services/AlertService';
import { config } from '../src/config';
import { Alert } from '../src/types';

// Mock Slack SDK functions (replace with actual Slack SDK)
interface SlackMessage {
  channel: string;
  text: string;
  thread_ts?: string;
}

async function mockSlackSend(message: SlackMessage): Promise<void> {
  console.log(`📤 Sending to Slack channel ${message.channel}:`);
  console.log(message.text);
  if (message.thread_ts) {
    console.log(`   (as reply to thread ${message.thread_ts})`);
  }
}

class SlackAlertBot {
  private alertService: AlertService;

  constructor() {
    this.alertService = new AlertService(config);
  }

  // This would be called by your Slack event handler
  async handleAlertMessage(slackMessage: any): Promise<void> {
    try {
      // Extract alert information from Slack message
      const alert = this.parseSlackAlert(slackMessage);
      
      if (!alert) {
        console.log('⚠️  Message does not appear to be a Prometheus alert');
        return;
      }

      console.log(`🔍 Processing alert from Slack: ${alert.details.alertname}`);
      
      // Process the alert to get context
      const result = await this.alertService.processAlert(alert);
      
      // Send enriched context as a threaded reply
      await mockSlackSend({
        channel: slackMessage.channel,
        text: result.formattedContext,
        thread_ts: slackMessage.ts // Reply to original alert message
      });
      
    } catch (error) {
      console.error('❌ Error handling alert message:', error);
      
      // Send error message to Slack
      await mockSlackSend({
        channel: slackMessage.channel,
        text: `❌ Failed to process alert: ${error instanceof Error ? error.message : 'Unknown error'}`,
        thread_ts: slackMessage.ts
      });
    }
  }

  private parseSlackAlert(slackMessage: any): Alert | null {
    // This is a simplified parser - you'd need to adapt based on your alert format
    const text = slackMessage.text || '';
    
    // Look for alert patterns like "[FIRING:1] AlertName for..."
    const alertMatch = text.match(/\[(FIRING|RESOLVED)(?::\d+)?\]\s*(\w+)/);
    if (!alertMatch) return null;
    
    const [, status, alertname] = alertMatch;
    
    // Extract other details from the message (this is very simplified)
    const containerMatch = text.match(/container (\w+)/);
    const podMatch = text.match(/pod '([^']+)'/);
    const namespaceMatch = text.match(/namespace (\w+)/);
    
    return {
      status: status as 'FIRING' | 'RESOLVED',
      alertTitle: `${alertname} for`,
      alert: 'Alert extracted from Slack message',
      description: text,
      details: {
        alertname,
        container: containerMatch?.[1] || 'unknown',
        ct_cluster: 'production', // You'd extract this from the message
        namespace: namespaceMatch?.[1] || 'default',
        pod: podMatch?.[1] || 'unknown',
        target: 'slack',
        team: 'unknown' // You'd extract this from channel name or message
      }
    };
  }
}

// Example usage
async function slackIntegrationExample() {
  const bot = new SlackAlertBot();
  
  // Mock Slack message (this would come from Slack Events API)
  const mockSlackMessage = {
    channel: 'pt-backend-alerts',
    ts: '1234567890.123456',
    text: `[FIRING:1] ContainerCPUThrotellingIsHigh for
Alert: A process has been experienced elevated CPU throttling.
Description: The process in the container api-server on pod 'api-server-xyz789' has 18.3% throttling of CPU
Details:
  • alertname: ContainerCPUThrotellingIsHigh
  • container: api-server
  • namespace: production
  • pod: api-server-xyz789
  • team: backend`
  };
  
  console.log('🎭 Simulating Slack bot integration...\n');
  console.log('📥 Received alert in Slack:');
  console.log(mockSlackMessage.text);
  console.log('\n' + '='.repeat(60));
  
  await bot.handleAlertMessage(mockSlackMessage);
}

// Run the example
if (require.main === module) {
  slackIntegrationExample().catch(console.error);
}

export { SlackAlertBot };
export default slackIntegrationExample;
