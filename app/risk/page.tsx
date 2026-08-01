'use client';

import React, { useState } from 'react';
import { ShieldAlert, Activity, PieChart, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { Input, Button } from '@/components/ui';

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

  const addPosition = () => {
    if (newTicker.trim()) {
      setPortfolio([...portfolio, { ticker: newTicker.trim().toUpperCase(), weight: Number(newWeight) }]);
      setNewTicker('');
    }
  };

  const removePosition = (idx: number) => {
    setPortfolio(portfolio.filter((_, i) => i !== idx));
  };

  return (
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="Council AI Risk Matrix & Stress Testing"
      moduleBank="COUNCIL AI"
      icon={<ShieldAlert className="w-6 h-6" />}
      accent="red"
      title="Risk Matrix & Stress Testing Portofolio"
      subtitle="Estimasi ilustratif skenario makro Indonesia (belum dihitung dari komposisi portofolio Anda)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <PieChart className="w-5 h-5 text-tv-red" />
            Alokasi Portofolio User (%)
          </h3>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {portfolio.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 rounded-md bg-tv-bg border border-tv-border text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-tv-text px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                    {item.ticker}
                  </span>
                  <span className="text-tv-text font-bold font-number">{item.weight}%</span>
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

          <div className="pt-2 border-t border-tv-border flex items-end gap-2">
            <Input
              size="sm"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              placeholder="Ticker (cth: BMRI)"
              className="flex-1"
            />
            <Input
              size="sm"
              type="number"
              value={newWeight}
              onChange={(e) => setNewWeight(Number(e.target.value))}
              placeholder="%"
              className="w-16 font-number"
            />
            <Button size="sm" variant="success" onClick={addPosition}>
              <Plus className="w-4 h-4" /> Tambah
            </Button>
          </div>
        </div>

        {/* Stress Testing Results */}
        <div className="lg:col-span-2 bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <Activity className="w-5 h-5 text-tv-yellow" />
            Hasil Stress Test IHSG Crash & Makro Indonesia
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">IHSG Drops -5%</div>
              <div className="text-lg font-bold text-tv-red font-number">-5.75%</div>
              <div className="text-[10px] text-tv-muted mt-1">Estimasi generik, bukan portofolio Anda</div>
            </div>
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">IHSG Crash -10%</div>
              <div className="text-lg font-bold text-tv-red font-number">-12.5%</div>
              <div className="text-[10px] text-tv-muted mt-1">Skenario Panik Pasar</div>
            </div>
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">BI Rate Hike +50bps</div>
              <div className="text-lg font-bold text-tv-yellow font-number">-4.2%</div>
              <div className="text-[10px] text-tv-muted mt-1">Ketatnya Likuiditas Perbankan</div>
            </div>
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">USD/IDR Rp 16.500</div>
              <div className="text-lg font-bold text-tv-yellow font-number">-6.8%</div>
              <div className="text-[10px] text-tv-muted mt-1">Capital Outflow Asing</div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-tv-bg border border-tv-border space-y-2 text-xs">
            <div className="text-tv-yellow font-bold uppercase flex items-center gap-1.5 tracking-wide">
              <AlertTriangle className="w-4 h-4 text-tv-yellow" />
              Rekomendasi Hedging & Rebalancing Council AI
            </div>
            <p className="text-tv-text leading-relaxed">
              Alokasikan 15-20% ke SBN / Emas untuk meredam volatilitas portofolio.
            </p>
            <p className="text-tv-muted italic">
              Catatan: angka di atas adalah estimasi generik pasar IHSG, belum dihitung
              berdasarkan komposisi aset & bobot portofolio Anda di panel kiri.
            </p>
          </div>
        </div>
      </div>
    </TickerAnalysisShell>
  );
}
