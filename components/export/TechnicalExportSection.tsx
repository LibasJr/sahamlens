'use client';

import React, { useRef } from 'react';
import TechnicalExportCard from './TechnicalExportCard';
import ExportImageButton from './ExportImageButton';
import { buildExportFileName } from '@/shared/format/export-filename';

interface ExportAnalyzer {
  name: string;
  signal: string;
  value?: string | null;
  confidence?: number | null;
  dimension?: string | null;
}

interface ExportDimension {
  dimension: string;
  weight: number;
  direction: string;
  votedAnalyzers: number;
  analyzers: string[];
}

interface TechnicalExportSectionProps {
  symbol: string;
  finalSuggestion: string;
  /** Arah kategori (positive/negative/neutral) - dipakai kartu export untuk memilih
   * warna finalSuggestion. Tanpa ini kartu selalu mewarnai hijau walau sinyalnya negatif
   * (lihat catatan di TechnicalExportCard.tsx). */
  finalSuggestionTone?: 'positive' | 'negative' | 'neutral';
  summaryId?: string;
  buyPct: number;
  sellPct: number;
  holdPct: number;
  waitPct: number;
  agents: ExportAnalyzer[];
  score?: number | null;
  exportedAt?: Date;

  // Extended report fields
  coveragePct?: number | null;
  researchLabel?: string | null;
  scoreConfidence?: string | null;
  advisoryStatus?: { label: string; title: string } | null;
  freshnessLabel?: string | null;
  freshnessTone?: string | null;
  freshnessDetail?: string | null;
  dataTimestamp?: string | null;
  provider?: string | null;
  subScores?: { label: string; nilai: number | null }[];
  dimensions?: ExportDimension[];
  ringkasan?: string | null;
}

// Wrapper client - LensConsensusAnalysisDisplay (app/technical/[symbol]/page.tsx) adalah
// async server component yang fetch data council, tapi html-to-image (dipakai ExportImageButton)
// cuma bisa jalan di browser. Komponen ini menerima data council sebagai prop biasa (sudah
// serializable JSON) dari server lalu me-render tombol + kartu offscreen di client.
export default function TechnicalExportSection({
  symbol, finalSuggestion, finalSuggestionTone, summaryId, buyPct, sellPct, holdPct, waitPct, agents, score,
  exportedAt = new Date(),
  coveragePct, researchLabel, scoreConfidence, advisoryStatus,
  freshnessLabel, freshnessTone, freshnessDetail, dataTimestamp, provider,
  subScores, dimensions, ringkasan,
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
          screenshot kotak 0x0 -> PNG 0 byte. Sekarang wrapper penyembunyi dipisah
          dari elemen yang di-ref - elemen yang di-ref TIDAK dikasih style penyembunyi
          apa pun jadi ukuran aslinya tetap utuh saat di-capture. */}
      <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        <div ref={exportRef}>
          <TechnicalExportCard
            symbol={symbol}
            finalSuggestion={finalSuggestion}
            finalSuggestionTone={finalSuggestionTone}
            summaryId={summaryId}
            buyPct={buyPct}
            sellPct={sellPct}
            holdPct={holdPct}
            waitPct={waitPct}
            agents={agents.map((a) => ({
              label: a.name,
              value: a.value ?? null,
              decision: a.signal,
              confidence: a.confidence ?? null,
              dimension: a.dimension ?? null,
            }))}
            score={score}
            exportedAt={exportedAt}
            coveragePct={coveragePct}
            researchLabel={researchLabel}
            scoreConfidence={scoreConfidence}
            advisoryStatus={advisoryStatus}
            freshnessLabel={freshnessLabel}
            freshnessTone={freshnessTone}
            freshnessDetail={freshnessDetail}
            dataTimestamp={dataTimestamp}
            provider={provider}
            subScores={subScores}
            dimensions={dimensions}
            ringkasan={ringkasan}
          />
        </div>
      </div>
    </>
  );
}
