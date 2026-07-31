'use me';
'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Award, Shield, CheckCircle, Star, Zap } from 'lucide-react';

export default function MoatPage() {
  const [sector, setSector] = useState('Finance');
  const [ticker, setTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const fetchMoatAnalysis = async (selectedSector: string) => {
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
    fetchMoatAnalysis(sector);
  }, [sector]);

  const ai = data?.analysis || {};
  const emitens = ai?.top_emitens || [];

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="Bain & Co Competitive Moat Analysis"
        moduleBank="BAIN & CO"
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Sector Selection Bar */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-400/10 border border-purple-400/30 text-purple-400">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Analisis Keunggulan Bersaing Sektor IDX</h1>
              <p className="text-xs text-tv-muted font-mono">
                Evaluasi Keunggulan Parit Ekonomi (Economic Moat), Pangsa Pasar, & Manajemen Emiten.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-tv-bg p-1.5 rounded-lg border border-tv-border">
            {['Finance', 'Consumer', 'Telecom', 'Energy', 'Automotive', 'Retail'].map((sec) => (
              <button
                key={sec}
                onClick={() => setSector(sec)}
                className={`px-3 py-1.5 rounded-md font-mono text-xs font-bold transition-all ${
                  sector === sec
                    ? 'bg-purple-400 text-black shadow-md'
                    : 'text-tv-text hover:bg-tv-hover hover:text-white'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>
        </div>

        {/* Top Emitens Moat Comparison Table */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
            <Shield className="w-5 h-5 text-purple-400" />
            Matriks Persaingan & Rating Moat Sektor {sector}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-tv-border bg-tv-bg text-tv-muted uppercase text-[10px]">
                  <th className="p-3">Ticker</th>
                  <th className="p-3 text-right">Market Cap</th>
                  <th className="p-3 text-right">Profit Margin</th>
                  <th className="p-3">Tipe & Keunggulan Moat</th>
                  <th className="p-3">Pangsa Pasar 3-Tahun</th>
                  <th className="p-3 text-right">Rating Manajemen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/50">
                {emitens.map((e: any) => (
                  <tr key={e.ticker} className="hover:bg-tv-hover/50">
                    <td className="p-3">
                      <span className="font-bold text-white px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                        {e.ticker}
                      </span>
                    </td>
                    <td className="p-3 text-right text-white font-bold">{e.market_cap_t}</td>
                    <td className="p-3 text-right text-tv-green font-bold">{e.rev_margin}</td>
                    <td className="p-3 text-tv-yellow font-bold">{e.moat_type}</td>
                    <td className="p-3 text-tv-text">{e.market_share_3yr}</td>
                    <td className="p-3 text-right text-tv-accent font-bold">{e.mgmt_rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 rounded-lg bg-purple-400/10 border border-purple-400/30 space-y-2 font-mono text-xs">
            <div className="text-purple-300 font-bold uppercase flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-purple-400" />
              1 SAHAM PEMENANG UTAMA & KATALIS 12 BULAN
            </div>
            <p className="text-tv-text leading-relaxed">
              {ai.swot_winner || 'BBCA adalah pemenang utama sektor keuangan dengan rasio CASA tertinggi dan digital efisiensi ekosistem.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
