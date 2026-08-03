'use client';

import React, { useState } from 'react';
import { Cpu, Sparkles } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { SegmentedControl } from '@/components/ui';

const PERIODS = ['1 Tahun', '3 Tahun', '5 Tahun', '10 Tahun'];

// AUDIT DATA INTEGRITY 2026-08-03 (temuan C-03): halaman ini sebelumnya memanggil
// /api/live/[ticker] (tidak pernah punya field `analysis.seasonal_patterns`) dan
// merender statistik musiman/probabilitas hardcoded ("85% Win Rate", "76.5%", "Rabu &
// Jumat net buy asing terbesar") sebagai fallback yang SELALU aktif - tidak satu pun
// dihitung dari backtest sungguhan, dilabeli "Renaissance Quant Edge" padahal Renaissance
// Technologies tidak pernah memproduksi angka ini. Dihapus - lihat prinsip REAL DATA OR
// NO DATA di AUDIT-DATA-INTEGRITY-2026-08-03.md.
export default function PatternPage() {
  const [ticker, setTicker] = useState('BBCA');
  const [period, setPeriod] = useState('5 Tahun');

  return (
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="Statistical Anomaly & Seasonal Patterns"
      icon={<Cpu className="w-6 h-6" />}
      accent="pink"
      title={`${ticker}.JK Statistical Anomaly & Seasonal Edge`}
      subtitle="Model Kuantitatif & Anomali Perilaku Harga Berdasarkan Data Historis"
      headerExtra={<SegmentedControl options={PERIODS.map((p) => ({ label: p, value: p }))} value={period} onChange={setPeriod} layoutId="pattern-period" />}
    >
      <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
        <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
          <Sparkles className="w-5 h-5 text-pink-400" />
          Keunggulan Statistik (Quant Statistical Edge)
        </h3>

        <p className="text-xs text-tv-muted leading-relaxed">
          Data tidak tersedia. Statistik musiman (window dressing, efek Ramadan/Lebaran,
          January effect) dan probabilitas anomali harga butuh backtest historis
          per-saham yang belum tersambung di backend ini - SahamLens tidak menampilkan
          win-rate atau probabilitas yang tidak pernah dihitung. Untuk simulasi strategi
          berbasis data historis riil, lihat{' '}
          <a href="/backtest" className="text-tv-blue hover:underline">Backtest</a>.
        </p>
      </div>
    </TickerAnalysisShell>
  );
}
