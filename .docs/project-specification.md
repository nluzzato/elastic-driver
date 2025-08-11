# Alert Context Agent - Project Specification

**Version:** 1.2  
**Last Updated:** 2025-08-11  
**Target Audience:** LLM Systems (Claude, GPT, etc.) for codebase understanding  

## Project Overview

The Alert Context Agent is a Node.js/TypeScript service that provides comprehensive context for Prometheus alerts by integrating multiple data sources. When an alert fires, it enriches the alert with technical details from GitHub, human-readable explanations from OpenAI, operational logs from Elasticsearch, and intelligent analysis combining all available data.

## Core Problem Statement

**Problem:** Prometheus alerts in Slack channels (pt-*-alerts pattern) are difficult to understand without context. Teams receive raw alerts like "PrometheusTSDBCompactionsFailing" with minimal information about what caused the issue, how to investigate, or what actions to take.

**Solution:** An AI-powered agent that automatically enriches alerts with:
1. **Technical Context** - Alert rule definitions from GitHub
2. **Human Explanations** - Plain language explanations of complex PromQL queries  
3. **Operational Data** - Recent logs, errors, and performance metrics
4. **Intelligent Analysis** - AI-powered correlation and recommendations

## Architecture Overview

```
Alert Input → [GitHub Integration] → [OpenAI Explanation] → [Elasticsearch Logs] → [Grafana Metrics] → [AI Analysis]
            → [REST API (Express)] → [Vite/React GUI]
```

### Data Flow
1. **Input**: Prometheus alert JSON (alertname, pod, status, details) OR minimal input (pod name only)
2. **GitHub Enrichment**: Search for alert rule definition in `Connecteam/alerts` repository (optional if no alertname)
3. **OpenAI Explanation**: Generate human-readable explanation of PromQL query (optional if no alert found)
4. **Log Fetching**: Parallel retrieval of 4 log types from Elasticsearch
5. **Metrics Fetching**: Query Grafana/Prometheus for current values and trends
6. **AI Analysis**: Comprehensive analysis using o3-mini model with logs (works with or without alert context)
7. **Output**: Formatted context and structured fields (logs, explanations, analysis) returned via REST and rendered in GUI

## Core Services Architecture

### 1. SimpleAlertService (Main Orchestrator)
- **File**: `src/services/SimpleAlertService.ts`
- **Purpose**: Coordinates all enrichment services and formats final output
- **Key Methods**:
  - `processAlert(alert: Alert)`: Main processing pipeline
  
  - `fullHealthCheck()`: Tests all service connectivity

### 2. GitHubService (Alert Definitions)
- **File**: `src/services/GitHubService.ts`
- **Purpose**: Fetches alert rule definitions from GitHub repository
- **Implementation**: Direct GitHub API calls with authentication
- **Search Strategy**: 
  1. GitHub Code Search API with multiple query patterns
  2. Fallback to file-by-file search in known alert files
- **Key Files Searched**: 
  - `default_alerts/k8s_alerts.yaml`
  - `default_alerts/app_alerts.yaml` 
  - `teams/*/k8s_overrides.yaml`

### 3. OpenAIQueryService (AI Explanations & Analysis)
- **File**: `src/services/OpenAIQueryService.ts`
- **Purpose**: Provides human-readable explanations and intelligent analysis
- **Models Used**:
  - `gpt-4o-mini`: PromQL query explanations (fast, cost-effective)
  - `o3-mini`: Alert correlation and analysis (reasoning-optimized)
- **Key Methods**:
  - `explainPrometheusQuery()`: Converts technical PromQL to plain language
  - `analyzeAlertWithLogs()`: Correlates alert with logs for root cause analysis (works with or without alert context)
- **Flexible Analysis**: Can perform general log analysis when no specific alert is provided

### 4. ElasticsearchService (Operational Logs)
- **File**: `src/services/ElasticsearchService.ts`
- **Purpose**: Fetches contextual logs for alert correlation and reset investigation
- **Implementation**: Direct HTTP requests (not Elasticsearch client)
- **Log Types Retrieved** (configurable via UI settings):
  - **General Logs**: Configurable number (default 100) of general application logs
  - **Error Logs**: Configurable number (default 100) of ERROR-level logs (`json.levelname = "ERROR"`)
  - **Time Debugger Logs**: Configurable number (default 100) of TIME_DEBUGGER [SLOW] logs (`[TIME_DEBUGGER] [SLOW]` in message)
  - **Slow Request Logs**: Configurable number (default 100) of logs where `json.extra.request_time > threshold` (configurable threshold, default 1s)
- **Search Field**: `json.hostname` (exact match on pod name using `term` queries for precise filtering)
- **Reset Investigation**: Specialized methods for finding Git commit logs and fetching logs since pod initialization
- **Query Optimization**: Uses `match` queries for flexible text search and `term` queries for exact field matching
- **Configuration**: Document limits and slow request thresholds configurable via Elasticsearch Settings panel in UI

### 5. GrafanaService (Metrics & Dashboards)
- **File**: `src/services/GrafanaService.ts`
- **Purpose**: Fetches Prometheus metrics and dashboard context via Grafana API
- **Implementation**: Grafana HTTP API with Bearer token authentication
- **Key Methods**:
  - `queryMetric()`: Queries current Prometheus metric values
  - `queryRange()`: Queries historical data for trends
  - `getAlertMetricData()`: Gets current value and trend for alert expression
  - `getRelatedMetrics()`: Fetches CPU, memory, network metrics for pod
  - `healthCheck()`: Tests API connectivity
- **Metrics Retrieved**:
  - **Alert Metric**: Current value of the alerting metric with trend analysis
  - **Related Metrics**: CPU usage, memory usage, network TX/RX for pod
  - **Trend Data**: 30-minute historical data to determine if metrics are stable/up/down
- **Dashboard Context**: Auto-generated links to relevant Grafana dashboards

## Data Sources

### GitHub Repository: `Connecteam/alerts`
- **Content**: Prometheus alert rule definitions in YAML format
- **Authentication**: Personal Access Token (GITHUB_TOKEN)
- **Search**: GitHub Code Search API + fallback file search
- **Parsed Data**: PromQL expressions, durations, severity, descriptions

### OpenAI API
- **Models**: 
  - `gpt-4o-mini` for explanations
  - `o3-mini` for analysis
- **Authentication**: API Key (OPEN_AI_KEY)
- **Rate Limiting**: Built-in OpenAI SDK handling
- **Temperature**: 0.3 for consistent, factual responses

### Elasticsearch
- **Endpoint**: Custom `/search/_search` path (not standard Elasticsearch)
- **Authentication**: Basic Auth (username/password) or API Key
- **Index Pattern**: `app-logs*`
- **Implementation**: Direct HTTP POST requests (fetch API)
- **Query Types**: 
  - `term` queries for exact field matching (hostnames, log levels)
  - `match` queries for flexible text search (message content)
  - `range` queries for timestamp and numeric filtering
- **Key Fields**: `json.hostname` for pod identification, `json.message` for Git commit detection

### Grafana API
- **Endpoint**: Grafana HTTP API for querying Prometheus data sources
- **Authentication**: API Key (GRAFANA_API_KEY)
- **Capabilities**: 
  - Query Prometheus metrics via `/api/datasources/proxy/:id/api/v1/query`
  - Query range data via `/api/datasources/proxy/:id/api/v1/query_range`
  - Dashboard links and annotations
- **Implementation**: Direct HTTP requests with Bearer token authentication

## Configuration Management

### Environment Variables
```bash
# GitHub Configuration
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_OWNER=Connecteam
GITHUB_REPO=alerts

# OpenAI Configuration  
OPEN_AI_KEY=sk-xxxxxxxxxxxx

# Elasticsearch Configuration
ELASTICSEARCH_URL=https://qa.dev.connecteam.com:9000/search
ELASTICSEARCH_USERNAME=username
ELASTICSEARCH_PASSWORD=password
ELASTICSEARCH_INDEX_PATTERN=app-logs*

# Grafana Configuration
GRAFANA_URL=https://grafana.connecteam.com
GRAFANA_API_KEY=glsa_xxxxxxxxxxxx
GRAFANA_TIMEOUT=30000
```

### Configuration Loading
- **File**: `src/config/index.ts`
- **Method**: dotenv for environment variable loading
- **Validation**: Runtime checks with graceful degradation
- **Fallbacks**: Services disable gracefully if credentials missing

## Input/Output Formats

### Input Alert Format
```typescript
interface Alert {
  status: 'FIRING' | 'RESOLVED';
  alertTitle: string;
  alert: string;
  description: string;
  details: {
    alertname: string;
    pod: string;
    container: string;
    ct_cluster: string;
    namespace: string;
    target: string;
    team: string;
  };
}
```

### Output Context Format
```typescript
interface ContextOutput {
  alertname: string;
  status: 'FIRING' | 'RESOLVED';
  description: string;
  found: boolean;
  source: 'github' | 'mock' | 'error' | 'none';
  file?: string;
  url?: string;
  rule?: AlertRule;
  instanceDetails: Record<string, string>;

  // Structured fields for GUI consumption
  lastLogs?: ElasticLogEntry[];
  lastErrorLogs?: ElasticLogEntry[];
  lastTimeDebuggerLogs?: ElasticLogEntry[];
  lastSlowRequestLogs?: ElasticLogEntry[];
  alertExpressionExplanation?: string;
  analysisText?: string;
}

interface ElasticLogEntry {
  timestamp: string;
  level: string;
  message: string;
  pod?: string;
  container?: string;
  namespace?: string;
  service?: string;
  module?: string;
  environment?: string;
  applicationName?: string;
  requestTime?: number; // For slow request logs
}

interface ElasticSettings {
  timeframeMinutes: number;    // Search timeframe (not yet implemented)
  documentLimit: number;       // Number of documents to fetch per log type
  slowRequestThreshold: number; // Threshold in seconds for slow requests
}
```

## CLI Tools & Usage

### Primary CLI Tool: `npm run quick`
```bash
npm run quick <alertname> <podname>
```
**Example**: `npm run quick ContainerCPUThrotellingIsHigh pymobiengine-user-status-656f8b67bc-cf6pm`

**Note**: Alert name is now optional - you can analyze logs for any pod even without a specific alert:
```bash
npm run quick "" <podname>  # General log analysis without alert context
```

### Additional Tools
- `npm run alert`: Process full JSON alert
- `npm run simple`: Basic demo functionality
- `npm run build`: Compile TypeScript
- `npm run dev`: Development mode
- `npm run server`: Start API server only
- `npm run gui:dev`: Start both API and UI development servers
- `npm run gui:build`: Build production UI
- `npm run gui:preview`: Preview built UI

## Output Example

```
🚨 Alert Context for ContainerCPUThrotellingIsHigh
──────────────────────────────────────────────────
📊 Status: FIRING
📝 Description: Alert ContainerCPUThrotellingIsHigh triggered on pod pymobiengine-user-status-656f8b67bc-cf6pm

⚡ Expression Details:
• Query: sum(increase(owner:container_cpu_cfs_throttled_periods_total{...})) > 25
• Duration: 10m
• Severity: warning
• File: teams/core/k8s_overrides.yaml
• URL: https://github.com/Connecteam/alerts/blob/...

🤖 AI Explanation:
This query measures CPU throttling for containers. When containers use more CPU than allocated, the system restricts their usage. The alert triggers when throttling exceeds 25% over 10 minutes, indicating performance issues...

📋 Recent Logs (Last 100):
🔵 [5:52:13 PM] 200 GET /api/HealthCheck/ (10.244.32.1) 1.02ms
...

🔴 Recent ERROR Logs (Last 100):
🔴 [5:51:46 PM] SSE connection closed
🔴 [5:51:34 PM] connection_lost: StreamLostError...
...

⏱️ TIME_DEBUGGER Logs (Last 100):
⏱️ [5:54:35 AM] [TIME_DEBUGGER] [ACTIVITY_PERFORMANCE_TD] UserLoginsActivitySource took 0.001s
...

🤖 AI Analysis & Recommendations:
────────────────────────────────────────────
Based on the alert and logs, there are several indicators of system stress:

1. **CPU Throttling**: The alert indicates containers are being limited
2. **Connection Issues**: Multiple SSE connection closures suggest network/resource pressure
3. **Performance Patterns**: TIME_DEBUGGER logs show some operations taking longer

**Recommendations**:
- Check CPU resource limits and requests
- Investigate SSE connection stability
- Monitor database query performance
...

🏷️ Instance Details:
• alertname: ContainerCPUThrotellingIsHigh
• pod: pymobiengine-user-status-656f8b67bc-cf6pm
...
```

## Dependencies

### Core Dependencies
```json
{
  "dotenv": "^16.0.0",        // Environment configuration
  "openai": "^5.12.2",        // OpenAI SDK for AI services
  "express": "^4.19.2",       // REST API for GUI
  "cors": "^2.8.5",           // CORS for local dev
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
}
```

### Development Dependencies
```json
{
  "@types/node": "^20.19.10", // Node.js type definitions
  "ts-node": "^10.9.0",       // TypeScript execution
  "typescript": "^5.0.0",     // TypeScript compiler
  "@types/express": "^4.17.21",
  "@types/cors": "^2.8.17",
  "@types/react": "^18.3.3",
  "@types/react-dom": "^18.3.0",
  "vite": "^5.4.0",
  "@vitejs/plugin-react": "^4.3.1",
  "concurrently": "^9.0.1"
}
```

**Note**: Previously used `@elastic/elasticsearch` but removed in favor of direct HTTP requests due to custom endpoint requirements.

## Error Handling & Resilience

### Graceful Degradation
- **Missing GitHub Token**: Falls back to mock data
- **OpenAI API Failure**: Skips explanations, continues with other data
- **Elasticsearch Unavailable**: Shows "No logs found" but continues processing
- **Network Issues**: Timeout handling with informative error messages
- **Hostname Filtering**: Uses precise `term` queries to prevent cross-pod log contamination
- **Git Commit Search**: Flexible `match` queries for finding commit logs with debug fallbacks

### Health Checks
- **GitHub**: Repository access test
- **OpenAI**: Simple completion test
- **Elasticsearch**: Direct endpoint connectivity test with authentication validation
- **Grafana**: API connectivity and datasource proxy validation

### Logging Strategy
- **Console Logging**: Structured with emojis for easy scanning
- **Error Context**: Detailed error messages for debugging
- **Performance Tracking**: Request timing and response size logging

## Development Workflow

### Project Structure
```
src/
├── config/             # Configuration management
├── services/           # Core business logic services
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
├── server.ts           # Express REST API for GUI
├── ui/                 # Vite/React UI
│   ├── index.html
│   ├── main.tsx
│   └── screens/App.tsx
├── run-simple.ts       # CLI tools
├── run-alert.ts        # CLI tools
└── index.ts            # Main entry point

.docs/                 # Project documentation
examples/              # Example alert data
```

### TypeScript Configuration
- **Target**: ES2020
- **Module**: CommonJS  
- **Strict Mode**: Enabled
- **Output**: `dist/` directory

### Code Organization Principles
- **Single Responsibility**: Each service handles one data source
- **Dependency Injection**: Services receive configuration in constructors
- **Error Boundaries**: Services handle their own failures gracefully
- **Async/Await**: Consistent async pattern throughout
- **Parallel Processing**: Multiple data sources fetched simultaneously
 - **UI Separation**: `src/ui` for GUI, `src/server.ts` for API

## GUI & API

- GUI: Vite + React app under `src/ui`.
- API: Express server (`src/server.ts`) exposing REST endpoints consumed by the GUI.

### Endpoints
- `GET /api/health`: returns `{ github, openai, elasticsearch, grafana }` connectivity.
- `POST /api/quick`: `{ alertname, pod, elasticSettings?, logTypes?, preset?, specialBehavior? }` → `ContextOutput` (with structured fields). Alert name is optional, elasticSettings configures document limits and thresholds.
- `POST /api/alert`: `Alert` JSON → `ContextOutput`.
- `POST /api/request-trace`: `{ requestId }` → Request flow analysis for debugging.
- `POST /api/generate-debug-prompt`: `{ requestId, documents, customPrompt? }` → Contextual debugging prompt generation.

### NPM Scripts
- `server`: start API only
- `gui:dev`: run API and Vite dev server concurrently
- `gui:build`: build the UI
- `gui:preview`: preview UI build

## Future Architecture Considerations

### Scalability
- **Caching**: Consider Redis for GitHub API responses
- **Rate Limiting**: OpenAI token usage monitoring
- **Batching**: Process multiple alerts efficiently

### Integration Points
- **Slack Bot**: Direct integration with Slack channels
- **Webhook Support**: Real-time alert processing
- **Metrics**: Prometheus metrics for the agent itself

### Configuration Evolution
- **Multi-Repository Support**: Different alert repositories per team
- **Custom Log Queries**: Team-specific Elasticsearch queries
- **AI Model Selection**: Choose models based on alert type/urgency

## Security Considerations

### Secrets Management
- **Environment Variables**: All tokens stored in `.env` (not committed)
- **Access Tokens**: Minimum required permissions
- **Network Security**: HTTPS for all external API calls

### Data Privacy
- **Log Sampling**: Limited log retrieval (100 entries max)
- **No Persistence**: No long-term storage of sensitive log data
- **Audit Trail**: Console logging for debugging and monitoring

---

## LLM Usage Notes

When working with this codebase as an LLM:

1. **Start Here**: This specification provides the complete mental model
2. **Key Files**: Focus on services in `src/services/` for business logic
3. **Testing**: Use `npm run quick` with real alerts for immediate feedback
4. **Configuration**: Check `src/config/index.ts` for environment setup
5. **Types**: Refer to `src/types/index.ts` for data structure definitions
6. **Evolution**: Update this specification when making architectural changes

The project follows a **pipeline pattern** where each service adds enrichment data, culminating in a comprehensive alert context that helps teams respond effectively to production issues.

---

## UI/UX Design Brief (Executive Summary)

This brief defines the visual language, interaction patterns, and performance goals for the GUI so any agent can implement a beautiful and efficient experience without ambiguity. The full execution details live in `@gui-architecture.md` under “UI/UX Implementation Requirements”.

### Core UX Goals
- Clarity under pressure: first screen must answer “what’s wrong, where, why, what next?” in under 10 seconds.
- Trustworthy data: clear provenance for rules, logs, and metrics with links back to sources.
- Fast and responsive: render skeletons in <100ms, first meaningful paint <1s on modern laptops, virtualized long lists.

### Primary Screen Layout
- Header: Alert title, status pill, namespace/pod, quick actions (copy, link to Grafana/GitHub).
- Two-column content on desktop (stacked on mobile):
  - Left: Expression Details, AI Explanation, AI Analysis & Recommendations.
  - Right: Service Health, Logs (General, Error, Slow), Instance Details.
- Sticky context bar when scrolling with alertname, pod, and status.

### Design System Tokens
- Colors (semantic, theme-ready):
  - success: #10B981, warning: #F59E0B, danger: #EF4444, info: #3B82F6, surface: #0B1220 (dark) / #FFFFFF (light), border: rgba(148,163,184,0.24).
- Typography: Inter or system stack; sizes 12/14/16/20/24 with 1.4–1.6 line-height.
- Spacing scale: 4/8/12/16/24/32/48.
- Radius: 8 default; 12 for primary cards.
- Elevation: shadows 0/1/2; avoid heavy drop shadows.

### Components (must be reusable)
- StatPill (status, severity), SectionCard (title, actions, body), KeyValueGrid (two-column responsive), LogTable (virtualized, copy-to-clipboard per row), CodeBlock (wrap + copy), SourceLink (icon + label), EmptyState, ErrorState, Skeletons.

### States
- Loading: skeletons for each card; never blank screens.
- Empty: neutral illustrations/messages with next-steps.
- Error: actionable text with retry and underlying error detail in a collapsible area.

### Accessibility
- Keyboard navigable, visible focus, aria-live for async loads, color contrast AA.

### Performance Budget
- DOM nodes <3k on initial view; lists virtualized; images/svg under 150KB total; avoid blocking network waterfalls; concurrent fetch where possible.

### Non-goals
- Do not introduce a large UI framework; prefer CSS variables and minimal utilities over heavy dependencies.

See `@gui-architecture.md` for concrete acceptance criteria and implementation steps.
