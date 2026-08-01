import React from 'react';
import { cn } from '../../lib/utils/cn';

type InputSize = 'sm' | 'md' | 'lg';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: InputSize;
}

const SIZES: Record<InputSize, string> = {
  sm: 'text-xs py-1.5 px-2.5',
  md: 'text-sm py-2 px-3',
  lg: 'text-base py-2.5 px-3.5',
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, size = 'md', className, id, ...props }, ref) => {
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
              'w-full bg-tv-bg/60 border border-tv-border rounded-md text-tv-text placeholder:text-tv-muted',
              'transition-colors duration-150',
              'focus:outline-none focus:border-tv-blue focus:ring-1 focus:ring-tv-blue/40',
              SIZES[size],
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              error && 'border-tv-red focus:border-tv-red focus:ring-tv-red/40',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-tv-muted">
              {rightIcon}
            </span>
          )}
        </div>
        {error && <p className="mt-1 text-[11px] text-tv-red">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
