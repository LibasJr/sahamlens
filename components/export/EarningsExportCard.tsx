import React from 'react';
import { Calendar, TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import type { EarningsResultStatus, EarningsQuarter } from '@/modules/fundamental/service/public-earnings-data.service';

interface EarningsExportCardProps {
  ticker: string;
  stock: { name?: string; price?: number | null; sector?: string | null };
  upcoming: { date: string | null; isEstimate: boolean; fiscalQuarter: string | null };
  expectation: {
    eps: { average: number | null; growth: number | null; currency: string | null };
    revenue: { average: number | null; growth: number | null; currency: string | null };
  };
  latestQuarter: EarningsQuarter | null;
  exportedAt: Date;
}

// Class Tailwind literal per status - pola sama dengan MoatExportCard/sector-theme.tsx,
// bukan dirangkai dari template string (Tailwind JIT tidak menangkap hasil concat runtime).
const RESULT_STYLE: Record<EarningsResultStatus, { text: string; Icon: LucideIcon }> = {
  BEAT: { text: 'text-tv-green', Icon: TrendingUp },
  MISS: { text: 'text-tv-red', Icon: TrendingDown },
  INLINE: { text: 'text-tv-yellow', Icon: Minus },
  NO_DATA: { text: 'text-tv-muted', Icon: Minus },
};

function fmtDate(value: string | null): string {
  if (!value) return 'Belum tersedia';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Belum tersedia';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(date);
}

function fmtCompact(value: number | null, currency: string | null): string {
  if (value == null) return 'N/A';
  const formatted = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return currency ? `${currency} ${formatted}` : formatted;
}

function fmtPct(value: number | null): string {
  if (value == null) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
}

// Kartu export offscreen untuk /earnings (lihat wiring di app/earnings/page.tsx). Gaya
// visual satu sistem dengan FundamentalExportCard/TechnicalExportCard/MoatExportCard -
// banner color-block, lens-export-dark mengunci palet gelap apa pun tema pengguna. Hanya
// data yang sudah difetch page (jadwal earnings mendatang, konsensus estimasi analis,
// hasil kuartal terakhir) yang ditampilkan - tidak ada proyeksi/target harga karangan.
export default function EarningsExportCard({ ticker, stock, upcoming, expectation, latestQuarter, exportedAt }: EarningsExportCardProps) {
  const displaySymbol = ticker.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
  const resultStyle = latestQuarter ? RESULT_STYLE[latestQuarter.status] : RESULT_STYLE.NO_DATA;
  const ResultIcon = resultStyle.Icon;

  return (
    <div className="lens-export-dark w-[1080px] h-[1350px] bg-gradient-to-b from-tv-bg to-tv-surface text-white flex flex-col overflow-hidden">
      <div className="bg-gradient-accent px-16 py-9 flex items-center justify-between">
        <div>
          <div className="text-4xl font-heading font-extrabold text-white">SahamLens</div>
          <div className="text-sm font-mono text-white/80 uppercase tracking-wide mt-1">Earnings Monitor</div>
        </div>
        {latestQuarter && (
          <div className={`text-xl font-mono font-bold px-5 py-2 rounded-full bg-white flex items-center gap-2 ${resultStyle.text}`}>
            <ResultIcon className="w-5 h-5" />
            {latestQuarter.status}
          </div>
        )}
      </div>

      <div className="flex-1 p-16 flex flex-col justify-between">
        <div>
          <div className="mb-8">
            <div className="text-6xl font-heading font-extrabold leading-tight">{displaySymbol}.JK</div>
            <div className="text-xl text-tv-muted mt-1">{stock.name || displaySymbol}{stock.sector ? ` · ${stock.sector}` : ''}</div>
          </div>

          <div className="bg-tv-card border border-tv-border rounded-2xl p-6 mb-8">
            <div className="flex items-center gap-2 mb-2 text-tv-blue">
              <Calendar className="w-5 h-5" />
              <span className="text-sm font-mono uppercase tracking-wide">Jadwal Earnings Berikutnya</span>
            </div>
            <div className="text-2xl font-bold">
              {fmtDate(upcoming.date)}{upcoming.isEstimate ? ' (estimasi)' : ''}
            </div>
            {upcoming.fiscalQuarter && <div className="text-sm text-tv-muted mt-1">{upcoming.fiscalQuarter}</div>}
          </div>

          <div className="text-sm font-mono text-tv-muted uppercase mb-3">Konsensus Estimasi Analis</div>
          <div className="grid grid-cols-2 gap-5 mb-8">
            <div className="bg-tv-card border border-tv-border rounded-xl p-5">
              <div className="text-xs text-tv-muted uppercase font-mono mb-1">EPS Rata-rata</div>
              <div className="text-2xl font-number font-bold">{fmtCompact(expectation.eps.average, expectation.eps.currency)}</div>
              <div className="text-xs font-mono text-tv-muted mt-1">Pertumbuhan {fmtPct(expectation.eps.growth)}</div>
            </div>
            <div className="bg-tv-card border border-tv-border rounded-xl p-5">
              <div className="text-xs text-tv-muted uppercase font-mono mb-1">Revenue Rata-rata</div>
              <div className="text-2xl font-number font-bold">{fmtCompact(expectation.revenue.average, expectation.revenue.currency)}</div>
              <div className="text-xs font-mono text-tv-muted mt-1">Pertumbuhan {fmtPct(expectation.revenue.growth)}</div>
            </div>
          </div>

          {latestQuarter && (
            <>
              <div className="text-sm font-mono text-tv-muted uppercase mb-3">Hasil Kuartal Terakhir - {latestQuarter.quarter}</div>
              <div className="grid grid-cols-2 gap-5">
                <div className="bg-tv-card border border-tv-border rounded-xl p-5">
                  <div className="text-xs text-tv-muted uppercase font-mono mb-1">EPS Aktual vs Estimasi</div>
                  <div className="text-xl font-number font-bold">
                    {latestQuarter.actualEps ?? 'N/A'} <span className="text-tv-muted text-base">/ {latestQuarter.estimatedEps ?? 'N/A'}</span>
                  </div>
                  <div className={`text-xs font-mono mt-1 ${resultStyle.text}`}>Surprise {fmtPct(latestQuarter.surprisePct)}</div>
                </div>
                <div className="bg-tv-card border border-tv-border rounded-xl p-5">
                  <div className="text-xs text-tv-muted uppercase font-mono mb-1">Revenue</div>
                  <div className="text-xl font-number font-bold">{fmtCompact(latestQuarter.revenue, null)}</div>
                  <div className="text-xs font-mono text-tv-muted mt-1">Margin {fmtPct(latestQuarter.profitMargin != null ? latestQuarter.profitMargin * 100 : null)}</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="text-xs font-mono text-tv-muted border-t border-tv-border pt-4">
          Data via SahamLens &bull; {timeLabel}
        </div>
      </div>
    </div>
  );
}
