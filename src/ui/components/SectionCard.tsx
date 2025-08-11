import React from 'react';

export const SectionCard: React.FC<{ title: string; actions?: React.ReactNode; children: React.ReactNode; role?: string }>
  = ({ title, actions, children, role }) => {
  return (
    <section className="card" role={role} aria-labelledby={title.replace(/\s+/g, '-') + '-title'}>
      <div className="card-header">
        <h3 id={title.replace(/\s+/g, '-') + '-title'} className="card-title">{title}</h3>
        {actions}
      </div>
      <div className="card-body">
        {children}
      </div>
    </section>
  );
};


