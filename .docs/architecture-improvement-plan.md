### Architecture Quality Improvement Plan (v2)

This plan proposes concrete, low-risk edits to improve consistency, extensibility, and reliability without breaking current behavior. Each item includes exact files to touch, suggested code edits, and acceptance checks.

---

## Executive Summary

- **Unify HTTP/auth patterns** across `GitHubService`, `ElasticsearchService`, `GrafanaService` with a small `HttpClient` wrapper and consistent headers/timeouts/retries.
- **Honor UI-configured log toggles** in `SimpleAlertService` to avoid unnecessary queries and speed up runs.
- **Normalize Elasticsearch endpoints** and hostname filtering to prevent cross-pod contamination and inconsistent behavior.
- **Centralize AI model selection** in `application.ts` and remove hardcoded model names from services.
- **Tighten types** for `ElasticSettings` and `LogTypes`, and reuse them across API/server/services/UI.
- **Improve health checks** (Grafana) and error handling patterns (TypeScript-safe) uniformly.
- **Add dev quality gates**: `tsc --noEmit`, ESLint + Prettier, minimal smoke tests.
- **Implement service interface pattern** for better extensibility and testability.
- **Add request context propagation** for better traceability and debugging.

---

## Current State (Key Observations)

- `ElasticsearchService` builds headers and URLs in multiple ways (`/_search` vs `/${indexPattern}/_search`); auth header composition varies.
- `SimpleAlertService.processAlert()` ignores the `logTypes` toggle; always fetches all 4 categories.
- `OpenAIQueryService` hardcodes model names vs `application.ts` central config.
- Error handling and auth headers are not uniformly using the workspace rules.
- Grafana health check hits base URL (non-specific), which may not validate API access properly.
- Types for `ElasticSettings` and `LogTypes` appear in docs/`application.ts` but are not consistently reused across `src/types` and API.
- HTTP request patterns differ across services: GitHub uses custom `makeRequest`, others use direct `fetch`.
- No timeout enforcement on ElasticsearchService requests despite configuration.
- Inconsistent error logging patterns - some use `console.warn`, others `console.error`.
- No service interface/contract definitions, making it harder to add new integrations.

---

## Guiding Principles

- **Don’t break functionality**: keep existing behaviors as defaults; add new behavior behind flags or inferred from existing config.
- **Uniform patterns**: one way to build headers, one way to time out HTTP calls, one way to construct ES queries.
- **Extendible**: minimal abstractions where we have duplicates (HTTP), no heavy frameworks.

---

## Phase 1 (Today): Consistency, Safety, and honoring UI toggles

### 1) Introduce a tiny HttpClient wrapper (timeouts + headers)

- Files: `src/utils/http.ts` (new), update `src/utils/index.ts` to export
- Purpose: centralize fetch with timeouts and consistent auth header composition per service.

Suggested shape:

```ts
// src/utils/http.ts
export type HttpOptions = {
  method?: 'GET'|'POST'|'PUT'|'DELETE';
  headers?: Record<string,string>;
  body?: any;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export class HttpTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'HttpTimeoutError';
  }
}

export async function httpFetch(url: string, opts: HttpOptions = {}): Promise<Response> {
  const { retries = 0, retryDelayMs = 1000, ...fetchOpts } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);

    try {
      const headers = { ...(fetchOpts.headers || {}) } as Record<string,string>;
      const hasContentType = Object.keys(headers).some(h => h.toLowerCase() === 'content-type');

      let bodyToSend: BodyInit | undefined = undefined;
      if (fetchOpts.body !== undefined) {
        const isString = typeof fetchOpts.body === 'string';
        const isFormLike = fetchOpts.body instanceof URLSearchParams || fetchOpts.body instanceof FormData || fetchOpts.body instanceof Blob;
        const isUrlEncoded = hasContentType && headers['Content-Type'] === 'application/x-www-form-urlencoded';

        if (isString || isFormLike || isUrlEncoded) {
          bodyToSend = fetchOpts.body as BodyInit;
        } else {
          if (!hasContentType) headers['Content-Type'] = 'application/json';
          bodyToSend = JSON.stringify(fetchOpts.body);
        }
      }

      const response = await fetch(url, {
        method: fetchOpts.method ?? 'GET',
        headers,
        body: bodyToSend,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on 5xx if we have retries left
      if (!response.ok && attempt < retries) {
        console.warn(`⚠️  HTTP ${response.status} for ${url}, retrying in ${retryDelayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Check if it's an abort error (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpTimeoutError(url, opts.timeoutMs ?? 30000);
      }

      // Retry on network errors if we have retries left
      if (attempt < retries) {
        console.warn(`⚠️  Network error for ${url}, retrying in ${retryDelayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

// Helper to read JSON response with error handling
export async function httpFetchJson<T = any>(url: string, opts: HttpOptions = {}): Promise<T> {
  const response = await httpFetch(url, opts);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}
```

Action:
- Refactor `ElasticsearchService`, `GitHubService`, `GrafanaService` to use `httpFetch(url, { headers, body, timeoutMs, retries })` with service-specific defaults sourced from `application.ts > timeouts` (per-service overrides allowed).

Acceptance:
- All HTTP calls still work; timeouts now enforced consistently.

### 2) Standardize Elasticsearch auth headers and URL building

- Files: `src/services/ElasticsearchService.ts`
- Apply the workspace rule for auth headers and add a helper:

```ts
private buildAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(this.config.apiKey && { 'Authorization': `ApiKey ${this.config.apiKey}` }),
    ...(this.config.username && this.config.password && {
      'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`
    })
  } as Record<string,string>;
}

private buildSearchUrl(includeIndex: boolean = false) {
  // ELASTICSEARCH_URL is already the custom /search base
  return includeIndex
    ? `${this.config.url}/${this.config.indexPattern}/_search`
    : `${this.config.url}/_search`;
}
```

Action:
- Replace all ad-hoc header construction with `this.buildAuthHeaders()`.
- Replace literal `/_search` and `/${indexPattern}/_search` with `this.buildSearchUrl(includeIndex)` consistently:
  - General + around-time: `includeIndex = false` (keeps current custom aggregator endpoint usage)
  - Slow requests + request trace + sinceTimestamp (where index is currently used): `includeIndex = true`

Acceptance:
- Existing queries return the same results; headers follow a single rule.

### 3) Honor `logTypes` in `SimpleAlertService.processAlert()`

- File: `src/services/SimpleAlertService.ts`
- Replace the unconditional parallel fetch with conditional calls based on `logTypes`:

```ts
// Build promises array with type tracking
const logPromises: Array<{ type: string; promise: Promise<LogEntry[]> }> = [];

if (!logTypes || logTypes.general) {
  logPromises.push({ 
    type: 'general', 
    promise: this.elasticsearchService.getLastLogsForPod(podName, limit, undefined, undefined, timeframeMinutes) 
  });
}
if (!logTypes || logTypes.error) {
  logPromises.push({ 
    type: 'error', 
    promise: this.elasticsearchService.getLastLogsForPod(podName, limit, 'ERROR', undefined, timeframeMinutes) 
  });
}
if (!logTypes || logTypes.timeDebugger) {
  logPromises.push({ 
    type: 'timeDebugger', 
    promise: this.elasticsearchService.getLastLogsForPod(podName, limit, undefined, '[TIME_DEBUGGER] [SLOW]', timeframeMinutes) 
  });
}
if (!logTypes || logTypes.slow) {
  logPromises.push({ 
    type: 'slow', 
    promise: this.elasticsearchService.getLastSlowRequestLogsForPod(podName, limit, slowThreshold, timeframeMinutes) 
  });
}

// Execute promises and map results
const results = await Promise.all(logPromises.map(p => p.promise));
const logResults: Record<string, LogEntry[]> = {
  general: [],
  error: [],
  timeDebugger: [],
  slow: []
};

// Map results back to correct types
logPromises.forEach((item, index) => {
  logResults[item.type] = results[index];
});

// Assign to variables
logs = logResults.general;
errorLogs = logResults.error;
timeDebuggerLogs = logResults.timeDebugger;
slowRequestLogs = logResults.slow;
```

Action:
- Implement conditional promise building with type tracking to ensure correct mapping of results.

Acceptance:
- When a preset disables a category, corresponding ES calls are skipped and UI counts reflect that.
- Performance improvement when fewer log types are requested.

### 4) Centralize AI model names in `application.ts`

- Files: `src/config/application.ts`, `src/services/OpenAIQueryService.ts`
- Action: Use `defaultAiSettings.model.explanation` and `.analysis` instead of hardcoded `'gpt-4o-mini'` and `'o3-mini'`.

Edits:
- Import `defaultAiSettings` in `OpenAIQueryService` and reference `defaultAiSettings.model.explanation` and `defaultAiSettings.model.analysis` in the two calls.

Acceptance:
- Changing models in one place updates behavior everywhere; explanations/analysis still work.

### 5) Tighten shared types and reuse them

- Files: `src/types/index.ts`, references in `SimpleAlertService`, `src/server.ts`, UI types where needed
- Action:
  - Add `export interface ElasticSettings { timeframeMinutes: number; documentLimit: number; slowRequestThreshold: number }`
  - Add `export interface LogTypes { general: boolean; error: boolean; slow: boolean; timeDebugger: boolean }`
  - Replace inline object types with these across services and API.

Acceptance:
- `tsc --noEmit` passes; fewer inline anonymous types.

### 6) Error handling pattern (TypeScript-safe)

- Files: all services; focus on catch blocks
- Action: Replace generic `catch (error: any)` logs with the workspace rule:

```ts
catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error:', message);
}
```

Acceptance:
- No loss of error information; consistent logging.

### 7) Grafana health check correctness

- File: `src/services/GrafanaService.ts`
- Action: Replace base URL ping with a lightweight authorized endpoint:

```ts
async healthCheck(): Promise<boolean> {
  if (!this.enabled) return false;

  const headers = { 'Authorization': `Bearer ${this.config!.apiKey}` };
  const endpoints = ['/api/health', '/api/search', '/api/datasources'];

  for (const ep of endpoints) {
    try {
      const resp = await httpFetch(`${this.config!.url}${ep}`, { headers, timeoutMs: 5000 });
      if (resp.ok) {
        console.log(`✅ Grafana health check passed via ${ep}`);
        return true;
      }
      console.warn(`⚠️  Grafana health probe ${ep} returned ${resp.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`⚠️  Grafana probe ${ep} error: ${message}`);
    }
  }

  console.error('❌ Grafana health check failed: all probes unsuccessful');
  return false;
}
```

Acceptance:
- Health reflects real API access and token validity.
- Timeout enforced for quick failure detection.

---

## Phase 2 (Next 1–2 days): Uniform architecture and small extensions

### 8) Implement Service Interface Pattern

- Files: `src/services/interfaces.ts` (new), all service files
- Define base interfaces for consistent service behavior:

```ts
// src/services/interfaces.ts
export interface ServiceHealth {
  isEnabled(): boolean;
  healthCheck(): Promise<boolean>;
}

export interface ServiceConfig {
  timeout?: number;
  retries?: number;
}

export interface LogService extends ServiceHealth {
  getLastLogsForPod(podName: string, limit?: number, ...args: any[]): Promise<LogEntry[]>;
}

export interface MetricsService extends ServiceHealth {
  queryMetric(query: string, ...args: any[]): Promise<any>;
}

export interface AlertDefinitionService extends ServiceHealth {
  searchForAlert(alertName: string, ...args: any[]): Promise<any>;
}
```

Action:
- Make all services implement appropriate interfaces
- Ensures consistent API across services for easier testing and extension

### 9) Consolidate ES query builders

- File: `src/services/ElasticsearchService.ts`
- Add query builder helpers:

```ts
private buildTermQuery(field: string, value: string) {
  return { term: { [field]: value } };
}

private buildTimeRangeQuery(minutes?: number) {
  if (!minutes) return null;
  return {
    range: {
      '@timestamp': {
        gte: `now-${minutes}m`,
        lte: 'now'
      }
    }
  };
}

private buildMustClauses(conditions: any[]) {
  return {
    bool: {
      must: conditions.filter(Boolean)
    }
  };
}
```

### 10) Add Request Context Propagation

- Files: `src/types/index.ts`, all services
- Add request context for better traceability:

```ts
export interface RequestContext {
  requestId: string;
  userId?: string;
  traceId?: string;
  startTime: Date;
}

// Pass context through service calls (last optional argument to preserve existing signature)
async processAlert(
  alert: Alert,
  elasticSettings?: ElasticSettings,
  logTypes?: LogTypes,
  specialBehavior?: PresetBehavior,
  presetConfig?: { gitHubRepo?: string },
  requestContext?: RequestContext
): Promise<ContextOutput>
```

### 11) Config validation enhancement

- Files: `src/config/index.ts`
- Return structured validation result:

```ts
export interface ConfigValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  serviceStatus: {
    github: boolean;
    openai: boolean;
    elasticsearch: boolean;
    grafana: boolean;
  };
}

export function validateConfig(): ConfigValidation {
  const validation: ConfigValidation = {
    ok: true,
    errors: [],
    warnings: [],
    serviceStatus: {
      github: false,
      openai: false,
      elasticsearch: false,
      grafana: false
    }
  };
  
  // Validation logic...
  
  return validation;
}
```

---

## Phase 3 (DevEx + Quality gates)

### 12) Add ESLint + Prettier configuration

- Files: `.eslintrc.js`, `.prettierrc.json`, `package.json`
- ESLint config with TypeScript support:

```js
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    es2020: true
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'no-console': 'off', // Allow console for logging
    'prefer-const': 'error'
  }
};
```

- Prettier config:
```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

- Scripts:
  - `"typecheck": "tsc --noEmit"`
  - `"lint": "eslint \"src/**/*.{ts,tsx}\""`
  - `"lint:fix": "eslint \"src/**/*.{ts,tsx}\" --fix"`
  - `"format": "prettier --write \"src/**/*.{ts,tsx,json}\""`
  - `"check:all": "npm run typecheck && npm run lint"`

### 13) Add basic test infrastructure

- Files: `vitest.config.ts`, `src/__tests__/`, `package.json`
- Add vitest for fast unit testing:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  }
});
```

- Example smoke test:
```ts
// src/__tests__/utils/http.test.ts
import { describe, it, expect } from 'vitest';
import { httpFetch, HttpTimeoutError } from '../../utils/http';

describe('httpFetch', () => {
  it('should timeout after specified duration', async () => {
    await expect(
      httpFetch('https://httpstat.us/200?sleep=5000', { timeoutMs: 100 })
    ).rejects.toThrow(HttpTimeoutError);
  });
});
```

### 14) Separate UI and server TypeScript configs

- Files: `tsconfig.json`, `tsconfig.server.json`, `src/ui/tsconfig.json`
- Root tsconfig as base:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

- Server-specific config:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/ui/**/*", "src/__tests__/**/*"]
}
```

### 15) Add pre-commit hooks (optional but recommended)

- Files: `.husky/`, `package.json`
- Use husky + lint-staged for automatic checks:
```json
{
  "lint-staged": {
    "src/**/*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

---

## Acceptance Checklist

### Phase 1 Acceptance
- [ ] `npm run build` and `npm run typecheck` pass without errors
- [ ] HTTP requests use unified `httpFetch` with proper timeouts
- [ ] `/api/quick` honors `logTypes` and reduces ES calls when tabs are disabled
- [ ] ES headers and URLs are consistent; no mixed patterns
- [ ] Changing AI models in `application.ts` immediately affects services
- [ ] Grafana health check validates API access, not just connectivity
- [ ] All error handling follows TypeScript-safe pattern

### Phase 2 Acceptance
- [ ] All services implement appropriate interfaces
- [ ] ES query building is centralized and consistent
- [ ] Request context can be propagated through service calls
- [ ] Config validation returns structured results with warnings

### Phase 3 Acceptance
- [ ] ESLint and Prettier are configured and passing
- [ ] Basic smoke tests are running
- [ ] TypeScript configs properly separate UI and server concerns
- [ ] Pre-commit hooks ensure code quality (if implemented)

### Performance Improvements
- [ ] Reduced API calls when log types are disabled
- [ ] Timeout enforcement prevents hanging requests
- [ ] Retry logic handles transient failures gracefully

---

## Detailed Edit Index (Quick Reference)

### Phase 1 - Core Consistency
- `src/utils/http.ts`: NEW - Create `httpFetch()` with timeout and retry support
- `src/utils/index.ts`: Export new http utilities
- `src/services/ElasticsearchService.ts`: 
  - Add `buildAuthHeaders()`, `buildSearchUrl()` helpers
  - Replace all fetch calls with `httpFetch`
  - Add query builder methods
- `src/services/SimpleAlertService.ts`: 
  - Honor `logTypes` when building parallel ES calls
  - Use promise array with type tracking
  - Preserve reset-investigation behavior
- `src/services/OpenAIQueryService.ts`: 
  - Import `defaultAiSettings` from config
  - Replace hardcoded model names
- `src/services/GrafanaService.ts`: 
  - Update `healthCheck()` to use `/api/datasources`
  - Replace all fetch with `httpFetch`
- `src/services/GitHubService.ts`:
  - Refactor `makeRequest` to use `httpFetch`
- `src/types/index.ts`: 
  - Add `ElasticSettings` interface
  - Add `LogTypes` interface
  - Export for reuse
- `src/server.ts`: 
  - Import shared types
  - Use types consistently
  - NOTE: Ensure request/response DTOs reuse `ElasticSettings` and `LogTypes` from `src/types` to keep API/GUI contracts in sync.
  
### Cross-cutting
- `src/index.ts`:
  - Either export `SimpleAlertService` as `AlertService` for backward compatibility or remove stale `AlertService` export and update README/snippets accordingly.
  - Confirm `README.md` examples reflect `SimpleAlertService`.

---

## Step-by-step Implementation Plan

Follow these steps in order. After each step, run `npm run build` (TypeScript) and update the Progress Log below.

1) Branch setup
- Create branch: `git checkout -b feat/arch-quality-phase1`

2) Add HTTP client utility
- Add `src/utils/http.ts` with `httpFetch`, `httpFetchJson`, and `HttpTimeoutError` as specified above.
- Export from `src/utils/index.ts` if needed.

3) Refactor GrafanaService to use httpFetch
- Replace all `fetch` calls with `httpFetch`.
- Update `healthCheck()` to probe `/api/health`, then `/api/search`, then `/api/datasources` with timeouts.
- Preserve `application/x-www-form-urlencoded` bodies for query methods.

4) Standardize ElasticsearchService
- Add `private buildAuthHeaders()` and `private buildSearchUrl(includeIndex?: boolean)`.
- Replace ad-hoc headers and URLs, and move to `httpFetch`.
- Keep aggregator vs index-specific endpoints per the plan; guard against empty `indexPattern`.

5) Honor logTypes in SimpleAlertService
- Build conditional promises with type tracking and map results back to the right buckets.
- Keep reset-investigation logic intact.

6) Centralize AI model selection in OpenAIQueryService
- Import `defaultAiSettings` and use `model.explanation` and `model.analysis`.

7) Tighten shared types and use them
- In `src/types/index.ts`, add `ElasticSettings` and `LogTypes`.
- In `src/server.ts` and `src/services/SimpleAlertService.ts`, use these types.

8) Error handling normalization
- Update catch blocks in services touched above to use the TypeScript-safe error pattern.

9) Cross-cutting export cleanup
- In `src/index.ts`, export `SimpleAlertService` as `AlertService` (or remove stale export) and align README examples.

10) Build and verify
- Run: `npm run build` (or `tsc --noEmit`). Ensure 0 errors.

11) Commit Phase 1
- Commit with message: `feat(architecture): phase 1 – http client, ES standardization, logTypes, ai models, health checks`

---

## Progress Log

- [x] Step 1: Branch created
- [x] Step 2: HTTP client utility added
- [x] Step 3: GrafanaService refactored to httpFetch + improved health
- [x] Step 4: ElasticsearchService standardized (headers/URLs/httpFetch)
- [x] Step 5: SimpleAlertService honors logTypes
- [x] Step 6: OpenAIQueryService uses centralized model names
- [x] Step 7: Shared types added and reused in server/service
- [ ] Step 8: Error handling normalized in touched services
- [ ] Step 9: `src/index.ts` export cleanup (and README alignment)
- [x] Step 10: TypeScript build green
- [ ] Step 11: Commit Phase 1

### Phase 2 - Architecture Enhancement
- `src/services/interfaces.ts`: NEW - Service interface definitions
- `src/types/index.ts`: Add `RequestContext` interface
- `src/config/index.ts`: Enhanced validation with `ConfigValidation` type
- All service files: Implement appropriate interfaces

### Phase 3 - Developer Experience
- `.eslintrc.js`: NEW - ESLint configuration
- `.prettierrc.json`: NEW - Prettier configuration
- `vitest.config.ts`: NEW - Test configuration
- `tsconfig.server.json`: NEW - Server-specific TypeScript config
- `src/ui/tsconfig.json`: NEW - UI-specific TypeScript config
- `package.json`: Add new scripts and dev dependencies

---

## Appendix: Code Snippets

### A1. Consistent ES auth headers (drop-in)

```ts
private buildAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(this.config.apiKey && { 'Authorization': `ApiKey ${this.config.apiKey}` }),
    ...(this.config.username && this.config.password && {
      'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`
    })
  } as Record<string,string>;
}
```

### A2. Safe catch pattern

```ts
catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error:', message);
}
```

### A3. Centralized model selection

```ts
import { defaultAiSettings } from '@/config/application';

const explanationModel = defaultAiSettings.model.explanation;
const analysisModel = defaultAiSettings.model.analysis;
```

### A4. Service Interface Example Implementation

```ts
// src/services/ElasticsearchService.ts
import { LogService } from './interfaces';

export class ElasticsearchService implements LogService {
  // Existing implementation...
  
  isEnabled(): boolean {
    return this.enabled;
  }
  
  async healthCheck(): Promise<boolean> {
    // Implementation with httpFetch...
  }
}
```

### A5. Enhanced Error Logging Pattern

```ts
// Consistent error logging with context
private logError(operation: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const stack = error instanceof Error ? error.stack : undefined;
  
  console.error(`❌ ${this.constructor.name}.${operation} failed:`, {
    message,
    stack: stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
    timestamp: new Date().toISOString()
  });
}
```

---

## Migration Strategy

### Week 1: Foundation (Phase 1)
- Day 1-2: Implement HTTP wrapper and update all services
- Day 3: Fix logTypes handling in SimpleAlertService
- Day 4: Standardize Elasticsearch patterns
- Day 5: Update types and error handling

### Week 2: Architecture (Phase 2)
- Day 1-2: Implement service interfaces
- Day 3: Add query builders and helpers
- Day 4: Implement request context
- Day 5: Enhanced config validation

### Week 3: Quality (Phase 3)
- Day 1-2: Setup linting and formatting
- Day 3: Add basic tests
- Day 4: TypeScript config separation
- Day 5: Documentation and final checks

---

## Risk Mitigation

1. **Breaking Changes**: All changes preserve existing API contracts
2. **Performance**: Log type filtering improves performance
3. **Testing**: Add smoke tests before major refactoring
4. **Rollback**: Each phase can be deployed independently

---

## Success Metrics

1. **Code Quality**
   - TypeScript compilation: 0 errors
   - ESLint warnings: < 10
   - Test coverage: > 50% for critical paths

2. **Performance**
   - Reduced ES queries by ~25% with log type filtering
   - All requests timeout within configured limits
   - Failed requests retry appropriately

3. **Developer Experience**
   - Consistent patterns across all services
   - Clear interfaces for extending functionality
   - Automated quality checks in place

---

This plan keeps existing behavior intact while making patterns uniform and easier to extend. Each change is scoped, mechanical, and verifiable with a short checklist. The phased approach allows for incremental improvements without disrupting the production system.
