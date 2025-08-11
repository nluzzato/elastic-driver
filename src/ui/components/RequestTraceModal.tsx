import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from './Button';
import { Input } from './Input';
import { CodeBlock } from './CodeBlock';
import { contextualDebugPrompt } from '../../config/application';

interface RequestTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
}

interface RequestTraceData {
  requestId: string;
  documents: any[];
  documentCount: number;
  timeRange?: {
    start: string;
    end: string;
  };
  message?: string;
}

interface DebugPromptResponse {
  requestId: string;
  debugPrompt: string;
  documentCount: number;
}

export const RequestTraceModal: React.FC<RequestTraceModalProps> = ({
  isOpen,
  onClose,
  requestId
}) => {
  const [traceData, setTraceData] = useState<RequestTraceData | null>(null);
  const [debugPrompt, setDebugPrompt] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>(contextualDebugPrompt);
  const [loading, setLoading] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTraceData(null);
      setDebugPrompt('');
      setError(null);
      setLoading(false);
      setGeneratingPrompt(false);
    }
  }, [isOpen]);

  const fetchRequestTrace = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/request-trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch request trace');
      }
      
      setTraceData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch request trace');
    } finally {
      setLoading(false);
    }
  };

  const generateDebugPrompt = async () => {
    if (!traceData?.documents.length) return;
    
    setGeneratingPrompt(true);
    setError(null);
    
    try {
      const response = await fetch('/api/generate-debug-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          requestId,
          documents: traceData.documents,
          customPrompt: showCustomPrompt ? customPrompt : undefined
        })
      });
      
      const data: DebugPromptResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.debugPrompt || 'Failed to generate debug prompt');
      }
      
      setDebugPrompt(data.debugPrompt);
    } catch (err: any) {
      setError(err.message || 'Failed to generate debug prompt');
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content request-trace-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔍 Request Flow Analysis</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Initial State - Show request ID and fetch button */}
          {!traceData && !loading && !error && (
            <div className="initial-state">
              <div className="request-info-card">
                <div className="request-id-section">
                  <h3>📍 Request Trace Analysis</h3>
                  <div className="request-id-display">
                    <span className="request-id-label">Request ID:</span>
                    <code className="request-id-value">{requestId}</code>
                  </div>
                  <p className="request-description">
                    Analyze the complete flow of this request across all services and timeframes to understand 
                    what happened and generate debugging context for development.
                  </p>
                </div>
                
                <div className="fetch-section">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={fetchRequestTrace}
                    leftIcon="🔍"
                  >
                    Fetch Request Trace
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="loading-state">
              <div className="loading-spinner">
                <div className="spinner"></div>
              </div>
              <h3>🔍 Analyzing Request Flow</h3>
              <p>Searching for all logs related to request <code>{requestId}</code>...</p>
              <div className="loading-steps">
                <div className="loading-step">📡 Querying Elasticsearch</div>
                <div className="loading-step">⏱️ Sorting by timeline</div>
                <div className="loading-step">🔗 Building request flow</div>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="error-state">
              <div className="error-icon">⚠️</div>
              <h3>Request Trace Failed</h3>
              <p className="error-message">{error}</p>
              <Button
                variant="primary"
                size="md"
                onClick={fetchRequestTrace}
                leftIcon="🔄"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Results State */}
          {traceData && (
            <div className="results-state">
              {/* Header with summary */}
              <div className="trace-header">
                <div className="trace-title">
                  <h3>📊 Request Flow Analysis</h3>
                  <div className="trace-meta">
                    <span className="trace-stat">
                      <strong>{traceData.documentCount}</strong> events
                    </span>
                    {traceData.timeRange && (
                      <span className="trace-stat">
                        <strong>{Math.round((new Date(traceData.timeRange.end).getTime() - new Date(traceData.timeRange.start).getTime()) / 1000)}s</strong> duration
                      </span>
                    )}
                    <span className="trace-period">
                      {traceData.timeRange && `${formatTimestamp(traceData.timeRange.start)} → ${formatTimestamp(traceData.timeRange.end)}`}
                    </span>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTraceData(null);
                    setDebugPrompt('');
                    setError(null);
                  }}
                  leftIcon="🔄"
                >
                  New Search
                </Button>
              </div>

              {traceData.documents.length === 0 ? (
                <div className="no-results">
                  <div className="no-results-icon">🔍</div>
                  <h4>No Events Found</h4>
                  <p>No log entries were found for request ID <code>{requestId}</code></p>
                  {traceData.message && <p className="hint">{traceData.message}</p>}
                </div>
              ) : (
                <>
                  {/* Timeline of events */}
                  <div className="timeline-section">
                    <h4>🕐 Request Timeline</h4>
                    <div className="timeline-container">
                      {traceData.documents.map((doc, index) => (
                        <div key={index} className="timeline-event">
                          <div className="timeline-marker">
                            <div className="timeline-dot"></div>
                            {index < traceData.documents.length - 1 && <div className="timeline-line"></div>}
                          </div>
                          <div className="timeline-content">
                            <div className="event-header">
                              <span className="event-time">{formatTimestamp(doc['@timestamp'])}</span>
                              <span className={`event-level ${(doc.json?.levelname || 'INFO').toLowerCase()}`}>
                                {doc.json?.levelname || 'INFO'}
                              </span>
                              {doc.json?.extra?.request_time && (
                                <span className="event-timing">{doc.json.extra.request_time}s</span>
                              )}
                            </div>
                            <div className="event-message">{doc.json?.message || 'No message'}</div>
                            <div className="event-meta">
                              {doc.json?.service_name && <span className="event-service">{doc.json.service_name}</span>}
                              {doc.json?.module && <span className="event-module">{doc.json.module}</span>}
                              {doc.json?.hostname && <span className="event-pod">{doc.json.hostname}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Debug Prompt Generation */}
                  <div className="ai-section">
                    <div className="ai-header">
                      <h4>🤖 Generate Debug Prompt</h4>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                      >
                        {showCustomPrompt ? 'Hide' : 'Customize'} Prompt
                      </Button>
                    </div>

                    {showCustomPrompt && (
                      <div className="custom-prompt-card">
                        <label className="prompt-label">Custom Analysis Prompt:</label>
                        <textarea
                          className="prompt-textarea"
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          rows={4}
                          placeholder="Customize how the AI should analyze this request flow..."
                        />
                      </div>
                    )}

                    <div className="ai-actions">
                      <Button
                        variant="primary"
                        size="md"
                        onClick={generateDebugPrompt}
                        disabled={generatingPrompt}
                        isLoading={generatingPrompt}
                        leftIcon="⚡"
                      >
                        Generate Cursor Debug Prompt
                      </Button>
                    </div>

                    {debugPrompt && (
                      <div className="prompt-result">
                        <div className="prompt-result-header">
                          <h5>📋 Generated Debug Prompt</h5>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(debugPrompt)}
                            leftIcon="📋"
                          >
                            Copy to Clipboard
                          </Button>
                        </div>
                        <div className="prompt-content">
                          <ReactMarkdown>{debugPrompt}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
