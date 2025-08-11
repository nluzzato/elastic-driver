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
  - `GET /api/health`: Calls `SimpleAlertService.fullHealthCheck()` and returns `{ github, openai, elasticsearch }` service connectivity.
  - `POST /api/quick`: Accepts `{ alertname, pod }` and constructs a minimal `Alert`, then calls `SimpleAlertService.processAlert()` and returns the resulting `ContextOutput`.
  - `POST /api/alert`: Accepts a full `Alert` JSON payload and returns the resulting `ContextOutput`.

The server uses the existing configuration loader `src/config/index.ts` and does not duplicate business logic.

## UI

- Entry HTML: `src/ui/index.html`
- Entry TSX: `src/ui/main.tsx`
- Screen: `src/ui/screens/App.tsx`

The `App` screen provides:
- Service Health panel: Calls `/api/health` and displays connectivity status for GitHub, OpenAI, Elasticsearch.
- Quick Run form: `alertname` + `pod` to invoke `/api/quick`. The response renders both structured fields and the `formattedContext` string from the orchestrator.

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


