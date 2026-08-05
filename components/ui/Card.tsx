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
        // scale-[1.01] + angkat 2px: cukup terasa sebagai respons sentuhan, masih
        // di bawah ambang yang bikin teks di dalam card ikut buram saat transisi.
        hoverable && 'hover:border-tv-borderLight hover:shadow-2 hover:-translate-y-0.5 hover:scale-[1.01] motion-reduce:hover:scale-100 motion-reduce:hover:translate-y-0',
        PADDING[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Alias niat: `variant="glass" hoverable` adalah kombinasi yang dipakai berulang
// untuk panel melayang (modal, overlay, panel ringkasan di atas chart). Diberi nama
// sendiri supaya niatnya kebaca di tempat pemakaian, bukan komponen baru.
export function GlassCard({ className, ...props }: Omit<CardProps, 'variant'>) {
  return <Card variant="glass" hoverable className={className} {...props} />;
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
