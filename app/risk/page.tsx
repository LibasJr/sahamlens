'use me';
'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { ShieldAlert, Activity, PieChart, Plus, Trash2, Zap, AlertTriangle, CheckCircle } from 'lucide-react';

export default function RiskPage() {
  const [ticker, setTicker] = useState('BBCA');
  const [portfolio, setPortfolio] = useState([
    { ticker: 'BBCA', weight: 30 },
    { ticker: 'BBRI', weight: 25 },
    { ticker: 'TLKM', weight: 20 },
    { ticker: 'ASII', weight: 15 },
    { ticker: 'GOTO', weight: 10 }
  ]);
  const [newTicker, setNewTicker] = useState('');
  const [newWeight, setNewWeight] = useState(10);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const runRiskAnalysis = async () => {
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
    runRiskAnalysis();
  }, [portfolio]);

  const addPosition = () => {
    if (newTicker.trim()) {
      setPortfolio([...portfolio, { ticker: newTicker.trim().toUpperCase(), weight: Number(newWeight) }]);
      setNewTicker('');
    }
  };

  const removePosition = (idx: number) => {
    setPortfolio(portfolio.filter((_, i) => i !== idx));
  };

  const quant = data?.quant || {};
  const ai = data?.analysis || {};
  const stress = quant?.stress_test || {};
  const sectorMap = quant?.sector_concentration || {};

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="Bridgewater Risk Matrix & Stress Testing"
        moduleBank="BRIDGEWATER"
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Portfolio Input & Management Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
              <PieChart className="w-5 h-5 text-red-400" />
              Alokasi Portofolio User (%)
            </h3>

            {/* List of Tickers */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {portfolio.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-tv-bg border border-tv-border font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                      {item.ticker}
                    </span>
                    <span className="text-tv-text font-bold">{item.weight}%</span>
                  </div>
                  <button
                    onClick={() => removePosition(idx)}
                    className="p-1 text-tv-muted hover:text-tv-red transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Position Form */}
            <div className="pt-2 border-t border-tv-border flex items-center gap-2">
              <input
                type="text"
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                placeholder="Ticker (cth: BMRI)"
                className="w-1/2 bg-tv-bg border border-tv-border rounded p-2 text-xs font-mono text-white focus:outline-none focus:border-tv-green"
              />
              <input
                type="number"
                value={newWeight}
                onChange={(e) => setNewWeight(Number(e.target.value))}
                placeholder="%"
                className="w-1/4 bg-tv-bg border border-tv-border rounded p-2 text-xs font-mono text-white focus:outline-none focus:border-tv-green"
              />
              <button
                onClick={addPosition}
                className="w-1/4 p-2 bg-tv-green hover:bg-tv-greenHover text-white rounded text-xs font-mono font-bold flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" /> Tambah
              </button>
            </div>
          </div>

          {/* Stress Testing Results */}
          <div className="lg:col-span-2 bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3 font-mono">
              <Activity className="w-5 h-5 text-tv-yellow" />
              Hasil Stress Test IHSG Crash & Makro Indonesia
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-lg bg-tv-bg border border-tv-border font-mono">
                <div className="text-[10px] text-tv-muted">IHSG DROPS -5%</div>
                <div className="text-lg font-bold text-tv-red">{stress.ihsg_minus_5pct || '-5.75'}%</div>
                <div className="text-[10px] text-tv-muted mt-1">Estimasi penurunan portofolio</div>
              </div>
              <div className="p-3.5 rounded-lg bg-tv-bg border border-tv-border font-mono">
                <div className="text-[10px] text-tv-muted">IHSG CRASH -10%</div>
                <div className="text-lg font-bold text-tv-red">{stress.ihsg_minus_10pct_crash || '-12.5'}%</div>
                <div className="text-[10px] text-tv-muted mt-1">Skenario Panik Pasar</div>
              </div>
              <div className="p-3.5 rounded-lg bg-tv-bg border border-tv-border font-mono">
                <div className="text-[10px] text-tv-muted">BI RATE HIKE +50BPS</div>
                <div className="text-lg font-bold text-tv-yellow">{stress.bi_rate_hike_50bps || '-4.2'}%</div>
                <div className="text-[10px] text-tv-muted mt-1">Ketatnya Likuiditas Perbankan</div>
              </div>
              <div className="p-3.5 rounded-lg bg-tv-bg border border-tv-border font-mono">
                <div className="text-[10px] text-tv-muted">USD/IDR Rp 16.500</div>
                <div className="text-lg font-bold text-tv-yellow">{stress.rupiah_depreciation_usd16500 || '-6.8'}%</div>
                <div className="text-[10px] text-tv-muted mt-1">Capital Outflow Asing</div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="p-4 rounded-lg bg-tv-bg border border-tv-border space-y-2 font-mono text-xs">
              <div className="text-tv-yellow font-bold uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-tv-yellow" />
                Rekomendasi Hedging & Rebalancing Bridgewater
              </div>
              <p className="text-tv-text leading-relaxed">
                {quant.recommended_hedging || 'Alokasikan 15-20% ke SBN / Emas untuk meredam volatilitas portofolio.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
