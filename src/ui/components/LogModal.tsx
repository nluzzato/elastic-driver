import React from 'react';

type Log = { timestamp: string; level?: string; message: string };

interface LogModalProps {
  log: Log | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LogModal: React.FC<LogModalProps> = ({ log, isOpen, onClose }) => {
  if (!isOpen || !log) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCopyLog = () => {
    if (log) {
      const logText = JSON.stringify(log, null, 2);
      navigator.clipboard.writeText(logText);
    }
  };

  const icon = log.level?.toLowerCase() === 'error' ? '🔴' : log.level?.toLowerCase() === 'warn' ? '🟡' : '🔵';
  const formattedTime = new Date(log.timestamp).toLocaleString();

  return (
    <div 
      className="modal-overlay" 
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-4)'
      }}
    >
      <div 
        className="modal-content"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          maxWidth: '90vw',
          maxHeight: '90vh',
          width: '800px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div 
          className="modal-header"
          style={{
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: '18px' }}>{icon}</span>
            <h3 style={{ margin: 0 }}>Log Details</h3>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="button" onClick={handleCopyLog} style={{ fontSize: '14px', padding: 'var(--space-2) var(--space-3)' }}>
              Copy JSON
            </button>
            <button 
              className="button" 
              onClick={onClose}
              style={{ 
                background: 'var(--muted)', 
                fontSize: '14px', 
                padding: 'var(--space-2) var(--space-3)' 
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div 
          className="modal-body"
          style={{
            padding: 'var(--space-4)',
            overflow: 'auto',
            flex: 1
          }}
        >
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {/* Timestamp */}
            <div>
              <h4 style={{ margin: '0 0 var(--space-2) 0', color: 'var(--muted)' }}>Timestamp</h4>
              <div className="code" style={{ padding: 'var(--space-2) var(--space-3)' }}>
                {formattedTime}
              </div>
            </div>

            {/* Level */}
            {log.level && (
              <div>
                <h4 style={{ margin: '0 0 var(--space-2) 0', color: 'var(--muted)' }}>Level</h4>
                <div className="code" style={{ padding: 'var(--space-2) var(--space-3)' }}>
                  {log.level}
                </div>
              </div>
            )}

            {/* Message */}
            <div>
              <h4 style={{ margin: '0 0 var(--space-2) 0', color: 'var(--muted)' }}>Message</h4>
              <div 
                className="code" 
                style={{ 
                  padding: 'var(--space-3)', 
                  whiteSpace: 'pre-wrap', 
                  wordBreak: 'break-word',
                  maxHeight: '300px',
                  overflow: 'auto'
                }}
              >
                {log.message}
              </div>
            </div>

            {/* Raw JSON */}
            <div>
              <h4 style={{ margin: '0 0 var(--space-2) 0', color: 'var(--muted)' }}>Raw JSON</h4>
              <div 
                className="code" 
                style={{ 
                  padding: 'var(--space-3)', 
                  whiteSpace: 'pre-wrap', 
                  fontSize: '12px',
                  maxHeight: '200px',
                  overflow: 'auto'
                }}
              >
                {JSON.stringify(log, null, 2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
