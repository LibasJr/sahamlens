'use client';

import React from 'react';
import type { MoatProxyResult } from '@/modules/fundamental/service/moat-proxy.service';
import type { EarningsQuarter } from '@/modules/fundamental/service/public-earnings-data.service';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import { ABSENT, BULL, BEAR, FLAT, orAbsent, pct, rp, timestampLabel, toneColor } from './research-paper';

interface Trend { timeframe: string; label: string; status: string; detail: string; benchmark: string }
interface SnapshotProps {
  symbol: string;
  stockName?: string;
  currentPrice?: number | null;
  changePct?: number | null;
  volume?: number | null;
  dataTimestamp?: string | null;
  consensusLabel?: string;
  consensusTone?: 'positive' | 'negative' | 'neutral';
  score?: number | null;
  scoreBreakdown?: { technical?: number | null; flow?: number | null; fundamental?: number | null };
  range52w?: { high52w: number; low52w: number; currentPrice: number; positionPct: number } | null;
  trends?: Trend[];
  tradingPlan?: { entryZone?: [number, number]; stopLoss?: number; targetPrice1?: number; targetPrice2?: number; atr14?: number; riskRewardRatio?: string } | null;
  flowDetails?: { cmf20?: number | null; bandarmologyStatus?: string | null; foreignFlowStatus?: string | null };
  fundamentals?: { marketCap?: number | null; trailingPE?: number | null; forwardPE?: number | null; priceToBook?: number | null; returnOnEquity?: number | null; returnOnAssets?: number | null; debtToEquity?: number | null; currentRatio?: number | null; revenueGrowth?: number | null; earningsGrowth?: number | null; dividendYield?: number | null; profitMargins?: number | null };
  profile?: { sector?: string; industry?: string };
  moat?: MoatProxyResult | null;
  valuation?: { fairValue?: number | null; mos?: number | null; valuation?: string | null; method?: string | null } | null;
  latestEarningsQuarter?: EarningsQuarter | null;
  ownership?: { foreignPct?: number | null; localPct?: number | null; observedDate?: string | null; previous?: { actualGapDays?: number | null; foreignPp?: number | null } | null } | null;
  exportedAt?: Date;
}

const BG = '#08090A';
const PANEL = '#111214';
const PANEL_2 = '#17181B';
const BORDER = 'rgba(255,255,255,.09)';
const TEXT = '#F7F8F8';
const MUTED = '#8A8F98';
const SUBTLE = '#62666D';
const ACCENT = '#7170FF';

function dateLabel(value?: string | null): string {
  if (!value) return 'DATA TERBATAS';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'DATA TERBATAS';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date);
}

function Metric({ label, value, sub, color = TEXT }: { label: string; value: string; sub?: string; color?: string }) {
  return <div style={{ minWidth: 0 }}><div style={{ color: SUBTLE, fontSize: 10, fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase' }}>{label}</div><div className="font-number" style={{ color, fontSize: 20, fontWeight: 600, marginTop: 5 }}>{value}</div>{sub ? <div style={{ color: MUTED, fontSize: 11, lineHeight: 1.4, marginTop: 3 }}>{sub}</div> : null}</div>;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20 }}><div className="flex items-baseline justify-between" style={{ marginBottom: 16 }}><h2 style={{ color: TEXT, fontSize: 16, fontWeight: 590, letterSpacing: '-.02em' }}>{title}</h2>{note ? <span style={{ color: SUBTLE, fontSize: 10 }}>{note}</span> : null}</div>{children}</section>;
}

export default function InvestmentSnapshot360Card({ symbol, stockName, currentPrice = null, changePct = null, volume = null, dataTimestamp = null, consensusLabel = 'DATA TERBATAS', consensusTone = 'neutral', score = null, scoreBreakdown = {}, range52w = null, trends = [], tradingPlan = null, flowDetails, fundamentals = {}, profile = {}, moat = null, valuation = null, latestEarningsQuarter = null, ownership = null, exportedAt = new Date() }: SnapshotProps) {
  const ticker = symbol.replace('.JK', '').toUpperCase();
  const evidenceCount = [currentPrice, score, range52w, fundamentals.trailingPE, fundamentals.returnOnEquity, valuation?.fairValue, ownership?.observedDate].filter((v) => v != null).length;
  const evidenceQuality = evidenceCount >= 6 ? 'TINGGI' : evidenceCount >= 3 ? 'SEDANG' : 'DATA TERBATAS';
  const evidenceColor = evidenceQuality === 'TINGGI' ? BULL : evidenceQuality === 'SEDANG' ? FLAT : MUTED;
  const consensusColor = consensusTone === 'positive' ? BULL : consensusTone === 'negative' ? BEAR : FLAT;
  const isFinancial = `${profile.sector || ''} ${profile.industry || ''}`.toLowerCase().includes('finan') || `${profile.industry || ''}`.toLowerCase().includes('bank');
  const hasPlan = !!(tradingPlan?.entryZone && tradingPlan.stopLoss && tradingPlan.targetPrice1);
  const position = range52w?.positionPct != null ? Math.max(0, Math.min(100, Math.round(range52w.positionPct))) : null;
  const positiveTrends = trends.filter((t) => ['BULLISH', 'BUY', 'KUAT'].includes(t.status.toUpperCase())).length;
  const riskText = !hasPlan ? 'Level eksekusi belum lengkap' : positiveTrends === 0 ? 'Tren belum mengonfirmasi entry' : (valuation?.mos ?? 0) < 0 ? 'Harga di atas estimasi nilai wajar' : 'Risiko teknikal mengikuti batas invalidasi';

  return <div className="w-[1080px] font-sans" style={{ background: BG, color: TEXT, padding: 28, fontFeatureSettings: '"cv01", "ss03"' }}>
    <header className="flex items-start justify-between" style={{ padding: '6px 2px 20px' }}>
      <div><div style={{ color: ACCENT, fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase' }}>SahamLens · Investment Snapshot 360°</div><div className="flex items-baseline gap-3" style={{ marginTop: 8 }}><h1 style={{ fontSize: 48, fontWeight: 590, lineHeight: 1, letterSpacing: '-1.05px' }}>{ticker}</h1><span style={{ color: MUTED, fontSize: 14 }}>{stockName || 'Nama emiten belum tersedia'}</span></div><div style={{ color: SUBTLE, fontSize: 11, marginTop: 8 }}>{profile.sector || 'Sektor belum tersedia'}{profile.industry ? ` · ${profile.industry}` : ''}</div></div>
      <div className="text-right"><div className="font-number" style={{ fontSize: 36, fontWeight: 590 }}>{rp(currentPrice)}</div><div style={{ color: changePct == null ? MUTED : changePct >= 0 ? BULL : BEAR, fontSize: 14, fontWeight: 600, marginTop: 3 }}>{changePct == null ? ABSENT : pct(changePct, true, 2)}</div><div style={{ color: SUBTLE, fontSize: 10, marginTop: 9 }}>Data per {dateLabel(dataTimestamp)} · dibuat {timestampLabel(exportedAt)}</div></div>
    </header>

    <div className="grid grid-cols-4 gap-3" style={{ marginBottom: 12 }}>
      <div style={{ background: PANEL_2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}><Metric label="LensScore" value={score == null ? ABSENT : `${score}/100`} sub="Keselarasan faktor" color={ACCENT} /></div>
      <div style={{ background: PANEL_2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}><Metric label="Konsensus" value={consensusLabel} sub={`${scoreBreakdown.technical ?? ABSENT}/40 teknikal · ${scoreBreakdown.flow ?? ABSENT}/30 flow`} color={consensusColor} /></div>
      <div style={{ background: PANEL_2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}><Metric label="Valuasi" value={valuation?.valuation || 'DATA TERBATAS'} sub={valuation?.fairValue != null ? `${rp(valuation.fairValue)} · MoS ${pct(valuation.mos)}` : 'Nilai wajar belum tersedia'} color={toneColor(valuation?.valuation)} /></div>
      <div style={{ background: PANEL_2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}><Metric label="Evidence Quality" value={evidenceQuality} sub={`${evidenceCount}/7 kelompok bukti tersedia`} color={evidenceColor} /></div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <Section title="Struktur Teknikal" note="trend · momentum · volume · level">
        <div className="grid grid-cols-3 gap-4">{trends.slice(0, 3).map((t) => <Metric key={t.timeframe} label={t.label} value={t.status} sub={`${t.benchmark} · ${t.detail}`} color={toneColor(t.status)} />)}{trends.length === 0 ? <div style={{ color: MUTED, fontSize: 12 }}>DATA TERBATAS — tren multi-timeframe belum tersedia.</div> : null}</div>
        <div style={{ height: 1, background: BORDER, margin: '16px 0' }} />
        <div className="grid grid-cols-3 gap-4"><Metric label="Posisi 52 Minggu" value={position == null ? ABSENT : `${position}%`} sub={range52w ? `${rp(range52w.low52w)} — ${rp(range52w.high52w)}` : 'Rentang belum tersedia'} /><Metric label="ATR 14" value={rp(tradingPlan?.atr14)} sub="Volatilitas absolut" /><Metric label="Money Flow" value={flowDetails?.bandarmologyStatus || ABSENT} sub={flowDetails?.cmf20 != null ? `CMF20 ${flowDetails.cmf20 > 0 ? '+' : ''}${flowDetails.cmf20}` : 'CMF belum tersedia'} color={toneColor(flowDetails?.bandarmologyStatus)} /></div>
        {position != null ? <div style={{ height: 5, background: '#26282D', marginTop: 14, borderRadius: 5 }}><div style={{ width: `${position}%`, height: 5, background: ACCENT, borderRadius: 5 }} /></div> : null}
      </Section>

      <Section title="Fundamental & Valuasi" note={isFinancial ? 'metrik relevan sektor keuangan' : 'growth · quality · valuation'}>
        <div className="grid grid-cols-4 gap-4"><Metric label="Market Cap" value={orAbsent(fmtTriliun(fundamentals.marketCap))} /><Metric label="PER" value={orAbsent(fmtKali(fundamentals.trailingPE))} /><Metric label="PBV" value={orAbsent(fmtKali(fundamentals.priceToBook))} /><Metric label="Dividend Yield" value={orAbsent(fmtPersen(fundamentals.dividendYield))} /></div>
        <div style={{ height: 1, background: BORDER, margin: '16px 0' }} />
        <div className="grid grid-cols-4 gap-4"><Metric label="ROE" value={orAbsent(fmtPersen(fundamentals.returnOnEquity))} /><Metric label="Revenue YoY" value={orAbsent(fmtPersen(fundamentals.revenueGrowth))} /><Metric label="Earnings YoY" value={orAbsent(fmtPersen(fundamentals.earningsGrowth))} /><Metric label={isFinancial ? 'DER' : 'Net Margin'} value={isFinancial ? orAbsent(fundamentals.debtToEquity == null ? null : `${fundamentals.debtToEquity.toLocaleString('id-ID')}x`) : orAbsent(fmtPersen(fundamentals.profitMargins))} /></div>
        <div style={{ color: MUTED, fontSize: 11, marginTop: 14 }}>Moat proxy: <b style={{ color: toneColor(moat?.status) }}>{moat?.status || 'DATA TERBATAS'}</b>{moat ? ` · cakupan ${moat.coveragePct}% (${moat.supportive}/${moat.available} indikator mendukung)` : ''}</div>
      </Section>

      <Section title="Trade Structure" note="proyeksi berbasis ATR, bukan rekomendasi">
        <div className="grid grid-cols-5 gap-4"><Metric label="Entry Zone" value={tradingPlan?.entryZone ? `${rp(tradingPlan.entryZone[0])}–${rp(tradingPlan.entryZone[1])}` : ABSENT} /><Metric label="Invalidasi" value={rp(tradingPlan?.stopLoss)} color={BEAR} /><Metric label="Target 1" value={rp(tradingPlan?.targetPrice1)} color={BULL} /><Metric label="Target 2" value={rp(tradingPlan?.targetPrice2)} color={BULL} /><Metric label="Risk/Reward" value={tradingPlan?.riskRewardRatio || ABSENT} /></div>
        <div style={{ color: hasPlan ? BULL : MUTED, fontSize: 11, fontWeight: 600, marginTop: 16 }}>{hasPlan ? 'TRADEPLAN: TERSEDIA — revalidasi terhadap harga dan sesi terbaru' : 'TRADEPLAN: TIDAK ACTIONABLE'}</div>
      </Section>

      <Section title="Earnings & Ownership" note="pisahkan laporan emiten dan snapshot KSEI">
        <div className="grid grid-cols-4 gap-4"><Metric label="Periode" value={latestEarningsQuarter?.quarter || ABSENT} /><Metric label="EPS Aktual" value={latestEarningsQuarter?.actualEps?.toLocaleString('id-ID') || ABSENT} sub={latestEarningsQuarter?.surprisePct != null ? `Surprise ${pct(latestEarningsQuarter.surprisePct, true)}` : 'Estimasi belum tersedia'} color={toneColor(latestEarningsQuarter?.status)} /><Metric label="Asing KSEI" value={ownership?.foreignPct == null ? ABSENT : pct(ownership.foreignPct)} sub={ownership?.previous?.foreignPp != null ? `${ownership.previous.actualGapDays ?? 'Antar'} hari ${pct(ownership.previous.foreignPp, true)} pp` : 'Perubahan belum tersedia'} /><Metric label="Tanggal KSEI" value={dateLabel(ownership?.observedDate)} sub="Snapshot kepemilikan, bukan broker flow" /></div>
      </Section>
    </div>

    <section style={{ background: 'linear-gradient(90deg, rgba(113,112,255,.14), rgba(113,112,255,.04))', border: `1px solid rgba(113,112,255,.35)`, borderRadius: 12, padding: 20, marginTop: 12 }}><div className="flex items-center justify-between"><h2 style={{ fontSize: 16, fontWeight: 590 }}>Decision Strip</h2><span style={{ color: evidenceColor, fontSize: 11, fontWeight: 600 }}>EVIDENCE QUALITY: {evidenceQuality}</span></div><div className="grid grid-cols-4 gap-5" style={{ marginTop: 14 }}><Metric label="Timing" value={positiveTrends >= 2 ? 'TERKONFIRMASI' : positiveTrends === 1 ? 'CAMPURAN' : 'BELUM TERKONFIRMASI'} sub={`${positiveTrends}/${Math.max(3, trends.length)} timeframe positif`} color={positiveTrends >= 2 ? BULL : FLAT} /><Metric label="Katalis Terukur" value={latestEarningsQuarter?.status || 'DATA TERBATAS'} sub={latestEarningsQuarter?.quarter ? `Laporan ${latestEarningsQuarter.quarter}` : 'Belum ada earnings terbaru'} color={toneColor(latestEarningsQuarter?.status)} /><Metric label="Risiko Utama" value={riskText} sub="Periksa likuiditas, corporate action, dan governance sebelum eksekusi" color={BEAR} /><Metric label="Status" value={hasPlan && evidenceQuality !== 'DATA TERBATAS' ? 'PERLU REVIEW MANUSIA' : 'DATA TERBATAS'} sub="Bukan anjuran beli atau jual" color={ACCENT} /></div></section>

    <footer className="flex items-start justify-between" style={{ color: SUBTLE, fontSize: 10, lineHeight: 1.5, padding: '16px 2px 2px' }}><span style={{ maxWidth: 760 }}>LensScore adalah keselarasan faktor, bukan probabilitas profit. Level teknikal, fair value, moat proxy, dan status sinyal adalah keluaran model SahamLens; validasi sumber, freshness, corporate action, likuiditas, dan risiko tetap diperlukan.</span><span className="text-right">sahamlens.id<br />Bursa Efek Indonesia</span></footer>
  </div>;
}
