#!/usr/bin/env ts-node

import { config, validateConfig } from './config';
import { SimpleAlertService } from './services/SimpleAlertService';
import { Alert } from './types';

/**
 * Simple CLI Alert Runner - Just Pod + Alert Name
 * Usage: npm run quick <alertname> <pod>
 * Example: npm run quick ContainerCPUThrotellingIsHigh pymobiengine-company-policy-6ff6cc49dd-jk76x
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('❌ Error: Please provide alertname and pod');
    console.log('\nUsage:');
    console.log('  npm run quick <alertname> <pod>');
    console.log('\nExamples:');
    console.log('  npm run quick ContainerCPUThrotellingIsHigh pymobiengine-company-policy-6ff6cc49dd-jk76x');
    console.log('  npm run quick HighMemoryUsage web-server-abc123');
    console.log('  npm run quick TestAlert my-pod-123');
    process.exit(1);
  }

  const alertname = args[0];
  const pod = args[1];
  
  // Create a minimal alert JSON with just the essentials
  const alert: Alert = {
    status: 'FIRING',
    alertTitle: `${alertname} for`,
    alert: `Alert triggered for ${alertname}`,
    description: `Alert ${alertname} triggered on pod ${pod}`,
    details: {
      alertname: alertname,
      pod: pod,
      container: 'unknown',
      ct_cluster: 'unknown',
      namespace: 'default',
      target: 'slack',
      team: 'unknown'
    }
  };
  
  console.log('🚀 Quick Alert Runner');
  console.log('═'.repeat(30));
  console.log(`📥 Alert: ${alertname}`);
  console.log(`🏷️  Pod: ${pod}`);
  
  try {
    // Validate configuration
    validateConfig();
    
    console.log(`🔗 Repository: ${config.github.owner}/${config.github.repo}`);
    console.log(`✅ GitHub token: ${config.github.token ? 'Configured' : 'Missing'}`);
    console.log(`🤖 OpenAI API key: ${config.openai.apiKey ? 'Configured' : 'Missing'}`);
    console.log(`🔍 Elasticsearch URL: ${config.elasticsearch.url ? 'Configured' : 'Missing'}`);
    
    // Initialize service
    const alertService = new SimpleAlertService(config);
    
    // Test services
    console.log('\n🏥 Testing services...');
    const healthStatus = await alertService.fullHealthCheck();
    console.log(`${healthStatus.github ? '✅' : '❌'} GitHub: ${healthStatus.github ? 'CONNECTED' : 'FAILED'}`);
    console.log(`${healthStatus.openai ? '✅' : '❌'} OpenAI: ${healthStatus.openai ? 'CONNECTED' : 'FAILED'}`);
    console.log(`${healthStatus.elasticsearch ? '✅' : '❌'} Elasticsearch: ${healthStatus.elasticsearch ? 'CONNECTED' : 'FAILED'}`);
    
    // Process the alert
    console.log('\n🔍 Processing alert...');
    const context = await alertService.processAlert(alert);
    
    // Use the formatted context which includes AI explanation
    console.log('\n' + context.formattedContext);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the CLI
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
