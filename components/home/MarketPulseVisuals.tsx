'use client';

import Link from 'next/link';
import { Activity, BarChart3 } from 'lucide-react';
import { AnimatedNumber, EmptyState } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';
import { Card } from '@/components/ui/Card';

/**
 * Breadth sebagai satu batang proporsional, bukan dua angka bersebelahan.
 * Perbandingannya langsung terbaca dari panjang segmen - itu inti informasinya,
 * dan itu yang hilang saat "312 naik / 254 turun" ditulis sebagai teks.
 */
export function MarketBreadthBar({ breadth }: { breadth: { advancing: number; declining: number; total: number } }) {
  const { advancing, declining, total } = breadth;
  if (!Number.isFinite(total) || total <= 0) {
    return (
      <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="40" className="border-tv-border/80 p-4 sm:p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-tv-muted">
          <BarChart3 className="w-4 h-4 text-tv-blue" />
          Market Breadth
        </div>
        <p className="mt-3 text-sm text-tv-muted">Data breadth belum tersedia. SahamLens tidak mengubah data kosong menjadi breadth 0% atau sinyal pasar.</p>
      </Card>
    );
  }
  const unchanged = Math.max(0, total - (advancing + declining));
  const denom = total;
  const advPct = Math.round((advancing / denom) * 100);
  const decPct = Math.round((declining / denom) * 100);
  const unchPct = Math.max(0, 100 - advPct - decPct);
  const ratio = declining > 0 ? advancing / declining : advancing;

  // Kalimatnya menerjemahkan rasio jadi kondisi pasar. Ambangnya sengaja lebar
  // (2:1 dan 1:2) supaya hari-hari biasa disebut "seimbang", bukan didramatisir.
  const verdict =
    ratio >= 2 ? { text: 'Partisipasi naik luas — mayoritas saham ikut menguat, momentum pasar positif.', tone: 'text-tv-green', bgTone: 'border-tv-green/30 bg-tv-green/10 text-tv-green' }
    : ratio <= 0.5 ? { text: 'Tekanan jual merata — pelemahan meluas ke hampir seluruh sektor.', tone: 'text-tv-red', bgTone: 'border-tv-red/30 bg-tv-red/10 text-tv-red' }
    : { text: 'Pasar berimbang — pergerakan indeks lebih ditentukan oleh bobot emiten berkapitalisasi besar.', tone: 'text-tv-muted', bgTone: 'border-tv-border bg-tv-card/60 text-tv-text/90' };

  return (
    <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" surface="40" className="border-tv-border/80 p-4 sm:p-5 backdrop-blur-sm space-y-4">
      {/* Header & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-tv-blue" />
          <span className="text-xs font-bold uppercase tracking-wider text-tv-muted">Market Breadth</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-tv-card border border-tv-border text-tv-muted font-number font-medium">
            <AnimatedNumber value={total} className="font-number font-semibold text-tv-text" /> Saham
          </span>
        </div>

        {/* 3 KPI Summary Badges */}
        <div className="flex items-center gap-2 text-xs font-semibold flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-tv-green/30 bg-tv-green/10 text-tv-green font-number">
            <span className="w-2 h-2 rounded-full bg-tv-green animate-pulse" />
            <AnimatedNumber value={advancing} /> Naik ({advPct}%)
          </span>
          {unchanged > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-tv-border bg-tv-card text-tv-muted font-number">
              <span className="w-2 h-2 rounded-full bg-tv-muted/60" />
              <AnimatedNumber value={unchanged} /> Netral ({unchPct}%)
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-tv-red/30 bg-tv-red/10 text-tv-red font-number">
            <span className="w-2 h-2 rounded-full bg-tv-red" />
            <AnimatedNumber value={declining} /> Turun ({decPct}%)
          </span>
        </div>
      </div>

      {/* Modern Thicker Segmented Breadth Bar */}
      <div className="space-y-1.5">
        <div className="flex h-3.5 sm:h-4 w-full overflow-hidden rounded-full bg-tv-hover/80 p-0.5 border border-tv-border/50 shadow-inner" role="img" aria-label={`${advancing} saham naik, ${declining} saham turun`}>
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-tv-green rounded-l-full transition-all duration-700 ease-settle shadow-sm"
            style={{ width: `${advPct}%` }}
          />
          {unchanged > 0 && (
            <div
              className="h-full bg-tv-muted/40 transition-all duration-700 ease-settle"
              style={{ width: `${unchPct}%` }}
            />
          )}
          <div
            className="h-full bg-gradient-to-r from-tv-red to-rose-600 rounded-r-full transition-all duration-700 ease-settle shadow-sm"
            style={{ width: `${decPct}%` }}
          />
        </div>
      </div>

      {/* Storytelling Verdict Box */}
      <div className={`p-3 rounded-lg border text-xs leading-relaxed flex items-center gap-2.5 ${verdict.bgTone}`}>
        <Activity className="w-4 h-4 shrink-0 opacity-80" />
        <span>{verdict.text}</span>
      </div>
    </Card>
  );
}

/**
 * Saham di balik angka persilangan MA, sebagai chip yang bisa diklik.
 *
 * Sebelum ini kartu Golden/Dead Cross hanya menampilkan jumlahnya - "2 saham" tanpa
 * satu pun cara mengetahui saham mana. Daftar simbolnya sebenarnya sudah ikut di
 * respons /api/daily-picks sejak awal; beranda membuangnya.
 *
 * Tujuannya /technical/[symbol], bukan halaman daftar khusus: rute golden/dead cross
 * tidak ada lagi sejak tab-tabnya dilebur di audit 2026-08-03.
 *
 * min-h-11 (44px) disengaja. Chip ini tautan yang ditekan di layar sentuh, jadi
 * mengikuti ambang 44px - bukan cuma minimum WCAG 2.5.8 (24px), yang sebenarnya
 * sudah lolos di tinggi asalnya 29px.
 */
export function CrossSymbolChips({ symbols, tone }: { symbols?: string[]; tone: 'positive' | 'negative' }) {
  if (!symbols?.length) return null;
  const warna = tone === 'positive'
    ? 'border-tv-green/25 bg-tv-green/10 text-tv-green hover:border-tv-green/50'
    : 'border-tv-red/25 bg-tv-red/10 text-tv-red hover:border-tv-red/50';
  return (
    <div className="flex flex-wrap gap-1.5">
      {symbols.map((s) => (
        <Link
          key={s}
          href={`/technical/${s}.JK`}
          className={`font-number inline-flex min-h-11 items-center rounded-md border px-2.5 lens-meta font-bold transition-colors ${warna}`}
        >
          {s}
        </Link>
      ))}
    </div>
  );
}

/**
 * Heatmap sektor: intensitas warna = besar perubahan, dipotong di 3% supaya satu
 * sektor ekstrem tidak membuat sisanya tampak abu-abu seragam.
 */
export function SectorHeatmap({ sectors }: { sectors: { sector: string; changePct: number }[] }) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  if (sectors.length === 0) {
    return (
      <EmptyState
        illustration="empty"
        title={isEn ? 'Sector data not available yet' : 'Data sektor belum masuk'}
        description={isEn ? 'Sector heatmap populates once market trading commences.' : 'Heatmap sektor terisi setelah sesi perdagangan berjalan.'}
      />
    );
  }

  const sorted = [...sectors].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const INTENSITY_CAP_PCT = 3;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-tv-muted">
          {isEn ? 'IDX 11 Sectors Performance' : 'Performa 11 Sektor IDX'}
        </h4>
        <span className="lens-meta text-tv-muted/80">{isEn ? 'Sorted by strength' : 'Disortir dari terkuat'}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {sorted.map((s) => {
          const isPos = s.changePct > 0;
          const isNeg = s.changePct < 0;
          const magnitude = Math.min(Math.abs(s.changePct) / INTENSITY_CAP_PCT, 1);
          const alpha = 0.08 + magnitude * 0.35;
          const rgb = isPos ? '34,197,94' : isNeg ? '239,68,68' : '148,163,184';

          return (
            <div
              key={s.sector}
              title={`${s.sector}: ${isPos ? '+' : ''}${s.changePct.toFixed(2)}%`}
              className="group relative flex flex-col justify-between rounded-xl border border-tv-border/80 p-3 sm:p-3.5 transition-all duration-200 ease-settle hover:scale-[1.02] hover:border-tv-borderLight hover:shadow-md cursor-default overflow-hidden"
              style={{ background: `rgba(${rgb}, ${alpha})` }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-semibold text-tv-text/95 truncate">
                  {s.sector}
                </span>
                <span className={`lens-meta font-bold px-1.5 py-0.5 rounded ${isPos ? 'bg-tv-green/20 text-tv-green' : isNeg ? 'bg-tv-red/20 text-tv-red' : 'bg-tv-muted/20 text-tv-muted'}`}>
                  {isPos ? '▲' : isNeg ? '▼' : '●'}
                </span>
              </div>
              <div className={`font-number text-sm sm:text-base font-bold mt-2 ${isPos ? 'text-tv-green' : isNeg ? 'text-tv-red' : 'text-tv-muted'}`}>
                {isPos ? '+' : ''}{s.changePct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > 1 && (
        <p className="lens-body-sm border-t border-tv-border/60 pt-3 text-tv-muted">
          {isEn ? (
            <>
              <span className="text-tv-green font-semibold">{best.sector}</span> leading ({best.changePct >= 0 ? '+' : ''}{best.changePct.toFixed(2)}%),{' '}
              <span className="text-tv-red font-semibold">{worst.sector}</span> lagging ({worst.changePct >= 0 ? '+' : ''}{worst.changePct.toFixed(2)}%) — spread of{' '}
              <span className="font-number font-bold text-tv-text">{(best.changePct - worst.changePct).toFixed(2)} percentage points</span> between strongest and weakest sectors.
            </>
          ) : (
            <>
              <span className="text-tv-green font-semibold">{best.sector}</span> memimpin ({best.changePct >= 0 ? '+' : ''}{best.changePct.toFixed(2)}%),{' '}
              <span className="text-tv-red font-semibold">{worst.sector}</span> tertinggal ({worst.changePct >= 0 ? '+' : ''}{worst.changePct.toFixed(2)}%) — selisih{' '}
              <span className="font-number font-bold text-tv-text">{(best.changePct - worst.changePct).toFixed(2)} poin persen</span> antar sektor terkuat dan terlemah.
            </>
          )}
        </p>
      )}
    </div>
  );
}

