'use client';

import React, { useState } from 'react';
import { Award, Shield } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import { SegmentedControl } from '@/components/ui';

const SECTORS = ['Finance', 'Consumer', 'Telecom', 'Energy', 'Automotive', 'Retail'];

// AUDIT DATA INTEGRITY 2026-08-03 (temuan C-03): halaman ini sebelumnya memanggil
// /api/live/[ticker] (yang tidak pernah punya field `analysis.top_emitens`/`swot_winner`)
// dan merender tabel yang SELALU kosong plus satu kalimat kesimpulan hardcoded ("BBCA
// adalah pemenang utama sektor keuangan...") yang tidak pernah berubah walau sektor
// diganti, dilabeli "Bain & Co Competitive Moat Analysis" padahal Bain & Co tidak pernah
// memproduksi analisis ini. Dihapus - lihat prinsip REAL DATA OR NO DATA di
// AUDIT-DATA-INTEGRITY-2026-08-03.md.
export default function MoatPage() {
  const [sector, setSector] = useState('Finance');
  const [ticker, setTicker] = useState('BBCA');

  return (
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="Competitive Moat Analysis"
      icon={<Award className="w-6 h-6" />}
      accent="purple"
      title="Analisis Keunggulan Bersaing Sektor IDX"
      subtitle="Evaluasi Keunggulan Parit Ekonomi (Economic Moat), Pangsa Pasar, & Manajemen Emiten"
      headerExtra={<SegmentedControl options={SECTORS.map((s) => ({ label: s, value: s }))} value={sector} onChange={setSector} layoutId="moat-sector" />}
    >
      <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
        <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
          <Shield className="w-5 h-5 text-tv-purple" />
          Matriks Persaingan & Rating Moat Sektor {sector}
        </h3>

        <p className="text-xs text-tv-muted leading-relaxed">
          Data tidak tersedia. Penilaian moat kualitatif (pangsa pasar, rating manajemen,
          perbandingan antar-emiten) butuh riset ekuitas berlisensi yang belum tersambung
          di backend ini - SahamLens tidak mengarang penilaian kualitatif tanpa dasar data.
          Untuk proxy kuantitatif moat (ROE + gross margin), lihat kolom &quot;Moat&quot;
          di{' '}
          <a href="/screener" className="text-tv-blue hover:underline">Stock Screener</a>.
        </p>
      </div>
    </TickerAnalysisShell>
  );
}
