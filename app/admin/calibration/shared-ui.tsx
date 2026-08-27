'use client';

import React from 'react';
import { Card, Skeleton, LoadingFact } from '@/components/ui';
import type { CalibrationBucketChartRow, LensScoreWeights } from './types';

// Keempat pemformat di bawah dulu mengembalikan '-' polos. Di halaman kalibrasi
// statistik, tanda hubung tidak membedakan "sampelnya nol", "tidak bisa dihitung",
// dan "gagal dimuat" - padahal itu justru yang perlu dibedakan sebelum seorang
// admin mengambil keputusan atas angkanya.
export const EMPTY = 'belum ada';

export function pct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return `${value.toFixed(digits)}%`;
}

export function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return value.toLocaleString('id-ID');
}

/** Probabilitas 0..1 dirender sebagai persen. Dipisah dari pct() yang menerima persen. */
export function prob(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return `${(value * 100).toFixed(digits)}%`;
}

export function score4(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return value.toFixed(4);
}

export function pValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'belum bisa dihitung';
  if (value < 0.0001) return '<0.0001';
  return value.toFixed(4);
}

/** Sel angka yang meredup saat kosong, supaya baris tanpa data tidak terbaca
 *  sekuat baris yang benar-benar punya angka. */
export function Val({ value, tone, className = '' }: { value: number | null | undefined; tone?: 'signed'; className?: string }) {
  const empty = value == null || !Number.isFinite(value);
  const color = empty
    ? 'text-tv-muted/60 italic'
    : tone === 'signed'
      ? ((value as number) >= 0 ? 'text-tv-green' : 'text-tv-red')
      : 'text-tv-text';
  return <span className={`font-number ${color} ${className}`}>{pct(value)}</span>;
}

export function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Skeleton className="h-[420px] w-full xl:col-span-3" />
        <Skeleton className="h-[420px] w-full xl:col-span-2" />
      </div>
      <LoadingFact />
    </div>
  );
}

export function weightText(weights: LensScoreWeights | null | undefined): string {
  if (!weights) return 'belum ada usulan bobot';
  return `Teknikal ${weights.technical}% • Fundamental ${weights.fundamental}% • Flow ${weights.flow}%`;
}

// Label TAMPILAN untuk status proposal. Nilai enum-nya sendiri (PENDING_APPROVAL, dst)
// SENGAJA tidak diubah - itu tersimpan di baris database lama dan dipakai service, jadi
// mengganti namanya berarti migrasi data demi sekadar kata-kata.
//
// "PENDING_APPROVAL" apa adanya menyesatkan: pembaca mencari tombol Approve, padahal
// tidak pernah ada dan memang tidak dirancang ada. Menerapkan proposal = mengubah bobot
// di kode lalu deploy, supaya perubahan yang menggeser skor SELURUH saham untuk SEMUA
// pengguna tetap punya jejak git, bisa di-review, dan bisa di-rollback. Labelnya sekarang
// menyebutkan jalur itu, dan langkah persisnya ditulis di bawah kartu proposal.
export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Siap direview — diterapkan lewat deploy',
  INSUFFICIENT_STATS: 'Statistik belum cukup',
  INSUFFICIENT_COMPONENT_HISTORY: 'Histori komponen belum cukup',
  NO_VALID_CANDIDATE: 'Tidak ada kandidat yang lolos',
};

/**
 * Tooltip batang per bucket. Bawaan Recharts cuma menyebut nilainya; jumlah sampel
 * di balik angka itu justru yang menentukan apakah ia layak dipercaya.
 */
export function BucketTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: CalibrationBucketChartRow; value?: number | null }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CalibrationBucketChartRow | undefined;
  const v = payload[0]?.value as number | null | undefined;
  const tipis = (row?.totalSamples ?? 0) > 0 && (row?.totalSamples ?? 0) < 30;
  return (
    <Card as="div" padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border bg-tv-card/95 px-3 py-2.5 shadow-2 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wide text-tv-muted">Bucket {label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-tv-muted text-xs">Avg T+20</span>
        <Val value={v} tone="signed" className="text-sm font-semibold" />
      </div>
      <div className="mt-1 text-[11px] text-tv-muted">
        {num(row?.totalSamples)} sampel
        {tipis && <span className="text-tv-warning"> · terlalu sedikit untuk disimpulkan</span>}
      </div>
    </Card>
  );
}

// Posisi awal slider simulasi saja - murni tampilan, tidak mengubah ambang apa pun di
// produksi. Baseline pembanding sengaja TETAP 80: seluruh kolom "Δ vs 80" dan
// calculateThresholdSimulations() mengukur terhadap 80, jadi menggeser baseline berarti
// membandingkan angka terhadap dirinya sendiri.
//
// Riwayat: 90 -> 85 (2026-08-12), 85 -> 80 (2026-08-15). Keduanya permintaan pemilik
// produk, dan keduanya HANYA memindahkan posisi awal slider.
//
// Alasan 90 ditinggalkan tetap berlaku: makin tinggi ambangnya makin sedikit sinyal yang
// lolos, dan pada 90 sampelnya jatuh ke 66 - win rate di kartu paling kiri tidak lagi bisa
// dibaca sebagai apa pun.
//
// KONSEKUENSI YANG DISENGAJA dari memilih 80: 80 adalah baseline pembanding di
// calculateThresholdSimulations(), jadi saat halaman dibuka seluruh kolom "Δ vs 80"
// membaca 0,00%. Itu BUKAN bug dan bukan data kosong - geser slider ke angka lain dan
// kolomnya hidup lagi. Dicatat di sini supaya tidak ada yang "memperbaikinya" balik ke 85.
//
// Yang TIDAK berubah oleh baris ini: ambang produksi. Label STRONG BUY/BUY tetap diputuskan
// SCORING_KATEGORI_THRESHOLDS (STRONG_BUY 75, BUY 60) di
// modules/technical/service/decision-thresholds.ts, dan tidak ada tombol di panel admin
// mana pun yang bisa mengubahnya saat runtime.
//
// Konteks data saat perubahan ini dibuat (dibaca langsung dari produksi 2026-08-15):
// ambang 80 memberi 517 sinyal, win rate 36,17% (LEBIH RENDAH dari 38,77% di 75),
// avg T+20 +0,09% net tetapi median -2,81% - ditandai MEAN_POSITIVE_MEDIAN_NEGATIVE,
// artinya untungnya dari segelintir outlier. Bootstrap CI 95% -4,77%..+7,25% masih
// melewati nol. Tidak ada ambang di tabel ini yang tervalidasi; angka simulasi tetap
// untuk riset, bukan dasar mengubah produksi.
export const DEFAULT_SIMULATION_THRESHOLD = 80;
