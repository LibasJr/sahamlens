import React from 'react';
import { cn } from '../../lib/utils/cn';

type CardElement = 'div' | 'section' | 'article' | 'form';

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: CardElement;
  variant?: 'default' | 'glass' | 'flat';
  surface?: 'solid' | '30' | '40' | '50' | '60' | '78' | '90' | '95';
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  elevation?: 'none' | 'sm' | 'md' | 'glass';
  overflow?: 'hidden' | 'visible';
  highlight?: boolean;
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-4 md:p-6',
  lg: 'p-6 md:p-8',
};

const RADIUS: Record<NonNullable<CardProps['radius']>, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
};


const SURFACE: Record<NonNullable<CardProps['surface']>, string> = {
  solid: 'bg-tv-card',
  '30': 'bg-tv-card/30',
  '40': 'bg-tv-card/40',
  '50': 'bg-tv-card/50',
  '60': 'bg-tv-card/60',
  '78': 'bg-tv-card/78',
  '90': 'bg-tv-card/90',
  '95': 'bg-tv-card/95',
};

const ELEVATION: Record<NonNullable<CardProps['elevation']>, string> = {
  none: '',
  sm: 'shadow-1',
  md: 'shadow-2',
  glass: 'shadow-glass',
};

export function Card({
  as: Component = 'div',
  variant = 'default',
  surface = 'solid',
  hoverable = false,
  padding = 'md',
  radius = '2xl',
  elevation,
  overflow = 'hidden',
  highlight = true,
  className,
  children,
  ...props
}: CardProps) {
  const resolvedElevation = elevation ?? (variant === 'glass' ? 'glass' : variant === 'flat' ? 'none' : 'sm');

  return (
    <Component
      className={cn(
        'relative border transition-all duration-250 ease-settle',
        overflow === 'hidden' ? 'overflow-hidden' : 'overflow-visible',
        RADIUS[radius],
        ELEVATION[resolvedElevation],
        variant === 'default' && 'border-white/[0.075]',
        variant === 'default' && SURFACE[surface],
        variant === 'glass' && 'border-white/[0.09] bg-tv-card/78 backdrop-blur-xl',
        variant === 'flat' && 'border-transparent bg-transparent',
        hoverable && 'hover:-translate-y-0.5 hover:border-white/[0.13] hover:shadow-2 motion-reduce:hover:translate-y-0',
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {highlight && variant !== 'flat' && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />}
      {children}
    </Component>
  );
}

export function GlassCard({ className, ...props }: Omit<CardProps, 'variant'>) {
  return <Card variant="glass" hoverable className={className} {...props} />;
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3', className)} {...props}>{children}</div>;
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('lens-card-title min-w-0 text-tv-text', className)} {...props}>{children}</h3>;
}

export function CardSubtitle({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('lens-body-sm mt-1 text-tv-muted', className)} {...props}>{children}</p>;
}

export default Card;
