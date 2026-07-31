import React from 'react';
import { cn } from '../../lib/utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, className, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-tv-muted mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tv-muted pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full bg-tv-bg/60 border border-tv-border rounded-md text-sm text-tv-text placeholder:text-tv-muted',
              'px-3 py-2 transition-colors duration-150',
              'focus:outline-none focus:border-tv-blue focus:ring-1 focus:ring-tv-blue/40',
              leftIcon && 'pl-9',
              error && 'border-tv-red focus:border-tv-red focus:ring-tv-red/40',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="mt-1 text-[11px] text-tv-red">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
