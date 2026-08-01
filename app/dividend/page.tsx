'use client';

import React, { useState, useEffect } from 'react';
import { Coins, ShieldCheck, Repeat } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { Input } from '@/components/ui';

export default function DividendPage() {
  const [capital, setCapital] = useState(200_000_000);
  const [targetMonthly, setTargetMonthly] = useState(10_000_000);
  const [ticker, setTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Catatan: kalkulator ini menghitung rata-rata dari 15-20 saham dividen IDX terbaik
  // (universe likuid, lihat modules/fundamental/service/dividend-plan.service.ts),
  // BUKAN dividend yield khusus `ticker` yang dipilih di header - input ticker di sini
  // sengaja tetap ada untuk konsistensi shell (TickerAnalysisShellProps mewajibkannya),
  // tapi tidak memengaruhi hasil simulasi di bawah.
  const fetchDividendPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dividend-plan?capital=${capital}&targetMonthly=${targetMonthly}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Gagal memuat simulasi dividen');
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      console.error(e);
      setError('Gagal memuat simulasi dividen');
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
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="Harvard Dividend Compounding & DRIP Planner"
      moduleBank="HARVARD HMC"
      icon={<Coins className="w-6 h-6" />}
      accent="green"
      title="Simulasi Cash Flow Dividen IDX"
      subtitle="Bebas Pajak 10% jika direinvestasikan kembali (Pajak Dividen 0% UU HPP)"
      headerExtra={
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Modal Awal (IDR)"
            type="number"
            size="sm"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
            className="w-40 font-number"
          />
          <Input
            label="Target Pasif/Bulan (IDR)"
            type="number"
            size="sm"
            value={targetMonthly}
            onChange={(e) => setTargetMonthly(Number(e.target.value))}
            className="w-40 font-number"
          />
        </div>
      }
    >
      {error && (
        <div className="bg-tv-card border border-tv-red/30 rounded-lg p-4 text-sm text-tv-red">
          {error}
        </div>
      )}
      {loading && !data && (
        <div className="text-sm text-tv-muted">Menghitung simulasi dari data dividen real...</div>
      )}

      {/* Dynamic Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-tv-card border border-tv-border shadow-1">
          <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Estimasi Pasif Income / Bulan Saat Ini</div>
          <div className="text-xl font-bold text-tv-green mt-1 font-number">
            Rp {quant.est_monthly_income_now?.toLocaleString('id-ID') || '-'}
          </div>
        </div>
        <div className="p-4 rounded-lg bg-tv-card border border-tv-border shadow-1">
          <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Estimasi Pasif Income / Tahun Saat Ini</div>
          <div className="text-xl font-bold text-tv-yellow mt-1 font-number">
            Rp {quant.est_annual_income_now?.toLocaleString('id-ID') || '-'}
          </div>
        </div>
        <div className="p-4 rounded-lg bg-tv-card border border-tv-border shadow-1">
          <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Rata-rata Dividend Yield</div>
          <div className="text-xl font-bold text-tv-text mt-1 font-number">
            {quant.average_portfolio_yield ?? '-'}%
          </div>
        </div>
        <div className="p-4 rounded-lg bg-tv-card border border-tv-border shadow-1">
          <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Modal Dibutuhkan untuk Target</div>
          <div className="text-xl font-bold text-tv-blue mt-1 font-number">
            Rp {quant.required_capital_for_target?.toLocaleString('id-ID') || '-'}
          </div>
        </div>
      </div>

      {/* Dividend Stocks Table & Compounding Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <ShieldCheck className="w-5 h-5 text-tv-green" />
            15-20 Saham Dividen IDX Terbaik & Safety Score
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px] font-semibold tracking-wide">
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
                      <span className="font-bold text-tv-text px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                        {s.ticker}
                      </span>
                    </td>
                    <td className="p-2.5 text-right text-tv-yellow font-bold font-number">{s.yield_pct}%</td>
                    <td className="p-2.5 text-right text-tv-green font-bold font-number">{s.safety_score} / 10</td>
                    <td className="p-2.5 text-right text-tv-muted font-number">{s.payout_ratio}%</td>
                    <td className="p-2.5 text-right text-tv-text font-bold font-number">{s.consistency_years} Thn</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <Repeat className="w-5 h-5 text-tv-blue" />
            Simulasi Compounding 10-Tahun (DRIP Reinvestment)
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px] font-semibold tracking-wide">
                  <th className="p-2.5">Tahun</th>
                  <th className="p-2.5 text-right">Nilai Portofolio Akhir</th>
                  <th className="p-2.5 text-right">Passive Income / Bln</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/50">
                {schedule.map((row: any) => (
                  <tr key={row.year} className="hover:bg-tv-hover/50">
                    <td className="p-2.5 font-bold text-tv-text">{row.year}</td>
                    <td className="p-2.5 text-right text-tv-green font-bold font-number">
                      Rp {row.capital_end_of_year?.toLocaleString('id-ID')}
                    </td>
                    <td className="p-2.5 text-right text-tv-yellow font-bold font-number">
                      Rp {row.monthly_passive_income?.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TickerAnalysisShell>
  );
}
