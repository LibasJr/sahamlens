'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ValidationCard } from './shared-ui';
import { useIntradayValidation } from './useIntradayValidation';
import { StatusAndActionsSection } from './StatusAndActionsSection';
import { DataQualitySection } from './DataQualitySection';
import { RecentSamplesSection } from './RecentSamplesSection';
import { AcceptanceGateSection, ResultsSection, ThresholdAndWeightSection } from './ResultsSection';
import { OosProtocolSection, RunHistorySection } from './HistorySections';

/**
 * Intraday Validation Lab (admin). Halaman ini hanya MENAMPILKAN apa yang
 * dikirim server - tidak ada nilai yang dihitung ulang di browser, supaya
 * tidak muncul dua versi angka.
 *
 * Dipecah 27 Agustus 2026 dari satu berkas 1549 baris (Task 7 dari brief
 * engineering improvement) menjadi: types.ts (kontrak data), shared-ui.tsx
 * (formatter + komponen kecil bersama), useIntradayValidation.ts (state dan
 * fetch), dan file section per blok kartu. PERILAKU TIDAK BERUBAH - murni
 * pemindahan kode, diverifikasi dengan typecheck + build + smoke test manual.
 */
export default function IntradayValidationClient() {
  const {
    dashboard,
    loading,
    error,
    busy,
    actionMessage,
    horizon,
    setHorizon,
    threshold,
    setThreshold,
    thresholdSim,
    weightProposal,
    lookbackDays,
    setLookbackDays,
    sampleSort,
    load,
    runAction,
    result,
    sortedRecentSamples,
    handleSampleSort,
  } = useIntradayValidation();

  if (loading && !dashboard) {
    return (
      <div className="flex items-center gap-2 text-sm text-tv-muted py-16">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat Intraday Validation Lab...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-tv-red/40 bg-tv-red/10 p-4 text-sm text-tv-red">
        {error}
        <Button variant="bare" size="none" onClick={() => void load()} className="ml-3 underline">
          Coba lagi
        </Button>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div>
      <div className="mb-6 rounded-lg border border-tv-accent/40 bg-tv-accent/10 p-3 text-xs text-tv-accent">
        {dashboard.disclaimer}
      </div>

      {/* 1. STATUS UTAMA + AKSI */}
      <StatusAndActionsSection
        dashboard={dashboard}
        result={result}
        busy={busy}
        actionMessage={actionMessage}
        lookbackDays={lookbackDays}
        setLookbackDays={setLookbackDays}
        onLoad={() => void load()}
        onRunAction={(action, payload) => void runAction(action, payload)}
      />

      {/* 2. DATA QUALITY */}
      <DataQualitySection dataQuality={dashboard.dataQuality} />

      <RecentSamplesSection
        totalSamples={dashboard.recentSamples.length}
        sortedRecentSamples={sortedRecentSamples}
        sampleSort={sampleSort}
        onSort={handleSampleSort}
      />

      {!result ? (
        <ValidationCard title="Hasil Validasi" subtitle="Belum ada validation run yang selesai.">
          <p className="text-sm text-tv-muted">
            Jalankan &quot;Kumpulkan data intraday&quot; lalu &quot;Jalankan validation run&quot;. Sampai itu terjadi, tidak ada
            angka performa yang ditampilkan - halaman ini tidak mengisi kekosongan dengan data contoh.
          </p>
        </ValidationCard>
      ) : (
        <>
          <ResultsSection result={result} horizon={horizon} setHorizon={setHorizon} />
          <ThresholdAndWeightSection
            threshold={threshold}
            setThreshold={setThreshold}
            thresholdSim={thresholdSim}
            weightProposal={weightProposal}
            busy={busy}
            horizon={horizon}
            onRunAction={(action, payload) => void runAction(action, payload)}
          />
          <AcceptanceGateSection result={result} />
        </>
      )}

      {/* PROTOKOL OOS */}
      <OosProtocolSection dashboard={dashboard} />

      {/* HISTORI RUN */}
      <RunHistorySection recentRuns={dashboard.recentRuns} />
    </div>
  );
}
