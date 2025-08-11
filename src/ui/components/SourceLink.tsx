import React from 'react';

export const SourceLink: React.FC<{ href?: string; label?: string }>
  = ({ href, label = 'Open source' }) => {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="muted" style={{ textDecoration: 'underline' }}>
      {label}
    </a>
  );
};


