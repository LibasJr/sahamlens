'use client';

import React from 'react';
import { Card3DTheme, getThemeById } from './card-3d-themes';
import {
  BEAR, BULL, FLAT, INK, INK_2, INK_3, PAPER, RULE, RULE_SOFT, SERIF, SHEET,
  Absent, Eyebrow, Field, Rule, SectionTitle, accentOf, pct, rp, timestampLabel, toneColor,
} from './research-paper';
import { PriceChartBlock, type PriceCandle, type PriceLevel } from './PriceChartBlock';

/**
 * Kartu "Grafik & Analisa" - halaman 9:16 ukuran asli (1080 x 1920).
 *
 * KENAPA HALAMAN TERSENDIRI. Kartu riset (Teknikal / Fundamental) itu dokumen padat:
 * lebar 1080 dengan tinggi mengikuti isi, lalu dipaskan ke area aman 9:16 dengan cara
 * DIPERKECIL. Untuk unggahan vertikal, mengecilkan halaman padat berarti teks ikut mengecil.
 * Halaman ini disusun pada ukuran aslinya: tinggi dipatok 1920 dan area aman TikTok
 * (150 px atas, 320 px bawah) dijadikan padding, jadi tidak ada bagian yang tertutup
 * antarmuka aplikasi dan tidak ada yang diperkecil.
 *
 * ISINYA TETAP DATA NYATA. Semua angka berasal dari payload yang sama dengan kartu lain
 * (candle harian bursa, pivot hasil perhitungan dari candle itu, ATR/R:R dari rencana
 * trading). Yang tidak tersedia ditulis apa adanya lewat <Absent>, bukan diisi angka
 * contoh.
 */

const LEBAR_HALAMAN = 1080;
const TINGGI_HALAMAN = 1920;
/** Area aman TikTok: 150 px atas (pencarian/status) dan 320 px bawah (keterangan unggahan). */
const AREA_AMAN_ATAS = 150;
const AREA_AMAN_BAWAH = 320;
/** Bingkai luar kertas, senada dengan `Sheet` pada kartu riset. */
const BINGKAI = 26;

export interface ChartAnalysisCardProps {
  symbol: string;
  stockName?: string | null;
  currentPrice?: number | null;
  changePct?: number | null;
  volume?: number | null;
  /** Candle harian asli (`stock.history`). Kosong = grafik menyebut kekurangan datanya. */
  priceHistory?: PriceCandle[] | null;
  pivots?: { pp: number; s1: number; s2: number; s3?: number; r1: number; r2: number; r3?: number } | null;
  range52w?: { high52w: number; low52w: number; currentPrice: number; positionPct: number } | null;
  trends?: Array<{ timeframe: string; label: string; status: string; detail: string; benchmark: string }>;
  patterns?: Array<{ id: string; name: string; sentiment: string; description: string; reliability: string; volumeConfirmed?: boolean }>;
  patternAsOf?: string | null;
  score?: number | null;
  consensusLabel?: string | null;
  consensusTone?: 'bull' | 'bear' | 'neutral' | null;
  tradingPlan?: {
    atr14?: number;
    entryZone?: [number, number];
    stopLoss?: number;
    targetPrice1?: number;
    riskPct?: number;
    rewardPct1?: number;
    riskRewardRatio?: string;
  } | null;
  themeId?: string;
  theme?: Card3DTheme;
  exportedAt?: Date;
}

/** Volume ditulis ringkas supaya tidak memanjang seperti "89.421.300 lembar". */
function volumeRingkas(volume?: number | null): string {
  if (typeof volume !== 'number' || !Number.isFinite(volume) || volume <= 0) return '';
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(1).replace('.', ',')} m lembar`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1).replace('.', ',')} jt lembar`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(0)} rb lembar`;
  return `${volume} lembar`;
}

const NAMA_TREN: Record<string, string> = {
  SHORT_TERM: 'Jangka pendek',
  MEDIUM_TERM: 'Jangka menengah',
  LONG_TERM: 'Jangka panjang',
};

export default function ChartAnalysisCard({
  symbol,
  stockName,
  currentPrice,
  changePct,
  volume,
  priceHistory,
  pivots,
  range52w,
  trends = [],
  patterns = [],
  patternAsOf,
  score,
  consensusLabel,
  consensusTone,
  tradingPlan,
  themeId,
  theme,
  exportedAt = new Date(),
}: ChartAnalysisCardProps) {
  const activeTheme = theme ?? getThemeById(themeId);
  const accent = accentOf(activeTheme);
  const naik = typeof changePct === 'number' ? changePct >= 0 : null;

  // Level yang ditandai di grafik hanya yang benar-benar ada di data.
  const levelGrafik: PriceLevel[] = [];
  if (pivots) {
    levelGrafik.push({ value: pivots.r1, label: 'R1', tone: 'bear' });
    levelGrafik.push({ value: pivots.s1, label: 'S1', tone: 'bull' });
  }
  if (tradingPlan?.targetPrice1) levelGrafik.push({ value: tradingPlan.targetPrice1, label: 'TP1', tone: 'accent' });
  if (tradingPlan?.stopLoss) levelGrafik.push({ value: tradingPlan.stopLoss, label: 'CL', tone: 'neutral' });

  return (
    <div
      className="w-[1080px] font-sans"
      style={{ height: TINGGI_HALAMAN, width: LEBAR_HALAMAN, backgroundColor: PAPER, color: INK, padding: BINGKAI }}
    >
      <div
        style={{
          height: TINGGI_HALAMAN - BINGKAI * 2,
          backgroundColor: SHEET,
          border: `1px solid ${RULE}`,
          paddingTop: AREA_AMAN_ATAS - BINGKAI,
          paddingBottom: AREA_AMAN_BAWAH - BINGKAI,
          paddingLeft: 40,
          paddingRight: 40,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Kop */}
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-3">
            <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>SahamLens</span>
            <span style={{ color: INK_3, fontSize: 13, letterSpacing: '0.16em' }} className="uppercase font-semibold">
              Grafik &amp; Analisa
            </span>
          </div>
          <span className="font-number" style={{ color: INK_3, fontSize: 13 }}>
            {timestampLabel(exportedAt)}
          </span>
        </div>

        <div style={{ height: 1, backgroundColor: RULE, marginTop: 16 }} />

        {/* Identitas dan harga */}
        <div className="flex items-end justify-between" style={{ marginTop: 22 }}>
          <div>
            <div className="font-number font-bold" style={{ fontSize: 64, lineHeight: 1, letterSpacing: '-0.02em' }}>{symbol}</div>
            <div style={{ fontFamily: SERIF, fontSize: 24, color: INK_2, marginTop: 8 }}>{stockName || 'Nama emiten tidak tersedia'}</div>
            <div style={{ color: INK_3, fontSize: 13, marginTop: 6 }} className="uppercase font-semibold">
              {activeTheme.sectorLabel || 'Sektor tidak tersedia'}
            </div>
          </div>
          <div className="text-right">
            <div className="font-number font-bold" style={{ fontSize: 60, lineHeight: 1 }}>{rp(currentPrice)}</div>
            <div
              className="font-number font-bold"
              style={{ fontSize: 24, marginTop: 8, color: naik === null ? INK_3 : naik ? BULL : BEAR }}
            >
              {typeof changePct === 'number' ? pct(changePct, true) : 'perubahan tidak tersedia'}
            </div>
            <div style={{ color: INK_3, fontSize: 13, marginTop: 6 }}>
              {volumeRingkas(volume) || 'volume tidak tersedia'}
            </div>
          </div>
        </div>

        <div style={{ height: 1, backgroundColor: RULE, marginTop: 22 }} />

        {/* Grafik */}
        <div style={{ marginTop: 20 }}>
          <SectionTitle accent={accent} note="Garis putus-putus = level di dalam rentang gambar">
            Grafik harga harian
          </SectionTitle>
          <PriceChartBlock
            history={priceHistory}
            accent={accent}
            levels={levelGrafik}
            tinggiHarga={560}
            tinggiVolume={110}
          />
        </div>

        <div style={{ height: 1, backgroundColor: RULE, marginTop: 22 }} />

        {/* Angka kunci */}
        <div style={{ marginTop: 20 }}>
          <SectionTitle accent={accent}>Angka kunci</SectionTitle>
          <div className="flex justify-between gap-6">
            <Field
              label="Skor lens"
              value={typeof score === 'number' ? `${Math.round(score)}/100` : 'tidak tersedia'}
              sub={consensusLabel || undefined}
              valueColor={consensusTone ? toneColor(consensusTone) : undefined}
            />
            <Field
              label="Posisi 52 mg"
              value={range52w ? `${Math.round(range52w.positionPct)}%` : 'tidak tersedia'}
              sub={range52w ? `${rp(range52w.low52w)} - ${rp(range52w.high52w)}` : undefined}
            />
            <Field
              label="ATR 14"
              value={tradingPlan?.atr14 != null ? rp(tradingPlan.atr14) : 'tidak tersedia'}
              sub="volatilitas harian"
            />
            <Field
              label="Target 1"
              value={tradingPlan?.targetPrice1 != null ? rp(tradingPlan.targetPrice1) : 'tidak tersedia'}
              valueColor={BULL}
              sub={tradingPlan?.rewardPct1 != null ? pct(tradingPlan.rewardPct1, true) : undefined}
            />
            <Field
              label="Batas rugi"
              value={tradingPlan?.stopLoss != null ? rp(tradingPlan.stopLoss) : 'tidak tersedia'}
              valueColor={BEAR}
              sub={tradingPlan?.riskPct != null ? pct(-Math.abs(tradingPlan.riskPct), true) : undefined}
            />
          </div>
        </div>

        <div style={{ height: 1, backgroundColor: RULE, marginTop: 22 }} />

        {/* Analisa */}
        <div style={{ marginTop: 20 }}>
          <SectionTitle accent={accent} note={patternAsOf ? `pola per ${patternAsOf}` : undefined}>
            Analisa
          </SectionTitle>

          {trends.length > 0 ? (
            <div className="flex flex-col" style={{ gap: 10 }}>
              {trends.map((tren) => (
                <div key={tren.timeframe} className="flex items-baseline justify-between gap-6">
                  <span style={{ color: INK_2, fontSize: 17, width: 190 }}>{NAMA_TREN[tren.timeframe] || tren.label}</span>
                  <span className="font-bold uppercase" style={{ color: toneColor(tren.status), fontSize: 17, width: 150 }}>
                    {tren.status}
                  </span>
                  <span style={{ color: INK_3, fontSize: 15, flex: 1, textAlign: 'right' }}>{tren.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <Absent>Tren multi-timeframe tidak tersedia: candle harian belum cukup untuk menghitungnya.</Absent>
          )}

          <div className="flex items-baseline gap-10" style={{ marginTop: 16 }}>
            <span style={{ color: INK_3, fontSize: 15 }} className="uppercase font-semibold">Pivot harian</span>
            {pivots ? (
              <span className="font-number" style={{ fontSize: 19 }}>
                S1 <b style={{ color: BULL }}>{rp(pivots.s1)}</b>
                <span style={{ color: INK_3 }}> · </span>
                PP <b>{rp(pivots.pp)}</b>
                <span style={{ color: INK_3 }}> · </span>
                R1 <b style={{ color: BEAR }}>{rp(pivots.r1)}</b>
              </span>
            ) : (
              <span style={{ color: INK_3, fontSize: 15 }}>pivot tidak tersedia (butuh candle harian)</span>
            )}
          </div>

          <div className="flex items-baseline gap-10" style={{ marginTop: 12 }}>
            <span style={{ color: INK_3, fontSize: 15 }} className="uppercase font-semibold">Pola candle</span>
            {patterns.length > 0 ? (
              <span style={{ fontSize: 17 }}>
                {patterns.map((pola) => `${pola.name} (${pola.sentiment?.toLowerCase?.() || 'netral'}${pola.volumeConfirmed ? ', volume terkonfirmasi' : ''})`).join(' · ')}
              </span>
            ) : (
              <span style={{ color: INK_3, fontSize: 15 }}>tidak ada pola terkonfirmasi pada data terakhir</span>
            )}
          </div>
        </div>

        {/* Kaki halaman - selalu menempel di dasar area aman */}
        <div style={{ marginTop: 'auto' }}>
          <div style={{ height: 1, backgroundColor: RULE_SOFT }} />
          <div className="flex items-baseline justify-between" style={{ marginTop: 12 }}>
            <Eyebrow>
              Sumber: candle harian bursa (EOD); pivot, ATR, dan tren dihitung dari candle tersebut
            </Eyebrow>
            <span style={{ color: FLAT, fontSize: 13 }} className="font-semibold">
              Bukan rekomendasi jual/beli
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}