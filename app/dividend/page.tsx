'use me';
'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Coins, DollarSign, TrendingUp, ShieldCheck, Repeat, ArrowUpRight } from 'lucide-react';

export default function DividendPage() {
  const [capital, setCapital] = useState(200_000_000);
  const [targetMonthly, setTargetMonthly] = useState(10_000_000);
  const [ticker, setTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const fetchDividendPlan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/live/' + ticker);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDividendPlan();
  }, [capital, targetMonthly]);

  const quant = data?.quant || {};
  const stocks = quant?.div_stocks || [];
  const schedule = quant?.compounding_schedule || [];

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="Harvard Dividend Compounding & DRIP Planner"
        moduleBank="HARVARD HMC"
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Form Controls & Overview */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-400/10 border border-green-400/30 flex items-center justify-center text-green-400">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white font-mono">Simulasi Cash Flow Dividen IDX</h1>
              <p className="text-xs text-tv-muted font-mono">
                Bebas Pajak 10% jika direinvestasikan kembali (Pajak Dividen 0% UU HPP)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
            <div>
              <label className="text-tv-muted block mb-1">Modal Awal (IDR)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                className="bg-tv-bg border border-tv-border rounded p-2 text-white font-bold focus:outline-none focus:border-tv-green"
              />
            </div>
            <div>
              <label className="text-tv-muted block mb-1">Target Pasif/Bulan (IDR)</label>
              <input
                type="number"
                value={targetMonthly}
                onChange={(e) => setTargetMonthly(Number(e.target.value))}
                className="bg-tv-bg border border-tv-border rounded p-2 text-white font-bold focus:outline-none focus:border-tv-green"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono">
          <div className="p-4 rounded-xl bg-tv-card border border-tv-border shadow-1">
            <div className="text-[10px] text-tv-muted uppercase">ESTIMASI PASIF INCOME / BULAN SAAT INI</div>
            <div className="text-xl font-bold text-tv-green mt-1">
              Rp {quant.est_monthly_income_now?.toLocaleString('id-ID') || '-'}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-tv-card border border-tv-border shadow-1">
            <div className="text-[10px] text-tv-muted uppercase">ESTIMASI PASIF INCOME / TAHUN SAAT INI</div>
            <div className="text-xl font-bold text-tv-yellow mt-1">
              Rp {quant.est_annual_income_now?.toLocaleString('id-ID') || '-'}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-tv-card border border-tv-border shadow-1">
            <div className="text-[10px] text-tv-muted uppercase">RATA-RATA DIVIDEND YIELD</div>
            <div className="text-xl font-bold text-white mt-1">
              {quant.average_portfolio_yield || '7.1'}%
            </div>
          </div>
          <div className="p-4 rounded-xl bg-tv-card border border-tv-border shadow-1">
            <div className="text-[10px] text-tv-muted uppercase">MODAL DIBUTUHKAN UNTUK TARGET</div>
            <div className="text-xl font-bold text-tv-accent mt-1">
              Rp {quant.required_capital_for_target?.toLocaleString('id-ID') || '-'}
            </div>
          </div>
        </div>

        {/* Dividend Stocks Table & Compounding Schedule */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
              <ShieldCheck className="w-5 h-5 text-green-400" />
              15-20 Saham Dividen IDX Terbaik & Safety Score
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px]">
                    <th className="p-2.5">Ticker</th>
                    <th className="p-2.5 text-right">Yield</th>
                    <th className="p-2.5 text-right">Safety (1-10)</th>
                    <th className="p-2.5 text-right">Payout Ratio</th>
                    <th className="p-2.5 text-right">Track Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border/50">
                  {stocks.map((s: any) => (
                    <tr key={s.ticker} className="hover:bg-tv-hover/50">
                      <td className="p-2.5">
                        <span className="font-bold text-white px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                          {s.ticker}
                        </span>
                      </td>
                      <td className="p-2.5 text-right text-tv-yellow font-bold">{s.yield_pct}%</td>
                      <td className="p-2.5 text-right text-tv-green font-bold">{s.safety_score} / 10</td>
                      <td className="p-2.5 text-right text-tv-muted">{s.payout_ratio}%</td>
                      <td className="p-2.5 text-right text-white font-bold">{s.consistency_years} Thn</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
              <Repeat className="w-5 h-5 text-tv-accent" />
              Simulasi Compounding 10-Tahun (DRIP Reinvestment)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px]">
                    <th className="p-2.5">Tahun</th>
                    <th className="p-2.5 text-right">Nilai Portofolio Akhir</th>
                    <th className="p-2.5 text-right">Passive Income / Bln</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border/50">
                  {schedule.map((row: any) => (
                    <tr key={row.year} className="hover:bg-tv-hover/50">
                      <td className="p-2.5 font-bold text-white">{row.year}</td>
                      <td className="p-2.5 text-right text-tv-green font-bold">
                        Rp {row.capital_end_of_year?.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2.5 text-right text-tv-yellow font-bold">
                        Rp {row.monthly_passive_income?.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
