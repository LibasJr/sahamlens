import React from 'react';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';

interface FundamentalExportCardProps {
  ticker: string;
  stock: { symbol?: string; name?: string; current_price?: number; change_pct?: number };
  fundamentals: {
    marketCap?: number | null;
    trailingPE?: number | null;
    priceToBook?: number | null;
    returnOnEquity?: number | null;
    grossMargins?: number | null;
    totalRevenue?: number | null;
    nim?: number | null;
  };
  profile: { sector?: string; industry?: string; description?: string };
  consensus?: string;
  exportedAt: Date;
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4">
      <div className="text-xs text-tv-muted uppercase font-mono">{label}</div>
      <div className="text-2xl font-number font-bold mt-1 text-white">{value}</div>
    </div>
  );
}

// Kartu export offscreen untuk /fundamental (lihat wiring di app/fundamental/page.tsx).
// Deteksi sektor bank SENGAJA disamakan persis dengan app/fundamental/page.tsx (cabang
// NIM vs Gross Margin) - kartu export tidak boleh menampilkan rasio yang beda logic
// dari tampilan asli untuk emiten yang sama.
export default function FundamentalExportCard({ ticker, stock, fundamentals, profile, consensus, exportedAt }: FundamentalExportCardProps) {
  const isBank = Boolean(profile.sector?.includes('Financial') || profile.industry?.includes('Bank'));
  const displaySymbol = ticker.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

  return (
    <div className="w-[1080px] h-[1350px] bg-tv-bg text-white p-16 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-10">
          <div className="text-3xl font-heading font-extrabold text-tv-accent">SahamLens</div>
          <div className={`text-xl font-mono font-bold px-5 py-2 rounded-full border ${
            consensus?.includes('BULLISH') ? 'bg-tv-green/20 text-tv-green border-tv-green'
              : consensus?.includes('BEARISH') ? 'bg-tv-red/20 text-tv-red border-tv-red'
              : 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow'
          }`}>{consensus || 'AWAITING'}</div>
        </div>

        <div className="mb-8">
          <div className="text-6xl font-heading font-extrabold">{displaySymbol}.JK</div>
          <div className="text-2xl text-tv-muted mt-2">{stock.name || displaySymbol}</div>
          <div className="flex items-center gap-4 mt-4">
            <span className="text-5xl font-mono font-bold">
              Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
            </span>
            {typeof stock.change_pct === 'number' && (
              <span className={`text-2xl font-mono font-bold ${stock.change_pct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
              </span>
            )}
          </div>
        </div>

        <div className="text-sm font-mono text-tv-muted uppercase mb-2">Sektor &amp; Industri</div>
        <div className="text-xl font-bold mb-6">{profile.sector || '-'} / {profile.industry || '-'}</div>

        <div className="grid grid-cols-3 gap-5 mb-8">
          <MetricBox label="Market Cap" value={fmtTriliun(fundamentals.marketCap)} />
          <MetricBox label="P/E Ratio (TTM)" value={fmtKali(fundamentals.trailingPE)} />
          <MetricBox label="Price to Book" value={fmtKali(fundamentals.priceToBook)} />
          <MetricBox label="ROE" value={fmtPersen(fundamentals.returnOnEquity)} />
          {isBank ? (
            <>
              <MetricBox label="NIM" value={fmtPersen(fundamentals.nim)} />
              <MetricBox label="Revenue" value={fmtTriliun(fundamentals.totalRevenue)} />
            </>
          ) : (
            <>
              <MetricBox label="Gross Margin" value={fmtPersen(fundamentals.grossMargins)} />
              <MetricBox label="Revenue" value={fmtTriliun(fundamentals.totalRevenue)} />
            </>
          )}
        </div>

        {profile.description && (
          <div className="text-base text-tv-muted leading-relaxed line-clamp-3">{profile.description}</div>
        )}
      </div>

      <div className="text-xs font-mono text-tv-muted border-t border-tv-border pt-4">
        Data via SahamLens • {timeLabel}
      </div>
    </div>
  );
}
