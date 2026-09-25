/**
 * Grafik harga untuk kartu ekspor (Teknikal & Fundamental).
 *
 * Digambar sebagai SVG, bukan canvas: kartu ekspor diserialkan oleh `html-to-image`, dan
 * elemen SVG ikut terserialkan apa adanya, sedangkan isi `<canvas>` bergantung pada
 * pustaka grafik dan bisa keluar kosong pada hasil unduhan. SVG juga membuat grafik ini
 * bisa diuji tanpa peramban.
 *
 * Aturan data (sama dengan sisa kartu):
 * - Sekunder ini hanya menggambar candle yang benar-benar ada di payload. Kalau sesi tidak
 *   cukup, blok ini menampilkan "tidak tersedia" alih-alih menggambar grafik kosong.
 * - Tidak ada interpolasi, tidak ada angka contoh, tidak ada proyeksi: yang digambar adalah
 *   open/high/low/close/volume yang diterima apa adanya.
 */

import React from 'react';
import { Absent, BEAR, BULL, INK_3, RULE, RULE_SOFT, SHEET } from './research-paper';

export interface PriceCandle {
  time: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  adjClose?: number | null;
  volume?: number | null;
}

export interface PriceLevel {
  value: number;
  label: string;
  tone?: 'accent' | 'bull' | 'bear' | 'neutral';
}

export interface PriceChartBlockProps {
  history?: PriceCandle[] | null;
  accent: string;
  title?: string;
  /** Jumlah sesi terakhir yang digambar. */
  sessions?: number;
  /** Garis bantu: level pivot, batas 52 minggu, nilai wajar, dan sejenisnya. */
  levels?: PriceLevel[];
  /** Keterangan asal data pada baris bawah grafik. */
  sourceNote?: string;
  /** Tinggi area harga (satuan viewBox). Halaman 9:16 memakai nilai besar. */
  tinggiHarga?: number;
  /** Tinggi area volume (satuan viewBox). */
  tinggiVolume?: number;
}

const SESSION_MINIMUM = 5;
const VIEW_W = 1000;
const TINGGI_HARGA_BAWAAN = 168;
const GAP = 14;
const TINGGI_VOLUME_BAWAAN = 40;
const TINGGI_VIEWBOX_BAWAAN = TINGGI_HARGA_BAWAAN + GAP + TINGGI_VOLUME_BAWAAN;
const GUTTER = 78;
const PLOT_W = VIEW_W - GUTTER;

function angka(value: number): string {
  return value.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

/** Volume ditulis ringkas dalam juta/miliar lembar supaya tetap terbaca pada kartu cetak. */
export function volumeRingkas(volume: number): string {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(1).replace('.', ',')} m`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1).replace('.', ',')} jt`;
  if (volume >= 1_000) return `${Math.round(volume / 1_000)} rb`;
  return `${Math.round(volume)}`;
}

function sah(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

/** Menyaring dan mengurutkan candle; candle tanpa harga penutup sah dibuang, bukan ditebak. */
export function siapkanCandle(history: PriceCandle[] | null | undefined, sessions: number): Bar[] {
  return (history ?? [])
    .filter((candle) => candle && typeof candle.time === 'string' && sah(candle.close) && (candle.close as number) > 0)
    .map((candle) => {
      const close = candle.close as number;
      const high = sah(candle.high) && (candle.high as number) >= close ? (candle.high as number) : close;
      const low = sah(candle.low) && (candle.low as number) <= close ? (candle.low as number) : close;
      const open = sah(candle.open) && (candle.open as number) > 0 ? (candle.open as number) : close;
      return {
        time: candle.time.slice(0, 10),
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: sah(candle.volume) && (candle.volume as number) > 0 ? (candle.volume as number) : null,
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(-Math.max(SESSION_MINIMUM, sessions));
}

export function PriceChartBlock({
  history,
  accent,
  title,
  sessions = 90,
  tinggiHarga = TINGGI_HARGA_BAWAAN,
  tinggiVolume = TINGGI_VOLUME_BAWAAN,
  levels = [],
  sourceNote,
}: PriceChartBlockProps) {
  const bars = React.useMemo(() => siapkanCandle(history, sessions), [history, sessions]);

  if (bars.length < SESSION_MINIMUM) {
    return (
      <Absent>
        Grafik harga tidak tersedia: candle harian yang sah belum cukup (perlu minimal {SESSION_MINIMUM} sesi, tersedia {bars.length}).
      </Absent>
    );
  }

  // Sumbu harga dihitung HANYA dari candle yang digambar, lalu level di luar rentang itu
  // dibuang - bukan dipaksa ikut. Satu level jauh (mis. batas 52 minggu di luar jendela
  // gambar) akan menekan seluruh candle menjadi garis datar dan menyembunyikan pergerakan
  // yang justru sedang diperlihatkan.
  const tertinggi = Math.max(...bars.map((bar) => bar.high));
  const terendah = Math.min(...bars.map((bar) => bar.low));
  const nilaiLevel = levels.filter(
    (level) => sah(level.value) && level.value >= terendah && level.value <= tertinggi,
  );
  const rentang = tertinggi - terendah || 1;
  const TINGGI_VIEWBOX = tinggiHarga + GAP + tinggiVolume;
  const tinggiPlot = tinggiHarga - 8;
  const skalaY = (harga: number) => 4 + (1 - (harga - terendah) / rentang) * tinggiPlot;

  const langkah = PLOT_W / bars.length;
  const lebarBadan = Math.max(1.2, Math.min(9, langkah * 0.62));
  const volumeTertinggi = Math.max(...bars.map((bar) => bar.volume ?? 0));
  const dasarVolume = TINGGI_VIEWBOX;
  const awal = bars[0].time;
  const akhir = bars[bars.length - 1].time;
  const warnaLevel = (tone: PriceLevel['tone']) => (tone === 'bull' ? BULL : tone === 'bear' ? BEAR : tone === 'neutral' ? INK_3 : accent);

  return (
    <div>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
        {title ? (
          <span className="uppercase font-bold" style={{ color: INK_3, fontSize: 10.5, letterSpacing: '0.14em' }}>
            {title}
          </span>
        ) : (
          <span />
        )}
        <span className="font-number" style={{ color: INK_3, fontSize: 10.5 }}>
          {bars.length} sesi · {awal} → {akhir}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${TINGGI_VIEWBOX}`}
        width="100%"
        height={TINGGI_VIEWBOX}
        role="img"
        aria-label={`Grafik harga harian ${awal} sampai ${akhir}, ${bars.length} sesi`}
        style={{ display: 'block' }}
      >
        {/* Batas area harga */}
        <line x1={0} y1={skalaY(tertinggi)} x2={PLOT_W} y2={skalaY(tertinggi)} stroke={RULE_SOFT} strokeWidth={1} />
        <line x1={0} y1={skalaY(terendah)} x2={PLOT_W} y2={skalaY(terendah)} stroke={RULE_SOFT} strokeWidth={1} />

        {/* Garis bantu level */}
        {nilaiLevel.map((level) => {
          const y = skalaY(level.value);
          return (
            <g key={`${level.label}-${level.value}`}>
              <line
                x1={0}
                y1={y}
                x2={PLOT_W}
                y2={y}
                stroke={warnaLevel(level.tone)}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={PLOT_W - 8}
                y={Math.min(Math.max(y - 4, 11), tinggiHarga - 4)}
                textAnchor="end"
                fontSize={12}
                fill={warnaLevel(level.tone)}
                stroke={SHEET}
                strokeWidth={3}
                paintOrder="stroke"
                className="font-number"
              >
                {level.label} {angka(level.value)}
              </text>
            </g>
          );
        })}

        {/* Garis harga terakhir - pembaca bisa langsung melihat harga kini terhadap level */}
        {bars.length > 0 && (
          <g data-last-price={bars[bars.length - 1].close}>
            <line
              x1={0}
              y1={skalaY(bars[bars.length - 1].close)}
              x2={PLOT_W}
              y2={skalaY(bars[bars.length - 1].close)}
              stroke={accent}
              strokeWidth={1.6}
              strokeDasharray="1 3"
            />
            <circle
              cx={PLOT_W}
              cy={skalaY(bars[bars.length - 1].close)}
              r={3.2}
              fill={accent}
            />
          </g>
        )}

        {/* Label sumbu harga */}
        <text x={PLOT_W + 6} y={skalaY(tertinggi) + 3.5} fontSize={11} fill={INK_3} className="font-number">
          {angka(tertinggi)}
        </text>
        <text x={PLOT_W + 6} y={skalaY(terendah) + 3.5} fontSize={11} fill={INK_3} className="font-number">
          {angka(terendah)}
        </text>

        {/* Batang volume */}
        {bars.map((bar, index) => {
          if (bar.volume == null || volumeTertinggi <= 0) return null;
          const tinggi = Math.max(1, (bar.volume / volumeTertinggi) * tinggiVolume);
          return (
            <rect
              key={`v-${bar.time}`}
              data-volume={bar.time}
              x={index * langkah + (langkah - lebarBadan) / 2}
              y={dasarVolume - tinggi}
              width={lebarBadan}
              height={tinggi}
              fill={bar.close >= bar.open ? BULL : BEAR}
              opacity={0.45}
            />
          );
        })}

        {/* Candle */}
        {bars.map((bar, index) => {
          const tengah = index * langkah + langkah / 2;
          const naik = bar.close >= bar.open;
          const warna = naik ? BULL : BEAR;
          const yBadan = Math.min(skalaY(bar.open), skalaY(bar.close));
          const tinggiBadan = Math.max(1.4, Math.abs(skalaY(bar.close) - skalaY(bar.open)));
          return (
            <g key={`c-${bar.time}`} data-candle={bar.time}>
              <line x1={tengah} y1={skalaY(bar.high)} x2={tengah} y2={skalaY(bar.low)} stroke={warna} strokeWidth={1.4} />
              <rect
                x={tengah - lebarBadan / 2}
                y={yBadan}
                width={lebarBadan}
                height={tinggiBadan}
                fill={naik ? 'none' : warna}
                stroke={warna}
                strokeWidth={1.2}
              />
            </g>
          );
        })}

        {/* Garis pemisah area harga dan volume */}
        <line x1={0} y1={tinggiHarga + GAP / 2} x2={VIEW_W} y2={tinggiHarga + GAP / 2} stroke={RULE_SOFT} strokeWidth={1} />
      </svg>

      <div className="flex items-baseline justify-between" style={{ marginTop: 6, color: INK_3, fontSize: 10.5 }}>
        <span>{sourceNote ?? 'Candle harian dari data harga pasar (EOD). Bukan proyeksi.'}</span>
        <span className="font-number uppercase">
          {volumeTertinggi > 0 ? `Volume maks ${volumeRingkas(volumeTertinggi)} lembar` : 'Volume tidak tersedia'}
        </span>
      </div>
    </div>
  );
}