'use client';

import React, { useState, useEffect } from 'react';
import { Award, Shield, Zap } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { SegmentedControl } from '@/components/ui';

const SECTORS = ['Finance', 'Consumer', 'Telecom', 'Energy', 'Automotive', 'Retail'];

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
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="Bain & Co Competitive Moat Analysis"
      moduleBank="BAIN & CO"
      icon={<Award className="w-6 h-6" />}
      accent="purple"
      title="Analisis Keunggulan Bersaing Sektor IDX"
      subtitle="Evaluasi Keunggulan Parit Ekonomi (Economic Moat), Pangsa Pasar, & Manajemen Emiten"
      headerExtra={<SegmentedControl options={SECTORS.map((s) => ({ label: s, value: s }))} value={sector} onChange={setSector} layoutId="moat-sector" />}
    >
      {/* Top Emitens Moat Comparison Table */}
      <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
        <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
          <Shield className="w-5 h-5 text-tv-purple" />
          Matriks Persaingan & Rating Moat Sektor {sector}
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-tv-border bg-tv-bg text-tv-muted uppercase text-[10px] font-semibold tracking-wide">
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
                    <span className="font-bold text-tv-text px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                      {e.ticker}
                    </span>
                  </td>
                  <td className="p-3 text-right text-tv-text font-bold font-number">{e.market_cap_t}</td>
                  <td className="p-3 text-right text-tv-green font-bold font-number">{e.rev_margin}</td>
                  <td className="p-3 text-tv-yellow font-bold">{e.moat_type}</td>
                  <td className="p-3 text-tv-text">{e.market_share_3yr}</td>
                  <td className="p-3 text-right text-tv-blue font-bold">{e.mgmt_rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 rounded-lg bg-tv-purple/10 border border-tv-purple/30 space-y-2 text-xs">
          <div className="text-tv-purple font-bold uppercase flex items-center gap-1.5 tracking-wide">
            <Zap className="w-4 h-4 text-tv-purple" />
            1 Saham Pemenang Utama & Katalis 12 Bulan
          </div>
          <p className="text-tv-text leading-relaxed">
            {ai.swot_winner || 'BBCA adalah pemenang utama sektor keuangan dengan rasio CASA tertinggi dan digital efisiensi ekosistem.'}
          </p>
        </div>
      </div>
    </TickerAnalysisShell>
  );
}
