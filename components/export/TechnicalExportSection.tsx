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
      {/* BUG FIX (2026-08-05, percobaan #2): percobaan #1 (`width:0, height:0,
          overflow:hidden` LANGSUNG di elemen yang di-ref/di-capture) bikin html-to-image
          screenshot kotak 0x0 -> PNG 0 byte (dikonfirmasi user, sama kasus dengan
          app/fundamental/page.tsx). Sekarang wrapper penyembunyi (opacity:0, dst) dipisah
          dari elemen yang di-ref - elemen yang di-ref TIDAK dikasih style penyembunyi
          apa pun jadi ukuran aslinya (1080x1350) tetap utuh saat di-capture. opacity
          tidak diwariskan sebagai computed style ke child, jadi computed opacity elemen
          yang di-ref tetap 1 walau wrapper luarnya 0. */}
      <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        <div ref={exportRef}>
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
      </div>
    </>
  );
}
