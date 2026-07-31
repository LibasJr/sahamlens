'use me';
'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Calculator, DollarSign, TrendingUp, Table, CheckCircle, AlertTriangle, ArrowUpRight } from 'lucide-react';

export default function DcfPage() {
  // Default bukan saham bank - DCF berbasis Free Cash Flow secara sengaja tidak berlaku
  // untuk sektor keuangan (lihat calculateDcfModel), jadi kalau default-nya bank (mis.
  // BBCA) halaman ini akan selalu tampak kosong saat pertama dibuka.
  const [ticker, setTicker] = useState('TLKM');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

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

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="Council AI DCF Intrinsic Valuation"
        moduleBank="COUNCIL AI"
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Top DCF Summary Banner */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-400/10 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white font-mono">{stock.symbol || ticker}.JK Intrinsic Valuation</h1>
              <p className="text-xs text-tv-muted font-mono">
                WACC {quant.wacc_pct != null ? `${quant.wacc_pct}%` : '-'} (SBN 10Y Yield {quant.sbn_10y_yield != null ? `${quant.sbn_10y_yield}%` : '-'} + Risk Premium {quant.risk_premium != null ? `${quant.risk_premium}%` : '-'})
              </p>
            </div>
          </div>

          {/* Fair Value vs Market Price Badge */}
          <div className="flex items-center gap-6 font-mono">
            <div>
              <div className="text-[10px] text-tv-muted uppercase">HARGA PASAR SAAT INI</div>
              <div className="text-xl font-bold text-white">Rp {quant.current_price?.toLocaleString('id-ID') || '-'}</div>
            </div>
            <div>
              <div className="text-[10px] text-tv-muted uppercase">COUNCIL AI FAIR VALUE</div>
              <div className="text-xl font-extrabold text-tv-green">Rp {quant.fair_value?.toLocaleString('id-ID') || '-'}</div>
            </div>
            <div className="pl-4 border-l border-tv-border">
              <div className="text-[10px] text-tv-muted uppercase">STATUS VALUASI</div>
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
        </div>

        {/* DCF tidak berlaku (bank / data FCF tidak tersedia) */}
        {quant.not_applicable && (
          <div className="bg-tv-card border border-tv-yellow/40 rounded-xl p-6 flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-tv-yellow shrink-0 mt-0.5" />
            <div>
              <h3 className="text-white font-bold mb-1">Model DCF Tidak Berlaku untuk {stock.symbol || ticker}.JK</h3>
              <p className="text-sm text-tv-muted leading-relaxed">{ai.executive_summary}</p>
            </div>
          </div>
        )}

        {/* 5-Year FCF Projections Table */}
        {!quant.not_applicable && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              Proyeksi Cash Flow 5-Tahun (Free Cash Flow Per Share)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px]">
                    <th className="p-3">Periode</th>
                    <th className="p-3 text-right">Proyeksi FCF (IDR/Lbr)</th>
                    <th className="p-3 text-right">Present Value (PV @ WACC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border/50">
                  {fcfList.map((f: any) => (
                    <tr key={f.year} className="hover:bg-tv-hover/50">
                      <td className="p-3 font-bold text-white">{f.year}</td>
                      <td className="p-3 text-right text-tv-green font-bold">Rp {f.fcf_per_share?.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right text-blue-400 font-bold">Rp {f.pv_fcf?.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                  <tr className="bg-tv-bg font-bold border-t border-tv-border">
                    <td className="p-3 text-white">Sum Present Value FCF (5-Thn)</td>
                    <td className="p-3 text-right text-tv-muted">-</td>
                    <td className="p-3 text-right text-tv-green">Rp {quant.pv_fcf_sum?.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr className="bg-tv-bg font-bold">
                    <td className="p-3 text-white">Present Value Terminal Value (g={quant.terminal_growth_pct}%)</td>
                    <td className="p-3 text-right text-tv-muted">-</td>
                    <td className="p-3 text-right text-tv-accent">Rp {quant.pv_terminal_value?.toLocaleString('id-ID')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* WACC vs Terminal Growth Sensitivity Matrix */}
          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
              <Table className="w-5 h-5 text-tv-yellow" />
              Tabel Sensitivitas Valuasi WACC vs Terminal Growth
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-tv-border bg-tv-bg text-tv-muted text-[10px]">
                    <th className="p-3">WACC \ g</th>
                    <th className="p-3">Growth 3.0%</th>
                    <th className="p-3">Growth 3.5% (Base)</th>
                    <th className="p-3">Growth 4.0%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border/50">
                  {sensitivity.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-tv-hover/50">
                      <td className="p-3 font-bold text-tv-yellow bg-tv-bg/50">{row.wacc_pct}</td>
                      <td className="p-3 text-tv-text font-bold">Rp {row['g_3.0%']?.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-tv-green font-extrabold bg-tv-green/10 border border-tv-green/30">
                        Rp {row['g_3.5%']?.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-tv-text font-bold">Rp {row['g_4.0%']?.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 rounded-lg bg-tv-bg border border-tv-border space-y-2">
              <h4 className="text-xs font-bold text-white font-mono uppercase">Ringkasan Analisis Council AI</h4>
              <p className="text-xs text-tv-text leading-relaxed">
                {ai.executive_summary || (loading ? 'Menghitung model DCF...' : 'Data FCF tidak tersedia untuk simbol ini (mis. sektor bank tidak memakai model DCF FCF-based).')}
              </p>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
