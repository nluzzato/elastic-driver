import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  hint,
  error,
  required = false,
  optional = false,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  
  const inputClasses = [
    'elastic-input',
    leftIcon && 'input-with-left-icon',
    rightIcon && 'input-with-right-icon',
    error && 'input-error',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className="elastic-setting-row">
      {label && (
        <label htmlFor={inputId} className="elastic-setting-label">
          <span>{label}</span>
          {required && <span className="input-label-badge required">Required</span>}
          {optional && <span className="input-label-badge">Optional</span>}
        </label>
      )}
      
      <div className="elastic-setting-control">
        <div className="input-wrapper">
          {leftIcon && <span className="input-icon input-icon-left">{leftIcon}</span>}
          <input
            id={inputId}
            className={inputClasses}
            style={{ width: '100%' }}
            {...props}
          />
          {rightIcon && <span className="input-icon input-icon-right">{rightIcon}</span>}
        </div>
        {hint && !error && <div className="elastic-setting-hint">{hint}</div>}
        {error && <div className="input-error-text">{error}</div>}
      </div>
    </div>
  );
};
