'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { fadeUp } from '@/lib/motion';

export type CardItem = { code: string; change: string; value: string; dir: 'up' | 'down' | 'neutral'; href: string };
export type CardDef = { id: string; title: string; sub: string; accent: string; Icon: any; key: string; listPath: string };
export type MoverCard = CardDef & { items: CardItem[] };

export const ACCENT_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  green: { bg: 'bg-tv-green/10', text: 'text-tv-green', border: 'border-tv-green/25', dot: 'bg-tv-green' },
  red: { bg: 'bg-tv-red/10', text: 'text-tv-red', border: 'border-tv-red/25', dot: 'bg-tv-red' },
  blue: { bg: 'bg-tv-blue/10', text: 'text-tv-blue', border: 'border-tv-blue/25', dot: 'bg-tv-blue' },
  purple: { bg: 'bg-tv-purple/10', text: 'text-tv-purple', border: 'border-tv-purple/25', dot: 'bg-tv-purple' },
  warning: { bg: 'bg-tv-warning/10', text: 'text-tv-warning', border: 'border-tv-warning/25', dot: 'bg-tv-warning' },
  slate: { bg: 'bg-tv-hover', text: 'text-tv-muted', border: 'border-tv-border', dot: 'bg-tv-muted' },
};

export function formatCardItems(id: string, arr: any[]): CardItem[] {
  return (arr || []).slice(0, 4).map((s: any) => {
    const href = `/technical/${s.symbol}.JK`;
    const priceStr = `Rp ${Math.round(s.price || 0).toLocaleString('id-ID')}`;
    switch (id) {
      case 'gainer':
        return { code: s.symbol, change: `+${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'up', href };
      case 'loser':
        return { code: s.symbol, change: `${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'down', href };
      case 'volume':
        return { code: s.symbol, change: `${Math.round(s.volume / 100).toLocaleString('id-ID')} lot`, value: priceStr, dir: 'neutral', href };
      case 'technical':
        return { code: s.symbol, change: `Skor ${s.score}%`, value: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, dir: 'up', href };
      case 'technicalBearish':
        return { code: s.symbol, change: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, value: priceStr, dir: 'down', href };
      case 'rsiOversold':
        return { code: s.symbol, change: `RSI ${s.rsi.toFixed(1)}`, value: `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`, dir: s.changePct >= 0 ? 'up' : 'down', href };
      default:
        return { code: s.symbol, change: '-', value: '-', dir: 'neutral', href };
    }
  });
}

export function MarketMoverCard({ card, lastUpdated, loaded }: { card: MoverCard; lastUpdated: string | null; loaded: boolean }) {
  const accent = ACCENT_MAP[card.accent] || ACCENT_MAP.slate;
  return (
    <motion.div variants={fadeUp} className="group relative rounded-lg border border-tv-border bg-tv-card p-5 shadow-1 hover:shadow-2 hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg grid place-items-center border ${accent.bg} ${accent.border} ${accent.text}`}>
            <card.Icon className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-heading text-[13px] font-bold leading-tight tracking-tight text-tv-text max-w-[180px]">{card.title}</h4>
            <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${accent.bg} ${accent.text}`}>{card.sub}</span>
          </div>
        </div>
        <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
      </div>
      <div className="mt-4 divide-y divide-tv-border/60 rounded-lg border border-tv-border/60 overflow-hidden">
        {card.items.length === 0 && (
          <div className="bg-tv-card px-3 py-6 text-center text-[11px] text-tv-muted">
            {loaded ? 'Belum ada data untuk kategori ini' : 'Memuat data...'}
          </div>
        )}
        {card.items.map((it, idx) => (
          <Link key={it.code} href={it.href} className="flex items-center justify-between gap-2 bg-tv-card px-3 py-[11px] hover:bg-tv-hover transition">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-tv-surface text-[10px] font-bold text-white shrink-0">{idx + 1}</span>
              <span className="text-[12px] font-bold tracking-tight text-tv-text">{it.code}</span>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-[12px] font-bold tracking-tight flex items-center justify-end gap-1 font-number ${it.dir === 'down' ? 'text-tv-red' : it.dir === 'up' ? 'text-tv-green' : 'text-tv-text'}`}>
                {it.dir !== 'neutral' && <span className={`h-1 w-1 rounded-full ${it.dir === 'down' ? 'bg-tv-red' : 'bg-tv-green'}`} />}
                {it.change}
              </div>
              <div className="text-[10px] font-medium text-tv-muted">{it.value}</div>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-tv-muted">Update {lastUpdated || '--:--'} • IDX</span>
        <Link href={card.listPath} className="inline-flex items-center gap-1 text-[11px] font-bold text-tv-blue hover:text-tv-text transition">
          Lihat Seluruhnya <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </motion.div>
  );
}
