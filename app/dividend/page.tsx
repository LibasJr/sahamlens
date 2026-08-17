'use client';

import React, { useState, useEffect } from 'react';
import { Coins, ShieldCheck, Repeat } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { Input } from '@/components/ui';
import PaywallModal from '@/components/PaywallModal';
import { MONTHLY_PRICE, formatRupiah } from '@/shared/config/pricing';

export default function DividendPage() {
  const [capital, setCapital] = useState(200_000_000);
  const [targetMonthly, setTargetMonthly] = useState(10_000_000);
  const [ticker, setTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

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
      // 402 = butuh Pro. Tampilkan modal upgrade (jalan keluar yang bisa ditindaklanjuti),
      // bukan teks error merah yang jadi jalan buntu seperti kegagalan teknis.
      if (res.status === 402 || json?.code === 'SUBSCRIPTION_REQUIRED') {
        setShowPaywall(true);
        setData(null);
        return;
      }
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
    // Ketikan angka tidak perlu mengirim satu request untuk setiap digit. Nilai nol
    // sementara saat field dikosongkan juga bukan simulasi yang bermakna.
    if (capital <= 0 || targetMonthly < 0) return;
    const timeout = window.setTimeout(fetchDividendPlan, 500);
    return () => window.clearTimeout(timeout);
  }, [capital, targetMonthly]);

  const quant = data?.quant || {};
  const stocks = quant?.div_stocks || [];
  const schedule = quant?.compounding_schedule || [];
  const [aristocratFilter, setAristocratFilter] = useState<'all' | 'aristocrats'>('all');

  const filteredStocks = React.useMemo(() => {
    if (aristocratFilter === 'aristocrats') {
      return stocks.filter((s: any) => s.is_aristocrat);
    }
    return stocks;
  }, [stocks, aristocratFilter]);

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

      {/* Metric Cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-tv-card border border-tv-border rounded-lg p-4 shadow-1">
            <div className="text-[11px] text-tv-muted uppercase font-semibold">Rata-Rata Yield Portfolio</div>
            <div className="text-2xl font-bold text-tv-yellow font-number mt-1">
              {quant.average_portfolio_yield}%
            </div>
            <div className="text-[11px] text-tv-muted mt-0.5">Dari {stocks.length} saham dividen IDX</div>
          </div>

          <div className="bg-tv-card border border-tv-border rounded-lg p-4 shadow-1">
            <div className="text-[11px] text-tv-muted uppercase font-semibold">Est. Pasif Income / Bulan</div>
            <div className="text-2xl font-bold text-tv-green font-number mt-1">
              Rp {quant.est_monthly_income_now?.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-tv-muted mt-0.5">Modal Rp {capital.toLocaleString('id-ID')}</div>
          </div>

          <div className="bg-tv-card border border-tv-border rounded-lg p-4 shadow-1">
            <div className="text-[11px] text-tv-muted uppercase font-semibold">Est. Pasif Income / Tahun</div>
            <div className="text-2xl font-bold text-tv-blue font-number mt-1">
              Rp {quant.est_annual_income_now?.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-tv-muted mt-0.5">Total cash flow tahunan</div>
          </div>

          <div className="bg-tv-card border border-tv-border rounded-lg p-4 shadow-1">
            <div className="text-[11px] text-tv-muted uppercase font-semibold">Modal Butuh Untuk Target</div>
            <div className="text-2xl font-bold text-tv-text font-number mt-1">
              Rp {quant.required_capital_for_target?.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-tv-muted mt-0.5">Untuk Rp {targetMonthly.toLocaleString('id-ID')}/bln</div>
          </div>
        </div>
      )}

      {/* Dividend Stocks Table & Compounding Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-tv-border pb-3">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-tv-green" />
              Saham Dividen IDX Terbaik
            </h3>

            {/* Filter Toggle */}
            <div className="flex items-center gap-1 bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.06] text-[11px]">
              <button
                type="button"
                onClick={() => setAristocratFilter('all')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                  aristocratFilter === 'all'
                    ? 'bg-tv-blue text-white shadow-sm'
                    : 'text-tv-muted hover:text-white'
                }`}
              >
                Semua ({stocks.length})
              </button>
              <button
                type="button"
                onClick={() => setAristocratFilter('aristocrats')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${
                  aristocratFilter === 'aristocrats'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-tv-muted hover:text-amber-300'
                }`}
              >
                <span>👑</span> Aristocrats ({stocks.filter((s: any) => s.is_aristocrat).length})
              </button>
            </div>
          </div>

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
                {filteredStocks.map((s: any) => (
                  <tr key={s.ticker} className="hover:bg-tv-hover/50">
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-tv-text px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                          {s.ticker}
                        </span>
                        {s.is_aristocrat && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-300">
                            👑 Aristocrat
                          </span>
                        )}
                      </div>
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
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Fitur Pro"
        body={`Dividend Compounding Planner termasuk paket Pro. Upgrade mulai ${formatRupiah(MONTHLY_PRICE)}/bulan untuk membuka simulasi cash flow dividen lengkap.`}
        benefits={[
          'Simulasi compounding & DRIP multi-tahun',
          'Universe saham dividen IDX terlikuid',
          'Seluruh modul Pro lain ikut terbuka',
        ]}
      />
    </TickerAnalysisShell>
  );
}
