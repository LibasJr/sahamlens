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
          <label htmlFor={textareaId} className="mb-1.5 block text-[11px] font-semibold text-tv-muted">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'min-h-[96px] w-full resize-y rounded-xl border border-white/[0.08] bg-black/15 px-3.5 py-3 text-sm text-tv-text placeholder:text-tv-muted/60 shadow-inner',
            'transition-all duration-150 focus:border-tv-blue/65 focus:outline-none focus:ring-2 focus:ring-tv-blue/10',
            error && 'border-tv-red/60 focus:border-tv-red focus:ring-tv-red/10',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-[10px] font-medium text-tv-red">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
