/**
 * Basic usage example for the Alert Context Agent
 */

import { AlertService } from '../src/services/AlertService';
import { config } from '../src/config';
import { Alert } from '../src/types';

async function basicExample() {
  // Initialize the alert service
  const alertService = new AlertService(config);

  // Example alert (this would come from Slack webhook in real usage)
  const alert: Alert = {
    status: "FIRING",
    alertTitle: "ContainerCPUThrotellingIsHigh for",
    alert: "A process has been experienced elevated CPU throttling.",
    description: "The process in the container api-server on pod 'api-server-abc123' has 15.2% throttling of CPU",
    details: {
      alertname: "ContainerCPUThrotellingIsHigh",
      container: "api-server",
      ct_cluster: "app.production",
      namespace: "default",
      pod: "api-server-abc123",
      target: "slack",
      team: "backend"
    }
  };

  try {
    // Process the alert and get enriched context
    const result = await alertService.processAlert(alert);
    
    console.log("📄 Alert Processing Result:");
    console.log(`- Alert Name: ${result.alertname}`);
    console.log(`- Status: ${result.status}`);
    console.log(`- Found Rule: ${result.found ? 'Yes' : 'No'}`);
    console.log(`- Source: ${result.source || 'Not found'}`);
    console.log(`- File: ${result.file || 'N/A'}`);
    
    if (result.rule) {
      console.log(`- Query: ${result.rule.expression.substring(0, 60)}...`);
      console.log(`- Duration: ${result.rule.duration}`);
      console.log(`- Severity: ${result.rule.labels?.severity || 'Unknown'}`);
    }
    
    // The formatted context would be sent to Slack
    console.log("\n🎯 Slack Message Content:");
    console.log(result.formattedContext);
    
  } catch (error) {
    console.error('❌ Error processing alert:', error);
  }
}

// Run the example
if (require.main === module) {
  basicExample().catch(console.error);
}

export default basicExample;
