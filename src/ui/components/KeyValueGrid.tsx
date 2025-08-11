import React from 'react';

export const KeyValueGrid: React.FC<{ items: Array<[string, React.ReactNode]>; columns?: number }>
  = ({ items, columns = 2 }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '12px' }}>
      {items.map(([k, v]) => (
        <div key={k}>
          <div className="muted" style={{ fontSize: 12 }}>{k}</div>
          <div>{v}</div>
        </div>
      ))}
    </div>
  );
};


