### Alert Context GUI Architecture

This document describes the GUI architecture, how it interacts with the existing services, and how to run it locally.

## Overview

- The UI lives entirely under `src/ui` to keep a clean separation from the server/business logic.
- A minimal REST API is exposed by `src/server.ts` that wraps the existing `SimpleAlertService` orchestrator.
- The UI is a Vite + React single-page app that calls the API via fetch.

## Server/API

- File: `src/server.ts`
- Stack: Express with CORS + JSON middleware.
- Endpoints:
  - `GET /api/health`: Calls `SimpleAlertService.fullHealthCheck()` and returns `{ github, openai, elasticsearch, grafana }` service connectivity.
  - `POST /api/quick`: Accepts `{ alertname, pod, elasticSettings?, logTypes?, preset?, specialBehavior? }` and constructs a minimal `Alert`, then calls `SimpleAlertService.processAlert()` with the elastic settings and returns the resulting `ContextOutput`.
  - `POST /api/alert`: Accepts a full `Alert` JSON payload and returns the resulting `ContextOutput`.
  - `POST /api/request-trace`: Accepts `{ requestId }` for request flow analysis and debugging.
  - `POST /api/generate-debug-prompt`: Accepts `{ requestId, documents, customPrompt? }` for contextual debugging prompt generation.

The server uses the existing configuration loader `src/config/index.ts` and does not duplicate business logic.

## UI

- Entry HTML: `src/ui/index.html`
- Entry TSX: `src/ui/main.tsx`
- Screen: `src/ui/screens/App.tsx`

The `App` screen provides:
- Service Health panel: Calls `/api/health` and displays connectivity status for GitHub, OpenAI, Elasticsearch, Grafana.
- Quick Run form: `alertname` (optional) + `pod` (required) + preset selection to invoke `/api/quick`. The response renders structured fields with rich UI components.
- Preset System: Investigation presets including General Investigation, Reset Investigation, Performance Analysis, Security Audit, Capacity Planning, and Error Correlation.
- Collapsible Settings Panels: Elasticsearch configuration (timeframe, document limits, slow request threshold) that dynamically controls log fetching behavior, and AI prompt configuration.
- Enhanced Log Display: Four log categories (General, Error, Time Debugger, Slow Requests) with clear visual selection indicators and clickable entries.
- Request Tracing: Optional request ID input for detailed request flow analysis and debugging.

### API Response Shape for GUI

The server enriches the classic `ContextOutput` with structured fields for the GUI:

```
interface ContextOutput {
  // existing fields...
  
  // structured fields for GUI
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
  timeframeMinutes: number;    // Search timeframe for log filtering
  documentLimit: number;       // Number of documents to fetch per log type
  slowRequestThreshold: number; // Threshold in seconds for slow requests
}

interface LogTypes {
  general: boolean;     // Include general application logs
  error: boolean;       // Include ERROR-level logs
  slow: boolean;        // Include slow request logs
  timeDebugger: boolean; // Include TIME_DEBUGGER logs
}

interface PresetConfig {
  gitHubRepo?: string;  // Override GitHub repository for specific presets
}
```

These are populated directly from `ElasticsearchService` results and `OpenAIQueryService` outputs to enable rich rendering with tabbed log views, markdown formatting, and interactive elements.

## Build Tooling

- Vite config in `vite.config.ts` with dev server proxying `/api` to the Express server on port `5174`.
- TypeScript paths extended in `tsconfig.json` to include `src/ui`.
- NPM scripts in `package.json`:
  - `server`: run the Express API via ts-node
  - `gui:dev`: run API and Vite dev server concurrently
  - `gui:build`: build the UI
  - `gui:preview`: preview the built UI

## Running Locally

1. Ensure Node.js 18+ and a `.env` populated per `env.example`.
2. Install dependencies: `npm install`.
3. Start both API and UI: `npm run gui:dev`.
   - UI at `http://localhost:5173`
   - API at `http://localhost:5174`

Alternatively, run only the API with `npm run server` and open the Vite dev server separately with `vite`.

## Interaction With Existing Code

- The API constructs or accepts an `Alert` matching `src/types/index.ts` and hands it to `SimpleAlertService.processAlert()`.
- The resulting `ContextOutput` is returned as JSON to the UI.
- No changes were made to `GitHubService`, `OpenAIQueryService`, or `ElasticsearchService` logic; the GUI simply orchestrates calls via the new REST endpoints.

## Recent Enhancements (Completed)

- ✅ Functional collapsible settings panels for Elasticsearch (document limits, slow thresholds) and AI prompt configuration
- ✅ Enhanced log categorization with four types: General, Error, Time Debugger, Slow Requests
- ✅ Clickable log entries with detailed modal view
- ✅ Markdown rendering for AI explanations and analysis
- ✅ Visual tab selection indicators
- ✅ Consistent spacing and responsive design
- ✅ Optional alert name - supports general log analysis without specific alerts
- ✅ Investigation preset system with specialized behaviors (Reset Investigation, Performance Analysis, etc.)
- ✅ Request tracing and contextual debugging capabilities
- ✅ Fixed hostname filtering issues in Elasticsearch queries for precise pod log isolation
- ✅ Improved Git commit log detection for reset investigation scenarios

## Future Enhancements

- Persist recent alert runs in local storage.
- Add a form to POST full JSON alerts to `/api/alert`.
- Slack webhook integration for sending formatted context.
- Dashboard links and Grafana integration UI.
- Real-time log streaming for active investigations.
- Advanced preset customization and sharing.
- Performance metrics dashboard for the agent itself.
- Enhanced authentication header caching and connection pooling optimization.

---

## UI/UX Implementation Requirements

This section provides concrete requirements an agent can follow to transform the current UI into a polished, performant, and accessible experience.

### Visual Direction
- Support light and dark themes via CSS variables under `:root` and `[data-theme="dark"]`.
- Use semantic tokens (see below) and avoid hard-coded hex values in components.

#### CSS Variables (add to `src/ui/index.css` or equivalent)
```css
:root {
  --color-bg: #ffffff;
  --color-surface: #0B1220;
  --color-text: #0F172A;
  --color-muted: #64748B;
  --color-border: rgba(148,163,184,0.24);
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-danger: #EF4444;
  --color-info: #3B82F6;
  --radius: 12px;
  --radius-sm: 8px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px; --space-7: 48px;
}
[data-theme="dark"] {
  --color-bg: #0B1220;
  --color-surface: #111827;
  --color-text: #E5E7EB;
  --color-muted: #94A3B8;
  --color-border: rgba(148,163,184,0.24);
}
```

### Component Contracts (TypeScript-first)

Implement reusable components in `src/ui/components/`:

```ts
// StatPill.tsx
export type StatPillProps = { label: string; tone: 'success'|'warning'|'danger'|'info'|'neutral'; };

// SectionCard.tsx
export type SectionCardProps = { title: string; actions?: React.ReactNode; children: React.ReactNode; isLoading?: boolean; };

// KeyValueGrid.tsx
export type KeyValue = { key: string; value: React.ReactNode };
export type KeyValueGridProps = { items: KeyValue[] };

// LogTable.tsx (virtualized)
export type LogRow = { timestamp: string; level: string; message: string };
export type LogTableProps = { rows: LogRow[]; isLoading?: boolean };

// CodeBlock.tsx
export type CodeBlockProps = { code: string; language?: string };

// SourceLink.tsx
export type SourceLinkProps = { href: string; label: string; icon?: React.ReactNode };
```

Acceptance criteria:
- Components accept props only, no implicit globals.
- Styles use local CSS modules or inline styles based on variables. No global class name collisions.
- Log lists are virtualized for >200 rows.
- All components export a skeleton variant for loading.

### Layout and Screens
- `src/ui/screens/App.tsx` includes:
  - Header bar with alertname, pod, status `StatPill`, preset selection, and primary actions.
  - Two-column responsive grid (min 320px columns). Stack on small screens.
  - Cards: Quick Run with preset selection, Elasticsearch Settings (collapsible), AI Prompt Configuration (collapsible), Request Tracing (optional), Results with Expression Details, AI Explanation, AI Analysis, Service Health, Logs (four tabs: General, Error, Time Debugger, Slow), Instance Details.
  - Preset-specific behaviors and special investigation modes (Reset Investigation, Performance Analysis, etc.).
  - Consistent spacing using CSS variables and flex layouts.

### Data Binding
- Bind to existing endpoints:
  - `GET /api/health` → Service Health card.
  - `POST /api/quick` → All main sections; show skeletons while loading.
- Render structured fields with rich components:
  - `lastLogs`, `lastErrorLogs`, `lastTimeDebuggerLogs`, `lastSlowRequestLogs` in tabbed `LogTable` with virtualization.
  - `alertExpressionExplanation`, `analysisText` rendered as markdown.
- Interactive features: clickable log entries open detailed modal, copy-to-clipboard functionality.

### Accessibility & Quality
- Keyboard support and focus order checked manually.
- Role and aria labels for tablists (Logs tabs), tables, and live regions.
- Color contrast AA minimum.

### Performance Requirements
- Use Suspense-like patterns with skeletons; avoid spinner-only states.
- Parallelize network calls where possible; avoid serial waterfalls.
- Virtualize any log list beyond 100 rows.

### Testing Checklist
- Health up/down renders correctly.
- Empty and error states per section.
- Copy-to-clipboard works for code and log lines.
- Links to GitHub and Grafana present where applicable.

### Out-of-Scope
- Introducing Redux or heavy state libraries. Prefer React Query or minimal hooks.

With these requirements, an agent can implement a cohesive design quickly while preserving performance and clarity.