#!/usr/bin/env ts-node

import { config, validateConfig } from './config';
import { SimpleAlertService } from './services/SimpleAlertService';
import { Alert } from './types';

/**
 * CLI Alert Runner
 * Usage: npm run alert <json-string>
 * Example: npm run alert '{"status":"FIRING","alert":"Test","description":"Test alert","details":{"alertname":"ContainerCPUThrotellingIsHigh","container":"test"}}'
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Error: Please provide alert JSON as argument');
    console.log('\nUsage:');
    console.log('  npm run alert \'{"status":"FIRING","alert":"Test","description":"Test alert","details":{"alertname":"ContainerCPUThrotellingIsHigh"}}\'');
    console.log('\nExample:');
    console.log('  npm run alert \'{"status":"RESOLVED","alertTitle":"ContainerCPUThrotellingIsHigh for","alert":"A process has been experienced elevated CPU throttling.","description":"The process in the container pymobiengine on pod pymobiengine-company-policy-6ff6cc49dd-jk76x has 14.05% throttling of CPU","details":{"alertname":"ContainerCPUThrotellingIsHigh","container":"pymobiengine","ct_cluster":"app.production","namespace":"default","pod":"pymobiengine-company-policy-6ff6cc49dd-jk76x","target":"slack","team":"time-clock"}}\'');
    process.exit(1);
  }

  const jsonInput = args.join(' ');
  
  try {
    // Parse the JSON input
    const alert: Alert = JSON.parse(jsonInput);
    
    console.log('🚀 Alert Context Agent - CLI Runner');
    console.log('═'.repeat(50));
    console.log(`📥 Input Alert: ${alert.details?.alertname || 'Unknown'}`);
    
    // Validate configuration
    try {
      validateConfig();
    } catch (error) {
      console.error('❌ Configuration error:', error);
      process.exit(1);
    }

    // Initialize service
    const alertService = new SimpleAlertService(config);
    
    // Process the alert
    console.log('\n🔍 Processing alert...');
    const context = await alertService.processAlert(alert);
    
    // Output the results
    console.log('\n' + context.formattedContext);
    
    // Also output as JSON for programmatic use
    console.log('\n📄 JSON Output:');
    console.log('─'.repeat(20));
    console.log(JSON.stringify(context, null, 2));
    
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('❌ Invalid JSON input:', error.message);
      console.log('\nTip: Make sure to wrap the JSON in single quotes and escape any inner quotes');
    } else {
      console.error('❌ Error processing alert:', error);
    }
    process.exit(1);
  }
}

// Run the CLI
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
