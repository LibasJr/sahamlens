import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { getScreener, type ScreenerPayload, type ScreenerRow } from '../api';
import { formatIdr } from '../format';

type Profile = 'Konservatif' | 'Moderat' | 'Agresif';
const profiles: Profile[] = ['Konservatif', 'Moderat', 'Agresif'];
const presets = [
  { label: 'Quality + Large/Liquid', profile: 'Konservatif' as Profile, cap: '10', liquidity: '10', price: '' },
  { label: 'Kualitas + Valuasi + Growth', profile: 'Moderat' as Profile, cap: '2', liquidity: '5', price: '' },
  { label: 'Defensif: Dividen + DER', profile: 'Konservatif' as Profile, cap: '5', liquidity: '5', price: '' },
  { label: 'Growth + Momentum < Rp5.000', profile: 'Agresif' as Profile, cap: '1', liquidity: '2', price: '5000' },
];
const show = (value: unknown, suffix = '') => value == null || value === '' ? 'N/A' : `${String(value)}${suffix}`;
const compact = (value: number | null | undefined) => value == null ? 'N/A' : value >= 1e12 ? `Rp ${(value / 1e12).toFixed(1)} T` : value >= 1e9 ? `Rp ${(value / 1e9).toFixed(1)} M` : formatIdr(value);

export function MarketScreener({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [profile, setProfile] = useState<Profile>('Moderat');
  const [sector, setSector] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minCap, setMinCap] = useState('');
  const [minLiquidity, setMinLiquidity] = useState('');
  const [payload, setPayload] = useState<ScreenerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const params = useMemo(() => {
    const p = new URLSearchParams({ profile });
    if (sector) p.set('sector', sector);
    if (Number(maxPrice) > 0) p.set('maxPrice', maxPrice);
    if (Number(minCap) > 0) p.set('minMarketCap', String(Number(minCap) * 1e12));
    if (Number(minLiquidity) > 0) p.set('minLiquidity', String(Number(minLiquidity) * 1e9));
    return p;
  }, [profile, sector, maxPrice, minCap, minLiquidity]);
  const load = () => { setLoading(true); setError(''); void getScreener(params).then(setPayload).catch((reason) => { setPayload(null); setError(reason instanceof Error ? reason.message : 'Screener gagal dimuat.'); }).finally(() => setLoading(false)); };
  useEffect(() => { const timeout = setTimeout(load, 450); return () => clearTimeout(timeout); }, [params.toString()]);
  const rows = payload?.analysis?.top_10_stocks ?? payload?.top_10_stocks ?? [];
  const sectors = payload?.availableSectors ?? [];
  const apply = (preset: typeof presets[number]) => { setProfile(preset.profile); setMinCap(preset.cap); setMinLiquidity(preset.liquidity); setMaxPrice(preset.price); setSector(''); };
  return <section className="desktop-screener">
    <header><div className="screener-icon"><SlidersHorizontal size={20} /></div><div><span className="section-kicker">LENSSCANNER</span><h2>Seleksi Profil Risiko Investor</h2><p>Pilih toleransi risiko untuk memfilter 10 saham IDX terbaik berdasarkan skor total dan kualitas datanya.</p></div><button className="screener-tool" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={14} /> Refresh</button></header>
    <div className="risk-profile-tabs">{profiles.map((item) => <button key={item} className={profile === item ? 'active' : ''} onClick={() => setProfile(item)}>{item}</button>)}</div>
    <div className="screener-presets"><span>Preset Parameter (1-Klik)</span><div>{presets.map((preset) => <button key={preset.label} onClick={() => apply(preset)}>{preset.label}</button>)}</div><small>Preset hanya mengisi parameter SahamLens yang terlihat; bukan strategi resmi, indeks resmi, atau jaminan hasil.</small></div>
    <div className="screener-filters"><label>Sektor<select value={sector} onChange={(event) => setSector(event.target.value)}><option value="">Semua sektor</option>{sectors.map((item) => <option key={item}>{item}</option>)}</select></label><label>Harga Maksimum (Rp)<input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Tanpa batas" /></label><label>Market Cap Min (Rp T)<input inputMode="decimal" value={minCap} onChange={(event) => setMinCap(event.target.value)} placeholder="0" /></label><label>Likuiditas Min (Rp M/Hari)<input inputMode="decimal" value={minLiquidity} onChange={(event) => setMinLiquidity(event.target.value)} placeholder="0" /></label></div>
    <div className="screener-meta"><span className={`data-status${error ? ' error' : ''}`}><i /> {error ? 'DATA BERMASALAH' : loading ? 'MEMINDAI' : 'API DATA'}</span><span>{payload?._meta?.freshness ?? 'Freshness belum tersedia'}</span><span>{rows.length} dari {payload?.analysis?.total_count ?? rows.length} hasil</span></div>
    {error ? <div className="data-empty error">Screener tidak dapat dimuat: {error} <button onClick={load}>Coba lagi</button></div> : <div className="screener-table-wrap"><table><thead><tr><th>Emiten</th><th>Sektor</th><th>Harga</th><th>PER / PBV</th><th>ROE</th><th>DER</th><th>Div Yield</th><th>Growth</th><th>Kualitas Profit</th><th>Bandarmology</th><th>Sinyal</th><th>Market Cap</th><th>Likuiditas</th></tr></thead><tbody>{loading ? <tr><td colSpan={13} className="data-empty">Memindai data pasar nyata…</td></tr> : rows.length === 0 ? <tr><td colSpan={13} className="data-empty">Tidak ada saham yang memenuhi filter saat ini.</td></tr> : rows.map((row: ScreenerRow) => <tr key={row.ticker} onClick={() => onSelect(row.ticker)}><td><strong>{row.ticker}</strong><small>{row.name}</small></td><td>{show(row.sector)}</td><td>{formatIdr(row.entry)}</td><td>{show(row.per, 'x')} / {show(row.pbv, 'x')}</td><td>{show(row.roe)}</td><td>{show(row.der)}</td><td>{show(row.div_yield)}</td><td>{show(row.rev_growth_ttm)}</td><td>{show(row.moat)}</td><td>{show(row.bandarmology)}</td><td><span className="signal-pill">{row.decision?.action ?? row.signal ?? 'N/A'}</span></td><td>{compact(row.market_cap)}</td><td>{compact(row.adv20_idr)}</td></tr>)}</tbody></table></div>}
    <footer>Semua nilai berasal dari SahamLens API. Nilai yang tidak tersedia tetap ditampilkan sebagai N/A dan tidak diperkirakan.</footer>
  </section>;
}
