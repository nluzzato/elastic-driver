import React from 'react';

export const StatPill: React.FC<{ label: string; value: string | number; tone?: 'success' | 'warning' | 'danger' | 'default' }>
  = ({ label, value, tone = 'default' }) => {
  const color = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : tone === 'danger' ? 'var(--danger)' : 'var(--muted)';
  return (
    <span className="pill" aria-label={`${label}: ${value}`} style={{ color }}>
      <span className="muted" style={{ color }}>{label}</span>
      <strong>{value}</strong>
    </span>
  );
};


