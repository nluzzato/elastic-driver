import React, { useMemo, useRef, useState, useEffect } from 'react';

type Log = { timestamp: string; level?: string; message: string; requestId?: string };

// Simple virtualized list without external deps
export const LogTable: React.FC<{ 
  logs?: Log[]; 
  emptyText: string; 
  ariaLabel?: string;
  onLogClick?: (log: Log) => void;
  onRequestTrace?: (requestId: string) => void;
}>
  = ({ logs, emptyText, ariaLabel, onLogClick, onRequestTrace }) => {
  const rowHeight = 32;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const items = logs || [];
  const totalHeight = items.length * rowHeight;
  const viewportHeight = 300;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 5);
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + 5);
  const slice = useMemo(() => items.slice(startIndex, endIndex), [items, startIndex, endIndex]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  if (!logs || logs.length === 0) {
    return <div className="muted" role="status" aria-live="polite">{emptyText}</div>;
  }

  return (
    <div
      ref={containerRef}
      role="table"
      aria-label={ariaLabel}
      style={{ height: viewportHeight, overflow: 'auto', position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {slice.map((log, i) => {
          const index = startIndex + i;
          const top = index * rowHeight;
          const icon = log.level?.toLowerCase() === 'error' ? '🔴' : log.level?.toLowerCase() === 'warn' ? '🟡' : '🔵';
          const time = new Date(log.timestamp).toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          });
          return (
            <div 
              key={index} 
              role="row" 
              tabIndex={0}
              onClick={() => onLogClick?.(log)}
              onKeyDown={(e) => e.key === 'Enter' && onLogClick?.(log)}
              style={{ 
                position: 'absolute', 
                top, 
                left: 0, 
                right: 0, 
                height: rowHeight, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                padding: '0 8px',
                cursor: onLogClick ? 'pointer' : 'default',
                backgroundColor: 'transparent',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (onLogClick) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span style={{ flexShrink: 0 }}>{icon}</span>
              <span className="muted" style={{ flexShrink: 0, minWidth: 'fit-content' }}>[{time}]</span>
              <span style={{ 
                flex: 1, 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                minWidth: 0
              }}>{log.message}</span>
              {log.requestId && onRequestTrace && (
                <button
                  className="request-trace-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestTrace(log.requestId!);
                  }}
                  title={`Trace request: ${log.requestId}`}
                  style={{
                    flexShrink: 0,
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px 6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    opacity: 0.7,
                    transition: 'opacity 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                >
                  🔍
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};


