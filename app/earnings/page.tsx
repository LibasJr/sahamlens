'use client';

import React, { useState } from 'react';
import { TrendingUp, Calendar, BarChart3 } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';

// AUDIT DATA INTEGRITY 2026-08-03 (temuan C-03): halaman ini sebelumnya memanggil
// /api/live/[ticker] (yang HANYA mengembalikan { price, changePercent, volume }, tidak
// pernah punya field `analysis`/`stock.symbol`) lalu merender literal karangan
// ("Konsensus Revenue: Rp 24.8 T", "kenaikan harga +4% hingga +6%", dst.) sebagai
// fallback `|| '...'` yang SELALU aktif untuk 100% request. Halaman juga dilabeli
// "JPMorgan Earnings Preview" padahal JPMorgan tidak pernah memproduksi angka ini.
//
// Aplikasi ini TIDAK punya sumber data konsensus analis (estimasi revenue/laba,
// riwayat beat/miss EPS per kuartal) - Yahoo Finance tidak menyediakannya gratis untuk
// emiten IDX. Sesuai prinsip REAL DATA OR NO DATA, halaman ini sekarang jujur
// menyatakan keterbatasannya alih-alih menampilkan angka karangan.
export default function EarningsPage() {
  const [ticker, setTicker] = useState('BBCA');

  return (
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="Earnings Preview & LK Breakdown"
      icon={<TrendingUp className="w-6 h-6" />}
      accent="green"
      title={`${ticker}.JK Earnings Preview`}
      subtitle={
        <span className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-tv-yellow" />
          Jadwal rilis & konsensus analis - lihat tanggal riil di{' '}
          <a href="/calendar" className="text-tv-blue hover:underline">Corporate Calendar</a>
        </span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <BarChart3 className="w-5 h-5 text-tv-green" />
            Riwayat Beat / Miss Earnings
          </h3>
          <p className="text-xs text-tv-muted leading-relaxed">
            Data tidak tersedia. SahamLens belum memiliki sumber data konsensus analis
            (estimasi EPS per kuartal) untuk emiten IDX - Yahoo Finance tidak menyediakan
            data ini secara gratis. Fitur ini akan diaktifkan begitu sumber data resmi
            tersambung, bukan ditampilkan dengan angka perkiraan.
          </p>
        </div>

        <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 space-y-4 text-xs">
          <h3 className="font-heading text-base font-bold text-tv-text border-b border-tv-border pb-3">
            Skenario Reaksi Pasar Pasca Rilis
          </h3>
          <p className="text-tv-muted leading-relaxed">
            Data tidak tersedia - skenario bull/bear case butuh estimasi konsensus revenue
            & laba bersih yang belum tersambung di backend ini. Untuk analisis fundamental
            riil saham ini, lihat{' '}
            <a href={`/fundamental?symbol=${ticker}`} className="text-tv-blue hover:underline">
              LensFundamental
            </a>.
          </p>
        </div>
      </div>
    </TickerAnalysisShell>
  );
}
