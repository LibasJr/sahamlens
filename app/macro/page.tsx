'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import { Globe, Compass } from 'lucide-react';
import { PageContainer } from '@/components/ui';

// AUDIT DATA INTEGRITY 2026-08-03 (temuan C-03): halaman ini sebelumnya memanggil
// /api/live/[ticker] (tidak pernah punya field `analysis.sector_rotation_matrix`/
// `ihsg_target`/`bi_rate_outlook`) dan merender rotasi sektor, target IHSG 12 bulan, dan
// outlook BI Rate sebagai fallback hardcoded yang SELALU aktif - tidak berubah walau
// dropdown "Kekhawatiran Utama" diganti. Dilabeli "McKinsey Macroeconomic Outlook"
// padahal McKinsey tidak pernah memproduksi angka ini. Dihapus - lihat prinsip REAL DATA
// OR NO DATA di AUDIT-DATA-INTEGRITY-2026-08-03.md.
//
// Satu-satunya data makro REAL yang tersambung di backend ini adalah kurs USD/IDR
// (modules/macro/ - di-refresh cron dari Yahoo Finance). BI Rate, inflasi, dan Fed Rate
// TIDAK punya sumber data resmi yang tersambung, jadi tidak ditampilkan sama sekali.
export default function MacroPage() {
  const [ticker, setTicker] = useState('BBCA');

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="Macroeconomic Outlook"
      />

      <PageContainer className="p-6 space-y-6">
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-400/10 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white font-heading">Outlook Makroekonomi Indonesia</h1>
            <p className="text-xs text-tv-muted font-mono">
              Analisis dampak makro (BI Rate, Fed Rate, inflasi, kurs Rupiah) terhadap emiten IDX.
            </p>
          </div>
        </div>

        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4 font-mono">
          <h3 className="font-heading text-base font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3">
            <Compass className="w-5 h-5 text-indigo-400" />
            Rotasi Sektor & Proyeksi IHSG
          </h3>
          <p className="text-xs text-tv-muted leading-relaxed">
            Data tidak tersedia. Rotasi sektor (overweight/neutral/underweight), proyeksi
            target IHSG 12 bulan, dan outlook BI Rate butuh sumber data makro resmi (BI
            Rate, inflasi, Fed Rate) yang belum tersambung di backend ini - hanya kurs
            USD/IDR yang saat ini disinkronkan (lihat modul{' '}
            <code className="text-tv-text">modules/macro/</code> dan penyesuaian mata uang
            di{' '}
            <a href="/dcf" className="text-tv-blue hover:underline">DCF Intrinsic Valuation</a>
            ). SahamLens tidak mengarang target indeks atau outlook kebijakan tanpa dasar
            data resmi.
          </p>
        </div>
      </PageContainer>
    </div>
  );
}
