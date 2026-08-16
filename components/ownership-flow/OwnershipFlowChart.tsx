'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// CHART DERET WAKTU KEPEMILIKAN.
//
// DUA ATURAN YANG MENENTUKAN BENTUK KOMPONEN INI:
//
// 1. TIDAK ADA INTERPOLASI. Setiap titik adalah observasi nyata pada
//    observed_date-nya. Tidak ada forward-fill, tidak ada titik sintetis untuk
//    "merapikan" garis. Garis penghubung antar titik adalah alat bantu baca,
//    dan setiap observasi diberi dot supaya terlihat mana yang benar-benar
//    diukur (§22).
//
// 2. SUMBU X BERSKALA WAKTU NYATA, bukan kategori. Ini bukan detail kosmetik:
//    dengan sumbu kategori, observasi berjarak 1 hari dan berjarak 31 hari akan
//    tampil dengan lebar yang SAMA - grafik akan menyiratkan pengukuran harian
//    padahal sumbernya bisa saja bulanan. Skala waktu membuat celah data
//    terlihat sebagai celah.

export interface OwnershipSeriesPoint {
  observedDate: string;
  foreignPct: number | null;
  localPct: number | null;
}

interface Props {
  series: OwnershipSeriesPoint[];
  /** Tampilkan garis kepemilikan lokal. Default hanya asing. */
  showLocal?: boolean;
  height?: number;
}

/** Minimal dua observasi sebelum sebuah garis bermakna. Satu titik bukan tren. */
const MIN_POINTS = 2;

function toTimestamp(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatTick(ts: number): string {
  return new Date(ts).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function OwnershipFlowChart({ series, showLocal = false, height = 220 }: Props) {
  const data = useMemo(
    () =>
      series
        // Observasi tanpa angka asing TIDAK ikut diplot. Memberinya nilai 0
        // akan menggambar jurang yang tidak pernah terjadi.
        .filter((point) => point.foreignPct !== null)
        .map((point) => ({
          ts: toTimestamp(point.observedDate),
          observedDate: point.observedDate,
          foreignPct: point.foreignPct,
          localPct: point.localPct,
        }))
        .sort((a, b) => a.ts - b.ts),
    [series]
  );

  if (data.length < MIN_POINTS) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 text-center"
        style={{ height }}
      >
        <p className="text-[12.5px] font-semibold text-tv-text">Histori belum cukup untuk grafik</p>
        <p className="max-w-xs text-[11.5px] leading-relaxed text-tv-muted">
          Dibutuhkan minimal {MIN_POINTS} observasi. Tersimpan saat ini: {data.length}. Titik
          sintetis sengaja tidak dibuat untuk mengisi kekosongan.
        </p>
      </div>
    );
  }

  // Domain Y dirapatkan ke rentang data + margin kecil. Kepemilikan asing
  // bergerak dalam hitungan pp; memaksa sumbu 0-100 akan membuat setiap
  // pergerakan nyata tampak sebagai garis datar.
  const values = data.flatMap((d) => [d.foreignPct as number, ...(showLocal && d.localPct !== null ? [d.localPct] : [])]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.5, (max - min) * 0.15);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
          <XAxis
            dataKey="ts"
            // Skala waktu - lihat aturan 2 di kepala berkas.
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatTick}
            stroke="#1E293B"
            tick={{ fill: '#94A3B8', fontSize: 10 }}
            tickLine={false}
          />
          <YAxis
            domain={[Number((min - pad).toFixed(2)), Number((max + pad).toFixed(2))]}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            stroke="#1E293B"
            tick={{ fill: '#94A3B8', fontSize: 10 }}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<OwnershipTooltip showLocal={showLocal} />} />
          <Line
            type="linear"
            dataKey="foreignPct"
            name="Asing"
            stroke="#3B82F6"
            strokeWidth={2}
            // Dot SELALU tampil: pembaca harus bisa membedakan observasi nyata
            // dari garis penghubungnya.
            dot={{ r: 2.5, fill: '#3B82F6' }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          {showLocal && (
            <Line
              type="linear"
              dataKey="localPct"
              name="Lokal"
              stroke="#64748B"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={{ r: 2, fill: '#64748B' }}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function OwnershipTooltip({
  active,
  payload,
  showLocal,
}: {
  active?: boolean;
  payload?: Array<{ payload: { observedDate: string; foreignPct: number | null; localPct: number | null } }>;
  showLocal?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-lg border border-white/[0.1] bg-tv-card/95 px-2.5 py-2 shadow-lg backdrop-blur">
      {/* Tanggal OBSERVASI, bukan tanggal pengambilan - pembeda yang menjadi
          dasar seluruh modul ini. */}
      <p className="text-[10.5px] uppercase tracking-wide text-tv-muted">
        Observasi {new Date(`${point.observedDate}T00:00:00Z`).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })}
      </p>
      <p className="mt-0.5 text-[13px] font-bold tabular-nums text-tv-text">
        Asing {point.foreignPct === null ? '—' : `${point.foreignPct.toFixed(2)}%`}
      </p>
      {showLocal && (
        <p className="text-[12px] tabular-nums text-tv-muted">
          Lokal {point.localPct === null ? '—' : `${point.localPct.toFixed(2)}%`}
        </p>
      )}
    </div>
  );
}

export default OwnershipFlowChart;
