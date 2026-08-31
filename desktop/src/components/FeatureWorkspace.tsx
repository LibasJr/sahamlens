import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { API_BASE_URL, apiFetch } from '../api';
import { getToken } from '../tokenStore';

type Method = 'GET' | 'POST';
export type DesktopFeature = {
  id: string;
  label: string;
  endpoint?: (symbol?: string, secondary?: string) => string | undefined;
  method?: Method;
  note: string;
  body?: (symbol: string, secondary: string) => unknown;
  needsSymbol?: boolean;
};

export const desktopFeatures: DesktopFeature[] = [
  { id: 'market-pulse', label: 'Market Pulse', endpoint: () => '/api/market-pulse', note: 'Pergerakan indeks dan saham dari server.' },
  { id: 'market-summary', label: 'Market Summary', endpoint: () => '/api/market-summary', note: 'Regime, breadth, dan market movers.' },
  { id: 'technical', label: 'Teknikal', endpoint: s => s ? `/api/stock/${encodeURIComponent(s)}` : undefined, note: 'Analisis teknikal emiten terpilih.', needsSymbol: true },
  { id: 'fundamental', label: 'Fundamental', endpoint: s => s ? `/api/fundamental/${encodeURIComponent(s)}` : undefined, note: 'Data laporan dan kesehatan fundamental.', needsSymbol: true },
  { id: 'screener', label: 'Screener', endpoint: () => '/api/screener', note: 'Universe screener dari server.' },
  { id: 'watchlist', label: 'Watchlist', endpoint: () => '/api/watchlist', note: 'Watchlist akun yang terautentikasi.' },
  { id: 'calendar', label: 'Calendar', endpoint: () => '/api/calendar', note: 'Kalender aksi korporasi.' },
  { id: 'news', label: 'News', endpoint: () => '/api/news', note: 'Berita pasar dari provider server.' },
  { id: 'dividend', label: 'Dividend', endpoint: () => '/api/dividend-plan', note: 'Rencana dan data dividen.' },
  { id: 'portfolio', label: 'Portfolio', endpoint: () => '/api/portfolio', note: 'Portofolio akun yang terautentikasi.' },
  { id: 'recommendations', label: 'Recommendations', endpoint: () => '/api/recommendations', note: 'Rekomendasi tervalidasi server.' },
  { id: 'breakout', label: 'Breakout Radar', endpoint: () => '/api/breakout-radar', note: 'Radar breakout berbasis data pasar.' },
  { id: 'ownership', label: 'Ownership Flow', endpoint: s => s ? `/api/ownership-flow/${encodeURIComponent(s)}` : undefined, note: 'Flow kepemilikan emiten.', needsSymbol: true },
  { id: 'risk', label: 'Risk Analysis', endpoint: () => '/api/risk-analysis', method: 'POST', note: 'Beta portofolio dan stress test riil.', body: s => ({ portfolio: s ? [{ ticker: s, weight: 100 }] : [] }) },
  { id: 'backtest', label: 'Backtest', endpoint: () => '/api/backtest', method: 'POST', note: 'Simulasi strategi memakai histori server.', body: () => ({ filters: [], modal: 0, period: 1 }) },
  { id: 'macro', label: 'Macro', endpoint: () => '/api/macro', note: 'Data makroekonomi.' },
  { id: 'ai', label: 'LensAI', endpoint: () => '/api/ai-briefing', method: 'POST', note: 'Briefing AI berbasis market data.', body: () => ({ topPick: null, indices: [], lang: 'id' }) },
  { id: 'compare', label: 'Compare', endpoint: (s, p) => s ? `/api/compare?symbol1=${encodeURIComponent(s)}${p ? `&symbol2=${encodeURIComponent(p)}` : ''}` : undefined, note: 'Perbandingan emiten terpilih.', needsSymbol: true },
  { id: 'dcf', label: 'DCF', endpoint: s => s ? `/api/dcf/${encodeURIComponent(s)}` : undefined, note: 'Valuasi DCF emiten.', needsSymbol: true },
  { id: 'earnings', label: 'Earnings', endpoint: s => s ? `/api/earnings/${encodeURIComponent(s)}` : undefined, note: 'Data earnings publik emiten.', needsSymbol: true },
];

function DataView({ payload }: { payload: unknown }) {
  if (payload == null) return <div className="data-empty">Server tidak mengembalikan data.</div>;
  if (Array.isArray(payload)) return <div className="feature-json feature-list">{payload.map((item, i) => <div key={i}>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</div>)}</div>;
  return <pre className="feature-json">{JSON.stringify(payload, null, 2)}</pre>;
}

export function FeatureWorkspace({ feature, symbol }: { feature: DesktopFeature; symbol?: string }) {
  const [payload, setPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputSymbol, setInputSymbol] = useState(symbol ?? '');
  const [secondary, setSecondary] = useState('');
  useEffect(() => setInputSymbol(symbol ?? ''), [symbol]);
  const path = useMemo(() => feature.endpoint?.(inputSymbol.trim().toUpperCase(), secondary.trim().toUpperCase()), [feature, inputSymbol, secondary]);

  const load = async () => {
    if (!path) { setError('Masukkan atau pilih ticker terlebih dahulu.'); return; }
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      const headers: HeadersInit = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const init: RequestInit = { method: feature.method ?? 'GET', credentials: 'include', headers, signal: AbortSignal.timeout(60000) };
      if (feature.method === 'POST') {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(feature.body?.(inputSymbol.trim().toUpperCase(), secondary) ?? {});
      }
      const response = await apiFetch(`${API_BASE_URL}${path}`, init);
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      setPayload(body);
    } catch (reason) { setPayload(null); setError(reason instanceof Error ? reason.message : 'Data tidak dapat dimuat.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (!feature.needsSymbol) void load(); }, [feature.id]);
  return <section className="feature-workspace">
    <div className="feature-heading"><div><span className="section-kicker">DESKTOP FEATURE</span><h2>{feature.label}</h2><p>{feature.note}</p></div><div className="feature-heading-actions"><span className="feature-api-label"><i /> {feature.method ?? 'GET'} · LIVE API</span><button className="screener-tool" onClick={() => void load()} aria-label="Refresh feature"><RefreshCw size={14} /></button><a className="screener-tool feature-link" href={`${API_BASE_URL}/${feature.id}`} target="_blank" rel="noreferrer" aria-label="Buka fitur di web"><ExternalLink size={14} /></a></div></div>
    {(feature.needsSymbol || feature.method === 'POST') && <div className="feature-controls"><input value={inputSymbol} onChange={e => setInputSymbol(e.target.value)} placeholder="Ticker, contoh BBCA" aria-label="Ticker" />{feature.id === 'compare' && <input value={secondary} onChange={e => setSecondary(e.target.value)} placeholder="Ticker pembanding (opsional)" aria-label="Ticker pembanding" />}<button className="primary-action" onClick={() => void load()}>Muat data</button></div>}
    {loading ? <div className="feature-state"><LoaderCircle className="spin" size={18} /> Memuat data resmi…</div> : error ? <div className="feature-state error"><AlertCircle size={17} /> {error}</div> : <DataView payload={payload} />}
  </section>;
}
