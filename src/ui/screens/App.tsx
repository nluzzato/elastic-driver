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
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { defaultElasticSettings, prometheusAlertPrompt, aiAnalysisPrompt } from '../../config/application';

type Health = {
  ok: boolean;
  services?: { github: boolean; openai: boolean; elasticsearch: boolean; grafana: boolean };
  error?: string;
};

type QuickForm = { alertname: string; pod: string };

type ElasticSettings = {
  timeframeMinutes: number;
  documentLimit: number;
  slowRequestThreshold: number;
};

type AIPromptSettings = {
  explanationPrompt: string;
  analysisPrompt: string;
};

type TabKey = 'recent' | 'error' | 'time' | 'slow';

export const App: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [form, setForm] = useState<QuickForm>({ alertname: '', pod: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('recent');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [elasticSettings, setElasticSettings] = useState<ElasticSettings>(defaultElasticSettings);
  const [showElasticSettings, setShowElasticSettings] = useState(false);
  const [aiPromptSettings, setAIPromptSettings] = useState<AIPromptSettings>({
    explanationPrompt: prometheusAlertPrompt,
    analysisPrompt: aiAnalysisPrompt
  });
  const [showAIPromptSettings, setShowAIPromptSettings] = useState(false);

  const canSubmit = useMemo(() => form.pod.trim(), [form]); // Only pod is required

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
        body: JSON.stringify({ 
          alertname: form.alertname, 
          pod: form.pod,
          elasticSettings: elasticSettings
        })
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





  const currentLogs = activeTab === 'recent' ? result?.lastLogs : 
                      activeTab === 'error' ? result?.lastErrorLogs : 
                      activeTab === 'time' ? result?.lastTimeDebuggerLogs :
                      result?.lastSlowRequestLogs;

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <SectionCard title="🚀 Quick Analysis" actions={
              <Button 
                variant="primary" 
                size="md" 
                disabled={!canSubmit} 
                isLoading={loading}
                leftIcon="⚡"
                onClick={submitQuick}
              >
                Analyze Logs
              </Button>
            }>
              <div className="elastic-settings-grid">
                <Input
                  label="Pod Name"
                  placeholder="e.g. my-app-656f8b67bc-cf6pm"
                  value={form.pod}
                  onChange={(e) => setForm((f) => ({ ...f, pod: e.target.value }))}
                  required
                  hint="The Kubernetes pod to analyze"
                />
                
                <Input
                  label="Alert Name"
                  placeholder="e.g. ContainerCPUThrottlingIsHigh"
                  value={form.alertname}
                  onChange={(e) => setForm((f) => ({ ...f, alertname: e.target.value }))}
                  optional
                  hint="Leave empty for general log analysis"
                />
              </div>
              
              {loading && <div className="skeleton enhanced-skeleton" />}
              {error && (
                <div role="alert" className="quick-run-error">
                  <span className="quick-run-error-icon">⚠️</span>
                  {error}
                </div>
              )}
            </SectionCard>

            <div className="elastic-settings-card">
              <button 
                className="elastic-settings-header"
                onClick={() => setShowElasticSettings(!showElasticSettings)}
                aria-expanded={showElasticSettings}
                aria-controls="elastic-settings-panel"
              >
                <div className="elastic-settings-title">
                  <span className="elastic-settings-icon">
                    ⚙️
                  </span>
                  <span>Elasticsearch Configuration</span>
                  <span className="elastic-settings-badge">
                    {elasticSettings.timeframeMinutes < 60 ? `${elasticSettings.timeframeMinutes}m` : `${Math.floor(elasticSettings.timeframeMinutes / 60)}h`}
                    {' • '}
                    {elasticSettings.documentLimit} docs
                    {' • '}
                    {elasticSettings.slowRequestThreshold}s
                  </span>
                </div>
                <span className={`elastic-settings-chevron ${showElasticSettings ? 'expanded' : ''}`}>
                  ⌄
                </span>
              </button>
              
              {showElasticSettings && (
                <div className="elastic-settings-panel" id="elastic-settings-panel">
                  <div className="elastic-settings-grid">
                    <div className="elastic-setting-row">
                      <label className="elastic-setting-label">
                        🕐 Timeframe
                      </label>
                      <div className="elastic-setting-control">
                        <select 
                          value={elasticSettings.timeframeMinutes}
                          onChange={(e) => setElasticSettings(prev => ({ ...prev, timeframeMinutes: parseInt(e.target.value) }))}
                          className="elastic-select"
                        >
                          <option value={15}>Last 15 minutes</option>
                          <option value={30}>Last 30 minutes</option>
                          <option value={60}>Last 1 hour</option>
                          <option value={120}>Last 2 hours</option>
                          <option value={360}>Last 6 hours</option>
                          <option value={720}>Last 12 hours</option>
                          <option value={1440}>Last 24 hours</option>
                        </select>
                        <span className="elastic-setting-hint">How far back to search</span>
                      </div>
                    </div>
                    
                    <div className="elastic-setting-row">
                      <label className="elastic-setting-label">
                        📄 Document Limit
                      </label>
                      <div className="elastic-setting-control">
                        <input 
                          type="number"
                          min="10"
                          max="1000"
                          value={elasticSettings.documentLimit}
                          onChange={(e) => setElasticSettings(prev => ({ ...prev, documentLimit: parseInt(e.target.value) || 100 }))}
                          className="elastic-input"
                        />
                        <span className="elastic-setting-hint">Documents per log type</span>
                      </div>
                    </div>
                    
                    <div className="elastic-setting-row">
                      <label className="elastic-setting-label">
                        🐌 Slow Threshold
                      </label>
                      <div className="elastic-setting-control">
                        <input 
                          type="number"
                          min="0.1"
                          max="30"
                          step="0.1"
                          value={elasticSettings.slowRequestThreshold}
                          onChange={(e) => setElasticSettings(prev => ({ ...prev, slowRequestThreshold: parseFloat(e.target.value) || 1 }))}
                          className="elastic-input"
                        />
                        <span className="elastic-setting-hint">Seconds for slow requests</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="ai-prompt-settings-card">
              <button 
                className="ai-prompt-settings-header"
                onClick={() => setShowAIPromptSettings(!showAIPromptSettings)}
                aria-expanded={showAIPromptSettings}
                aria-controls="ai-prompt-settings-panel"
              >
                <div className="ai-prompt-settings-title">
                  <span className="ai-prompt-settings-icon">
                    🤖
                  </span>
                  <span>AI Prompt Configuration</span>
                  <span className="ai-prompt-settings-badge">
                    {aiPromptSettings.explanationPrompt.length + aiPromptSettings.analysisPrompt.length} chars
                  </span>
                </div>
                <span className={`ai-prompt-settings-chevron ${showAIPromptSettings ? 'expanded' : ''}`}>
                  ⌄
                </span>
              </button>
              
              {showAIPromptSettings && (
                <div className="ai-prompt-settings-panel" id="ai-prompt-settings-panel">
                  <div className="ai-prompt-settings-grid">
                    <div className="ai-prompt-setting-row">
                      <label className="ai-prompt-setting-label">
                        💡 Explanation Prompt
                      </label>
                      <div className="ai-prompt-setting-control">
                        <textarea 
                          value={aiPromptSettings.explanationPrompt}
                          onChange={(e) => setAIPromptSettings(prev => ({ ...prev, explanationPrompt: e.target.value }))}
                          className="ai-prompt-textarea"
                          rows={4}
                          placeholder="Enter the system prompt for PromQL explanations..."
                        />
                        <span className="ai-prompt-setting-hint">
                          Controls how AI explains Prometheus queries - used for alert expression explanations
                        </span>
              </div>
              </div>
                    
                    <div className="ai-prompt-setting-row">
                      <label className="ai-prompt-setting-label">
                        🔍 Analysis Prompt
                      </label>
                      <div className="ai-prompt-setting-control">
                        <textarea 
                          value={aiPromptSettings.analysisPrompt}
                          onChange={(e) => setAIPromptSettings(prev => ({ ...prev, analysisPrompt: e.target.value }))}
                          className="ai-prompt-textarea"
                          rows={4}
                          placeholder="Enter the system prompt for alert analysis..."
                        />
                        <span className="ai-prompt-setting-hint">
                          Controls how AI analyzes alerts with logs - used for comprehensive analysis and recommendations
                        </span>
                      </div>
                    </div>

                    <div className="ai-prompt-actions">
                      <button 
                        onClick={() => setAIPromptSettings({
                          explanationPrompt: "You are a Prometheus expert explaining PromQL to experienced software engineers. Be concise and technical. Focus on: what metric is being measured, the threshold/condition that triggers the alert, and the immediate system impact. Assume familiarity with observability concepts.",
                          analysisPrompt: "You are an SRE analyzing production issues for experienced engineers. Be concise and technical. Correlate alert data with logs to identify root causes and provide actionable next steps. Use markdown formatting: ## headers, **bold** for key points, `code` for technical details. Skip basic explanations - focus on analysis and solutions."
                        })}
                        className="ai-prompt-reset-btn"
                      >
                        🔄 Reset to Defaults
                      </button>
                      <div className="ai-prompt-info">
                        <span>📊 Explanation: {aiPromptSettings.explanationPrompt.length} chars</span>
                        <span>📈 Analysis: {aiPromptSettings.analysisPrompt.length} chars</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <SectionCard title="Result">
              {!result && !loading && <div className="muted">Run a query to see results.</div>}
              {loading && (
                <>
                  <div className="skeleton" style={{ height: 24, marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 160 }} />
                </>
              )}
              {result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <SectionCard title="Service Health">
              {!health && <div className="muted">Click "Check Health" to fetch status.</div>}
              {health && (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <StatPill label="GitHub" value={health.services?.github ? 'OK' : 'DOWN'} tone={health.services?.github ? 'success' : 'danger'} />
                  <StatPill label="OpenAI" value={health.services?.openai ? 'OK' : 'DOWN'} tone={health.services?.openai ? 'success' : 'danger'} />
                  <StatPill label="Elasticsearch" value={health.services?.elasticsearch ? 'OK' : 'DOWN'} tone={health.services?.elasticsearch ? 'success' : 'danger'} />
                  <StatPill label="Grafana" value={health.services?.grafana ? 'OK' : 'DOWN'} tone={health.services?.grafana ? 'success' : 'danger'} />
                </div>
              )}
            </SectionCard>

            <SectionCard title="Logs">
              {!result && !loading && <div className="muted">Run a query to load logs.</div>}
              {loading && <div className="skeleton" style={{ height: 300 }} />}
              {result && (
                <div>
                  <div className="tabs" role="tablist" aria-label="Log categories">
                    <button className="tab" role="tab" aria-selected={activeTab === 'recent'} aria-controls="recent-panel" id="recent-tab" onClick={() => setActiveTab('recent')}>General ({result.lastLogs?.length || 0})</button>
                    <button className="tab" role="tab" aria-selected={activeTab === 'error'} aria-controls="error-panel" id="error-tab" onClick={() => setActiveTab('error')}>Error ({result.lastErrorLogs?.length || 0})</button>
                    <button className="tab" role="tab" aria-selected={activeTab === 'time'} aria-controls="time-panel" id="time-tab" onClick={() => setActiveTab('time')}>Time Debugger ({result.lastTimeDebuggerLogs?.length || 0})</button>
                    <button className="tab" role="tab" aria-selected={activeTab === 'slow'} aria-controls="slow-panel" id="slow-tab" onClick={() => setActiveTab('slow')}>Slow ({result.lastSlowRequestLogs?.length || 0})</button>
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
