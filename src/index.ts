#!/usr/bin/env node

/**
 * AI Alert Context Agent
 * 
 * This application processes Prometheus alerts and provides rich context
 * by looking up alert definitions from GitHub repositories.
 */

import { AlertService } from './services/AlertService';
import { config, validateConfig } from './config';
import { Alert } from './types';
import { createMockAlert, logWithTimestamp } from './utils';

// Sample alerts for testing
const testAlerts: Alert[] = [
  {
    status: "RESOLVED",
    alertTitle: "ContainerCPUThrotellingIsHigh for",
    alert: "A process has been experienced elevated CPU throttling.",
    description: "The process in the container pymobiengine on pod 'pymobiengine-company-policy-6ff6cc49dd-jk76x' has 14.05% throttling of CPU",
    details: {
      alertname: "ContainerCPUThrotellingIsHigh",
      container: "pymobiengine",
      ct_cluster: "app.production",
      namespace: "default",
      pod: "pymobiengine-company-policy-6ff6cc49dd-jk76x",
      target: "slack",
      team: "time-clock"
    }
  },
  createMockAlert("TestAlert", { 
    status: "FIRING",
    description: "This is a test alert to demonstrate the not-found scenario"
  })
];

async function main(): Promise<void> {
  try {
    console.log("🤖 AI Alert Context Agent - TypeScript Version");
    logWithTimestamp("Starting application...");
    
    // Validate configuration
    validateConfig();
    
    console.log(`🔗 Repository: ${config.github.owner}/${config.github.repo}`);
    
    if (!config.github.token) {
      console.log("⚠️  No GitHub token - using mock data fallback");
    } else {
      console.log("✅ GitHub token configured - will try GitHub first, fallback to mock");
    }
    
    // Initialize the alert service
    const alertService = new AlertService(config);
    
    console.log("\nProcessing test alerts...\n");
    
    // Process each test alert
    for (const alert of testAlerts) {
      try {
        const result = await alertService.processAlert(alert);
        
        // You could send this to Slack, save to database, etc.
        logWithTimestamp(`Successfully processed alert: ${result.alertname}`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error processing alert ${alert.details.alertname}: ${errorMessage}`);
      }
    }
    
    console.log(`\n${"=".repeat(60)}`);
    console.log("✅ Processing complete!");
    console.log("\n🎉 SUCCESS! This shows what would be posted as Slack replies");
    console.log("\n📝 The bot now provides rich context for alerts:");
    console.log("• PromQL query details");
    console.log("• Alert duration and severity");  
    console.log("• Direct GitHub links");
    console.log("• Instance metadata");
    console.log("\n🚀 Ready for Slack integration!");
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Application error: ${errorMessage}`);
    process.exit(1);
  }
}

// Export for use as a module
export { AlertService } from './services/AlertService';
export { GitHubService } from './services/GitHubService';
export * from './types';
export { config } from './config';
export * from './utils';

// Run the application if this is the main module
if (require.main === module) {
  main().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`💥 Fatal error: ${errorMessage}`);
    process.exit(1);
  });
}
