import React from 'react';

export const CodeBlock: React.FC<{ text: string; onCopy?: () => void }>
  = ({ text, onCopy }) => {
  return (
    <div>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="button" onClick={onCopy} aria-label="Copy formatted context">Copy</button>
      </div>
      <pre className="code" style={{ whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto' }}>{text}</pre>
    </div>
  );
};


