'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Button } from './Button';
import { trackJourneyEvent } from '@/shared/analytics/product-journey';
import { copyText } from '@/shared/browser/copy-text';

export function ApiErrorHint({ requestId, className = '' }: { requestId?: string | null; className?: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  // "Laporan dukungan yang bisa didiagnosis cepat" (PRD, Beta evaluation) bergantung pada
  // referensi yang BENAR-BENAR sampai ke layar. Dicatat di sini - satu-satunya tempat
  // referensi itu dirender - supaya angkanya tidak bisa menyimpang dari kenyataan saat
  // permukaan galat baru ditambahkan.
  useEffect(() => {
    if (requestId) trackJourneyEvent('support_request_id_shown', 'other');
  }, [requestId]);

  if (!requestId) return null;

  const handleCopy = async () => {
    const copied = await copyText(requestId);
    setCopyState(copied ? 'copied' : 'error');
    window.setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 lens-meta text-tv-muted ${className}`.trim()}>
      <span>Dukungan: <code className="font-mono text-tv-text/80">{requestId}</code></span>
      <Button
        type="button"
        variant="bare"
        size="none"
        className={`inline-flex min-h-0 items-center gap-1 rounded px-1.5 py-1 lens-meta hover:bg-tv-blue/10 ${copyState === 'error' ? 'text-tv-red' : 'text-tv-blue'}`}
        onClick={handleCopy}
        aria-label="Salin ID request"
      >
        {copyState === 'copied' ? <Check className="h-3 w-3" /> : copyState === 'error' ? <X className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copyState === 'copied' ? 'Tersalin' : copyState === 'error' ? 'Gagal menyalin' : 'Salin ID'}
      </Button>
    </div>
  );
}
