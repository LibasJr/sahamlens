'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calculator, TrendingUp, Table as TableIcon, AlertTriangle } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';

// BUG FIX (2026-08-01): halaman ini SEBELUMNYA selalu mulai dari ticker hardcoded
// 'TLKM' - berapa pun emiten yang sedang dibuka user di Technical Analyzer, begitu
// klik kartu "DCF Valuation" di bagian bawah, halaman ini diam-diam ganti balik ke
// TLKM. Sekarang ikut pola yang sama dengan /dashboard & /fundamental: prioritas
// ?symbol= di URL, lalu localStorage 'last_searched_ticker' (dipakai bersama lintas
// 3 halaman ini), baru default TLKM kalau memang belum pernah cari apa-apa.
function DcfContent() {
  const searchParams = useSearchParams();
  // Default bukan saham bank - DCF berbasis Free Cash Flow secara sengaja tidak berlaku
  // untuk sektor keuangan (lihat calculateDcfModel), jadi kalau default-nya bank (mis.
  // BBCA) halaman ini akan selalu tampak kosong saat pertama dibuka.
  const [ticker, setTickerState] = useState('TLKM');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

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
    try {
      const res = await fetch('/api/dcf/' + symbol);
      const json = await res.json();
      setData(res.ok ? json : null);
    } catch (e) {
      console.error(e);
      setData(null);
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

  return (
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="LensAI DCF Intrinsic Valuation"
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
            <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">LensAI Fair Value</div>
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
        </div>

        {/* WACC vs Terminal Growth Sensitivity Matrix */}
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <TableIcon className="w-5 h-5 text-tv-yellow" />
            Tabel Sensitivitas Valuasi Discount Rate vs Terminal Growth
          </h3>

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

          <div className="p-4 rounded-lg bg-tv-bg border border-tv-border space-y-2">
            <h4 className="text-xs font-bold text-tv-text uppercase tracking-wide font-heading">Ringkasan Analisis LensAI</h4>
            <p className="text-xs text-tv-text leading-relaxed">
              {ai.executive_summary || (loading ? 'Menghitung model DCF...' : 'Data FCF tidak tersedia untuk simbol ini (mis. sektor bank tidak memakai model DCF FCF-based).')}
            </p>
          </div>
        </div>
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
