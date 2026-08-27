'use client';

import { Brain, Lock, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui';
import {
  THRESHOLD_RECOMMENDER_ENABLED,
  MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION,
} from '@/modules/lens-radar/constants/research-status';
import { num, pct } from './shared-ui';
import type { ThresholdRecommendation, ThresholdSimulation } from './types';

/** Simulasi ambang rekomendasi: slider, kartu metrik, peringatan, tombol AI recommend. */
export function ThresholdSimulatorSection({
  threshold,
  setThreshold,
  selectedSimulation,
  baseline80,
  thinSample,
  hasEnoughT20,
  recommending,
  recommendation,
  onRequestRecommendation,
}: {
  threshold: number;
  setThreshold: (n: number) => void;
  selectedSimulation: ThresholdSimulation | null;
  baseline80: ThresholdSimulation | null;
  thinSample: boolean;
  hasEnoughT20: boolean;
  recommending: boolean;
  recommendation: ThresholdRecommendation | null;
  onRequestRecommendation: () => void;
}) {
  return (
    <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div className="flex-1">
          <h2 className="font-heading text-lg font-bold flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-tv-accent" />
            Simulasi Ambang Rekomendasi
          </h2>
          <p className="text-xs text-tv-muted mt-1">
            Geser ambang LensScore untuk melihat trade-off win rate T+20 vs jumlah sinyal.
            Baseline pembanding = ambang 80.
          </p>

          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-tv-muted">Ambang LensScore</span>
              <span className="font-number font-bold text-tv-text">{threshold}</span>
            </div>
            <input
              type="range"
              min={60}
              max={90}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-tv-accent"
            />
            <div className="flex justify-between text-[11px] text-tv-muted mt-1">
              <span>60</span>
              <span>75</span>
              <span>80</span>
              <span>85</span>
              <span>90</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:min-w-[660px]">
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Win Rate T+20</div>
            <div className={`font-number text-2xl font-bold mt-1 ${thinSample ? 'text-tv-yellow' : ''}`}>
              {pct(selectedSimulation?.winRateT20)}
            </div>
            <div className="text-[11px] text-tv-muted mt-1">
              Δ vs 80: {pct(selectedSimulation?.winRateDeltaPctVs80)}
            </div>
            {/* Peringatan dipasang PADA angkanya, bukan hanya di panel bawah: mata membaca
                win rate lebih dulu, dan kartu jumlah sinyal di sebelahnya tidak menyatakan
                bahwa angkanya terlalu kecil untuk dipercaya. */}
            {thinSample && (
              <div className="text-[11px] text-tv-yellow mt-0.5">
                n={num(selectedSimulation?.totalSignals)} - belum layak dibaca
              </div>
            )}
          </div>
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Jumlah Sinyal</div>
            <div className="font-number text-2xl font-bold mt-1">{num(selectedSimulation?.totalSignals)}</div>
            <div className="text-[11px] text-tv-muted mt-1">
              Δ vs 80: {pct(selectedSimulation?.signalDeltaPctVs80, 0)}
            </div>
          </div>
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Avg T+20</div>
            <div className="font-number text-2xl font-bold mt-1">{pct(selectedSimulation?.avgReturnT20)}</div>
            <div className="text-[11px] text-tv-muted mt-1">Net of cost</div>
          </div>
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Median T+20</div>
            <div className="font-number text-2xl font-bold mt-1">{pct(selectedSimulation?.medianReturnT20)}</div>
            <div className="text-[11px] text-tv-muted mt-1">lebih tahan outlier</div>
          </div>
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Profit Factor</div>
            <div className="font-number text-2xl font-bold mt-1">{selectedSimulation?.profitFactorT20?.toFixed(2) ?? '—'}</div>
            <div className="text-[11px] text-tv-muted mt-1">gross win / gross loss</div>
          </div>
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
            <div className="text-xs text-tv-muted uppercase">Baseline 80</div>
            <div className="font-number text-2xl font-bold mt-1">{pct(baseline80?.winRateT20)}</div>
            <div className="text-[11px] text-tv-muted mt-1">{num(baseline80?.totalSignals)} sinyal</div>
          </div>
        </div>
      </div>

      {thinSample && (
        <div className="mt-4 rounded-lg border border-tv-yellow/40 bg-tv-yellow/10 p-3 text-xs text-tv-yellow">
          <div className="font-semibold">Sampel terlalu tipis pada ambang {threshold}</div>
          <div className="mt-1 opacity-90">
            Hanya {num(selectedSimulation?.totalSignals)} sinyal lolos ambang ini, di bawah{' '}
            {MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION} minimum yang dipakai gerbang validasi lain.
            Win rate, profit factor, dan median di atas tetap dihitung apa adanya, tetapi pada
            ukuran ini satu-dua trade sudah cukup membaliknya - selisihnya terhadap baseline 80
            belum bisa dibedakan dari kebetulan. Turunkan ambang atau tunggu observasi T+20
            bertambah.
          </div>
        </div>
      )}

      {selectedSimulation?.distributionWarning === 'MEAN_POSITIVE_MEDIAN_NEGATIVE' && (
        <div className="mt-4 rounded-lg border border-tv-yellow/40 bg-tv-yellow/10 p-3 text-xs text-tv-yellow">
          <div className="font-semibold">Distribusi return sangat right-skewed</div>
          <div className="mt-1 opacity-90">Mean T+20 {pct(selectedSimulation.avgReturnT20)} tetapi median {pct(selectedSimulation.medianReturnT20)} (gap {pct(selectedSimulation.meanMedianGapT20)}). Edge rata-rata kemungkinan ditopang oleh sebagian winner besar; jangan membaca average sebagai hasil trade tipikal.</div>
        </div>
      )}

      {/* THRESHOLD_RECOMMENDER_ENABLED = false sejak audit kuantitatif: service-nya
          SELALU menolak dan mengembalikan pesan "dibekukan" (lihat
          calibration.service.ts baris 727). Sebelumnya tombol ini tetap tampil
          sebagai CTA utama berwarna aksen dan aktif setiap kali ada observasi T+20 -
          satu-satunya cara mengetahui fiturnya beku adalah menekannya dan membaca
          penolakan. Keadaan beku itu sekarang dinyatakan di muka. */}
      {!THRESHOLD_RECOMMENDER_ENABLED ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-tv-border bg-tv-bg p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-tv-muted" />
          <div>
            <p className="text-sm font-semibold text-tv-text">Rekomendasi ambang otomatis dibekukan</p>
            <p className="mt-1 text-xs leading-relaxed text-tv-muted">
              Dibekukan sampai tersedia validasi out-of-sample dan koreksi pengujian berganda.
              Mencari ambang terbaik dari data yang sama yang dipakai mengujinya akan menemukan
              pemenang bahkan pada data acak. Angka simulasi di atas tetap boleh dipakai untuk
              riset, bukan untuk mengubah ambang produksi.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <Button variant="bare" size="none"
            onClick={onRequestRecommendation}
            disabled={recommending || !hasEnoughT20}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-tv-accent px-4 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {recommending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {recommending ? 'AI sedang menilai...' : 'Rekomendasikan Ambang Baru'}
          </Button>
          <p className="text-xs text-tv-muted">
            AI hanya menyarankan ambang model, bukan rekomendasi beli/jual saham individual.
          </p>
        </div>
      )}

      {recommendation && (
        <div className="mt-4 rounded-xl border border-tv-accent/30 bg-tv-accent/10 p-4">
          <div className="text-xs text-tv-accent uppercase tracking-wide mb-1">
            {recommendation.aiGenerated ? 'LensAI Quant Recommendation' : 'Rule-based Recommendation'}
          </div>
          <p className="text-sm leading-relaxed text-tv-text">{recommendation.text}</p>
        </div>
      )}
    </Card>
  );
}
