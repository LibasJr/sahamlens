import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, LockKeyhole, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import { requestFeature } from '../api';

type Method = 'GET' | 'POST';
type Field = { key: string; label: string; placeholder: string; type?: 'text' | 'number' };
export type DesktopFeature = {
  id: string;
  label: string;
  endpoint?: (symbol?: string, secondary?: string) => string | undefined;
  method?: Method;
  note: string;
  body?: (symbol: string, secondary: string, fields: Record<string, string>) => unknown;
  needsSymbol?: boolean;
  fields?: Field[];
  access?: 'public' | 'account' | 'pro';
};

export const desktopFeatures: DesktopFeature[] = [
  { id: 'market-pulse', label: 'Market Pulse', endpoint: () => '/api/market-pulse', note: 'Pergerakan indeks dan saham dari server.' },
  { id: 'market-summary', label: 'Market Summary', endpoint: () => '/api/market-summary', note: 'Regime, breadth, dan market movers.' },
  { id: 'technical', label: 'Teknikal', endpoint: s => s ? `/api/stock/${encodeURIComponent(s)}` : undefined, note: 'Analisis teknikal emiten terpilih.', needsSymbol: true, access: 'account' },
  { id: 'fundamental', label: 'Fundamental', endpoint: s => s ? `/api/fundamental/${encodeURIComponent(s)}` : undefined, note: 'Data laporan dan kesehatan fundamental.', needsSymbol: true },
  { id: 'screener', label: 'Screener', endpoint: () => '/api/screener', note: 'Universe screener dari server.' },
  { id: 'watchlist', label: 'Daftar Pantau', endpoint: () => '/api/watchlist', note: 'Daftar Pantau manual milik akun yang terautentikasi.', access: 'account' },
  { id: 'calendar', label: 'Calendar', endpoint: () => '/api/calendar', note: 'Kalender aksi korporasi.' },
  { id: 'news', label: 'News', endpoint: () => '/api/news', note: 'Berita pasar dari provider server.' },
  { id: 'dividend', label: 'Dividend', endpoint: () => '/api/dividend-plan', note: 'Rencana dan data dividen.', fields: [{ key: 'capital', label: 'Modal awal', placeholder: '10000000', type: 'number' }, { key: 'targetMonthly', label: 'Target bulanan', placeholder: '500000', type: 'number' }] },
  { id: 'portfolio', label: 'Portfolio', endpoint: () => '/api/portfolio', note: 'Portofolio akun yang terautentikasi.', access: 'account' },
  { id: 'recommendations', label: 'Recommendations', endpoint: s => `/api/recommendations?symbols=${encodeURIComponent(s || 'BBCA.JK')}`, note: 'Rekomendasi tervalidasi server.', needsSymbol: true, access: 'pro' },
  { id: 'breakout', label: 'Breakout Radar', endpoint: () => '/api/breakout-radar', note: 'Radar breakout berbasis data pasar.' },
  { id: 'ownership', label: 'Ownership Flow', endpoint: s => s ? `/api/ownership-flow/${encodeURIComponent(s)}` : undefined, note: 'Flow kepemilikan emiten.', needsSymbol: true },
  { id: 'risk', label: 'Risk Analysis', endpoint: () => '/api/risk-analysis', method: 'POST', note: 'Beta portofolio dan stress test riil.', body: s => ({ portfolio: s ? [{ ticker: s, weight: 100 }] : [] }) },
  { id: 'backtest', label: 'Backtest', endpoint: () => '/api/backtest', method: 'POST', note: 'Simulasi strategi memakai histori server.', fields: [{ key: 'modal', label: 'Modal', placeholder: '10000000', type: 'number' }, { key: 'period', label: 'Periode (tahun)', placeholder: '1', type: 'number' }], body: (s, _, fields) => ({ filters: s ? [{ symbol: s }] : [], modal: Number(fields.modal || 10000000), period: Number(fields.period || 1) }) },
  { id: 'macro', label: 'Macro', endpoint: () => '/api/macro', note: 'Data makroekonomi.' },
  { id: 'ai', label: 'LensAI', endpoint: () => '/api/ai-briefing', method: 'POST', note: 'Briefing AI berbasis market data.', fields: [{ key: 'lang', label: 'Bahasa', placeholder: 'id atau en' }], body: (_, __, fields) => ({ topPick: null, indices: [], lang: fields.lang || 'id' }) },
  { id: 'compare', label: 'Compare', endpoint: (s, p) => s ? `/api/compare?symbol1=${encodeURIComponent(s)}${p ? `&symbol2=${encodeURIComponent(p)}` : ''}` : undefined, note: 'Perbandingan emiten terpilih.', needsSymbol: true },
  { id: 'dcf', label: 'DCF', endpoint: s => s ? `/api/dcf/${encodeURIComponent(s)}` : undefined, note: 'Valuasi DCF emiten.', needsSymbol: true },
  { id: 'earnings', label: 'Earnings', endpoint: s => s ? `/api/earnings/${encodeURIComponent(s)}` : undefined, note: 'Data earnings publik emiten.', needsSymbol: true },
];

function DataView({ payload }: { payload: unknown }) {
  const value = payload && typeof payload === 'object' && 'data' in payload && (payload as { data?: unknown }).data ? (payload as { data: unknown }).data : payload;
  if (value == null) return <div className="data-empty">Server tidak mengembalikan data.</div>;
  if (Array.isArray(value)) return <div className="data-cards">{value.length ? value.slice(0, 20).map((item, index) => <DataCard key={index} value={item} />) : <div className="data-empty">Tidak ada data untuk parameter ini.</div>}</div>;
  if (typeof value !== 'object') return <div className="data-value">{String(value)}</div>;
  return <div className="data-cards"><DataCard value={value} /></div>;
}

function labelFor(key: string) { return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); }
function valueText(value: unknown) { if (value == null) return '—'; if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'; if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('id-ID') : value.toLocaleString('id-ID', { maximumFractionDigits: 3 }); return String(value); }
function DataCard({ value }: { value: unknown }) {
  if (value == null || typeof value !== 'object') return <div className="data-card"><strong>{valueText(value)}</strong></div>;
  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => !['_meta', 'meta', 'provenance', 'description'].includes(key));
  const primitive = entries.filter(([, item]) => item == null || ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 12);
  const collections = entries.filter(([, item]) => Array.isArray(item)).slice(0, 3);
  return <div className="data-card"><div className="data-fields">{primitive.map(([key, item]) => <div key={key}><span>{labelFor(key)}</span><strong>{valueText(item)}</strong></div>)}</div>{collections.map(([key, items]) => <div className="data-collection" key={key}><span>{labelFor(key)}</span>{(items as unknown[]).slice(0, 6).map((item, index) => <DataCard key={index} value={item} />)}</div>)}</div>;
}

export function FeatureWorkspace({ feature, symbol, authenticated = false, onRequestAuth }: { feature: DesktopFeature; symbol?: string; authenticated?: boolean; onRequestAuth?: () => void }) {
  const [payload, setPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputSymbol, setInputSymbol] = useState(symbol ?? '');
  const [secondary, setSecondary] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({ capital: '10000000', targetMonthly: '500000', modal: '10000000', period: '1', lang: 'id' });
  useEffect(() => setInputSymbol(symbol ?? ''), [symbol]);
  const path = useMemo(() => {
    const base = feature.endpoint?.(inputSymbol.trim().toUpperCase(), secondary.trim().toUpperCase());
    if (!base) return base;
    if (feature.id === 'dividend') return `${base}?capital=${encodeURIComponent(fields.capital || '10000000')}&targetMonthly=${encodeURIComponent(fields.targetMonthly || '500000')}`;
    return base;
  }, [feature, inputSymbol, secondary, fields]);

  const load = async () => {
    if (feature.access === 'pro') { setError('PRO_DISABLED_TESTING'); return; }
    if (feature.access === 'account' && !authenticated) { setError('ACCOUNT_REQUIRED'); return; }
    if (!path) { setError('Masukkan atau pilih ticker terlebih dahulu.'); return; }
    setLoading(true); setError(null);
    try {
      const init: RequestInit = { method: feature.method ?? 'GET', signal: AbortSignal.timeout(60000) };
      if (feature.method === 'POST') init.body = JSON.stringify(feature.body?.(inputSymbol.trim().toUpperCase(), secondary, fields) ?? {});
      if (feature.method === 'POST') init.headers = { 'Content-Type': 'application/json' };
      setPayload(await requestFeature(path, init));
    } catch (reason) { setPayload(null); setError(reason instanceof Error ? reason.message : 'Data tidak dapat dimuat.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    setPayload(null); setError(null);
    // A selected issuer must immediately populate its research tab. POST tools and
    // comparisons remain explicit actions because they need user-entered parameters.
    if (path && feature.method !== 'POST' && feature.id !== 'compare' && feature.access !== 'pro' && (feature.access !== 'account' || authenticated)) void load();
  // `path` is the complete request identity; load intentionally reads the current form state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature.id, path, authenticated]);
  const locked = feature.access === 'pro' || (feature.access === 'account' && !authenticated);
  return <section className="feature-workspace">
    <div className="feature-heading"><div><span className="section-kicker">RISET SAHAMLENS</span><h2>{feature.label}</h2><p>{feature.note}</p></div><div className="feature-heading-actions"><span className="feature-api-label"><i /> {feature.method ?? 'GET'} · {feature.access === 'pro' ? 'PRO' : feature.access === 'account' ? 'AKUN' : 'PUBLIK'}</span><button className="screener-tool" onClick={() => void load()} aria-label="Muat ulang"><RefreshCw size={14} /> Refresh</button></div></div>
    {locked ? <div className="feature-access-gate" role="status">{feature.access === 'pro' ? <Sparkles size={22} /> : <LockKeyhole size={22} />}<div><strong>{feature.access === 'pro' ? 'Segera hadir setelah masa testing' : 'Buka riset lengkap dengan akun gratis'}</strong><p>{feature.access === 'pro' ? 'Fitur ini ditampilkan sebagai pratinjau. Akses Pro belum diaktifkan untuk akun mana pun.' : 'Daftar atau masuk untuk membuka fitur akun dan menyinkronkan riset lintas perangkat.'}</p></div>{feature.access === 'account' && <button className="primary-action" onClick={onRequestAuth}>Daftar / Masuk</button>}</div> : <>{(feature.needsSymbol || feature.method === 'POST' || feature.fields) && <div className="feature-controls">{(feature.needsSymbol || feature.id === 'risk') && <input value={inputSymbol} onChange={e => setInputSymbol(e.target.value)} placeholder="Ticker, contoh BBCA" aria-label="Ticker" />}{feature.id === 'compare' && <input value={secondary} onChange={e => setSecondary(e.target.value)} placeholder="Ticker pembanding" aria-label="Ticker pembanding" />}{feature.fields?.map(field => <input key={field.key} type={field.type ?? 'text'} value={fields[field.key] ?? ''} onChange={e => setFields(current => ({ ...current, [field.key]: e.target.value }))} placeholder={`${field.label}: ${field.placeholder}`} aria-label={field.label} />)}<button className="primary-action" onClick={() => void load()}>Muat data</button></div>}
    {loading ? <div className="feature-state"><LoaderCircle className="spin" size={18} /> Memuat data resmi…</div> : error ? <div className="feature-state error"><AlertCircle size={17} /> {error.includes('401') ? 'Fitur ini memerlukan autentikasi desktop.' : error.includes('402') || error.includes('Pro') ? 'Fitur ini memerlukan akses Pro.' : error}</div> : <DataView payload={payload} />}
  </>}</section>;
  }
