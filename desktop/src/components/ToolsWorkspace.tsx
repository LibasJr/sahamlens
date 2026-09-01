import { Calculator, CheckCircle2, Circle, ClipboardCheck, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getFundamentalSnapshot, type FundamentalSnapshot } from '../api';

export function StockChecklist({ symbol }: { symbol?: string }) {
  const [data, setData] = useState<FundamentalSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!symbol) { setData(null); return; } let active = true; setLoading(true); setError(''); void getFundamentalSnapshot(symbol).then((next) => { if (active) setData(next); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Checklist belum dapat dimuat.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [symbol]);
  if (!symbol) return <ToolState text="Pilih emiten terlebih dahulu untuk membuat checklist berbasis data." />;
  if (loading) return <ToolState loading text={`Membaca data ${symbol}…`} />;
  if (error) return <ToolState text={error} />;
  const metrics = data?.fundamentals;
  const entries = [
    ['Harga & identitas', data?.stock?.current_price == null ? null : `Rp ${data.stock.current_price.toLocaleString('id-ID')}`],
    ['P/E tersedia', metrics?.trailingPE == null ? null : `${metrics.trailingPE.toFixed(2)}x`],
    ['PBV tersedia', metrics?.priceToBook == null ? null : `${metrics.priceToBook.toFixed(2)}x`],
    ['ROE tersedia', metrics?.returnOnEquity == null ? null : `${(metrics.returnOnEquity * 100).toFixed(2)}%`],
    ['Data dividen tersedia', metrics?.dividendYield == null ? null : `${(metrics.dividendYield * 100).toFixed(2)}%`],
    ['Kesimpulan server', data?.consensus ?? null],
  ] as const;
  return <section className="tool-workspace"><div className="tool-heading"><div><span className="section-kicker">CHECKLIST EMITEN</span><h2>{data?.stock?.name ?? symbol}</h2><p>Checklist ini menampilkan kelengkapan dan pembacaan data dari SahamLens; bukan skor atau rekomendasi transaksi.</p></div><ClipboardCheck size={31} /></div><div className="checklist-grid">{entries.map(([label, value]) => <div className="checklist-item" key={label}>{value ? <CheckCircle2 size={17} className="positive" /> : <Circle size={17} className="muted" />}<div><strong>{label}</strong><span>{value ?? 'Belum tersedia dari sumber data.'}</span></div></div>)}</div></section>;
}

export function PositionSizing() {
  const [capital, setCapital] = useState('10000000'); const [entry, setEntry] = useState(''); const [stop, setStop] = useState(''); const [risk, setRisk] = useState('1'); const [submitted, setSubmitted] = useState(false);
  const result = useMemo(() => { const capitalValue = Number(capital); const entryValue = Number(entry); const stopValue = Number(stop); const riskValue = Number(risk); if (![capitalValue, entryValue, stopValue, riskValue].every(Number.isFinite) || capitalValue <= 0 || entryValue <= stopValue || riskValue <= 0) return null; const riskBudget = capitalValue * riskValue / 100; const shares = Math.floor(riskBudget / (entryValue - stopValue)); const lots = Math.floor(shares / 100); const quantity = lots * 100; return { riskBudget, lots, quantity, cost: quantity * entryValue, allocation: quantity * entryValue / capitalValue * 100 }; }, [capital, entry, stop, risk]);
  return <section className="tool-workspace"><div className="tool-heading"><div><span className="section-kicker">POSITION SIZING</span><h2>Hitung batas risiko</h2><p>Kalkulasi dari angka yang Anda isi sendiri. Ini alat edukasi pengelolaan risiko, bukan instruksi beli atau jual.</p></div><Calculator size={31} /></div><div className="position-form"><label>Modal tersedia<input value={capital} inputMode="decimal" onChange={(event) => setCapital(event.target.value)} placeholder="Contoh: 10000000" /></label><label>Harga rencana<input value={entry} inputMode="decimal" onChange={(event) => setEntry(event.target.value)} placeholder="Contoh: 6500" /></label><label>Batas risiko / stop<input value={stop} inputMode="decimal" onChange={(event) => setStop(event.target.value)} placeholder="Contoh: 6200" /></label><label>Risiko per ide (%)<input value={risk} inputMode="decimal" onChange={(event) => setRisk(event.target.value)} placeholder="Contoh: 1" /></label><button className="primary-action" onClick={() => setSubmitted(true)}>Hitung</button></div>{submitted && <div className="position-result">{result ? <><Metric label="Batas risiko nominal" value={`Rp ${result.riskBudget.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`} /><Metric label="Ukuran maksimum" value={`${result.lots.toLocaleString('id-ID')} lot (${result.quantity.toLocaleString('id-ID')} saham)`} /><Metric label="Estimasi nilai" value={`Rp ${result.cost.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`} /><Metric label="Porsi modal" value={`${result.allocation.toFixed(2)}%`} /></> : <p>Isi modal, harga rencana, stop yang lebih rendah dari harga, dan persentase risiko yang valid.</p>}</div>}</section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function ToolState({ text, loading }: { text: string; loading?: boolean }) { return <div className="stock-research-state">{loading ? <LoaderCircle className="spin" size={19} /> : <ClipboardCheck size={19} />}{text}</div>; }
