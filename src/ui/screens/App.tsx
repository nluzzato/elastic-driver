import React, { useMemo, useState } from 'react';

type Health = {
  ok: boolean;
  services?: { github: boolean; openai: boolean; elasticsearch: boolean };
  error?: string;
};

type QuickForm = { alertname: string; pod: string };

export const App: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [form, setForm] = useState<QuickForm>({ alertname: '', pod: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonAlert, setJsonAlert] = useState<string>('');
  const [jsonLoading, setJsonLoading] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const canSubmit = useMemo(() => form.alertname.trim() && form.pod.trim(), [form]);

  async function fetchHealth() {
    setError(null);
    setHealth(null);
    try {
      const res = await fetch('/api/health');
      const json = await res.json();
      setHealth(json);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch health');
    }
  }

  async function submitQuick() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Request failed');
      setResult(json);
    } catch (e: any) {
      setError(e?.message || 'Failed to process alert');
    } finally {
      setLoading(false);
    }
  }

  async function submitJsonAlert() {
    setJsonError(null);
    setError(null);
    setResult(null);
    let payload: any;
    try {
      payload = JSON.parse(jsonAlert);
    } catch (e: any) {
      setJsonError('Invalid JSON');
      return;
    }
    setJsonLoading(true);
    try {
      const res = await fetch('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Request failed');
      setResult(json);
    } catch (e: any) {
      setJsonError(e?.message || 'Failed to process alert');
    } finally {
      setJsonLoading(false);
    }
  }

  async function copyFormatted() {
    if (!result?.formattedContext) return;
    await navigator.clipboard.writeText(result.formattedContext);
    alert('Formatted context copied to clipboard');
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif', padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: 28 }}>🔎</span>
        <h1 style={{ margin: 0 }}>Alert Context GUI</h1>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Service Health</h2>
            <button onClick={fetchHealth}>Check Health</button>
          </div>
          {health && (
            <div style={{ marginTop: 12 }}>
              <div>Overall: {health.ok ? '✅ OK' : '❌ Issue'}</div>
              {health.error && <div style={{ color: '#b91c1c' }}>Error: {health.error}</div>}
              {health.services && (
                <ul>
                  <li>GitHub: {health.services.github ? '✅' : '❌'}</li>
                  <li>OpenAI: {health.services.openai ? '✅' : '❌'}</li>
                  <li>Elasticsearch: {health.services.elasticsearch ? '✅' : '❌'}</li>
                </ul>
              )}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, marginBottom: 12 }}>Quick Run</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
            <input
              placeholder="alertname (e.g. ContainerCPUThrotellingIsHigh)"
              value={form.alertname}
              onChange={(e) => setForm((f) => ({ ...f, alertname: e.target.value }))}
            />
            <input
              placeholder="pod (e.g. my-pod-123)"
              value={form.pod}
              onChange={(e) => setForm((f) => ({ ...f, pod: e.target.value }))}
            />
            <button disabled={!canSubmit || loading} onClick={submitQuick}>
              {loading ? 'Processing…' : 'Run'}
            </button>
          </div>
          {error && <div style={{ color: '#b91c1c', marginTop: 8 }}>{error}</div>}
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, marginBottom: 8 }}>Full JSON Alert</h2>
          <p style={{ marginTop: 0, color: '#6b7280' }}>Paste a full `Alert` JSON payload (see `src/types/index.ts`).</p>
          <textarea
            style={{ width: '100%', minHeight: 140, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \\"Liberation Mono\\", \\"Courier New\\", monospace' }}
            placeholder='{"status":"FIRING","alertTitle":"...","alert":"...","description":"...","details":{ "alertname":"...","pod":"...", "container":"...","ct_cluster":"...","namespace":"...","target":"slack","team":"..." }}'
            value={jsonAlert}
            onChange={(e) => setJsonAlert(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={submitJsonAlert} disabled={jsonLoading}>{jsonLoading ? 'Processing…' : 'Run JSON'}</button>
            <button onClick={() => setJsonAlert('')}>Clear</button>
          </div>
          {jsonError && <div style={{ color: '#b91c1c', marginTop: 8 }}>{jsonError}</div>}
        </div>
      </section>

      {result && (
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, marginBottom: 12 }}>Result</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <h3 style={{ marginTop: 0 }}>Overview</h3>
              <ul>
                <li><strong>alertname</strong>: {result.alertname}</li>
                <li><strong>status</strong>: {result.status}</li>
                <li><strong>found</strong>: {String(result.found)}</li>
                {result.file && <li><strong>file</strong>: {result.file}</li>}
                {result.url && (
                  <li>
                    <strong>url</strong>: <a href={result.url} target="_blank" rel="noreferrer">Open</a>
                  </li>
                )}
              </ul>
              {result.rule && (
                <div>
                  <h4 style={{ marginBottom: 4 }}>Rule</h4>
                  <div><strong>expression</strong>: <code style={{ wordBreak: 'break-all' }}>{result.rule.expression}</code></div>
                  {result.rule.duration && <div><strong>duration</strong>: {result.rule.duration}</div>}
                  {result.rule.labels?.severity && <div><strong>severity</strong>: {result.rule.labels.severity}</div>}
                </div>
              )}
            </div>
            <div>
              <h3 style={{ marginTop: 0 }}>Formatted Context</h3>
              <div style={{ marginBottom: 8 }}>
                <button onClick={copyFormatted}>Copy to clipboard</button>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#0b1023', color: '#e5e7eb', padding: 12, borderRadius: 8, maxHeight: 500, overflow: 'auto' }}>
                {result.formattedContext}
              </pre>
            </div>
          </div>
        </section>
      )}

      <footer style={{ marginTop: 24, color: '#6b7280' }}>
        <small>UI calls existing services via REST. Configure env in `.env`. Start with npm run gui:dev.</small>
      </footer>
    </div>
  );
};


