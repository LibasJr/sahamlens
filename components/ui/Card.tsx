import React from 'react';
import { cn } from '../../lib/utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'flat';
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  variant = 'default',
  hoverable = false,
  padding = 'md',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-250 ease-settle',
        variant === 'default' && 'bg-tv-card border-tv-border shadow-1',
        variant === 'glass' && 'tv-glass shadow-glass',
        variant === 'flat' && 'bg-transparent border-transparent',
        hoverable && 'hover:border-tv-borderLight hover:shadow-2 hover:-translate-y-0.5',
        PADDING[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between mb-3', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-heading text-sm font-semibold text-tv-text', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardSubtitle({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-xs text-tv-muted mt-0.5', className)} {...props}>
      {children}
    </p>
  );
}

export default Card;
