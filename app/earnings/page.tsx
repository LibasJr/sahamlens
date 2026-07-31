'use me';
'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { TrendingUp, Calendar, CheckCircle2, XCircle, BarChart3, AlertCircle } from 'lucide-react';

export default function EarningsPage() {
  const [ticker, setTicker] = useState('BBCA');
  const [releaseDate, setReleaseDate] = useState('Q3 2026');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const fetchEarnings = async (symbol: string) => {
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
    fetchEarnings(ticker);
  }, [ticker]);

  const stock = data?.stock || {};
  const ai = data?.analysis || {};
  const history = ai?.beat_miss_history || [];
  const consensus = ai?.consensus || {};

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="JPMorgan Earnings Preview & LK Breakdown"
        moduleBank="JPMORGAN"
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Top Summary Banner */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white font-mono">{stock.symbol || ticker}.JK Earnings Preview</h1>
              <p className="text-xs text-tv-muted font-mono flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-tv-yellow" />
                Jadwal Rilis Laporan Keuangan: <strong className="text-white">{ai.earnings_release_date || 'Q3 2026'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 font-mono">
            <div>
              <div className="text-[10px] text-tv-muted uppercase">KONSENSUS REVENUE</div>
              <div className="text-lg font-bold text-white">{consensus.revenue_est_trillion || 'Rp 24.8 T'}</div>
            </div>
            <div>
              <div className="text-[10px] text-tv-muted uppercase">KONSENSUS LABA BERSIH</div>
              <div className="text-lg font-extrabold text-tv-green">{consensus.net_profit_est_trillion || 'Rp 5.2 T'}</div>
            </div>
          </div>
        </div>

        {/* 4-Quarter Beat / Miss History Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              Riwayat Beat / Miss Earnings 4 Kuartal Terakhir
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px]">
                    <th className="p-3">Kuartal</th>
                    <th className="p-3 text-right">EPS Aktual</th>
                    <th className="p-3 text-right">EPS Konsensus</th>
                    <th className="p-3 text-right">Hasil Beat / Miss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border/50">
                  {history.map((h: any, i: number) => (
                    <tr key={i} className="hover:bg-tv-hover/50">
                      <td className="p-3 font-bold text-white">{h.quarter}</td>
                      <td className="p-3 text-right text-tv-green font-bold">{h.eps_actual}</td>
                      <td className="p-3 text-right text-tv-muted">{h.eps_estimate}</td>
                      <td className="p-3 text-right">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          h.result.includes('BEAT')
                            ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                            : 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                        }`}>
                          {h.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bull & Bear Cases Scenario */}
          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4 font-mono text-xs">
            <h3 className="text-base font-bold text-white border-b border-tv-border pb-3">
              Skenario Reaksi Pasar & Bull / Bear Case Pasca Rilis
            </h3>

            <div className="p-4 rounded-lg bg-tv-green/10 border border-tv-green/30 space-y-1">
              <div className="text-tv-green font-bold uppercase flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-tv-green" />
                BULL CASE SCENARIO
              </div>
              <p className="text-tv-text leading-relaxed">
                {ai.bull_case || 'Pertumbuhan Revenue di atas ekspektasi mendorong kenaikan harga +4% hingga +6%.'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-tv-red/10 border border-tv-red/30 space-y-1">
              <div className="text-tv-red font-bold uppercase flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-tv-red" />
                BEAR CASE SCENARIO
              </div>
              <p className="text-tv-text leading-relaxed">
                {ai.bear_case || 'Jika margin tertekan di bawah konsensus, berpotensi profit taking hingga -3%.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
