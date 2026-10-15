'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, CheckCircle2, Sparkles, BellRing } from 'lucide-react';
import { Card } from '@/components/ui';

export interface WatchlistDigestData {
  sessionLabel: string;
  watchlistCount: number;
  positionedCount: number;
  journaledCount: number;
  activeAlertsCount: number;
  triggeredAlertsCount: number;
  upcomingEvents: Array<{
    date: string;
    symbol: string;
    type: string;
    title: string;
    source: string;
    verification: string;
  }>;
  asOf: string;
}

interface WatchlistDigestBannerProps {
  digest: WatchlistDigestData | null;
  nearStopSymbols: string[];
  aboveTargetSymbols: string[];
}

export function WatchlistDigestBanner({
  digest,
  nearStopSymbols,
  aboveTargetSymbols,
}: WatchlistDigestBannerProps) {
  if (!digest || digest.watchlistCount === 0) return null;

  return (
    <Card padding="none" radius="lg" elevation="sm" highlight={false} className="lg:col-span-3 border-tv-border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tv-border pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-tv-blue" />
          <h3 className="font-heading text-sm font-bold text-tv-text">
            Ringkasan Harian Watchlist &amp; Agenda Korporasi
          </h3>
          <span className="lens-chip rounded-full border border-tv-blue/30 bg-tv-blue/10 px-2 py-0.5 text-tv-blue font-semibold">
            {digest.sessionLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 lens-meta text-tv-muted">
          <span>
            Jurnal Tesis: <strong className="text-tv-text font-number">{digest.journaledCount}/{digest.watchlistCount}</strong> saham
          </span>
          <span>
            Alert Aktif: <strong className="text-tv-text font-number">{digest.activeAlertsCount}</strong>
            {digest.triggeredAlertsCount > 0 ? ` (${digest.triggeredAlertsCount} terpicu)` : ''}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-md border border-tv-border bg-tv-bg p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-tv-text">
            <BellRing className="w-3.5 h-3.5 text-tv-yellow" />
            Evaluasi Rencana &amp; Level Harga
          </div>
          {nearStopSymbols.length === 0 && aboveTargetSymbols.length === 0 ? (
            <p className="text-tv-muted leading-relaxed">
              Seluruh posisi berharga beli masih bergerak dalam rentang normal rencana awal (tidak ada yang turun &ge;5% di bawah harga beli atau menyentuh batas stop).
            </p>
          ) : (
            <div className="space-y-1 text-tv-muted leading-relaxed">
              {nearStopSymbols.length > 0 && (
                <p>
                  <span className="font-bold text-tv-yellow">{nearStopSymbols.join(', ')}</span> berada &ge;5% di bawah harga beli atau menyentuh level pengingat. Tinjau kembali tesis di catatan jurnal Anda.
                </p>
              )}
              {aboveTargetSymbols.length > 0 && (
                <p>
                  <span className="font-bold text-tv-green">{aboveTargetSymbols.join(', ')}</span> berada &ge;10% di atas harga beli. Pertimbangkan pembaruan trailing stop atau evaluasi target.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border border-tv-border bg-tv-bg p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-tv-text">
              <Calendar className="w-3.5 h-3.5 text-tv-blue" />
              Agenda RUPS, Dividen &amp; Laporan Keuangan (45 Hari ke Depan)
            </div>
            <Link href="/calendar" className="lens-meta text-tv-blue hover:underline">
              Buka Kalender &rarr;
            </Link>
          </div>
          {digest.upcomingEvents.length === 0 ? (
            <p className="text-tv-muted leading-relaxed flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-tv-green shrink-0" />
              Tidak ada jadwal RUPS/Ex-Dividen tercatat untuk emiten di watchlist Anda dalam 45 hari ke depan.
            </p>
          ) : (
            <ul className="space-y-1 text-tv-muted">
              {digest.upcomingEvents.slice(0, 3).map((ev) => (
                <li key={`${ev.date}-${ev.symbol}-${ev.type}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <strong className="text-tv-text font-number">{ev.symbol}</strong> &middot; {ev.type}: {ev.title}
                  </span>
                  <span className="shrink-0 font-number text-tv-text">{ev.date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
