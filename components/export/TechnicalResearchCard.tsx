'use client';

import React from 'react';
import { getAnalyzerDirectionLabel } from '@/shared/presentation/signal-labels';
import { Card3DTheme, getThemeById } from './card-3d-themes';

/**
 * Kartu ekspor Teknikal, bahasa visual "catatan riset".
 *
 * KENAPA TIDAK LAGI 3D NEON. Delapan tema di `card-3d-themes.ts` semuanya varian dari
 * satu bahasa visual: latar gelap, orb glow, gradient, shadow tebal. Mengganti tema di
 * Studio cuma menukar warna neonnya - strukturnya identik. Yang diminta adalah kartu yang
 * terbaca seperti catatan riset sekuritas: kertas, serif, garis rambut, dan warna yang
 * hanya dipakai untuk menyatakan ARAH (bullish/bearish), bukan untuk dekorasi.
 *
 * Tema sektor tidak dibuang - ia menyusut jadi satu warna aksen (lihat `ACCENT_BY_THEME`),
 * jadi pilihan sektor di Studio tetap berarti tanpa mengembalikan neonnya.
 *
 * TATA LETAK SATU KOLOM, DAN ITU DISENGAJA. Versi sebelumnya memakai grid 12 kolom dengan
 * dua panel bersebelahan; keduanya dipaksa setinggi yang lebih tinggi, jadi begitu panel
 * kanan bertambah isi, panel kiri menyisakan ruang kosong ~110px yang tidak bisa diisi apa
 * pun kecuali dengan menambah data hanya demi memenuhi kotak. Dokumen satu kolom tidak
 * punya mode gagal itu: tiap bagian setinggi isinya sendiri.
 */

export interface TechnicalAnalyzerItem {
  name?: string;
  label?: string;
  value?: string | number;
  decision?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | string;
  confidence?: number;
  description?: string;
}

export interface TechnicalPatternItem {
  id?: string;
  name?: string;
  sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | string;
  description?: string;
  reliability?: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  volumeConfirmed?: boolean;
}

export interface TechnicalResearchCardProps {
  symbol: string;
  stockName?: string;
  currentPrice?: number | null;
  changePct?: number | null;
  volume?: number | null;
  consensusLabel?: string;
  consensusTone?: 'positive' | 'negative' | 'neutral';
  score?: number | null;
  scoreBreakdown?: {
    technical?: number | null;
    flow?: number | null;
    fundamental?: number | null;
    momentum?: number | null;
    moneyFlow?: number | null;
    risk?: number | null;
  };
  summaryText?: string;
  buyPct?: number | null;
  sellPct?: number | null;
  neutralPct?: number | null;
  analyzers?: TechnicalAnalyzerItem[];
  patterns?: TechnicalPatternItem[];
  patternAsOf?: string | null;
  pivots?: { pp: number; s1: number; s2: number; s3?: number; r1: number; r2: number; r3?: number } | null;
  range52w?: { high52w: number; low52w: number; currentPrice: number; positionPct: number } | null;
  trends?: Array<{ timeframe: string; label: string; status: string; detail: string; benchmark: string }>;
  tradingPlan?: {
    currentPrice?: number;
    atr14?: number;
    entryZone?: [number, number];
    stopLoss?: number;
    targetPrice1?: number;
    targetPrice2?: number;
    rewardPct1?: number;
    rewardPct2?: number;
    riskPct?: number;
    riskRewardRatio?: string;
    bias?: string;
  } | null;
  flowDetails?: {
    cmf20?: number | null;
    netPressurePct?: number | null;
    bandarmologyStatus?: string | null;
    foreignFlowStatus?: string | null;
  };
  themeId?: string;
  theme?: Card3DTheme;
  exportedAt?: Date;
}

/* ── Palet kertas ─────────────────────────────────────────────────────────────── */

const PAPER = '#F4F2EC';
const SHEET = '#FFFFFF';
const RULE = '#DDD8CC';
const RULE_SOFT = '#EDEAE2';
const INK = '#15181E';
const INK_2 = '#535A66';
const INK_3 = '#8B919B';
const BULL = '#12673C';
const BEAR = '#A02531';
const FLAT = '#8A6A16';

/** Tema sektor menyusut jadi satu warna aksen yang punya kontras cukup di atas kertas. */
const ACCENT_BY_THEME: Record<string, string> = {
  'sapphire-bank': '#1B3A6B',
  'imperial-gold': '#7E6014',
  'emerald-infra': '#12673C',
  'solar-mining': '#9A4A20',
  'rose-fmcg': '#8B3A59',
  'ruby-health': '#A02531',
  'tokyo-neon': '#463683',
  'obsidian-cyber': '#1D4A54',
};

const SERIF = "Georgia, 'Iowan Old Style', 'Source Serif Pro', 'Times New Roman', serif";

function rp(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}

function pct(value?: number | null, withSign = false, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '–';
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return `${withSign && rounded > 0 ? '+' : ''}${rounded.toLocaleString('id-ID')}%`;
}

/** `getAnalyzerDirectionLabel` memetakan BUY/SELL/HOLD, tapi meloloskan 'NEUTRAL' apa
 *  adanya - satu-satunya kata Inggris yang tersisa di dokumen berbahasa Indonesia ini,
 *  padahal kosakata rumahnya sudah 'NETRAL' (lihat ANALYZER_DIRECTION_LABEL). */
function arah(direction?: string | null): string {
  const label = getAnalyzerDirectionLabel(direction || 'NEUTRAL');
  return label === 'NEUTRAL' ? 'NETRAL' : label;
}

function toneColor(direction?: string | null): string {
  const d = (direction || '').toUpperCase();
  if (d === 'BULLISH' || d === 'BUY') return BULL;
  if (d === 'BEARISH' || d === 'SELL') return BEAR;
  if (d === 'NA') return INK_3;
  return FLAT;
}

function getAnalyzerAnalyticalNote(a: TechnicalAnalyzerItem): string {
  if (a.description && a.description !== 'Deskripsi tidak tersedia' && !a.description.includes('tidak tersedia')) {
    return a.description;
  }
  const label = (a.label || a.name || '').toUpperCase();
  const decision = a.decision || 'NEUTRAL';
  const isBull = decision === 'BULLISH' || decision === 'BUY';
  const isBear = decision === 'BEARISH' || decision === 'SELL';

  if (label.includes('EMA')) {
    return isBull ? 'Golden cross momentum positif' : isBear ? 'Death cross momentum negatif' : 'Pita EMA menyempit dalam konsolidasi';
  }
  if (label.includes('RSI')) {
    return isBull ? 'RSI di area akumulasi positif' : isBear ? 'RSI jenuh beli / mulai melemah' : 'RSI di zona netral stabil';
  }
  if (label.includes('MACD')) {
    return isBull ? 'Histogram positif di atas sinyal' : isBear ? 'Histogram negatif di bawah sinyal' : 'Konvergen dekat garis nol';
  }
  if (label.includes('VOLUME')) {
    return isBull ? 'Volume mengonfirmasi breakout' : isBear ? 'Tekanan volume distribusi' : 'Volume normal sesuai rata-rata';
  }
  if (label.includes('TREND') || label.includes('MA')) {
    return isBull ? 'Struktur MA uptrend berurutan' : isBear ? 'Harga di bawah MA utama' : 'Konsolidasi di sekitar MA';
  }
  if (label.includes('VOLATILITY') || label.includes('ATR')) {
    return isBull ? 'Rentang volatilitas harian teratur' : isBear ? 'Rentang volatilitas melebar tinggi' : 'Volatilitas stabil terukur';
  }
  if (label.includes('MOMENTUM')) {
    return isBull ? 'Akselerasi harga menguat' : isBear ? 'Momentum mengalami deselerasi' : 'Momentum harga mendatar';
  }
  if (label.includes('SUPPORT') || label.includes('RESIST')) {
    return isBull ? 'Pullback bertahan di atas support' : isBear ? 'Harga menguji level resistance' : 'Harga di dalam rentang koridor';
  }
  if (label.includes('LENSFLOW') || label.includes('ASING')) {
    return isBull ? 'Arus modal asing akumulasi' : isBear ? 'Arus modal asing distribusi' : 'Arus modal asing berimbang';
  }
  if (label.includes('BANDARMOLOGY') || label.includes('CMF')) {
    return isBull ? 'CMF positif (inflow likuiditas)' : isBear ? 'CMF negatif (outflow likuiditas)' : 'CMF di level netral';
  }
  return isBull ? 'Indikator mengarah beli' : isBear ? 'Indikator mengarah waspada' : 'Indikator dalam batas normal';
}

/* ── Potongan tata letak ──────────────────────────────────────────────────────── */

function Rule({ strong = false }: { strong?: boolean }) {
  return <div style={{ height: 1, backgroundColor: strong ? RULE : RULE_SOFT }} />;
}

function SectionTitle({ children, accent, note }: { children: React.ReactNode; accent: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-3">
      <div className="flex items-baseline gap-2.5">
        <span style={{ width: 18, height: 2, backgroundColor: accent, display: 'inline-block' }} />
        <span
          className="font-bold uppercase"
          style={{ color: INK, fontSize: 12.5, letterSpacing: '0.14em' }}
        >
          {children}
        </span>
      </div>
      {note ? (
        <span style={{ color: INK_3, fontSize: 11.5, letterSpacing: '0.02em' }}>{note}</span>
      ) : null}
    </div>
  );
}

function Field({ label, value, valueColor, sub }: { label: string; value: string; valueColor?: string; sub?: string }) {
  return (
    <div style={{ borderLeft: `2px solid ${RULE}`, paddingLeft: 12 }}>
      <div style={{ color: INK_3, fontSize: 11, letterSpacing: '0.1em' }} className="uppercase font-semibold">
        {label}
      </div>
      <div className="font-number font-bold" style={{ color: valueColor || INK, fontSize: 21, marginTop: 3 }}>
        {value}
      </div>
      {sub ? <div style={{ color: INK_2, fontSize: 11.5, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

/* ── Kartu ────────────────────────────────────────────────────────────────────── */

export default function TechnicalResearchCard({
  symbol,
  stockName,
  currentPrice = null,
  changePct = null,
  volume = null,
  consensusLabel = 'DATA N/A',
  consensusTone = 'neutral',
  score = null,
  scoreBreakdown = {},
  summaryText,
  buyPct = null,
  sellPct = null,
  neutralPct = null,
  analyzers = [],
  patterns = [],
  patternAsOf = null,
  pivots = null,
  range52w = null,
  trends = [],
  tradingPlan = null,
  flowDetails,
  themeId,
  theme,
  exportedAt = new Date(),
}: TechnicalResearchCardProps) {
  const activeTheme = theme || getThemeById(themeId || 'sapphire-bank');
  const accent = ACCENT_BY_THEME[activeTheme.id] || '#1B3A6B';

  const upperSym = (symbol || '').toUpperCase();
  const isIndex = upperSym.includes('JKSE') || upperSym === 'IHSG';
  const displaySymbol = isIndex ? 'IHSG' : upperSym.replace('.JK', '');
  const timeLabel =
    exportedAt.toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';

  const up = changePct != null ? changePct >= 0 : null;
  const priceColor = up == null ? INK : up ? BULL : BEAR;

  // Semua analyzer dipakai, tidak dipotong di angka 8. Kartu lama membuang empat
  // analyzer terakhir tanpa menyebutkannya - pembaca tidak punya cara tahu ada yang hilang.
  const shownAnalyzers = analyzers.filter((a) => {
    const v = String(a.value ?? '').trim();
    return v !== '' && !v.startsWith('N/A');
  });

  const shownPatterns = patterns.filter((p) => p.name);

  const pos52w =
    range52w?.positionPct != null ? Math.max(0, Math.min(100, Math.round(range52w.positionPct))) : null;
  const hasRange = range52w?.high52w != null && range52w?.low52w != null && range52w.high52w > range52w.low52w;

  const tp1 = tradingPlan?.targetPrice1 ?? null;
  const stopLoss = tradingPlan?.stopLoss ?? null;
  const rewardPct1 = tradingPlan?.rewardPct1 ?? null;
  const riskPct = tradingPlan?.riskPct ?? null;
  const atr14 = tradingPlan?.atr14 ?? null;
  const atrPct = atr14 != null && currentPrice ? Math.round((atr14 / currentPrice) * 1000) / 10 : null;

  const consensusColor =
    consensusTone === 'positive' ? BULL : consensusTone === 'negative' ? BEAR : FLAT;

  const pivotRow: Array<{ label: string; value: number | null | undefined }> = [
    { label: 'Support 2', value: pivots?.s2 },
    { label: 'Support 1', value: pivots?.s1 },
    { label: 'Pivot Point', value: pivots?.pp },
    { label: 'Resist 1', value: pivots?.r1 },
    { label: 'Resist 2', value: pivots?.r2 },
  ];

  return (
    <div
      className="w-[1080px] font-sans"
      style={{ backgroundColor: PAPER, color: INK, padding: 26 }}
    >
      <div style={{ backgroundColor: SHEET, border: `1px solid ${RULE}`, padding: '34px 40px 30px' }}>
        {/* 1. KOP ─────────────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-3">
            <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em' }}>
              SahamLens
            </span>
            <span style={{ width: 1, height: 16, backgroundColor: RULE, display: 'inline-block' }} />
            <span style={{ color: INK_2, fontSize: 13.5, letterSpacing: '0.16em' }} className="uppercase font-semibold">
              Catatan Teknikal
            </span>
          </div>
          <div className="text-right">
            <div style={{ color: INK_2, fontSize: 12.5 }}>{timeLabel}</div>
            <div style={{ color: INK_3, fontSize: 11.5, letterSpacing: '0.08em' }} className="uppercase">
              Bursa Efek Indonesia
            </div>
          </div>
        </div>

        <div style={{ height: 3, backgroundColor: accent, marginTop: 14 }} />

        {/* 2. IDENTITAS EMITEN ────────────────────────────────────────────── */}
        <div className="flex items-end justify-between" style={{ paddingTop: 22, paddingBottom: 20 }}>
          <div>
            <div className="flex items-center gap-3">
              <h1 style={{ fontFamily: SERIF, fontSize: 54, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>
                {displaySymbol}
              </h1>
              <span
                style={{ border: `1px solid ${RULE}`, color: INK_2, fontSize: 11, letterSpacing: '0.1em', padding: '4px 9px' }}
                className="uppercase font-semibold"
              >
                {isIndex ? 'Indeks Komposit' : 'Saham Reguler IDX'}
              </span>
            </div>
            <div style={{ color: INK_2, fontSize: 15, marginTop: 8 }}>
              {stockName || displaySymbol}
            </div>
            <div style={{ color: INK_3, fontSize: 12.5, marginTop: 4 }}>
              Volume{' '}
              {volume != null
                ? `${(Math.round(volume / 100_000) / 10).toLocaleString('id-ID')} juta lembar`
                : 'tidak tersedia'}
            </div>
          </div>

          <div className="text-right">
            <div style={{ color: INK_3, fontSize: 11, letterSpacing: '0.1em' }} className="uppercase font-semibold">
              Harga Terkini
            </div>
            <div className="font-number" style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
              {rp(currentPrice)}
            </div>
            <div className="font-number font-bold" style={{ color: priceColor, fontSize: 15, marginTop: 4 }}>
              {up == null ? '–' : `${up ? '▲' : '▼'} ${pct(changePct, true, 2)}`}
            </div>
          </div>
        </div>

        <Rule strong />

        {/* 3. RINGKASAN ───────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 20, paddingBottom: 20 }}>
          <SectionTitle accent={accent} note="Skor kuantitatif, bukan rekomendasi transaksi">
            Ringkasan Penilaian
          </SectionTitle>

          <div className="grid grid-cols-3 gap-7">
            <div>
              <div style={{ color: INK_3, fontSize: 11, letterSpacing: '0.1em' }} className="uppercase font-semibold">
                LensScore
              </div>
              <div className="flex items-baseline gap-1.5" style={{ marginTop: 4 }}>
                <span className="font-number" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
                  {score ?? '–'}
                </span>
                <span style={{ color: INK_3, fontSize: 14 }}>/ 100</span>
              </div>

              <div style={{ marginTop: 12 }}>
                {[
                  { label: 'Teknikal', value: scoreBreakdown.technical, max: 40 },
                  { label: 'Arus dana', value: scoreBreakdown.flow, max: 30 },
                  { label: 'Fundamental', value: scoreBreakdown.fundamental, max: 30 },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
                    <span style={{ color: INK_2, fontSize: 12, width: 84 }}>{row.label}</span>
                    <span style={{ flex: 1, height: 4, backgroundColor: RULE_SOFT, display: 'block' }}>
                      <span
                        style={{
                          display: 'block',
                          height: 4,
                          width: `${row.value != null ? Math.max(0, Math.min(100, (row.value / row.max) * 100)) : 0}%`,
                          backgroundColor: accent,
                        }}
                      />
                    </span>
                    <span className="font-number" style={{ color: INK, fontSize: 12, width: 46, textAlign: 'right' }}>
                      {row.value != null ? `${row.value}/${row.max}` : '–'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ color: INK_3, fontSize: 11, letterSpacing: '0.1em' }} className="uppercase font-semibold">
                Konsensus Sinyal
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 700, color: consensusColor, marginTop: 6, lineHeight: 1.15 }}>
                {consensusLabel}
              </div>

              {buyPct != null && sellPct != null && neutralPct != null ? (
                <>
                  <div style={{ display: 'flex', height: 6, marginTop: 14 }}>
                    <span style={{ width: `${buyPct}%`, backgroundColor: BULL }} />
                    <span style={{ width: `${neutralPct}%`, backgroundColor: '#C9C3B4' }} />
                    <span style={{ width: `${sellPct}%`, backgroundColor: BEAR }} />
                  </div>
                  <div className="flex justify-between" style={{ marginTop: 7, fontSize: 11.5 }}>
                    <span style={{ color: BULL }}>Bullish {buyPct}%</span>
                    <span style={{ color: INK_2 }}>Netral {neutralPct}%</span>
                    <span style={{ color: BEAR }}>Bearish {sellPct}%</span>
                  </div>
                </>
              ) : (
                <div style={{ color: INK_3, fontSize: 12, marginTop: 12 }}>Distribusi sinyal belum tersedia.</div>
              )}
            </div>

            <div>
              <div style={{ color: INK_3, fontSize: 11, letterSpacing: '0.1em' }} className="uppercase font-semibold">
                Rentang 52 Minggu
              </div>
              {hasRange && pos52w != null ? (
                <>
                  <div className="flex items-baseline justify-between" style={{ marginTop: 6 }}>
                    <span className="font-number" style={{ fontSize: 15, fontWeight: 700 }}>{rp(range52w!.low52w)}</span>
                    <span className="font-number" style={{ fontSize: 15, fontWeight: 700 }}>{rp(range52w!.high52w)}</span>
                  </div>
                  <div style={{ position: 'relative', height: 6, backgroundColor: RULE_SOFT, marginTop: 10 }}>
                    <span style={{ display: 'block', height: 6, width: `${pos52w}%`, backgroundColor: accent }} />
                    <span
                      style={{
                        position: 'absolute',
                        top: -4,
                        left: `${pos52w}%`,
                        width: 2,
                        height: 14,
                        backgroundColor: INK,
                        transform: 'translateX(-1px)',
                      }}
                    />
                  </div>
                  <div style={{ color: INK_2, fontSize: 12, marginTop: 9 }}>
                    Harga berada di <b style={{ color: INK }}>{pos52w}%</b> rentang setahun
                    {pos52w >= 80 ? ' — dekat puncak' : pos52w <= 20 ? ' — dekat dasar' : ' — zona tengah'}.
                  </div>
                </>
              ) : (
                <div style={{ color: INK_3, fontSize: 12, marginTop: 8 }}>Rentang 52 minggu belum lengkap.</div>
              )}
            </div>
          </div>

          {summaryText ? (
            <div style={{ color: INK_2, fontSize: 13, lineHeight: 1.65, marginTop: 18, maxWidth: 900 }}>{summaryText}</div>
          ) : null}
        </div>

        <Rule strong />

        {/* 4. LEVEL & PROYEKSI ATR ────────────────────────────────────────── */}
        <div style={{ paddingTop: 20, paddingBottom: 20 }}>
          <SectionTitle accent={accent} note="Classic floor pivot · stop 1,25× ATR · target 1:2 R:R">
            Level Kunci &amp; Proyeksi ATR
          </SectionTitle>

          <div className="grid grid-cols-5" style={{ border: `1px solid ${RULE}` }}>
            {pivotRow.map((cell, idx) => {
              const isPivot = cell.label === 'Pivot Point';
              return (
                <div
                  key={cell.label}
                  style={{
                    padding: '11px 12px',
                    borderLeft: idx === 0 ? 'none' : `1px solid ${RULE}`,
                    backgroundColor: isPivot ? '#F7F5EF' : 'transparent',
                  }}
                >
                  <div
                    style={{ color: isPivot ? accent : INK_3, fontSize: 10.5, letterSpacing: '0.1em' }}
                    className="uppercase font-semibold"
                  >
                    {cell.label}
                  </div>
                  <div className="font-number" style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>
                    {rp(cell.value)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-4 gap-6" style={{ marginTop: 18 }}>
            <Field label="Target (TP1)" value={rp(tp1)} valueColor={BULL} sub={rewardPct1 != null ? `${pct(rewardPct1, true)} dari harga` : 'ATR belum tersedia'} />
            <Field label="Cut Loss (CL)" value={rp(stopLoss)} valueColor={BEAR} sub={riskPct != null ? `−${pct(riskPct)} dari harga` : 'ATR belum tersedia'} />
            <Field label="ATR 14" value={rp(atr14)} sub={atrPct != null ? `Volatilitas ${pct(atrPct)} per hari` : 'Butuh 14 sesi lengkap'} />
            <Field
              label="Arus Bandar"
              value={flowDetails?.bandarmologyStatus ? arah(flowDetails.bandarmologyStatus) : '–'}
              valueColor={toneColor(flowDetails?.bandarmologyStatus)}
              sub={flowDetails?.cmf20 != null ? `CMF 20: ${flowDetails.cmf20 > 0 ? '+' : ''}${flowDetails.cmf20}` : 'CMF belum tersedia'}
            />
          </div>
        </div>

        <Rule strong />

        {/* 5. TREN MULTI-TIMEFRAME ────────────────────────────────────────── */}
        <div style={{ paddingTop: 20, paddingBottom: 18 }}>
          <SectionTitle accent={accent} note="Dibaca dari EMA 20, MA 50/100, dan MA 200">
            Tren Multi-Timeframe
          </SectionTitle>

          {trends.length > 0 ? (
            <div>
              {trends.slice(0, 3).map((tr, idx) => (
                <div
                  key={idx}
                  className="grid items-baseline"
                  style={{
                    gridTemplateColumns: '236px 118px 1fr',
                    gap: 16,
                    padding: '11px 0',
                    borderTop: idx === 0 ? 'none' : `1px solid ${RULE_SOFT}`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tr.label}</div>
                    <div style={{ color: INK_3, fontSize: 11.5, marginTop: 2 }}>{tr.benchmark}</div>
                  </div>
                  <div
                    className="uppercase font-bold"
                    style={{ color: toneColor(tr.status), fontSize: 12.5, letterSpacing: '0.1em' }}
                  >
                    {tr.status === 'NA' ? 'Data N/A' : arah(tr.status)}
                  </div>
                  <div style={{ color: INK_2, fontSize: 13, lineHeight: 1.5 }}>{tr.detail}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: INK_3, fontSize: 12.5 }}>Deret timeframe belum tersedia.</div>
          )}
        </div>

        <Rule strong />

        {/* 6. POLA CANDLESTICK ────────────────────────────────────────────── */}
        <div style={{ paddingTop: 20, paddingBottom: 18 }}>
          <SectionTitle
            accent={accent}
            note={patternAsOf ? `Sesi lengkap terakhir ${patternAsOf.slice(0, 10)}` : 'Sesi lengkap terakhir'}
          >
            Pola Candlestick
          </SectionTitle>

          {shownPatterns.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-8">
              {shownPatterns.slice(0, 6).map((p, idx) => (
                <div
                  key={p.id || idx}
                  style={{ padding: '10px 0', borderTop: idx > 1 ? `1px solid ${RULE_SOFT}` : 'none' }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                    <span
                      className="uppercase font-bold"
                      style={{ color: toneColor(p.sentiment), fontSize: 11.5, letterSpacing: '0.1em' }}
                    >
                      {arah(p.sentiment)}
                    </span>
                  </div>
                  <div style={{ color: INK_2, fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>{p.description}</div>
                  <div style={{ color: INK_3, fontSize: 11.5, marginTop: 3 }}>
                    Grade {p.reliability || '–'} · {p.volumeConfirmed ? 'terkonfirmasi volume' : 'tanpa konfirmasi volume'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: INK_3, fontSize: 12.5 }}>
              Tidak ada pola candlestick terkonfirmasi pada sesi lengkap terakhir.
            </div>
          )}
        </div>

        <Rule strong />

        {/* 7. INDIKATOR ───────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 20, paddingBottom: 6 }}>
          <SectionTitle accent={accent} note={`${shownAnalyzers.length} indikator dihitung`}>
            Indikator Teknikal &amp; Arus Dana
          </SectionTitle>

          {shownAnalyzers.length > 0 ? (
            <div className="grid grid-cols-3 gap-x-8">
              {shownAnalyzers.map((a, idx) => (
                <div
                  key={idx}
                  style={{ padding: '11px 0', borderTop: idx > 2 ? `1px solid ${RULE_SOFT}` : 'none' }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{a.label || a.name}</span>
                    <span
                      className="uppercase font-bold"
                      style={{ color: toneColor(a.decision), fontSize: 10.5, letterSpacing: '0.09em', whiteSpace: 'nowrap' }}
                    >
                      {arah(a.decision)}
                    </span>
                  </div>
                  <div className="font-number" style={{ fontSize: 12.5, marginTop: 4, color: INK }}>
                    {a.value}
                  </div>
                  <div style={{ color: INK_3, fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>
                    {getAnalyzerAnalyticalNote(a)}
                    {a.confidence != null ? ` · keyakinan ${a.confidence}` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: INK_3, fontSize: 12.5 }}>Analyzer teknikal tidak tersedia pada instrumen ini.</div>
          )}
        </div>

        <div style={{ height: 3, backgroundColor: accent, marginTop: 22 }} />

        {/* 8. KAKI ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-8" style={{ paddingTop: 14 }}>
          <div style={{ color: INK_2, fontSize: 11.5, lineHeight: 1.6, maxWidth: 720 }}>
            Seluruh angka dihitung dari data harga dan volume Bursa Efek Indonesia oleh mesin kuantitatif
            SahamLens. TP dan CL adalah proyeksi volatilitas ATR 14, bukan target harga dan bukan anjuran
            beli atau jual.
          </div>
          <div className="text-right" style={{ whiteSpace: 'nowrap' }}>
            <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700 }}>sahamlens.id</div>
            <div style={{ color: INK_3, fontSize: 11, letterSpacing: '0.08em' }} className="uppercase">
              {activeTheme.sectorLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
