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
const SIZES: Record<InputSize, string> = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-3.5 text-sm', lg: 'h-11 px-4 text-sm' };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, size = 'md', className, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="w-full">
        {label && <label htmlFor={inputId} className="mb-1.5 block text-[11px] font-semibold text-tv-muted">{label}</label>}
        <div className="relative">
          {leftIcon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tv-muted">{leftIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-xl border border-white/[0.08] bg-black/15 text-tv-text shadow-inner placeholder:text-tv-muted/60',
              'transition-all duration-150 focus:border-tv-blue/65 focus:bg-black/20 focus:outline-none focus:ring-2 focus:ring-tv-blue/10',
              SIZES[size], leftIcon && 'pl-9', rightIcon && 'pr-9',
              error && 'border-tv-red/60 focus:border-tv-red focus:ring-tv-red/10', className,
            )}
            {...props}
          />
          {rightIcon && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-tv-muted">{rightIcon}</span>}
        </div>
        {error && <p className="mt-1 text-[10px] font-medium text-tv-red">{error}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';
export default Input;
