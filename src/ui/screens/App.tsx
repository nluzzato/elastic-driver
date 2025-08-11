import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import '../index.css';
import { SectionCard } from '../components/SectionCard';
import { StatPill } from '../components/StatPill';
import { KeyValueGrid } from '../components/KeyValueGrid';
import { CodeBlock } from '../components/CodeBlock';
import { SourceLink } from '../components/SourceLink';
import { LogTable } from '../components/LogTable';
import { LogModal } from '../components/LogModal';

type Health = {
  ok: boolean;
  services?: { github: boolean; openai: boolean; elasticsearch: boolean };
  error?: string;
};

type QuickForm = { alertname: string; pod: string };

type TabKey = 'recent' | 'error' | 'time';

export const App: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [form, setForm] = useState<QuickForm>({ alertname: '', pod: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('recent');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

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





  const currentLogs = activeTab === 'recent' ? result?.lastLogs : activeTab === 'error' ? result?.lastErrorLogs : result?.lastSlowDebuggerLogs;

  const handleLogClick = (log: any) => {
    setSelectedLog(log);
    setIsLogModalOpen(true);
  };

  const handleCloseLogModal = () => {
    setIsLogModalOpen(false);
    setSelectedLog(null);
  };

  return (
    <div>
      <header className="app-header">
        <h1 className="app-title"><span aria-hidden>🔎</span> Alert Context GUI</h1>
        <div className="row" role="toolbar" aria-label="Global actions">
          <button className="button" onClick={fetchHealth}>Check Health</button>
        </div>
      </header>

      <div className="container">
                <div className="grid-2col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <SectionCard title="Quick Run" actions={
              <div className="row">
                <button className="button" disabled={!canSubmit || loading} onClick={submitQuick}>
                  {loading ? 'Processing…' : 'Run'}
                </button>
              </div>
            }>
              <div className="row" style={{ gap: 12 }}>
                <input className="input" placeholder="alertname (e.g. ContainerCPUThrotellingIsHigh)" value={form.alertname} onChange={(e) => setForm((f) => ({ ...f, alertname: e.target.value }))} aria-label="Alert name" />
                <input className="input" placeholder="pod (e.g. my-pod-123)" value={form.pod} onChange={(e) => setForm((f) => ({ ...f, pod: e.target.value }))} aria-label="Pod name" />
              </div>
              {loading && <div className="skeleton" style={{ height: 40, marginTop: 12 }} />}
              {error && <div role="alert" className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
            </SectionCard>

            <SectionCard title="Result">
              {!result && !loading && <div className="muted">Run a query to see results.</div>}
              {loading && (
                <>
                  <div className="skeleton" style={{ height: 24, marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 160 }} />
                </>
              )}
              {result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                      <StatPill label="Status" value={result.status} tone={result.status === 'FIRING' ? 'danger' : 'success'} />
                      <StatPill label="Found" value={String(result.found)} tone={result.found ? 'success' : 'warning'} />
                    </div>
                    <KeyValueGrid
                      items={[
                        ['Alert name', result.alertname],
                        ['File', result.file || '—'],
                        ['Severity', result.rule?.labels?.severity || '—'],
                        ['Duration', result.rule?.duration || '—']
                      ]}
                    />
                    <div style={{ marginTop: 8 }}>
                      <SourceLink href={result.url} />
                    </div>

                    {result.alertExpressionExplanation && (
                      <div style={{ marginTop: 16 }}>
                        <h4 style={{ margin: 0 }}>AI Explanation</h4>
                        <ReactMarkdown>{result.alertExpressionExplanation}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <SectionCard title="Service Health">
              {!health && <div className="muted">Click "Check Health" to fetch status.</div>}
              {health && (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <StatPill label="GitHub" value={health.services?.github ? 'OK' : 'DOWN'} tone={health.services?.github ? 'success' : 'danger'} />
                  <StatPill label="OpenAI" value={health.services?.openai ? 'OK' : 'DOWN'} tone={health.services?.openai ? 'success' : 'danger'} />
                  <StatPill label="Elasticsearch" value={health.services?.elasticsearch ? 'OK' : 'DOWN'} tone={health.services?.elasticsearch ? 'success' : 'danger'} />
                </div>
              )}
            </SectionCard>

            <SectionCard title="Logs">
              {!result && !loading && <div className="muted">Run a query to load logs.</div>}
              {loading && <div className="skeleton" style={{ height: 300 }} />}
              {result && (
                <div>
                  <div className="tabs" role="tablist" aria-label="Log categories">
                    <button className="tab" role="tab" aria-selected={activeTab === 'recent'} aria-controls="recent-panel" id="recent-tab" onClick={() => setActiveTab('recent')}>General</button>
                    <button className="tab" role="tab" aria-selected={activeTab === 'error'} aria-controls="error-panel" id="error-tab" onClick={() => setActiveTab('error')}>Error</button>
                    <button className="tab" role="tab" aria-selected={activeTab === 'time'} aria-controls="time-panel" id="time-tab" onClick={() => setActiveTab('time')}>Slow</button>
                  </div>
                  <div role="tabpanel" id={`${activeTab}-panel`} aria-labelledby={`${activeTab}-tab`}>
                    <LogTable logs={currentLogs} emptyText="No logs" ariaLabel={`${activeTab} logs`} onLogClick={handleLogClick} />
                  </div>
                </div>
              )}
            </SectionCard>

            {result?.analysisText && (
              <SectionCard title="AI Analysis & Recommendations">
                <ReactMarkdown>{result.analysisText}</ReactMarkdown>
              </SectionCard>
            )}
          </div>
        </div>
      </div>
      
      <LogModal 
        log={selectedLog}
        isOpen={isLogModalOpen}
        onClose={handleCloseLogModal}
      />
    </div>
  );
};
