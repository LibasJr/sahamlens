import React from 'react';
import { cn } from '../../lib/utils/cn';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

// Redesign UI/UX Fase 1 - saudara Input.tsx, kontrak visual sama (label/error).
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const textareaId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-medium text-tv-muted mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full bg-tv-bg/60 border border-tv-border rounded-md text-sm text-tv-text placeholder:text-tv-muted',
            'px-3 py-2 transition-colors duration-150 resize-y min-h-[80px]',
            'focus:outline-none focus:border-tv-blue focus:ring-1 focus:ring-tv-blue/40',
            error && 'border-tv-red focus:border-tv-red focus:ring-tv-red/40',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-[11px] text-tv-red">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
