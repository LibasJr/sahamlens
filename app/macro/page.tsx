'use me';
'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Globe, TrendingUp, Compass, ArrowRight, ShieldAlert, CheckCircle } from 'lucide-react';

export default function MacroPage() {
  const [economicConcern, setEconomicConcern] = useState('Suku Bunga BI Rate & Inflasi Pangan');
  const [ticker, setTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const fetchMacroAnalysis = async () => {
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
    fetchMacroAnalysis();
  }, [economicConcern]);

  const ai = data?.analysis || {};
  const rotation = ai?.sector_rotation_matrix || {};

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="McKinsey Macroeconomic & Sector Rotation Outlook"
        moduleBank="MCKINSEY & CO"
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Top Overview & Input */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-400/10 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white font-mono">Outlook Makroekonomi Indonesia & Proyeksi IHSG</h1>
              <p className="text-xs text-tv-muted font-mono">
                Analisis Dampak BI Rate, Fed Rate, Inflation Rate, & Kurs Rupiah terhadap Laba Emiten.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs w-full lg:w-auto">
            <label className="text-tv-muted whitespace-nowrap">Kekhawatiran Utama:</label>
            <select
              value={economicConcern}
              onChange={(e) => setEconomicConcern(e.target.value)}
              className="w-full lg:w-72 bg-tv-bg border border-tv-border rounded p-2 text-white font-bold focus:outline-none focus:border-tv-green"
            >
              <option value="Suku Bunga BI Rate & Inflasi Pangan">Suku Bunga BI Rate & Inflasi Pangan</option>
              <option value="Volatilitas Kurs Rupiah USD/IDR">Volatilitas Kurs Rupiah USD/IDR</option>
              <option value="Kebijakan Fed Rate & Capital Outflow">Kebijakan Fed Rate & Capital Outflow</option>
              <option value="Daya Beli Konsumen Ritel">Daya Beli Konsumen Ritel</option>
            </select>
          </div>
        </div>

        {/* Macro Summary & Target IHSG */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono">
          <div className="lg:col-span-2 bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3">
              <Compass className="w-5 h-5 text-indigo-400" />
              Rekomendasi Rotasi Sektor McKinsey Matrix
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-tv-green/10 border border-tv-green/30 space-y-2">
                <div className="text-tv-green font-bold uppercase flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-tv-green" /> OVERWEIGHT
                </div>
                <ul className="space-y-1 text-white font-medium">
                  {(rotation.overweight || ['Perbankan Big Cap', 'Consumer Goods', 'Retail']).map((s: string) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-tv-yellow/10 border border-tv-yellow/30 space-y-2">
                <div className="text-tv-yellow font-bold uppercase flex items-center gap-1">
                  <Compass className="w-4 h-4 text-tv-yellow" /> NEUTRAL
                </div>
                <ul className="space-y-1 text-white font-medium">
                  {(rotation.neutral || ['Telekomunikasi', 'Utilities']).map((s: string) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-tv-red/10 border border-tv-red/30 space-y-2">
                <div className="text-tv-red font-bold uppercase flex items-center gap-1">
                  <ShieldAlert className="w-4 h-4 text-tv-red" /> UNDERWEIGHT
                </div>
                <ul className="space-y-1 text-white font-medium">
                  {(rotation.underweight || ['Properti Komersial', 'Komoditas Batubara']).map((s: string) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white border-b border-tv-border pb-3">
              Proyeksi Target IHSG (12 Bulan)
            </h3>

            <div className="p-4 rounded-lg bg-tv-bg border border-tv-border text-center space-y-1">
              <div className="text-[10px] text-tv-muted uppercase">TARGET IHSG MCKINSEY</div>
              <div className="text-2xl font-extrabold text-tv-green">{ai.ihsg_target || '7.800 - 8.000'}</div>
              <div className="text-[10px] text-tv-muted">Dipicu oleh pelonggaran BI Rate & aliran dana asing</div>
            </div>

            <div className="p-4 rounded-lg bg-tv-bg border border-tv-border space-y-1 text-xs">
              <div className="text-tv-yellow font-bold uppercase">OUTLOOK BI RATE 6-12 BULAN</div>
              <p className="text-tv-text leading-relaxed">
                {ai.bi_rate_outlook || 'BI Rate diperkirakan memangkas 25-50 bps mengikuti pelemahan inflasi & FFR.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
