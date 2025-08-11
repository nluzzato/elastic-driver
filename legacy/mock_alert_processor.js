// AI Alert Context Agent - Mock Prototype
// Input: Mock alert JSON → Process → Output: Console formatted context

// Mock alert data based on the provided example
const mockAlerts = [
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
  {
    status: "FIRING",
    alertTitle: "PrometheusTSDBCompactionsFailing for prometheus-k8s",
    alert: "Prometheus has issues compacting blocks.",
    description: "Prometheus monitoring/prometheus-k8s-0 has detected 76.25 compaction failures over the last 3h.",
    details: {
      alertname: "PrometheusTSDBCompactionsFailing",
      container: "prometheus",
      ct_cluster: "mongo.production",
      namespace: "monitoring",
      pod: "prometheus-k8s-0",
      service: "prometheus-k8s",
      target: "slack",
      team: "devops"
    }
  },
  {
    status: "FIRING",
    alertTitle: "PodCrashLooping for",
    alert: "Pod is crash looping.",
    description: "Pod api-gateway-7b8f9c6d4-xyz12 in namespace production has been crash looping for more than 10 minutes.",
    details: {
      alertname: "PodCrashLooping",
      container: "api-gateway",
      ct_cluster: "app.production",
      namespace: "production",
      pod: "api-gateway-7b8f9c6d4-xyz12",
      target: "slack",
      team: "backend"
    }
  }
];

// Mock GitHub alert rule definitions
const mockAlertRules = {
  "ContainerCPUThrotellingIsHigh": {
    expr: "rate(container_cpu_cfs_throttled_periods_total[5m]) / rate(container_cpu_cfs_periods_total[5m]) > 0.1",
    for: "5m",
    labels: {
      severity: "warning"
    },
    annotations: {
      summary: "Container CPU throttling is high",
      description: "Container {{ $labels.container }} in pod {{ $labels.pod }} has {{ $value | humanizePercentage }} CPU throttling",
      runbook_url: "https://runbooks.company.com/alerts/cpu-throttling"
    }
  },
  "PrometheusTSDBCompactionsFailing": {
    expr: "rate(prometheus_tsdb_compactions_failed_total[5m]) > 0",
    for: "15m",
    labels: {
      severity: "warning"
    },
    annotations: {
      summary: "Prometheus TSDB compactions are failing",
      description: "Prometheus {{ $labels.instance }} has detected {{ $value }} compaction failures over the last 5 minutes",
      runbook_url: "https://runbooks.company.com/alerts/prometheus-compaction"
    }
  },
  "PodCrashLooping": {
    expr: "rate(kube_pod_container_status_restarts_total[15m]) * 60 * 15 > 0",
    for: "10m",
    labels: {
      severity: "critical"
    },
    annotations: {
      summary: "Pod is crash looping",
      description: "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} has been restarting frequently",
      runbook_url: "https://runbooks.company.com/alerts/pod-crash-loop"
    }
  }
};

// Alert Parser - extracts key information from alert
function parseAlert(alert) {
  return {
    alertname: alert.details.alertname,
    status: alert.status,
    description: alert.description,
    labels: alert.details,
    rawAlert: alert
  };
}

// Mock GitHub Rule Lookup
function lookupAlertRule(alertname) {
  const rule = mockAlertRules[alertname];
  if (!rule) {
    return {
      found: false,
      message: `Alert rule '${alertname}' not found in repository`
    };
  }
  
  return {
    found: true,
    rule: rule,
    alertname: alertname
  };
}

// Context Generator - creates formatted output
function generateContext(parsedAlert, ruleInfo) {
  const statusEmoji = parsedAlert.status === "FIRING" ? "🔥" : "✅";
  const severityEmoji = ruleInfo.found ? getSeverityEmoji(ruleInfo.rule.labels.severity) : "❓";
  
  let context = `\n${statusEmoji} Alert Context for ${parsedAlert.alertname}\n`;
  context += `${"-".repeat(50)}\n`;
  
  // Alert Status
  context += `📊 Status: ${parsedAlert.status}\n`;
  context += `📝 Description: ${parsedAlert.description}\n\n`;
  
  // Rule Information
  if (ruleInfo.found) {
    const rule = ruleInfo.rule;
    context += `${severityEmoji} Rule Definition:\n`;
    context += `• Query: ${rule.expr}\n`;
    context += `• Duration: ${rule.for}\n`;
    context += `• Severity: ${rule.labels.severity}\n\n`;
    
    context += `📚 Rule Annotations:\n`;
    context += `• Summary: ${rule.annotations.summary}\n`;
    context += `• Description: ${rule.annotations.description}\n`;
    if (rule.annotations.runbook_url) {
      context += `• Runbook: ${rule.annotations.runbook_url}\n`;
    }
    context += `\n`;
  } else {
    context += `❌ ${ruleInfo.message}\n\n`;
  }
  
  // Instance Details
  context += `🏷️ Instance Details:\n`;
  Object.entries(parsedAlert.labels).forEach(([key, value]) => {
    if (key !== 'alertname' && key !== 'target') {
      context += `• ${key}: ${value}\n`;
    }
  });
  
  return context;
}

// Helper function to get severity emoji
function getSeverityEmoji(severity) {
  const emojiMap = {
    'critical': '🚨',
    'warning': '⚠️',
    'info': 'ℹ️'
  };
  return emojiMap[severity] || '❓';
}

// Main processing function
function processAlert(alert) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing Alert: ${alert.details.alertname}`);
  console.log(`${"=".repeat(60)}`);
  
  // Step 1: Parse the alert
  const parsedAlert = parseAlert(alert);
  console.log(`✅ Parsed alert: ${parsedAlert.alertname}`);
  
  // Step 2: Lookup rule definition
  const ruleInfo = lookupAlertRule(parsedAlert.alertname);
  console.log(`✅ Rule lookup: ${ruleInfo.found ? 'Found' : 'Not found'}`);
  
  // Step 3: Generate context
  const context = generateContext(parsedAlert, ruleInfo);
  
  // Step 4: Output formatted context (this would be sent to Slack)
  console.log(context);
}

// Run the mock processor
console.log("🤖 AI Alert Context Agent - Mock Prototype");
console.log("Processing mock alerts...\n");

mockAlerts.forEach(alert => {
  processAlert(alert);
});

console.log(`\n${"=".repeat(60)}`);
console.log("✅ Mock processing complete!");
console.log("This output would be sent as Slack replies in the real system.");
