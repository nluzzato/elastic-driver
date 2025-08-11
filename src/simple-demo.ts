import { config, validateConfig } from './config';
import { SimpleAlertService } from './services/SimpleAlertService';
import { createMockAlert, logWithTimestamp } from './utils';

/**
 * Simple Demo - Just GitHub Expression Enrichment
 */

async function main() {
  console.log('🚀 AI Alert Context Agent - Simple Demo');
  console.log('═'.repeat(50));
  
  logWithTimestamp('Starting simple demo...');

  // Validate configuration
  try {
    validateConfig();
    console.log('✅ Configuration validated successfully');
  } catch (error) {
    console.error('❌ Configuration validation failed:', error);
    process.exit(1);
  }

  console.log(`🔗 Repository: ${config.github.owner}/${config.github.repo}`);
  console.log(`✅ GitHub token configured: ${config.github.token ? 'Yes' : 'No'}`);

  // Initialize simple service
  const alertService = new SimpleAlertService(config);

  // Test GitHub connectivity
  console.log('\n🏥 Testing GitHub connectivity...');
  const isHealthy = await alertService.healthCheck();
  console.log(`${isHealthy ? '✅' : '❌'} GitHub: ${isHealthy ? 'CONNECTED' : 'FAILED'}`);

  // Test alerts
  const testAlerts = [
    // Real alert that exists in GitHub
    createMockAlert('ContainerCPUThrotellingIsHigh', {
      status: 'RESOLVED',
      details: {
        alertname: 'ContainerCPUThrotellingIsHigh',
        container: 'pymobiengine',
        ct_cluster: 'app.production',
        namespace: 'default',
        pod: 'pymobiengine-company-policy-6ff6cc49dd-jk76x',
        target: 'slack',
        team: 'time-clock'
      }
    }),
    
    // Alert that doesn't exist - to test fallback
    createMockAlert('NonExistentAlert', {
      status: 'FIRING',
      details: {
        alertname: 'NonExistentAlert',
        container: 'test-container',
        ct_cluster: 'test.production',
        namespace: 'test',
        pod: 'test-pod-123',
        target: 'slack',
        team: 'test-team'
      }
    })
  ];

  console.log('\n🧪 Processing test alerts...\n');

  for (const alert of testAlerts) {
    try {
      console.log('─'.repeat(50));
      console.log(`🎯 Processing: ${alert.details?.alertname}`);
      console.log('─'.repeat(50));

      const context = await alertService.processAlert(alert);
      
      // Display the formatted context
      console.log(context.formattedContext);

      logWithTimestamp(`✅ Processed: ${context.alertname} (found: ${context.found})`);

    } catch (error) {
      console.error(`❌ Error processing alert: ${error}`);
    }
  }

  console.log('\n═'.repeat(50));
  console.log('✅ Simple Demo Complete!');
  console.log('\n🎯 This simple approach:');
  console.log('• Focuses only on GitHub expression enrichment');
  console.log('• No unnecessary complexity or mocks');
  console.log('• Clean, straightforward implementation');
  console.log('• Easy to understand and extend');
}

// Handle errors gracefully
main().catch(error => {
  console.error('💥 Demo failed:', error);
  process.exit(1);
});
