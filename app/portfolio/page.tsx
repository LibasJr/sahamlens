'use me';
'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { PieChart, User, Shield, Target, FileText, CheckCircle, ArrowRight } from 'lucide-react';

export default function PortfolioPage() {
  const [age, setAge] = useState(32);
  const [income, setIncome] = useState('Rp 25.000.000');
  const [goal, setGoal] = useState('Pensiun Jangka Panjang (10+ Tahun)');
  const [riskTolerance, setRiskTolerance] = useState('Moderat-Agresif');
  const [ticker, setTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const generatePortfolio = async () => {
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
    generatePortfolio();
  }, [age, riskTolerance]);

  const ai = data?.analysis || {};
  const alloc = ai?.asset_allocation || {};
  const instruments = ai?.recommended_idx_instruments || [];

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="BlackRock Asset Allocator & 1-Page IPS"
        moduleBank="BLACKROCK"
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Form Controls */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
            <User className="w-5 h-5 text-cyan-400" />
            Profil Investor & Parameter Keuangan
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono text-xs">
            <div>
              <label className="text-tv-muted block mb-1">Usia Investor</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full bg-tv-bg border border-tv-border rounded p-2 text-white focus:outline-none focus:border-tv-green font-bold"
              />
            </div>
            <div>
              <label className="text-tv-muted block mb-1">Penghasilan Bulanan</label>
              <input
                type="text"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                className="w-full bg-tv-bg border border-tv-border rounded p-2 text-white focus:outline-none focus:border-tv-green font-bold"
              />
            </div>
            <div>
              <label className="text-tv-muted block mb-1">Tujuan Investasi</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full bg-tv-bg border border-tv-border rounded p-2 text-white focus:outline-none focus:border-tv-green font-bold"
              />
            </div>
            <div>
              <label className="text-tv-muted block mb-1">Toleransi Risiko</label>
              <select
                value={riskTolerance}
                onChange={(e) => setRiskTolerance(e.target.value)}
                className="w-full bg-tv-bg border border-tv-border rounded p-2 text-white focus:outline-none focus:border-tv-green font-bold"
              >
                <option value="Konservatif">Konservatif</option>
                <option value="Moderat">Moderat</option>
                <option value="Moderat-Agresif">Moderat-Agresif</option>
                <option value="Agresif">Agresif</option>
              </select>
            </div>
          </div>
        </div>

        {/* Asset Allocation & Recommended Instruments */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
              <PieChart className="w-5 h-5 text-cyan-400" />
              Target Alokasi Aset (%)
            </h3>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between p-3 rounded bg-tv-bg border border-tv-border">
                <span className="text-tv-text font-bold">Saham IDX (Bluechip & Growth):</span>
                <span className="text-tv-green font-bold">{alloc.saham_idx || '55%'}</span>
              </div>
              <div className="flex justify-between p-3 rounded bg-tv-bg border border-tv-border">
                <span className="text-tv-text font-bold">SBN & Obligasi Ritel (ORI/SR):</span>
                <span className="text-cyan-400 font-bold">{alloc.sbn_obligasi || '25%'}</span>
              </div>
              <div className="flex justify-between p-3 rounded bg-tv-bg border border-tv-border">
                <span className="text-tv-text font-bold">Emas & Reksa Dana Pasar Uang:</span>
                <span className="text-tv-yellow font-bold">{alloc.emas_pasar_uang || '15%'}</span>
              </div>
              <div className="flex justify-between p-3 rounded bg-tv-bg border border-tv-border">
                <span className="text-tv-text font-bold">Kas Darurat Liquidity:</span>
                <span className="text-tv-accent font-bold">{alloc.kas_darurat || '5%'}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
              <FileText className="w-5 h-5 text-tv-green" />
              1-Page Investment Policy Statement (IPS) & Instrument Blueprint
            </h3>

            <div className="p-4 rounded-lg bg-tv-bg border border-tv-border space-y-2 font-mono text-xs">
              <div className="text-tv-green font-bold uppercase">Ringkasan Kebijakan Investasi (IPS)</div>
              <p className="text-tv-text leading-relaxed">
                {ai.ips_summary || 'Fokus pada pertumbuhan modal jangka panjang melalui kombinasi saham IDX berkualitas tinggi & instrumen pendapatan tetap SBN.'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-mono font-semibold text-tv-muted uppercase">Rekomendasi Instrumen Spesifik IDX</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                {instruments.map((ins: any, i: number) => (
                  <div key={i} className="p-3 rounded bg-tv-hover/50 border border-tv-borderLight">
                    <div className="text-[10px] text-cyan-400 font-bold">{ins.category}</div>
                    <div className="font-bold text-white mt-1">{ins.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
