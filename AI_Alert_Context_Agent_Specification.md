# AI Alert Context Agent - Project Specification

## Overview
An AI-powered Slack bot that automatically provides context for Prometheus alerts by reading alert definitions from a GitHub repository and enriching the alert information with relevant details.

## Problem Statement
Currently, alerts sent to `pt-*-alerts` Slack channels are difficult to understand without context. Engineers receiving alerts need to manually look up alert definitions, historical patterns, and related information, slowing down incident response.

## Solution
A Slack bot that:
1. Monitors messages in `pt-*-alerts` channels
2. Detects Prometheus alert notifications
3. Extracts alert information (alertname, labels, etc.)
4. Fetches corresponding alert rule definitions from the alerts repository
5. Posts an enriched context reply to the original alert message

## POC Success Criteria
The POC is considered successful when the bot can:
- Read an alert from a Slack channel
- Parse the alert to extract the `alertname` 
- Find and read the corresponding alert definition from the alerts repository
- Post a reply with the alert rule context (query, thresholds, description, etc.)

## Technical Requirements

### Input Format
The bot will process Prometheus alerts in this format:
```
[FIRING:1] PrometheusTSDBCompactionsFailing for prometheus-k8s
Alert: Prometheus has issues compacting blocks.
Description: Prometheus monitoring/prometheus-k8s-0 has detected 76.25 compaction failures over the last 3h.
Details:
  • alertname: PrometheusTSDBCompactionsFailing
  • container: prometheus
  • ct_cluster: mongo.production
  • namespace: monitoring
  • pod: prometheus-k8s-0
  • service: prometheus-k8s
  • target: slack
  • team: devops
```

### Core Components

#### 1. Slack Integration
- **Input**: Monitor messages in channels matching `pt-*-alerts` pattern
- **Output**: Post threaded replies with alert context
- **Authentication**: Slack Bot Token with appropriate permissions

#### 2. Alert Parser
- Extract key information from alert messages:
  - Alert name (e.g., `PrometheusTSDBCompactionsFailing`)
  - Alert status (FIRING/RESOLVED)
  - Instance details
  - Labels and metadata

#### 3. GitHub Repository Reader
- Connect to alerts repository
- Search for alert rule definitions by name
- Parse Prometheus rule files (likely YAML format)
- Extract rule context (query, for duration, annotations, etc.)

#### 4. Context Enricher
- Format alert rule information into human-readable context
- Include:
  - Original PromQL query
  - Alert thresholds and conditions
  - Rule descriptions/annotations
  - Links to relevant resources

### Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Slack API     │    │  Alert Context   │    │  GitHub API     │
│  (pt-*-alerts   │────│     Agent        │────│ (Alerts Repo)   │
│   channels)     │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              │
                       ┌──────────────────┐
                       │  Elasticsearch   │
                       │  (Future Phase)  │
                       └──────────────────┘
```

### Implementation Plan

#### Phase 1: Basic Alert Context (POC)
1. **Slack Bot Setup**
   - Create Slack app with bot permissions
   - Implement event subscription for message events
   - Filter for `pt-*-alerts` channels

2. **Alert Detection & Parsing**
   - Regex patterns to identify Prometheus alerts
   - Extract alertname and other metadata
   - Handle different alert formats gracefully

3. **GitHub Integration**
   - GitHub API client for repository access
   - Search functionality for alert rule files
   - YAML parsing for Prometheus rules

4. **Basic Response Generation**
   - Template-based context formatting
   - Threaded reply posting to original alert

#### Phase 2: Enhanced Context (Future)
- Elasticsearch log correlation
- Historical alert frequency analysis
- Root cause suggestions
- Alert severity prioritization

### Technical Stack Recommendations
- **Runtime**: Node.js or Python
- **Slack SDK**: Official Slack SDK for chosen language
- **GitHub Integration**: GitHub API or MCP GitHub client
- **YAML Parsing**: Built-in libraries
- **Deployment**: Standalone service (Docker container)

### Configuration Requirements
- Slack Bot Token
- GitHub Personal Access Token or App credentials
- Repository URL and structure information
- Channel patterns to monitor

### Example Output
```
🤖 Alert Context for PrometheusTSDBCompactionsFailing

📋 Rule Definition:
• Query: `rate(prometheus_tsdb_compactions_failed_total[5m]) > 0`
• For: 15m
• Severity: warning

📝 Description:
Prometheus time series database has been failing to compact blocks. This can lead to increased disk usage and query performance degradation.

🔗 Resources:
• Alert Rule: [Link to GitHub file]
• Prometheus Instance: prometheus-k8s-0 in monitoring namespace

⏰ This alert fires when compaction failures occur consistently for 15+ minutes.
```

### Success Metrics for POC
- Bot successfully detects 95%+ of alert messages
- Correctly extracts alertname from parsed messages
- Successfully finds corresponding rule definitions
- Posts contextual replies within 30 seconds of alert

### Next Phase Considerations
- Elasticsearch log correlation using Elastic MCP
- Alert frequency and pattern analysis
- Integration with incident management tools
- Machine learning for root cause analysis

## Questions for Implementation
1. What is the structure of the alerts repository? (file organization, naming conventions)
2. Are alert rules stored in standard Prometheus YAML format?
3. Which Slack workspace and do you have admin access for bot setup?
4. Should the bot respond to all alerts or only specific types initially?
