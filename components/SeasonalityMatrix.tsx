'use client';

import React, { useMemo } from 'react';
import { Calendar, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import {
  calculateMonthlySeasonality,
  MONTH_NAMES_SHORT,
  type SeasonalityCandle,
  type SeasonalitySummary,
} from '@/lib/utils/seasonality';

interface SeasonalityMatrixProps {
  /** WAJIB membawa `adjClose`. Return musiman dihitung dari basis total return saja -
   * lihat catatan temuan H-03 di lib/utils/seasonality.ts. */
  candles: SeasonalityCandle[];
  ticker: string;
}

export function SeasonalityMatrix({ candles, ticker }: SeasonalityMatrixProps) {
  const data: SeasonalitySummary = useMemo(() => {
    return calculateMonthlySeasonality(candles);
  }, [candles]);

  if (!data) return null;

  // Adjusted close tidak tersedia -> nyatakan apa adanya, jangan diam-diam menghitung
  // dari harga perdagangan (temuan H-03). Komponen ini sebelumnya mengembalikan `null`
  // untuk matriks kosong; sekarang alasan kosongnya ikut sampai ke pengguna.
  if (data.basis === 'UNAVAILABLE') {
    return (
      <Card variant="default" padding="lg" className="border-tv-border bg-tv-card shadow-2">
        <CardHeader className="flex items-center gap-2.5 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tv-blue/10 border border-tv-blue/20 text-tv-blue">
            <Calendar className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm">Pola Musiman Bulanan</CardTitle>
        </CardHeader>
        <p className="flex items-start gap-2 text-xs text-tv-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{data.unavailableReason}</span>
        </p>
      </Card>
    );
  }

  if (data.matrix.length === 0) return null;

  const getCellColor = (val: number | null) => {
    if (val === null) return 'text-tv-muted/30 bg-transparent';
    if (val > 10) return 'bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 font-bold border border-emerald-500/30';
    if (val >= 3) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold';
    if (val > 0) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400/90';
    if (val === 0) return 'bg-tv-hover text-tv-muted';
    if (val >= -3) return 'bg-rose-500/10 text-rose-600 dark:text-rose-400/90';
    if (val >= -10) return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold';
    return 'bg-rose-500/25 text-rose-600 dark:text-rose-300 font-bold border border-rose-500/30';
  };

  const cleanTicker = ticker.replace('.JK', '');

  return (
    <Card variant="default" padding="lg" className="border-tv-border bg-tv-card shadow-2">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tv-blue/10 border border-tv-blue/20 text-tv-blue">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-tv-text">
              Kinerja Musiman Bulanan ({cleanTicker})
            </CardTitle>
            <p className="text-xs text-tv-muted">
              Distribusi return historis bulanan & frekuensi bulan positif (Win Rate)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {data.bestMonth && (
            <Badge variant="success" className="gap-1 text-[11px] py-1 px-2.5">
              <TrendingUp className="h-3 w-3" />
              Bulan Terbaik: <strong>{data.bestMonth.monthName} (+{data.bestMonth.avgReturn.toFixed(1)}%)</strong>
            </Badge>
          )}
          {data.worstMonth && (
            <Badge variant="danger" className="gap-1 text-[11px] py-1 px-2.5">
              <TrendingDown className="h-3 w-3" />
              Bulan Terlemah: <strong>{data.worstMonth.monthName} ({data.worstMonth.avgReturn.toFixed(1)}%)</strong>
            </Badge>
          )}
        </div>
      </CardHeader>

      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full text-center border-collapse text-xs">
          <thead>
            <tr className="border-b border-tv-border text-tv-muted">
              <th className="py-2.5 px-3 text-left font-semibold sticky left-0 bg-tv-card border-r border-tv-border z-10">Tahun</th>
              {MONTH_NAMES_SHORT.map((m) => (
                <th key={m} className="py-2.5 px-2 font-semibold min-w-[52px]">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-tv-border/40">
            {data.matrix.map((row) => (
              <tr key={row.year} className="hover:bg-tv-hover/40 transition-colors">
                <td className="py-2 px-3 text-left font-bold font-number text-tv-text sticky left-0 bg-tv-card border-r border-tv-border z-10">
                  {row.year}
                </td>
                {row.months.map((val, idx) => (
                  <td key={idx} className="py-2 px-1">
                    <div
                      className={`h-7 flex items-center justify-center rounded-lg font-number text-[11px] transition-all ${getCellColor(val)}`}
                      title={val !== null ? `${MONTH_NAMES_SHORT[idx]} ${row.year}: ${val >= 0 ? '+' : ''}${val.toFixed(2)}%` : 'Tidak ada data'}
                    >
                      {val !== null ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : '—'}
                    </div>
                  </td>
                ))}
              </tr>
            ))}

            {/* Average Return Row */}
            <tr className="border-t-2 border-tv-border bg-tv-hover/20">
              <td className="py-2.5 px-3 text-left font-bold text-tv-blue sticky left-0 bg-tv-card border-r border-tv-border z-10">
                Rata-rata
              </td>
              {data.monthAverages.map((avg, idx) => (
                <td key={idx} className="py-2.5 px-1 font-number font-bold text-[11px]">
                  {avg !== null ? (
                    <span className={avg >= 0 ? 'text-tv-green' : 'text-tv-red'}>
                      {avg >= 0 ? '+' : ''}{avg.toFixed(1)}%
                    </span>
                  ) : '—'}
                </td>
              ))}
            </tr>

            {/* Win Rate Row */}
            <tr className="bg-tv-hover/30">
              <td className="py-2.5 px-3 text-left font-bold text-tv-gold sticky left-0 bg-tv-card border-r border-tv-border z-10" title="Persentase tahun di mana bulan tersebut berakhir positif">
                Win Rate
              </td>
              {data.monthWinRates.map((wr, idx) => (
                <td key={idx} className="py-2.5 px-1 font-number font-bold text-[11px]">
                  {wr !== null ? (
                    <span className={wr >= 60 ? 'text-tv-green font-bold' : wr <= 40 ? 'text-tv-red' : 'text-tv-muted'}>
                      {wr.toFixed(0)}%
                    </span>
                  ) : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-tv-hover/40 border border-tv-border p-3 text-xs text-tv-muted">
        <Info className="h-4 w-4 text-tv-blue shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Catatan Analisis Musiman:</strong> Data musiman mengukur kecenderungan statistik tahunan (seperti <em>Window Dressing</em> di bulan Desember atau <em>January Effect</em>). Gunakan sebagai konteks historis bersama tren teknikal dan valuasi fundamental. Win rate adalah frekuensi empiris pada sampel yang tersedia, bukan probabilitas terkalibrasi atau jaminan bulan berikutnya.
        </p>
      </div>
    </Card>
  );
}
