import React from 'react';
import { cn } from '../../lib/utils/cn';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

// Redesign UI/UX Fase 1 - state kosong yang konsisten (watchlist kosong, hasil
// screener nol, belum ada alert, dst.), pengganti pesan "Tidak ada data" polos
// yang sebelumnya ditulis beda-beda di tiap halaman.
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {icon && (
        <div className="w-12 h-12 rounded-full bg-tv-hover flex items-center justify-center text-tv-muted mb-4">
          {icon}
        </div>
      )}
      <p className="font-heading text-sm font-semibold text-tv-text">{title}</p>
      {description && <p className="text-xs text-tv-muted mt-1.5 max-w-xs">{description}</p>}
      {action && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
