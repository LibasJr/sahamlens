import { Activity, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { MarketPulse, MarketSummary } from '../api';

type Props = { market: { summary: MarketSummary; pulse: MarketPulse } | null; error: string; onSelect: (symbol: string) => void };

export function MarketOverview({ market, error, onSelect }: Props) {
  if (error) return <section className="market-overview market-message">{error}</section>;
  if (!market) return <section className="market-overview market-message"><RefreshCw className="spin" size={17} /> Menyusun ringkasan pasar dari SahamLens…</section>;
  const { summary, pulse } = market;
  const regime = pulse.marketRegime?.regime;
  const breadth = pulse.marketRegime?.indicators?.find((indicator) => indicator.id === 'breadth');
  const indices = pulse.indices.slice(0, 4);
  const sectors = [...(pulse.sectorHeatmap ?? [])].sort((left, right) => right.changePct - left.changePct).slice(0, 6);
  return <section className="market-overview">
    <div className="overview-heading"><div><span className="section-kicker">RINGKASAN PASAR</span><h1>{regime?.label ?? summary.marketRegime.trend}</h1><p>{pulse.marketRegime?.summary ?? 'Kondisi pasar berdasarkan data SahamLens.'}</p></div><span className="overview-live"><Activity size={14} /> SahamLens API</span></div>
    {breadth && <div className="breadth-strip"><div><span>MARKET BREADTH</span><strong>{breadth.raw?.advanceShare == null ? '—' : `${breadth.raw.advanceShare.toFixed(1)}%`}</strong><small>saham sampel menguat</small></div><div><span>ADVANCERS</span><strong className="positive">{breadth.raw?.advancing ?? '—'}</strong></div><div><span>DECLINERS</span><strong className="negative">{breadth.raw?.declining ?? '—'}</strong></div><div><span>SKOR BREADTH</span><strong>{breadth.score ?? '—'}</strong></div></div>}
    <div className="index-grid">{indices.map((index) => <button key={index.symbol} className="index-card" onClick={() => onSelect(index.symbol.replace('.JK', ''))}><span>{index.name}</span><strong>{index.price.toLocaleString('id-ID')}</strong><b className={index.changePct >= 0 ? 'positive' : 'negative'}>{index.changePct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{index.changePct.toFixed(2)}%</b></button>)}</div>
    {sectors.length > 0 && <div className="sector-heatmap"><div><span>SEKTOR TERKUAT & TERLEMAH</span><small>Representasi sampel SahamLens</small></div><div className="sector-cells">{sectors.map((sector) => <div key={sector.sector} className={sector.changePct >= 0 ? 'up' : 'down'}><strong>{sector.sector}</strong><span>{sector.changePct >= 0 ? '+' : ''}{sector.changePct.toFixed(2)}%</span></div>)}</div></div>}
    <div className="mover-grid"><Mover title="Penguat" items={summary.topGainers.slice(0, 4)} onSelect={onSelect} /><Mover title="Pelemah" items={summary.topLosers.slice(0, 4)} onSelect={onSelect} negative /></div>
  </section>;
}

function Mover({ title, items, onSelect, negative = false }: { title: string; items: MarketSummary['topGainers']; onSelect: (symbol: string) => void; negative?: boolean }) {
  return <div className="mover-card"><span>{title}</span>{items.map((item) => <button key={item.symbol} onClick={() => onSelect(item.symbol)}><strong>{item.symbol}</strong><em>Rp {item.price.toLocaleString('id-ID')}</em><b className={negative ? 'negative' : 'positive'}>{item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%</b></button>)}</div>;
}
