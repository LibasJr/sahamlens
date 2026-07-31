import React from 'react';
import { cn } from '../../lib/utils/cn';

type BadgeVariant = 'neutral' | 'success' | 'danger' | 'warning' | 'gold' | 'info';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-tv-hover text-tv-muted',
  success: 'bg-tv-green/15 text-tv-green',
  danger: 'bg-tv-red/15 text-tv-red',
  warning: 'bg-tv-warning/15 text-tv-warning',
  gold: 'bg-tv-gold/15 text-tv-gold',
  info: 'bg-tv-blue/15 text-tv-blue',
};

const DOT_COLOR: Record<BadgeVariant, string> = {
  neutral: 'bg-tv-muted',
  success: 'bg-tv-green',
  danger: 'bg-tv-red',
  warning: 'bg-tv-warning',
  gold: 'bg-tv-gold',
  info: 'bg-tv-blue',
};

export function Badge({ variant = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      {dot && <span className={cn('w-1 h-1 rounded-full', DOT_COLOR[variant])} />}
      {children}
    </span>
  );
}

export default Badge;
