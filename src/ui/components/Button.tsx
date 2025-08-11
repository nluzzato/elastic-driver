import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  // Use the consistent button styling from the existing design
  const baseClasses = 'uniform-button';
  const variantClasses = {
    primary: 'uniform-button-primary',
    secondary: 'uniform-button-secondary', 
    danger: 'uniform-button-danger',
    ghost: 'uniform-button-ghost'
  };
  const sizeClasses = {
    sm: 'uniform-button-sm',
    md: 'uniform-button-md',
    lg: 'uniform-button-lg'
  };

  const classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    isLoading && 'uniform-button-loading',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="uniform-button-content">
          <span className="uniform-button-spinner"></span>
          {children}
        </span>
      ) : (
        <span className="uniform-button-content">
          {leftIcon && <span className="uniform-button-icon">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="uniform-button-icon">{rightIcon}</span>}
        </span>
      )}
    </button>
  );
};
