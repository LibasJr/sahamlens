'use client';

import { useEffect } from 'react';
import { Copy } from 'lucide-react';
import { Button } from './Button';
import { trackJourneyEvent } from '@/shared/analytics/product-journey';

export function ApiErrorHint({ requestId, className = '' }: { requestId?: string | null; className?: string }) {
  // "Laporan dukungan yang bisa didiagnosis cepat" (PRD, Beta evaluation) bergantung pada
  // referensi yang BENAR-BENAR sampai ke layar. Dicatat di sini - satu-satunya tempat
  // referensi itu dirender - supaya angkanya tidak bisa menyimpang dari kenyataan saat
  // permukaan galat baru ditambahkan.
  useEffect(() => {
    if (requestId) trackJourneyEvent('support_request_id_shown', 'other');
  }, [requestId]);

  if (!requestId) return null;
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 lens-meta text-tv-muted ${className}`.trim()}>
      <span>Dukungan: <code className="font-mono text-tv-text/80">{requestId}</code></span>
      <Button
        type="button"
        variant="bare"
        size="none"
        className="inline-flex min-h-0 items-center gap-1 rounded px-1.5 py-1 lens-meta text-tv-blue hover:bg-tv-blue/10"
        onClick={() => navigator.clipboard?.writeText(requestId)}
        aria-label="Salin ID request"
      >
        <Copy className="h-3 w-3" /> Salin ID
      </Button>
    </div>
  );
}
