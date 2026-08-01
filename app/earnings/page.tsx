'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, CheckCircle2, XCircle, BarChart3 } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';

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
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="JPMorgan Earnings Preview & LK Breakdown"
      moduleBank="JPMORGAN"
      icon={<TrendingUp className="w-6 h-6" />}
      accent="green"
      title={`${stock.symbol || ticker}.JK Earnings Preview`}
      subtitle={
        <span className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-tv-yellow" />
          Jadwal Rilis Laporan Keuangan: <strong className="text-tv-text">{ai.earnings_release_date || 'Q3 2026'}</strong>
        </span>
      }
      headerExtra={
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Konsensus Revenue</div>
            <div className="text-lg font-bold text-tv-text font-number">{consensus.revenue_est_trillion || 'Rp 24.8 T'}</div>
          </div>
          <div>
            <div className="text-[10px] text-tv-muted uppercase font-semibold tracking-wide">Konsensus Laba Bersih</div>
            <div className="text-lg font-extrabold text-tv-green font-number">{consensus.net_profit_est_trillion || 'Rp 5.2 T'}</div>
          </div>
        </div>
      }
    >
      {/* 4-Quarter Beat / Miss History Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <BarChart3 className="w-5 h-5 text-tv-green" />
            Riwayat Beat / Miss Earnings 4 Kuartal Terakhir
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-tv-border text-tv-muted uppercase text-[10px] font-semibold tracking-wide">
                  <th className="p-3">Kuartal</th>
                  <th className="p-3 text-right">EPS Aktual</th>
                  <th className="p-3 text-right">EPS Konsensus</th>
                  <th className="p-3 text-right">Hasil Beat / Miss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/50">
                {history.map((h: any, i: number) => (
                  <tr key={i} className="hover:bg-tv-hover/50">
                    <td className="p-3 font-bold text-tv-text">{h.quarter}</td>
                    <td className="p-3 text-right text-tv-green font-bold font-number">{h.eps_actual}</td>
                    <td className="p-3 text-right text-tv-muted font-number">{h.eps_estimate}</td>
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
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4 text-xs">
          <h3 className="font-heading text-base font-bold text-tv-text border-b border-tv-border pb-3">
            Skenario Reaksi Pasar & Bull / Bear Case Pasca Rilis
          </h3>

          <div className="p-4 rounded-lg bg-tv-green/10 border border-tv-green/30 space-y-1">
            <div className="text-tv-green font-bold uppercase flex items-center gap-1.5 tracking-wide">
              <CheckCircle2 className="w-4 h-4 text-tv-green" />
              Bull Case Scenario
            </div>
            <p className="text-tv-text leading-relaxed">
              {ai.bull_case || 'Pertumbuhan Revenue di atas ekspektasi mendorong kenaikan harga +4% hingga +6%.'}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-tv-red/10 border border-tv-red/30 space-y-1">
            <div className="text-tv-red font-bold uppercase flex items-center gap-1.5 tracking-wide">
              <XCircle className="w-4 h-4 text-tv-red" />
              Bear Case Scenario
            </div>
            <p className="text-tv-text leading-relaxed">
              {ai.bear_case || 'Jika margin tertekan di bawah konsensus, berpotensi profit taking hingga -3%.'}
            </p>
          </div>
        </div>
      </div>
    </TickerAnalysisShell>
  );
}
