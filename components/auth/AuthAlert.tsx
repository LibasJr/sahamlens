import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

interface AuthAlertProps {
  variant: 'error' | 'success';
  children: React.ReactNode;
  className?: string;
}

// Redesign UI/UX Fase 1 - kotak error/success yang sebelumnya ditulis ulang (dengan
// warna berbeda-beda) di setiap halaman auth.
export function AuthAlert({ variant, children, className }: AuthAlertProps) {
  const Icon = variant === 'error' ? AlertTriangle : CheckCircle2;
  return (
    <div
      className={cn(
        'flex items-start gap-2 p-3 rounded-md text-[13px] mb-5',
        variant === 'error' && 'bg-tv-red/10 border border-tv-red/30 text-tv-red',
        variant === 'success' && 'bg-tv-green/10 border border-tv-green/30 text-tv-green',
        className
      )}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

export default AuthAlert;
