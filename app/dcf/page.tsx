'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Calculator, TrendingUp, Table as TableIcon, AlertTriangle, Lock, Gauge, ArrowUpRight } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { trackSignupClick } from '@/shared/analytics/product-funnel';
import { useLanguage } from '@/lib/i18n';

// BUG FIX (2026-08-01): halaman ini SEBELUMNYA selalu mulai dari ticker hardcoded
// 'TLKM' - berapa pun emiten yang sedang dibuka user di Technical Analyzer, begitu
// klik kartu "DCF Valuation" di bagian bawah, halaman ini diam-diam ganti balik ke
// TLKM. Sekarang ikut pola yang sama dengan /dashboard & /fundamental: prioritas
// ?symbol= di URL, lalu localStorage 'last_searched_ticker' (dipakai bersama lintas
// 3 halaman ini), baru default TLKM kalau memang belum pernah cari apa-apa.
function DcfContent() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const searchParams = useSearchParams();
  const [ticker, setTickerState] = useState('TLKM');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const setTicker = (newTicker: string) => {
    setTickerState(newTicker);
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_searched_ticker', newTicker);
    }
  };

  useEffect(() => {
    const urlSymbol = searchParams.get('symbol');
    if (urlSymbol) {
      // WAJIB pakai setTicker (bukan setTickerState) - sebelumnya dibuka via
      // link ?symbol= dari halaman lain menampilkan ticker yang benar TAPI tidak
      // ikut menulis localStorage, jadi kunjungan berikutnya ke /dcf tanpa
      // ?symbol= jatuh ke default TLKM lagi walau baru saja lihat emiten lain.
      setTicker(urlSymbol.toUpperCase());
      return;
    }
    const savedTicker = typeof window !== 'undefined' ? localStorage.getItem('last_searched_ticker') : null;
    if (savedTicker) {
      setTickerState(savedTicker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDcf = async (symbol: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/dcf/' + symbol);
      const json = await res.json();
      if (!res.ok) {
        setData(null);
        setLoadError(json?.error || 'Data DCF sementara tidak dapat dimuat.');
        return;
      }
      setData(json);
    } catch (e) {
      console.error(e);
      setData(null);
      setLoadError('Tidak dapat menghubungi layanan DCF. Coba lagi beberapa saat lagi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDcf(ticker);
  }, [ticker]);

  const quant = data?.quant || {};
  const stock = data?.stock || {};
  const ai = data?.analysis || {};
  const fcfList = quant?.fcf_projections || [];
  const sensitivity = quant?.sensitivity_table || [];
  const discountRatePct = quant.discount_rate_pct ?? quant.wacc_pct ?? null;
  const isGuestLimited = Boolean(data?.is_guest_limited || quant?.is_guest_limited);

  return (
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="DCF Intrinsic Valuation"
      moduleBank="LENSAI"
      icon={<Calculator className="w-6 h-6" />}
      accent="blue"
      title={`${stock.symbol || ticker}.JK Intrinsic Valuation`}
      subtitle={`Discount rate proxy ${discountRatePct != null ? `${discountRatePct}%` : '-'} (asumsi SBN 10Y ${quant.sbn_10y_yield != null ? `${quant.sbn_10y_yield}%` : '-'} + risk premium ${quant.risk_premium != null ? `${quant.risk_premium}%` : '-'})`}
      headerExtra={
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Harga Pasar Saat Ini</div>
            <div className="text-xl font-bold text-tv-text font-number">Rp {quant.current_price?.toLocaleString('id-ID') || '-'}</div>
          </div>
          <div>
            <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Nilai Wajar (Model DCF)</div>
            <div className="text-xl font-extrabold text-tv-green font-number">Rp {quant.fair_value?.toLocaleString('id-ID') || '-'}</div>
          </div>
          <div className="pl-4 border-l border-tv-border">
            <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Status Valuasi</div>
            <div className={`text-lg font-extrabold px-3 py-1 rounded border ${
              quant.valuation_status === 'UNDERVALUED'
                ? 'bg-tv-green/20 text-tv-green border-tv-green'
                : quant.valuation_status === 'OVERVALUED'
                ? 'bg-tv-red/20 text-tv-red border-tv-red'
                : 'bg-tv-border text-tv-muted border-tv-border'
            }`}>
              {quant.valuation_status || '-'}
            </div>
          </div>
        </div>
      }
    >
      {!quant.not_applicable && quant?.assumptions?.retention_source && (
        <div className="rounded-lg border border-tv-yellow/30 bg-tv-yellow/5 p-3 text-xs text-tv-muted">
          <span className="font-semibold text-tv-text">Asumsi pertumbuhan DCF: </span>
          {quant.assumptions.retention_source === 'MODEL_ASSUMPTION_60_PCT'
            ? `payout ratio tidak tersedia dari provider; model memakai retensi laba ${(Number(quant.assumptions.retention_ratio) * 100).toFixed(0)}%. Ini asumsi model, bukan data emiten.`
            : `retensi laba ${(Number(quant.assumptions.retention_ratio) * 100).toFixed(1)}% diturunkan dari payout ratio provider.`}
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-tv-red/30 bg-tv-red/10 p-4 text-sm text-tv-red">
          {loadError}
        </div>
      )}
      {/* DCF tidak berlaku (bank / data FCF tidak tersedia) */}
      {quant.not_applicable && (
        <div className="bg-tv-card border border-tv-yellow/40 rounded-lg p-6 flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-tv-yellow shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-tv-text font-bold mb-1">Model DCF Tidak Berlaku untuk {stock.symbol || ticker}.JK</h3>
            <p className="text-sm text-tv-muted leading-relaxed">{ai.executive_summary}</p>
          </div>
        </div>
      )}

      {/* 5-Year FCF Projections Table */}
      {!quant.not_applicable && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <TrendingUp className="w-5 h-5 text-tv-blue" />
            Proyeksi Cash Flow 5-Tahun (Free Cash Flow Per Share)
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px] font-semibold tracking-wide">
                  <th className="p-3">Periode</th>
                  <th className="p-3 text-right">Proyeksi FCF (IDR/Lbr)</th>
                  <th className="p-3 text-right">Present Value (PV @ Discount Rate)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/50">
                {fcfList.map((f: any) => (
                  <tr key={f.year} className="hover:bg-tv-hover/50">
                    <td className="p-3 font-bold text-tv-text">{f.year}</td>
                    <td className="p-3 text-right text-tv-green font-bold font-number">Rp {f.fcf_per_share?.toLocaleString('id-ID')}</td>
                    <td className="p-3 text-right text-tv-blue font-bold font-number">Rp {f.pv_fcf?.toLocaleString('id-ID')}</td>
                  </tr>
                ))}
                <tr className="bg-tv-bg font-bold border-t border-tv-border">
                  <td className="p-3 text-tv-text">Sum Present Value FCF (5-Thn)</td>
                  <td className="p-3 text-right text-tv-muted">-</td>
                  <td className="p-3 text-right text-tv-green font-number">Rp {quant.pv_fcf_sum?.toLocaleString('id-ID')}</td>
                </tr>
                <tr className="bg-tv-bg font-bold">
                  <td className="p-3 text-tv-text">Present Value Terminal Value (g={quant.terminal_growth_pct}%)</td>
                  <td className="p-3 text-right text-tv-muted">-</td>
                  <td className="p-3 text-right text-tv-blue font-number">Rp {quant.pv_terminal_value?.toLocaleString('id-ID')}</td>
                </tr>
                <tr className="bg-tv-bg font-bold">
                  <td className="p-3 text-tv-text">Enterprise Value / Share</td>
                  <td className="p-3 text-right text-tv-muted">-</td>
                  <td className="p-3 text-right text-tv-blue font-number">Rp {quant.enterprise_value_per_share?.toLocaleString('id-ID')}</td>
                </tr>
                <tr className="bg-tv-bg font-bold">
                  <td className="p-3 text-tv-text">Less: Net Debt / Share</td>
                  <td className="p-3 text-right text-tv-muted">-</td>
                  <td className="p-3 text-right text-tv-red font-number">Rp {quant.net_debt_per_share?.toLocaleString('id-ID')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {isGuestLimited && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-tv-blue/35 bg-tv-blue/5 px-3.5 py-2.5 text-xs">
              <div className="flex items-start gap-2 text-tv-muted">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tv-blue" />
                <span><strong className="text-tv-text">Proyeksi 3 tahun berikutnya &amp; rincian terkunci.</strong> Masuk atau daftar gratis untuk melihat seluruh proyeksi 5-tahun.</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link onClick={() => trackSignupClick('dcf_valuation')} href={`/login?next=${encodeURIComponent(`/dcf?symbol=${ticker}`)}`} className="rounded-md border border-tv-blue/50 px-2.5 py-1 font-semibold text-tv-blue hover:bg-tv-blue/10">Masuk</Link>
                <Link onClick={() => trackSignupClick('dcf_valuation')} href={`/signup?next=${encodeURIComponent(`/dcf?symbol=${ticker}`)}`} className="rounded-md bg-tv-blue px-2.5 py-1 font-semibold text-white hover:bg-tv-blueHover">Daftar Gratis</Link>
              </div>
            </div>
          )}
        </div>

        {/* WACC vs Terminal Growth Sensitivity Matrix */}
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <TableIcon className="w-5 h-5 text-tv-yellow" />
            Tabel Sensitivitas Valuasi Discount Rate vs Terminal Growth
          </h3>

          {isGuestLimited || sensitivity.length === 0 ? (
            <div className="p-6 rounded-lg border border-tv-blue/35 bg-tv-blue/5 text-center space-y-3">
              <Lock className="w-6 h-6 text-tv-blue mx-auto" />
              <div>
                <div className="text-sm font-bold text-tv-text">Matriks Sensitivitas Valuasi Terkunci</div>
                <div className="text-xs text-tv-muted mt-1 max-w-md mx-auto">
                  Lihat bagaimana estimasi nilai wajar {ticker} bergerak terhadap simulasi tingkat diskonto dan pertumbuhan perpetuitas.
                </div>
              </div>
              <div className="pt-1 flex items-center justify-center gap-2">
                <Link onClick={() => trackSignupClick('dcf_valuation')} href={`/login?next=${encodeURIComponent(`/dcf?symbol=${ticker}`)}`} className="rounded-md border border-tv-blue/50 px-3 py-1.5 text-xs font-semibold text-tv-blue hover:bg-tv-blue/10">Masuk</Link>
                <Link onClick={() => trackSignupClick('dcf_valuation')} href={`/signup?next=${encodeURIComponent(`/dcf?symbol=${ticker}`)}`} className="rounded-md bg-tv-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-tv-blueHover">Daftar Gratis</Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="border-b border-tv-border bg-tv-bg text-tv-muted text-[10px] font-semibold tracking-wide">
                    <th className="p-3">Discount Rate \ g</th>
                    <th className="p-3">Growth 3.0%</th>
                    <th className="p-3">Growth 3.5% (Base)</th>
                    <th className="p-3">Growth 4.0%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border/50">
                  {sensitivity.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-tv-hover/50">
                      <td className="p-3 font-bold text-tv-yellow bg-tv-bg/50 font-number">{row.discount_rate_pct ?? row.wacc_pct}</td>
                      <td className="p-3 text-tv-text font-bold font-number">Rp {row['g_3.0%']?.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-tv-green font-extrabold bg-tv-green/10 border border-tv-green/30 font-number">
                        Rp {row['g_3.5%']?.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-tv-text font-bold font-number">Rp {row['g_4.0%']?.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-4 rounded-lg bg-tv-bg border border-tv-border space-y-2">
            <h4 className="text-xs font-bold text-tv-text uppercase tracking-wide font-heading">
              {isEn ? 'Analysis Summary' : 'Ringkasan Analisis'}
            </h4>
            <p className="text-xs text-tv-text leading-relaxed">
              {ai.executive_summary || (loading ? (isEn ? 'Calculating DCF model...' : 'Menghitung model DCF...') : (isEn ? 'FCF data unavailable for this symbol.' : 'Data FCF tidak tersedia untuk simbol ini (mis. sektor bank tidak memakai model DCF FCF-based).'))}
            </p>
          </div>
        </div>

        {/* Reverse DCF / Implied Market Growth Card */}
        {quant.implied_fcf_growth_pct != null && (
          <div className="col-span-1 lg:col-span-2 bg-gradient-to-r from-tv-blue/[0.06] to-tv-card border border-tv-blue/30 rounded-lg p-5 shadow-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tv-border pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-tv-blue" />
                <div>
                  <h3 className="font-heading text-base font-bold text-tv-text">
                    {isEn ? 'Reverse DCF: Market Implied FCF Growth' : 'Reverse DCF: Ekspektasi Pertumbuhan yang Di-Price-In Pasar'}
                  </h3>
                  <p className="text-xs text-tv-muted">
                    {isEn
                      ? 'The annual Free Cash Flow growth rate required over the next 5 years to justify the current market price.'
                      : 'Laju pertumbuhan FCF tahunan yang dibutuhkan selama 5 tahun ke depan agar nilai wajar sama dengan harga pasar saat ini.'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-tv-muted block">{isEn ? 'Implied FCF Growth Rate' : 'Pertumbuhan FCF Tersirat'}</span>
                <span className={`text-2xl font-extrabold font-number ${
                  quant.implied_fcf_growth_pct > 15 ? 'text-tv-yellow' : quant.implied_fcf_growth_pct < 0 ? 'text-tv-red' : 'text-tv-green'
                }`}>
                  {quant.implied_fcf_growth_pct > 0 ? '+' : ''}{quant.implied_fcf_growth_pct}% / {isEn ? 'year' : 'tahun'}
                </span>
              </div>
            </div>

            <p className="text-xs text-tv-muted leading-relaxed">
              {quant.implied_fcf_growth_pct < 3
                ? (isEn
                    ? `The market currently prices in modest/conservative growth (${quant.implied_fcf_growth_pct}%/yr). If actual performance exceeds this low hurdle, there is high upside potential.`
                    : `Pasar saat ini hanya memperhitungkan pertumbuhan sangat rendah/konservatif (${quant.implied_fcf_growth_pct}%/tahun). Jika kinerja riil melampaui ekspektasi rendah ini, terdapat potensi kenaikan harga yang menarik (Margin of Safety tinggi).`)
                : quant.implied_fcf_growth_pct <= 12
                ? (isEn
                    ? `The market prices in a realistic annual growth rate of ${quant.implied_fcf_growth_pct}%/yr, broadly matching healthy corporate expansion.`
                    : `Pasar memperhitungkan pertumbuhan wajar sebesar ${quant.implied_fcf_growth_pct}%/tahun, sejalan dengan laju ekspansi bisnis yang sehat.`)
                : (isEn
                    ? `The market expects aggressive growth (${quant.implied_fcf_growth_pct}%/yr). High expectations create vulnerability if quarterly earnings slow down.`
                    : `Pasar memiliki ekspektasi pertumbuhan sangat agresif (${quant.implied_fcf_growth_pct}%/tahun). Saham ini rentan koreksi jika pertumbuhan laba melambat dari target tinggi tersebut.`)}
            </p>
          </div>
        )}
      </div>
      )}
    </TickerAnalysisShell>
  );
}

export default function DcfPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-tv-bg min-h-screen" />}>
      <DcfContent />
    </Suspense>
  );
}
