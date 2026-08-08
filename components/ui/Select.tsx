import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; error?: string; }
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ label, error, className, id, children, ...props }, ref) => {
  const selectId = id || props.name;
  return (
    <div className="w-full">
      {label && <label htmlFor={selectId} className="mb-1.5 block text-[11px] font-semibold text-tv-muted">{label}</label>}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'h-10 w-full appearance-none rounded-xl border border-white/[0.08] bg-black/15 px-3.5 pr-9 text-sm text-tv-text shadow-inner',
            'transition-all duration-150 focus:border-tv-blue/65 focus:outline-none focus:ring-2 focus:ring-tv-blue/10',
            error && 'border-tv-red/60 focus:border-tv-red focus:ring-tv-red/10', className,
          )}
          {...props}
        >{children}</select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tv-muted" />
      </div>
      {error && <p className="mt-1 text-[10px] font-medium text-tv-red">{error}</p>}
    </div>
  );
});
Select.displayName = 'Select';
export default Select;
