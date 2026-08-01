import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

// Redesign UI/UX Fase 1 - saudara Input.tsx, kontrak visual sama (label/error).
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, id, children, ...props }, ref) => {
    const selectId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-medium text-tv-muted mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full appearance-none bg-tv-bg/60 border border-tv-border rounded-md text-sm text-tv-text',
              'px-3 py-2 pr-9 transition-colors duration-150',
              'focus:outline-none focus:border-tv-blue focus:ring-1 focus:ring-tv-blue/40',
              error && 'border-tv-red focus:border-tv-red focus:ring-tv-red/40',
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tv-muted pointer-events-none" />
        </div>
        {error && <p className="mt-1 text-[11px] text-tv-red">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
