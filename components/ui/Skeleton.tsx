import React from 'react';
import { cn } from '../../lib/utils/cn';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'block' | 'circle';
}

const VARIANTS: Record<NonNullable<SkeletonProps['variant']>, string> = {
  text: 'h-3.5 rounded-md',
  block: 'rounded-lg',
  circle: 'rounded-full',
};

// Redesign UI/UX Fase 1 - shimmer bergerak (bukan cuma denyut animate-pulse polos),
// pengganti pola `<div className="animate-pulse bg-tv-hover ..." />` yang sebelumnya
// ditulis ulang ad-hoc di beberapa halaman (breakout-radar, dashboard, fundamental,
// market-pulse, technical/[symbol]).
export function Skeleton({ variant = 'block', className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-[linear-gradient(90deg,#1E2C4A_25%,#2C3A5A_50%,#1E2C4A_75%)] bg-[length:200%_100%] animate-shimmer',
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}

export default Skeleton;
