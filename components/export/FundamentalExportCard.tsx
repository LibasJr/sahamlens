import React from 'react';
import { Coins, TrendingUp, Scale, Percent, PieChart, Wallet, Layers, type LucideIcon } from 'lucide-react';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import { getSectorTheme } from './sector-theme';

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

function MetricBox({ label, value, Icon }: { label: string; value: string; Icon: LucideIcon }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4 flex flex-col gap-2">
      <Icon className="w-5 h-5 text-tv-muted" />
      <div className="text-xs text-tv-muted uppercase font-mono">{label}</div>
      <div className="text-2xl font-number font-bold text-white">{value}</div>
    </div>
  );
}

// Bar aksen brand (gradient signature biru->ungu, sudah didefinisikan sebagai
// `gradient-accent` di tailwind.config.js) di atas & bawah card - bookend visual,
// identitas brand konsisten terlepas dari sector emiten (sector dinyatakan lewat
// icon+warna chip di header, bukan lewat bar ini).
function AccentBar() {
  return <div className="h-3 w-full bg-gradient-accent" />;
}

// Kartu export offscreen untuk /fundamental (lihat wiring di app/fundamental/page.tsx).
// Deteksi sektor bank SENGAJA disamakan persis dengan app/fundamental/page.tsx (cabang
// NIM vs Gross Margin) - kartu export tidak boleh menampilkan rasio yang beda logic
// dari tampilan asli untuk emiten yang sama. Tema visual (icon+warna chip sektor) di
// bawah HANYA dekoratif, dicocokkan ke field sector/industry asli - tidak mengubah
// metrik yang ditampilkan.
export default function FundamentalExportCard({ ticker, stock, fundamentals, profile, consensus, exportedAt }: FundamentalExportCardProps) {
  const isBank = Boolean(profile.sector?.includes('Financial') || profile.industry?.includes('Bank'));
  const displaySymbol = ticker.replace('.JK', '');
  const timeLabel = exportedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
  const sectorTheme = getSectorTheme(profile.sector, profile.industry);
  const SectorIcon = sectorTheme.Icon;

  return (
    <div className="w-[1080px] h-[1350px] bg-gradient-to-b from-tv-bg to-tv-surface text-white flex flex-col">
      <AccentBar />

      <div className="flex-1 p-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-10">
            <div className="text-3xl font-heading font-extrabold text-tv-accent">SahamLens</div>
            <div className={`text-xl font-mono font-bold px-5 py-2 rounded-full border ${
              consensus?.includes('BULLISH') ? 'bg-tv-green/20 text-tv-green border-tv-green'
                : consensus?.includes('BEARISH') ? 'bg-tv-red/20 text-tv-red border-tv-red'
                : 'bg-tv-yellow/20 text-tv-yellow border-tv-yellow'
            }`}>{consensus || 'AWAITING'}</div>
          </div>

          <div className="mb-8 flex items-center gap-6">
            <div className={`w-20 h-20 shrink-0 rounded-2xl border flex items-center justify-center ${sectorTheme.chipBg} ${sectorTheme.chipBorder}`}>
              <SectorIcon className={`w-10 h-10 ${sectorTheme.chipText}`} />
            </div>
            <div>
              <div className="text-6xl font-heading font-extrabold">{displaySymbol}.JK</div>
              <div className="text-2xl text-tv-muted mt-1">{stock.name || displaySymbol}</div>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-8">
            <span className="text-5xl font-mono font-bold">
              Rp {stock.current_price?.toLocaleString('id-ID') || '-'}
            </span>
            {typeof stock.change_pct === 'number' && (
              <span className={`text-2xl font-mono font-bold ${stock.change_pct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <Layers className={`w-4 h-4 ${sectorTheme.chipText}`} />
            <span className="text-sm font-mono text-tv-muted uppercase">Sektor &amp; Industri</span>
          </div>
          <div className="text-xl font-bold mb-6 pb-6 border-b border-tv-border">{profile.sector || '-'} / {profile.industry || '-'}</div>

          <div className="grid grid-cols-3 gap-5 mb-8">
            <MetricBox label="Market Cap" value={fmtTriliun(fundamentals.marketCap)} Icon={Coins} />
            <MetricBox label="P/E Ratio (TTM)" value={fmtKali(fundamentals.trailingPE)} Icon={TrendingUp} />
            <MetricBox label="Price to Book" value={fmtKali(fundamentals.priceToBook)} Icon={Scale} />
            <MetricBox label="ROE" value={fmtPersen(fundamentals.returnOnEquity)} Icon={Percent} />
            {isBank ? (
              <>
                <MetricBox label="NIM" value={fmtPersen(fundamentals.nim)} Icon={Percent} />
                <MetricBox label="Revenue" value={fmtTriliun(fundamentals.totalRevenue)} Icon={Wallet} />
              </>
            ) : (
              <>
                <MetricBox label="Gross Margin" value={fmtPersen(fundamentals.grossMargins)} Icon={PieChart} />
                <MetricBox label="Revenue" value={fmtTriliun(fundamentals.totalRevenue)} Icon={Wallet} />
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

      <AccentBar />
    </div>
  );
}
