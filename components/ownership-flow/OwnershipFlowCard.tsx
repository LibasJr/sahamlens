'use client';

import { useEffect, useState } from 'react';
import { Globe, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import OwnershipFlowChart, { type OwnershipSeriesPoint } from './OwnershipFlowChart';
import {
  formatObservedDate,
  formatPercent,
  formatPpWithUnit,
  FRESHNESS_LABEL,
  TREND_LABEL,
  type FreshnessKey,
  type OwnershipTrendKey,
} from './ownership-flow-format';

// KARTU RINGKAS OWNERSHIP FLOW untuk halaman detail saham / LensTechnical.
//
// Sifatnya SUPPLEMENTAL EVIDENCE. Karena itu kartu ini:
//   - tidak pernah menampilkan BELI/JUAL/STRONG BUY,
//   - selalu menyebut tanggal observasi dan sumbernya,
//   - menulis perubahan dalam pp, bukan %,
//   - dan MENGHILANG (render null) ketika modul tidak aktif - bukan menampilkan
//     kerangka kosong yang membuat pengguna mengira ada yang rusak.

interface OwnershipFlowDetail {
  ticker: string;
  observedDate: string | null;
  source: string | null;
  foreignPct: number | null;
  localPct: number | null;
  delta: { '1d': number | null; '7d': number | null; '30d': number | null };
  deltaBasis: Record<'1d' | '7d' | '30d', { observedDate: string | null; gapDays: number | null }>;
  trend: OwnershipTrendKey;
  trendReason: string;
  freshness: FreshnessKey;
  historyCount: number;
  experimental: boolean;
  inFinalScore: boolean;
  series?: OwnershipSeriesPoint[];
}

export function OwnershipFlowCard({ ticker }: { ticker: string }) {
  const [data, setData] = useState<OwnershipFlowDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');

    (async () => {
      try {
        // series=1 dibawa sekalian: satu round-trip untuk angka DAN grafik.
        // Deretnya dibaca dari tabel histori yang sama, jadi tidak ada risiko
        // kartu dan grafiknya menampilkan observasi yang berbeda umur.
        const res = await fetch(`/api/ownership-flow/${encodeURIComponent(ticker)}?series=1`);
        if (cancelled) return;
        if (!res.ok) {
          // 404 = fitur belum aktif pada deployment ini. Itu bukan error yang
          // perlu ditampilkan ke pengguna; kartunya cukup tidak muncul.
          setState('unavailable');
          return;
        }
        setData((await res.json()) as OwnershipFlowDetail);
        setState('ready');
      } catch {
        if (!cancelled) setState('unavailable');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (state === 'unavailable') return null;

  if (state === 'loading') {
    return (
      <Card>
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="mt-3 h-9 w-28 rounded" />
        <Skeleton className="mt-3 h-14 w-full rounded" />
      </Card>
    );
  }

  if (!data) return null;

  const hasObservation = data.observedDate !== null;
  const trend = TREND_LABEL[data.trend];
  const freshness = FRESHNESS_LABEL[data.freshness];

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-heading text-[13px] font-bold uppercase tracking-wide text-tv-text">
          <Users className="h-3.5 w-3.5 text-tv-blue" />
          Ownership Flow
        </h3>
        <Badge variant="warning" size="sm">Eksperimental</Badge>
      </div>

      {!hasObservation ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-tv-muted">
          Belum ada observasi kepemilikan tersimpan untuk emiten ini. Histori mulai terkumpul
          setelah verifikasi sumber selesai &mdash; data sintetis sengaja tidak dibuat untuk
          mengisi kekosongan ini.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <p className="text-[10.5px] uppercase tracking-wide text-tv-muted">Kepemilikan asing</p>
            <p className="font-heading text-[28px] font-bold leading-tight tabular-nums text-tv-text">
              {formatPercent(data.foreignPct)}
            </p>
            {data.localPct !== null && (
              <p className="text-[12px] text-tv-muted">Lokal {formatPercent(data.localPct)}</p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['1d', '7d', '30d'] as const).map((key) => {
              const value = data.delta[key];
              const gap = data.deltaBasis[key]?.gapDays ?? null;
              return (
                <div
                  key={key}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5"
                  title={
                    value === null
                      ? 'Belum ada observasi pembanding pada horizon ini'
                      : `Dibanding observasi ${gap} hari sebelumnya`
                  }
                >
                  <p className="text-[10px] uppercase tracking-wide text-tv-muted">
                    {key === '1d' ? '1 hari' : key === '7d' ? '7 hari' : '30 hari'}
                  </p>
                  <p
                    className={`text-[12.5px] font-bold tabular-nums ${
                      value === null ? 'text-tv-muted' : value > 0 ? 'text-tv-green' : value < 0 ? 'text-tv-red' : 'text-tv-text'
                    }`}
                  >
                    {formatPpWithUnit(value)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant={trend.variant}>{trend.label}</Badge>
            <Badge variant={freshness.variant} size="sm">{freshness.label}</Badge>
          </div>

          <p className="mt-2 text-[11.5px] leading-relaxed text-tv-muted">{data.trendReason}</p>

          {/* Grafik hanya muncul kalau ada histori yang cukup. Komponennya
              sendiri sudah menolak menggambar di bawah 2 observasi, tapi
              menyembunyikan seluruh blok di sini menjaga kartu tetap ringkas
              pada hari-hari awal ketika histori memang baru mulai terkumpul. */}
          {(data.series?.length ?? 0) >= 2 && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              <p className="mb-1.5 text-[10.5px] uppercase tracking-wide text-tv-muted">
                Kepemilikan asing &mdash; {data.series!.length} observasi
              </p>
              <OwnershipFlowChart series={data.series!} height={180} />
            </div>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.06] pt-2.5 text-[11px] text-tv-muted">
        <span>Data per <strong className="text-tv-text">{formatObservedDate(data.observedDate)}</strong></span>
        <span className="inline-flex items-center gap-1">
          <Globe className="h-3 w-3" />
          {(data.source ?? 'KSEI').replace(/_/g, ' ')}
        </span>
      </div>

      {/* Pembeda yang WAJIB ada di dekat angkanya, bukan hanya di halaman
          dokumentasi: pembaca yang melihat "kepemilikan asing naik" paling mudah
          menyimpulkan "broker asing beli" - kesimpulan yang tidak punya dasar
          tanpa data broker-level. */}
      <p className="mt-2 text-[10.5px] leading-relaxed text-tv-muted/80">
        Perubahan komposisi kepemilikan, bukan data transaksi broker. Δ dalam percentage point (pp).
        Tidak ikut menghitung LensScore.
      </p>
    </Card>
  );
}

export default OwnershipFlowCard;
