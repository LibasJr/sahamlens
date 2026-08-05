'use client';

import React, { useRef } from 'react';
import TechnicalExportCard from './TechnicalExportCard';
import ExportImageButton from './ExportImageButton';
import { buildExportFileName } from '@/shared/format/export-filename';

interface Agent {
  name: string;
  signal: string;
}

interface TechnicalExportSectionProps {
  symbol: string;
  finalSuggestion: string;
  summaryId?: string;
  buyPct: number;
  sellPct: number;
  holdPct: number;
  waitPct: number;
  agents: Agent[];
  score?: number | null;
}

// Wrapper client - CouncilDisplay (app/technical/[symbol]/page.tsx) adalah async server
// component yang fetch data council, tapi html-to-image (dipakai ExportImageButton) cuma
// bisa jalan di browser. Komponen ini menerima data council sebagai prop biasa (sudah
// serializable JSON) dari server lalu me-render tombol + kartu offscreen di client.
export default function TechnicalExportSection({
  symbol, finalSuggestion, summaryId, buyPct, sellPct, holdPct, waitPct, agents, score,
}: TechnicalExportSectionProps) {
  const exportRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <ExportImageButton
        targetRef={exportRef}
        fileName={buildExportFileName('Technical', symbol)}
        label="Export Kartu Teknikal"
      />
      {/* BUG FIX (2026-08-05): SEBELUMNYA `position: absolute; left: -9999px` - elemen
          jauh di luar viewport tidak pernah ke-paint browser, jadi html-to-image
          menghasilkan PNG putih/blank. Sama seperti fix di app/fundamental/page.tsx -
          wrapper 0x0 + overflow hidden di (0,0) tetap ke-paint (ke-capture penuh) tapi
          tidak kelihatan/tidak mengubah layout untuk user. */}
      <div ref={exportRef} style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden' }}>
        <TechnicalExportCard
          symbol={symbol}
          finalSuggestion={finalSuggestion}
          summaryId={summaryId}
          buyPct={buyPct}
          sellPct={sellPct}
          holdPct={holdPct}
          waitPct={waitPct}
          agents={agents}
          score={score}
          exportedAt={new Date()}
        />
      </div>
    </>
  );
}
