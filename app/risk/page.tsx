'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Activity, PieChart, Plus, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { Input, Button } from '@/components/ui';

// AUDIT DATA INTEGRITY 2026-08-03 (temuan M-09): 4 kartu stress test di halaman ini
// SEBELUMNYA angka TETAP ("-5.75%", "-12.5%", "-4.2%", "-6.8%") - halaman sudah jujur
// mengakui ini lewat disclaimer ("belum dihitung dari portofolio Anda"), tapi angkanya
// sendiri tetap karangan, tidak pernah berubah walau alokasi diedit. Sekarang memanggil
// /api/risk-analysis yang menghitung BETA HISTORIS riil (regresi return harian 1 tahun,
// data Yahoo Finance) tiap saham terhadap IHSG dan kurs USD/IDR, dibobot alokasi
// portofolio pengguna. BI Rate TETAP tidak ditampilkan sebagai angka - aplikasi ini
// tidak punya data historis BI Rate, jadi endpoint mengembalikan status "tidak
// tersedia" dan itu yang ditampilkan, bukan angka tebakan.
interface RiskAnalysisResult {
  portfolioBetaIhsg: number | null;
  portfolioBetaUsdIdr: number | null;
  scenarios: {
    ihsgDrop5Pct: number | null;
    ihsgDrop10Pct: number | null;
    usdIdrWeaken1Pct: number | null;
  };
  biRateAvailable: boolean;
}

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
  const [analysis, setAnalysis] = useState<RiskAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    if (portfolio.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Gagal menghitung analisis risiko');
        setAnalysis(null);
        return;
      }
      setAnalysis(json);
    } catch (e) {
      setError('Gagal menghubungi server analisis risiko');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [portfolio]);

  useEffect(() => {
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPosition = () => {
    if (newTicker.trim()) {
      setPortfolio([...portfolio, { ticker: newTicker.trim().toUpperCase(), weight: Number(newWeight) }]);
      setNewTicker('');
    }
  };

  const removePosition = (idx: number) => {
    setPortfolio(portfolio.filter((_, i) => i !== idx));
  };

  const fmtPct = (v: number | null) => (v == null ? 'N/A' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);

  return (
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="Risk Matrix & Stress Testing"
      icon={<ShieldAlert className="w-6 h-6" />}
      accent="red"
      title="Risk Matrix & Stress Testing Portofolio"
      subtitle="Beta historis 1 tahun (regresi return harian terhadap IHSG & USD/IDR, data Yahoo Finance) - dihitung dari komposisi portofolio Anda"
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

          <Button size="sm" variant="secondary" onClick={runAnalysis} disabled={loading} className="w-full">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Menghitung...' : 'Hitung Ulang Beta Portofolio'}
          </Button>
        </div>

        {/* Stress Testing Results */}
        <div className="lg:col-span-2 bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <Activity className="w-5 h-5 text-tv-yellow" />
            Hasil Stress Test (Beta Historis Portofolio)
          </h3>

          {error && (
            <div className="p-3 rounded-md bg-tv-red/10 border border-tv-red/30 text-xs text-tv-red">{error}</div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">IHSG Drops -5%</div>
              <div className="text-lg font-bold text-tv-red font-number">{fmtPct(analysis?.scenarios.ihsgDrop5Pct ?? null)}</div>
              <div className="text-[10px] text-tv-muted mt-1">Beta portofolio x -5%</div>
            </div>
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">IHSG Crash -10%</div>
              <div className="text-lg font-bold text-tv-red font-number">{fmtPct(analysis?.scenarios.ihsgDrop10Pct ?? null)}</div>
              <div className="text-[10px] text-tv-muted mt-1">Beta portofolio x -10%</div>
            </div>
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">USD/IDR Melemah 1%</div>
              <div className="text-lg font-bold text-tv-yellow font-number">{fmtPct(analysis?.scenarios.usdIdrWeaken1Pct ?? null)}</div>
              <div className="text-[10px] text-tv-muted mt-1">Beta portofolio vs USDIDR=X</div>
            </div>
          </div>

          <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border text-xs text-tv-muted">
            <span className="font-bold text-tv-text">BI Rate Hike:</span> Data tidak tersedia - SahamLens belum
            memiliki sumber data historis BI Rate untuk menghitung sensitivitas riil (lihat{' '}
            <code className="text-tv-text">modules/macro/</code>, hanya kurs USD/IDR yang tersinkronkan). Angka
            sensitivitas BI Rate tidak ditampilkan supaya tidak mengarang.
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted uppercase">Beta Portofolio vs IHSG</div>
              <div className="text-tv-text font-bold font-number mt-1">{analysis?.portfolioBetaIhsg ?? 'N/A'}</div>
            </div>
            <div className="p-3 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted uppercase">Beta Portofolio vs USD/IDR</div>
              <div className="text-tv-text font-bold font-number mt-1">{analysis?.portfolioBetaUsdIdr ?? 'N/A'}</div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-tv-bg border border-tv-border space-y-2 text-xs">
            <div className="text-tv-yellow font-bold uppercase flex items-center gap-1.5 tracking-wide">
              <AlertTriangle className="w-4 h-4 text-tv-yellow" />
              Metodologi
            </div>
            <p className="text-tv-muted leading-relaxed">
              Beta dihitung dari regresi return harian 1 tahun tiap saham terhadap IHSG/USD=X (data historis Yahoo
              Finance), dibobot alokasi portofolio Anda. Ini estimasi statistik dari histori masa lalu, bukan
              jaminan pergerakan yang akan terjadi.
            </p>
          </div>
        </div>
      </div>
    </TickerAnalysisShell>
  );
}
