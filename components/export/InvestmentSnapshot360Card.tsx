'use client';

import React from 'react';
import type { MoatProxyResult } from '@/modules/fundamental/service/moat-proxy.service';
import type { EarningsQuarter } from '@/modules/fundamental/service/public-earnings-data.service';
import { fmtDer, fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import { ABSENT, BULL, BEAR, FLAT, orAbsent, pct, rp, timestampLabel, toneColor } from './research-paper';

/**
 * Lembar ekspor "Investment Snapshot 360°".
 *
 * SATU aturan yang menentukan seluruh berkas ini: setiap angka yang tercetak harus
 * datang dari payload SahamLens. Tidak ada nilai contoh, tidak ada default numerik,
 * tidak ada nol pengganti. Kartu ini diekspor sebagai GAMBAR - tidak ada tooltip,
 * tidak ada "selengkapnya", tidak ada cara pembaca memeriksa ulang. Karena itu satu
 * angka karangan di sini lebih buruk daripada satu kolom kosong.
 *
 * Konsekuensinya: SELURUH prop opsional, dan setiap slot yang datanya tidak ada
 * mencetak penanda "tidak tersedia" - bukan tebakan, bukan nol.
 */

interface Trend { timeframe: string; label: string; status: string; detail: string; benchmark: string }
interface PatternItem { name?: string; sentiment?: string; reliability?: string; volumeConfirmed?: boolean }

/**
 * Snapshot bank-specific. Angkanya sudah berupa PERSEN (NIM 5.2 = 5,2%), bukan fraksi -
 * jadi ia TIDAK boleh lewat `fmtPersen()` yang mengalikan 100.
 */
interface BankFundamentals {
  nimPct?: number | null;
  nplGrossPct?: number | null;
  casaPct?: number | null;
  ldrPct?: number | null;
  carPct?: number | null;
  costOfCreditPct?: number | null;
  periodEnd?: string | null;
  quality?: { status?: string; coveragePct?: number } | null;
}

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
  bullPct?: number | null;
  bearPct?: number | null;
  neutralPct?: number | null;
  range52w?: { high52w: number; low52w: number; currentPrice: number; positionPct: number } | null;
  pivots?: { pp: number; r1: number; r2: number; s1: number; s2: number } | null;
  trends?: Trend[];
  patterns?: PatternItem[];
  patternAsOf?: string | null;
  tradingPlan?: {
    entryZone?: [number, number];
    stopLoss?: number;
    targetPrice1?: number;
    targetPrice2?: number;
    atr14?: number;
    riskPct?: number;
    rewardPct1?: number;
    riskRewardRatio?: string;
    bias?: string;
  } | null;
  flowDetails?: {
    cmf20?: number | null;
    netPressurePct?: number | null;
    bandarmologyStatus?: string | null;
    foreignFlowStatus?: string | null;
  };
  fundamentals?: {
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
    priceToBook?: number | null;
    returnOnEquity?: number | null;
    returnOnAssets?: number | null;
    debtToEquity?: number | null;
    currentRatio?: number | null;
    revenueGrowth?: number | null;
    earningsGrowth?: number | null;
    dividendYield?: number | null;
    profitMargins?: number | null;
    operatingMargins?: number | null;
    totalRevenue?: number | null;
    freeCashflow?: number | null;
    operatingCashflow?: number | null;
    totalDebt?: number | null;
    totalCash?: number | null;
  };
  bankFundamentals?: BankFundamentals | null;
  profile?: { sector?: string; industry?: string };
  moat?: MoatProxyResult | null;
  durability?: { status?: string | null; conclusion?: string | null } | null;
  valuation?: { fairValue?: number | null; mos?: number | null; valuation?: string | null; method?: string | null } | null;
  latestEarningsQuarter?: EarningsQuarter | null;
  upcomingEarnings?: { date?: string | null; isEstimate?: boolean; fiscalQuarter?: string | null } | null;
  ownership?: {
    foreignPct?: number | null;
    localPct?: number | null;
    scriplessPct?: number | null;
    observedDate?: string | null;
    trend?: string | null;
    previous?: { actualGapDays?: number | null; foreignPp?: number | null } | null;
  } | null;
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
const NEUTRAL_BAR = '#3A3D44';

/**
 * Nol yang DIUKUR dibedakan dari nol yang berarti "tidak dilaporkan". Yahoo mengirim
 * `grossMargins: 0` dan `debtToEquity: 0` untuk bank; keduanya bukan pengukuran.
 * Pertumbuhan dan dividend yield sengaja TIDAK dijaga - emiten tanpa dividen memang 0%.
 */
function terukur(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null;
}

function dateLabel(value?: string | null): string {
  if (!value) return 'DATA TERBATAS';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'DATA TERBATAS';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date);
}

/** Persen yang SUDAH berupa persen (KSEI, NIM, bull/bear) - bukan fraksi. */
function pp(value?: number | null, digits = 1): string {
  return pct(value, false, digits);
}

function Metric({ label, value, sub, color = TEXT, size = 20 }: { label: string; value: string; sub?: string; color?: string; size?: number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: SUBTLE, fontSize: 9.5, fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase' }}>{label}</div>
      <div className="font-number" style={{ color, fontSize: size, fontWeight: 600, marginTop: 4, lineHeight: 1.15 }}>{value}</div>
      {sub ? <div style={{ color: MUTED, fontSize: 10.5, lineHeight: 1.35, marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 14 }}>
        <h2 style={{ color: TEXT, fontSize: 15, fontWeight: 590, letterSpacing: '-.02em' }}>{title}</h2>
        {note ? <span style={{ color: SUBTLE, fontSize: 9.5, letterSpacing: '.04em' }}>{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Divider() {
  return <div style={{ height: 1, background: BORDER, margin: '14px 0' }} />;
}

export default function InvestmentSnapshot360Card({
  symbol,
  stockName,
  currentPrice = null,
  changePct = null,
  volume = null,
  dataTimestamp = null,
  consensusLabel = 'DATA TERBATAS',
  consensusTone = 'neutral',
  score = null,
  scoreBreakdown = {},
  bullPct = null,
  bearPct = null,
  neutralPct = null,
  range52w = null,
  pivots = null,
  trends = [],
  patterns = [],
  patternAsOf = null,
  tradingPlan = null,
  flowDetails,
  fundamentals = {},
  bankFundamentals = null,
  profile = {},
  moat = null,
  durability = null,
  valuation = null,
  latestEarningsQuarter = null,
  upcomingEarnings = null,
  ownership = null,
  exportedAt = new Date(),
}: SnapshotProps) {
  const ticker = symbol.replace('.JK', '').toUpperCase();

  const isBank = `${profile.sector || ''} ${profile.industry || ''}`.toLowerCase().includes('bank')
    || `${profile.sector || ''}`.toLowerCase().includes('financial');

  const bankMetricCount = bankFundamentals
    ? [bankFundamentals.nimPct, bankFundamentals.nplGrossPct, bankFundamentals.casaPct, bankFundamentals.ldrPct, bankFundamentals.carPct].filter((v) => v != null).length
    : 0;
  const useBankPanel = isBank && bankMetricCount > 0;

  // Evidence quality dihitung dari KELOMPOK bukti yang benar-benar ada di payload,
  // bukan dari keyakinan terhadap emitennya.
  const evidenceGroups = [
    currentPrice != null,
    score != null,
    range52w != null,
    trends.length > 0,
    !!(tradingPlan?.stopLoss && tradingPlan?.targetPrice1),
    terukur(fundamentals.trailingPE) != null || terukur(fundamentals.priceToBook) != null,
    terukur(fundamentals.returnOnEquity) != null || useBankPanel,
    valuation?.fairValue != null,
    latestEarningsQuarter?.quarter != null,
    ownership?.observedDate != null,
  ];
  const evidenceCount = evidenceGroups.filter(Boolean).length;
  const evidenceTotal = evidenceGroups.length;
  const evidenceQuality = evidenceCount >= 8 ? 'TINGGI' : evidenceCount >= 5 ? 'SEDANG' : 'DATA TERBATAS';
  const evidenceColor = evidenceQuality === 'TINGGI' ? BULL : evidenceQuality === 'SEDANG' ? FLAT : MUTED;

  const consensusColor = consensusTone === 'positive' ? BULL : consensusTone === 'negative' ? BEAR : FLAT;
  const hasPlan = !!(tradingPlan?.entryZone && tradingPlan.stopLoss && tradingPlan.targetPrice1);
  const position = range52w?.positionPct != null ? Math.max(0, Math.min(100, Math.round(range52w.positionPct))) : null;
  const positiveTrends = trends.filter((t) => ['BULLISH', 'BUY', 'KUAT'].includes((t.status || '').toUpperCase())).length;
  const ratedTrends = trends.filter((t) => (t.status || '').toUpperCase() !== 'NA').length;
  const hasVote = bullPct != null && bearPct != null && neutralPct != null;

  const topPattern = patterns.find((p) => p.name) || null;

  // Kualitas arus kas: hanya dinyatakan kalau KEDUA angkanya ada. Rasio dengan satu sisi
  // hilang bukan "rendah", ia tidak terukur.
  const ocf = terukur(fundamentals.operatingCashflow);
  const fcf = terukur(fundamentals.freeCashflow);
  const fcfConversion = ocf != null && fcf != null && ocf > 0 ? Math.round((fcf / ocf) * 100) : null;
  const netCash = fundamentals.totalCash != null && fundamentals.totalDebt != null
    ? fundamentals.totalCash - fundamentals.totalDebt
    : null;

  const mos = valuation?.mos ?? null;
  const riskLines: string[] = [];
  if (!hasPlan) riskLines.push('Level eksekusi belum lengkap');
  if (ratedTrends > 0 && positiveTrends === 0) riskLines.push('Tren belum mengonfirmasi entry');
  if (mos != null && mos < 0) riskLines.push('Harga di atas estimasi nilai wajar');
  if (latestEarningsQuarter?.status === 'MISS') riskLines.push('Laporan terakhir di bawah estimasi');
  if (useBankPanel && bankFundamentals?.quality?.status === 'PARTIAL') riskLines.push('Metrik bank belum lengkap');
  if (riskLines.length === 0) riskLines.push('Risiko mengikuti batas invalidasi teknikal');

  return (
    <div className="w-[1080px] font-sans" style={{ background: BG, color: TEXT, padding: 26 }}>
      <header className="flex items-start justify-between" style={{ padding: '4px 2px 18px' }}>
        <div>
          <div style={{ color: ACCENT, fontSize: 10.5, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            SahamLens · Investment Snapshot 360°
          </div>
          <div className="flex items-baseline gap-3" style={{ marginTop: 8 }}>
            <h1 style={{ fontSize: 46, fontWeight: 590, lineHeight: 1, letterSpacing: '-1.05px' }}>{ticker}</h1>
            <span style={{ color: MUTED, fontSize: 13.5 }}>{stockName || 'Nama emiten belum tersedia'}</span>
          </div>
          <div style={{ color: SUBTLE, fontSize: 10.5, marginTop: 8 }}>
            {profile.sector || 'Sektor belum tersedia'}{profile.industry ? ` · ${profile.industry}` : ''}
            {volume != null ? ` · Volume ${Math.round(volume).toLocaleString('id-ID')} lembar` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="font-number" style={{ fontSize: 34, fontWeight: 590 }}>{rp(currentPrice)}</div>
          <div style={{ color: changePct == null ? MUTED : changePct >= 0 ? BULL : BEAR, fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>
            {changePct == null ? ABSENT : pct(changePct, true, 2)}
          </div>
          <div style={{ color: SUBTLE, fontSize: 9.5, marginTop: 8 }}>
            Data per {dateLabel(dataTimestamp)}<br />Dibuat {timestampLabel(exportedAt)}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3" style={{ marginBottom: 12 }}>
        <div style={{ background: PANEL_2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 15 }}>
          <Metric
            label="LensScore"
            value={score == null ? ABSENT : `${score}/100`}
            sub={`Teknikal ${scoreBreakdown.technical ?? ABSENT}/40 · Flow ${scoreBreakdown.flow ?? ABSENT}/30 · Fundamental ${scoreBreakdown.fundamental ?? ABSENT}/30`}
            color={ACCENT}
          />
        </div>
        <div style={{ background: PANEL_2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 15 }}>
          <Metric
            label="Konsensus Analyzer"
            value={consensusLabel}
            sub={hasVote ? `Bull ${pp(bullPct, 0)} · Netral ${pp(neutralPct, 0)} · Bear ${pp(bearPct, 0)}` : 'Distribusi suara belum tersedia'}
            color={consensusColor}
          />
          {hasVote ? (
            <div className="flex" style={{ height: 4, marginTop: 9, borderRadius: 4, overflow: 'hidden' }}>
              <span style={{ width: `${bullPct}%`, background: BULL }} />
              <span style={{ width: `${neutralPct}%`, background: NEUTRAL_BAR }} />
              <span style={{ width: `${bearPct}%`, background: BEAR }} />
            </div>
          ) : null}
        </div>
        <div style={{ background: PANEL_2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 15 }}>
          <Metric
            label="Valuasi"
            value={valuation?.valuation || 'DATA TERBATAS'}
            sub={valuation?.fairValue != null
              ? `Nilai wajar ${rp(valuation.fairValue)} · MoS ${pp(mos)}${valuation.method ? ` · ${valuation.method}` : ''}`
              : 'Nilai wajar belum tersedia'}
            color={toneColor(valuation?.valuation)}
          />
        </div>
        <div style={{ background: PANEL_2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 15 }}>
          <Metric
            label="Evidence Quality"
            value={evidenceQuality}
            sub={`${evidenceCount}/${evidenceTotal} kelompok bukti tersedia`}
            color={evidenceColor}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Section title="Struktur Teknikal" note="tren · momentum · pola · volatilitas">
          <div className="grid grid-cols-3 gap-4">
            {trends.slice(0, 3).map((t) => (
              <Metric key={t.timeframe} label={t.label} value={t.status} sub={`${t.benchmark} · ${t.detail}`} color={toneColor(t.status)} size={16} />
            ))}
            {trends.length === 0 ? (
              <div style={{ color: MUTED, fontSize: 11.5 }}>DATA TERBATAS — tren multi-timeframe belum tersedia.</div>
            ) : null}
          </div>
          <Divider />
          <div className="grid grid-cols-3 gap-4">
            <Metric
              label="Posisi 52 Minggu"
              value={position == null ? ABSENT : `${position}%`}
              sub={range52w ? `${rp(range52w.low52w)} — ${rp(range52w.high52w)}` : 'Rentang belum tersedia'}
            />
            <Metric
              label="ATR 14"
              value={rp(tradingPlan?.atr14)}
              sub={tradingPlan?.atr14 != null && currentPrice ? `${(Math.round((tradingPlan.atr14 / currentPrice) * 1000) / 10).toLocaleString('id-ID')}% dari harga` : 'Volatilitas belum tersedia'}
            />
            <Metric
              label="Pola Candle"
              value={topPattern?.name || ABSENT}
              sub={topPattern
                ? `${topPattern.reliability ? `Grade ${topPattern.reliability}` : 'Grade —'} · ${topPattern.volumeConfirmed ? 'terkonfirmasi volume' : 'tanpa konfirmasi volume'}${patternAsOf ? ` · ${patternAsOf.slice(0, 10)}` : ''}`
                : 'Tidak ada pola pada sesi lengkap terakhir'}
              color={toneColor(topPattern?.sentiment)}
              size={16}
            />
          </div>
          {position != null ? (
            <div style={{ height: 5, background: NEUTRAL_BAR, marginTop: 13, borderRadius: 5 }}>
              <div style={{ width: `${position}%`, height: 5, background: ACCENT, borderRadius: 5 }} />
            </div>
          ) : null}
        </Section>

        <Section title="Aliran Dana & Level Kunci" note="CMF · asing · pivot klasik">
          <div className="grid grid-cols-3 gap-4">
            <Metric
              label="Tekanan Bandar"
              value={flowDetails?.bandarmologyStatus || ABSENT}
              sub={flowDetails?.cmf20 != null ? `CMF20 ${flowDetails.cmf20 > 0 ? '+' : ''}${flowDetails.cmf20.toLocaleString('id-ID')}` : 'CMF belum tersedia'}
              color={toneColor(flowDetails?.bandarmologyStatus)}
              size={16}
            />
            <Metric
              label="Arus Asing"
              value={flowDetails?.foreignFlowStatus || ABSENT}
              sub={flowDetails?.netPressurePct != null ? `Tekanan bersih ${pp(flowDetails.netPressurePct)}` : 'Tekanan bersih belum tersedia'}
              size={16}
            />
            <Metric label="Pivot (PP)" value={rp(pivots?.pp)} sub="Acuan sesi berikutnya" />
          </div>
          <Divider />
          <div className="grid grid-cols-4 gap-4">
            <Metric label="Resistance 2" value={rp(pivots?.r2)} color={BEAR} size={17} />
            <Metric label="Resistance 1" value={rp(pivots?.r1)} color={BEAR} size={17} />
            <Metric label="Support 1" value={rp(pivots?.s1)} color={BULL} size={17} />
            <Metric label="Support 2" value={rp(pivots?.s2)} color={BULL} size={17} />
          </div>
        </Section>

        <Section
          title={useBankPanel ? 'Fundamental Bank & Valuasi' : 'Fundamental & Valuasi'}
          note={useBankPanel ? 'metrik perbankan · DATA_ONLY' : 'valuasi · profitabilitas · pertumbuhan'}
        >
          <div className="grid grid-cols-4 gap-4">
            <Metric label="Market Cap" value={orAbsent(fmtTriliun(fundamentals.marketCap))} />
            <Metric label="PER" value={orAbsent(fmtKali(terukur(fundamentals.trailingPE)))} sub={`Forward ${orAbsent(fmtKali(terukur(fundamentals.forwardPE)))}`} />
            <Metric label="PBV" value={orAbsent(fmtKali(terukur(fundamentals.priceToBook)))} />
            <Metric label="Dividend Yield" value={orAbsent(fmtPersen(fundamentals.dividendYield))} />
          </div>
          <Divider />
          {useBankPanel ? (
            <>
              <div className="grid grid-cols-5 gap-4">
                <Metric label="NIM" value={bankFundamentals?.nimPct == null ? ABSENT : pp(bankFundamentals.nimPct, 2)} size={17} />
                <Metric label="NPL Gross" value={bankFundamentals?.nplGrossPct == null ? ABSENT : pp(bankFundamentals.nplGrossPct, 2)} size={17} />
                <Metric label="CASA" value={bankFundamentals?.casaPct == null ? ABSENT : pp(bankFundamentals.casaPct, 2)} size={17} />
                <Metric label="LDR" value={bankFundamentals?.ldrPct == null ? ABSENT : pp(bankFundamentals.ldrPct, 2)} size={17} />
                <Metric label="CAR" value={bankFundamentals?.carPct == null ? ABSENT : pp(bankFundamentals.carPct, 2)} size={17} />
              </div>
              <div style={{ color: MUTED, fontSize: 10.5, marginTop: 12 }}>
                ROE {orAbsent(fmtPersen(terukur(fundamentals.returnOnEquity)))} · Pendapatan {orAbsent(fmtPersen(fundamentals.revenueGrowth))} YoY · Laba {orAbsent(fmtPersen(fundamentals.earningsGrowth))} YoY
                {bankFundamentals?.periodEnd ? ` · periode ${bankFundamentals.periodEnd}` : ''}
                {bankFundamentals?.quality?.coveragePct != null ? ` · cakupan ${bankFundamentals.quality.coveragePct}%` : ''}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4">
                <Metric label="ROE" value={orAbsent(fmtPersen(terukur(fundamentals.returnOnEquity)))} sub={`ROA ${orAbsent(fmtPersen(terukur(fundamentals.returnOnAssets)))}`} />
                <Metric label="Net Margin" value={orAbsent(fmtPersen(terukur(fundamentals.profitMargins)))} sub={`OPM ${orAbsent(fmtPersen(terukur(fundamentals.operatingMargins)))}`} />
                <Metric label="Revenue YoY" value={orAbsent(fmtPersen(fundamentals.revenueGrowth))} sub={`Laba ${orAbsent(fmtPersen(fundamentals.earningsGrowth))} YoY`} />
                <Metric label="DER" value={orAbsent(fmtDer(terukur(fundamentals.debtToEquity)))} sub={`CR ${orAbsent(fmtKali(terukur(fundamentals.currentRatio)))}`} />
              </div>
              <div style={{ color: MUTED, fontSize: 10.5, marginTop: 12 }}>
                Arus kas operasi {orAbsent(fmtTriliun(ocf))} · FCF {orAbsent(fmtTriliun(fcf))}
                {fcfConversion != null ? ` · konversi ${fcfConversion}%` : ' · konversi belum terukur'}
                {netCash != null ? ` · kas bersih ${orAbsent(fmtTriliun(netCash))}` : ''}
              </div>
            </>
          )}
          <div style={{ color: MUTED, fontSize: 10.5, marginTop: 8 }}>
            Moat proxy: <b style={{ color: toneColor(moat?.status) }}>{moat?.status || 'DATA TERBATAS'}</b>
            {moat ? ` · cakupan ${moat.coveragePct}% (${moat.supportive}/${moat.available} indikator mendukung)` : ''}
            {durability?.status ? ` · durabilitas ${durability.status}` : ''}
          </div>
        </Section>

        <Section title="Earnings & Kepemilikan" note="laporan emiten · snapshot KSEI">
          <div className="grid grid-cols-4 gap-4">
            <Metric
              label="Periode Terakhir"
              value={latestEarningsQuarter?.quarter || ABSENT}
              sub={latestEarningsQuarter?.reportedDate ? `Dilaporkan ${latestEarningsQuarter.reportedDate.slice(0, 10)}` : 'Tanggal laporan belum tersedia'}
              size={17}
            />
            <Metric
              label="EPS Aktual"
              value={latestEarningsQuarter?.actualEps == null ? ABSENT : latestEarningsQuarter.actualEps.toLocaleString('id-ID')}
              sub={latestEarningsQuarter?.surprisePct != null
                ? `${latestEarningsQuarter.status || 'Surprise'} ${pct(latestEarningsQuarter.surprisePct, true)}`
                : 'Estimasi analis belum tersedia'}
              color={toneColor(latestEarningsQuarter?.status)}
            />
            <Metric
              label="Asing KSEI"
              value={ownership?.foreignPct == null ? ABSENT : pp(ownership.foreignPct, 2)}
              sub={ownership?.previous?.foreignPp != null
                ? `${ownership.previous.actualGapDays ?? 'Antar'} hari ${pct(ownership.previous.foreignPp, true, 2)} pp`
                : 'Perubahan belum tersedia'}
            />
            <Metric
              label="Observasi KSEI"
              value={dateLabel(ownership?.observedDate)}
              sub={ownership?.scriplessPct != null ? `Scripless ${pp(ownership.scriplessPct, 2)} · bukan broker flow` : 'Snapshot kepemilikan, bukan broker flow'}
              size={15}
            />
          </div>
          <div style={{ color: MUTED, fontSize: 10.5, marginTop: 12 }}>
            {upcomingEarnings?.date
              ? `Laporan berikutnya ${upcomingEarnings.date.slice(0, 10)}${upcomingEarnings.fiscalQuarter ? ` (${upcomingEarnings.fiscalQuarter})` : ''}${upcomingEarnings.isEstimate ? ' · estimasi jadwal' : ''}`
              : 'Jadwal laporan berikutnya belum tersedia'}
          </div>
        </Section>
      </div>

      <Section title="Trade Structure" note="proyeksi berbasis ATR, bukan rekomendasi">
        <div className="grid grid-cols-6 gap-4">
          <Metric label="Entry Zone" value={tradingPlan?.entryZone ? `${rp(tradingPlan.entryZone[0])}–${rp(tradingPlan.entryZone[1])}` : ABSENT} size={16} />
          <Metric label="Invalidasi" value={rp(tradingPlan?.stopLoss)} sub={tradingPlan?.riskPct != null ? `Risiko ${pp(tradingPlan.riskPct)}` : undefined} color={BEAR} size={17} />
          <Metric label="Target 1" value={rp(tradingPlan?.targetPrice1)} sub={tradingPlan?.rewardPct1 != null ? `Imbal ${pp(tradingPlan.rewardPct1)}` : undefined} color={BULL} size={17} />
          <Metric label="Target 2" value={rp(tradingPlan?.targetPrice2)} color={BULL} size={17} />
          <Metric label="Risk/Reward" value={tradingPlan?.riskRewardRatio || ABSENT} size={17} />
          <Metric label="Bias Setup" value={tradingPlan?.bias || ABSENT} color={toneColor(tradingPlan?.bias?.includes('BULL') ? 'BULLISH' : tradingPlan?.bias?.includes('BEAR') ? 'BEARISH' : null)} size={14} />
        </div>
        <div style={{ color: hasPlan ? BULL : MUTED, fontSize: 10.5, fontWeight: 600, marginTop: 13 }}>
          {hasPlan ? 'TRADEPLAN: TERSEDIA — revalidasi terhadap harga dan sesi terbaru' : 'TRADEPLAN: TIDAK ACTIONABLE'}
        </div>
      </Section>

      <section
        style={{
          background: 'rgba(113,112,255,.10)',
          border: '1px solid rgba(113,112,255,.35)',
          borderRadius: 12,
          padding: 18,
          marginTop: 12,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: 15, fontWeight: 590 }}>Decision Strip</h2>
          <span style={{ color: evidenceColor, fontSize: 10.5, fontWeight: 600 }}>EVIDENCE QUALITY: {evidenceQuality}</span>
        </div>
        <div className="grid grid-cols-4 gap-5" style={{ marginTop: 13 }}>
          <Metric
            label="Timing Teknikal"
            value={ratedTrends === 0 ? 'DATA TERBATAS' : positiveTrends >= 2 ? 'TERKONFIRMASI' : positiveTrends === 1 ? 'CAMPURAN' : 'BELUM TERKONFIRMASI'}
            sub={ratedTrends === 0 ? 'Tren belum tersedia' : `${positiveTrends}/${ratedTrends} timeframe positif`}
            color={ratedTrends === 0 ? MUTED : positiveTrends >= 2 ? BULL : FLAT}
            size={16}
          />
          <Metric
            label="Katalis Terukur"
            value={latestEarningsQuarter?.status || 'DATA TERBATAS'}
            sub={latestEarningsQuarter?.quarter ? `Laporan ${latestEarningsQuarter.quarter}` : 'Belum ada laporan terbaru'}
            color={toneColor(latestEarningsQuarter?.status)}
            size={16}
          />
          <Metric
            label="Margin of Safety"
            value={mos == null ? ABSENT : pp(mos)}
            sub={valuation?.fairValue != null ? `Terhadap ${rp(valuation.fairValue)}` : 'Nilai wajar belum tersedia'}
            color={mos == null ? MUTED : mos > 0 ? BULL : BEAR}
            size={16}
          />
          <Metric label="Risiko Terbesar" value={riskLines[0]} sub={riskLines[1]} color={FLAT} size={13} />
        </div>
      </section>

      <footer className="flex items-start justify-between" style={{ color: SUBTLE, fontSize: 9.5, lineHeight: 1.5, padding: '15px 2px 2px' }}>
        <span style={{ maxWidth: 780 }}>
          LensScore adalah keselarasan faktor, bukan probabilitas profit. Level teknikal, nilai wajar, moat proxy, dan status sinyal adalah keluaran model SahamLens atas data publik; metrik bank bersifat DATA_ONLY dan tidak mengubah skor. Angka kepemilikan adalah snapshot KSEI, bukan broker flow. Validasi sumber, kesegaran data, aksi korporasi, dan likuiditas tetap diperlukan.
        </span>
        <span className="text-right">
          sahamlens.id<br />Bursa Efek Indonesia
        </span>
      </footer>
    </div>
  );
}
