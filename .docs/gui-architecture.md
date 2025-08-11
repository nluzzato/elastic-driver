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
  - `POST /api/quick`: Accepts `{ alertname, pod }` and constructs a minimal `Alert`, then calls `SimpleAlertService.processAlert()` and returns the resulting `ContextOutput`.
  - `POST /api/alert`: Accepts a full `Alert` JSON payload and returns the resulting `ContextOutput`.

The server uses the existing configuration loader `src/config/index.ts` and does not duplicate business logic.

## UI

- Entry HTML: `src/ui/index.html`
- Entry TSX: `src/ui/main.tsx`
- Screen: `src/ui/screens/App.tsx`

The `App` screen provides:
- Service Health panel: Calls `/api/health` and displays connectivity status for GitHub, OpenAI, Elasticsearch, Grafana.
- Quick Run form: `alertname` + `pod` to invoke `/api/quick`. The response renders both structured fields and the `formattedContext` string from the orchestrator.

### API Response Shape for GUI

The server enriches the classic `ContextOutput` with structured fields for the GUI:

```
interface ContextOutput {
  // existing fields...
  formattedContext: string;

  // structured fields for GUI
  lastLogs?: ElasticLogEntry[];
  lastErrorLogs?: ElasticLogEntry[];
  lastSlowDebuggerLogs?: ElasticLogEntry[];
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
}
```

These are populated directly from `ElasticsearchService` results and `OpenAIQueryService` outputs to enable rich rendering without parsing the `formattedContext`.

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

## Future Enhancements

- Add a rich viewer for logs and error breakdowns.
- Persist recent alert runs in local storage.
- Add a form to POST full JSON alerts to `/api/alert`.
- Slack webhook integration for sending formatted context.

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
- Replace `src/ui/screens/App.tsx` with a layout that includes:
  - Header bar with alertname, pod, status `StatPill`, and primary actions.
  - Two-column responsive grid (min 320px columns). Stack on small screens.
  - Cards: Expression Details, AI Explanation, AI Analysis, Service Health, Logs (three tabs), Instance Details.

### Data Binding
- Bind to existing endpoints:
  - `GET /api/health` → Service Health card.
  - `POST /api/quick` → All main sections; stream or show skeletons while loading.
- Render `formattedContext` inside `CodeBlock` with copy.
- Render structured fields: `lastLogs`, `lastErrorLogs`, `lastSlowDebuggerLogs`, `alertExpressionExplanation`, `analysisText`.

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