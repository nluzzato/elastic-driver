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

  // Fetch request trace data when modal opens
  useEffect(() => {
    if (isOpen && requestId) {
      fetchRequestTrace();
    } else if (!isOpen) {
      // Reset state when modal closes
      setTraceData(null);
      setDebugPrompt('');
      setError(null);
    }
  }, [isOpen, requestId]);

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
          <div className="request-info">
            <h3>Request ID: <code>{requestId}</code></h3>
            {traceData?.timeRange && (
              <p className="time-range">
                <span className="time-label">Time Range:</span>
                <span className="time-value">
                  {formatTimestamp(traceData.timeRange.start)} → {formatTimestamp(traceData.timeRange.end)}
                </span>
              </p>
            )}
          </div>

          {loading && (
            <div className="loading-section">
              <div className="skeleton enhanced-skeleton" />
              <p>Fetching request trace...</p>
            </div>
          )}

          {error && (
            <div className="error-section">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          {traceData && (
            <>
              <div className="trace-summary">
                <h4>📊 Trace Summary</h4>
                <div className="summary-stats">
                  <span className="stat">
                    <strong>{traceData.documentCount}</strong> documents
                  </span>
                  {traceData.timeRange && (
                    <span className="stat">
                      <strong>{Math.round((new Date(traceData.timeRange.end).getTime() - new Date(traceData.timeRange.start).getTime()) / 1000)}s</strong> duration
                    </span>
                  )}
                </div>
              </div>

              {traceData.documents.length === 0 ? (
                <div className="no-documents">
                  <p>No documents found for this request ID.</p>
                  {traceData.message && <p className="hint">{traceData.message}</p>}
                </div>
              ) : (
                <>
                  <div className="documents-section">
                    <h4>📋 Request Flow ({traceData.documents.length} documents)</h4>
                    <div className="documents-list">
                      {traceData.documents.map((doc, index) => (
                        <div key={index} className="document-item">
                          <div className="doc-header">
                            <span className="doc-index">{index + 1}</span>
                            <span className="doc-timestamp">{formatTimestamp(doc['@timestamp'])}</span>
                            <span className="doc-level">{doc.json?.levelname || 'INFO'}</span>
                          </div>
                          <div className="doc-content">
                            <div className="doc-message">{doc.json?.message || 'No message'}</div>
                            {doc.json?.service_name && <div className="doc-service">Service: {doc.json.service_name}</div>}
                            {doc.json?.module && <div className="doc-module">Module: {doc.json.module}</div>}
                            {doc.json?.extra?.request_time && <div className="doc-timing">Request Time: {doc.json.extra.request_time}s</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="debug-prompt-section">
                    <div className="section-header">
                      <h4>🤖 Generate Debugging Prompt for Cursor</h4>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                      >
                        {showCustomPrompt ? 'Hide' : 'Customize'} Prompt
                      </Button>
                    </div>

                    {showCustomPrompt && (
                      <div className="custom-prompt-section">
                        <label htmlFor="customPrompt" className="custom-prompt-label">
                          System Prompt for AI Analysis:
                        </label>
                        <textarea
                          id="customPrompt"
                          className="custom-prompt-input"
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          rows={6}
                          placeholder="Enter custom prompt for the AI analysis..."
                        />
                      </div>
                    )}

                    <div className="generate-section">
                      <Button
                        variant="primary"
                        size="md"
                        onClick={generateDebugPrompt}
                        disabled={generatingPrompt}
                        isLoading={generatingPrompt}
                        leftIcon="🔍"
                      >
                        Generate Contextual Prompt for Cursor
                      </Button>
                    </div>

                    {debugPrompt && (
                      <div className="debug-prompt-result">
                        <div className="result-header">
                          <h5>Generated Debug Prompt:</h5>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(debugPrompt)}
                            leftIcon="📋"
                          >
                            Copy to Clipboard
                          </Button>
                        </div>
                        <div className="debug-prompt-content">
                          <ReactMarkdown>{debugPrompt}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
