import React from 'react';
import { cn } from '../../lib/utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'flat';
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3.5',
  md: 'p-4 md:p-5',
  lg: 'p-5 md:p-6',
};

export function Card({ variant = 'default', hoverable = false, padding = 'md', className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border transition-all duration-250 ease-settle',
        variant === 'default' && 'border-white/[0.075] bg-tv-card shadow-1',
        variant === 'glass' && 'border-white/[0.09] bg-tv-card/78 shadow-glass backdrop-blur-xl',
        variant === 'flat' && 'border-transparent bg-transparent',
        hoverable && 'hover:-translate-y-0.5 hover:border-white/[0.13] hover:shadow-2 motion-reduce:hover:translate-y-0',
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {variant !== 'flat' && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />}
      {children}
    </div>
  );
}

export function GlassCard({ className, ...props }: Omit<CardProps, 'variant'>) {
  return <Card variant="glass" hoverable className={className} {...props} />;
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex items-center justify-between gap-3', className)} {...props}>{children}</div>;
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-heading text-sm font-semibold tracking-tight text-tv-text md:text-[15px]', className)} {...props}>{children}</h3>;
}

export function CardSubtitle({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-[11px] leading-relaxed text-tv-muted', className)} {...props}>{children}</p>;
}

export default Card;
