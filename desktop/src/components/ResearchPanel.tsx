import { AlertCircle, BadgeCheck, Building2, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FundamentalSnapshot } from '../api';
import { getFundamentalSnapshot } from '../api';
import type { Ticker } from '../main';

export function ResearchPanel({ ticker, apiBaseUrl, apiStatus }: { ticker?: Ticker; apiBaseUrl: string; apiStatus: 'checking' | 'online' | 'offline' }) {
  const [data, setData] = useState<FundamentalSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!ticker?.symbol) { setData(null); return; }
    let alive = true; setLoading(true); setError('');
    void getFundamentalSnapshot(ticker.symbol).then((result) => { if (alive) setData(result); }).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : 'Data fundamental belum tersedia.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ticker?.symbol]);
  const metrics = data?.fundamentals;
  return <aside className="research-panel">
    <div className="research-heading"><div className="profile-avatar"><Building2 size={15} /></div><div><strong>Riset emiten</strong><small>{apiStatus === 'online' ? 'API SahamLens terhubung' : apiStatus === 'offline' ? 'API belum dapat dihubungi' : 'Memeriksa koneksi API'}</small></div><BadgeCheck size={15} className="muted-icon" /></div>
    {!ticker ? <div className="research-state">Pilih emiten untuk memuat ringkasan fundamental.</div> : loading ? <div className="research-state"><LoaderCircle className="spin" size={17} /> Memuat fundamental {ticker.symbol}…</div> : error ? <div className="research-state error"><AlertCircle size={17} /> {error}</div> : data ? <>
      <div className="issuer-card"><span>{data.stock?.symbol ?? ticker.symbol}</span><strong>{data.stock?.name ?? ticker.name}</strong><small>{data.source?.provider ?? 'Sumber tidak tersedia'}</small></div>
      <div className="research-score"><span>KUALITAS FUNDAMENTAL</span><strong>{data.fundamentalQuality?.pct == null ? '—' : `${data.fundamentalQuality.pct}%`}</strong><b>{data.fundamentalQuality?.label ?? 'Belum dinilai'}</b><small>{data.consensus ?? 'Kesimpulan belum tersedia.'}</small></div>
      <div className="metric-grid"><Metric label="P/E" value={formatMultiple(metrics?.trailingPE)} /><Metric label="PBV" value={formatMultiple(metrics?.priceToBook)} /><Metric label="ROE" value={formatPercent(metrics?.returnOnEquity)} /><Metric label="DIVIDEN" value={formatPercent(metrics?.dividendYield)} /></div>
      <div className="research-list"><span>INDIKATOR TERATAS</span>{data.analyzers?.filter((item) => item.value !== 'N/A').slice(0, 5).map((item) => <div key={item.label}><small>{item.label}</small><strong>{item.value}</strong><b className={item.decision === 'BULLISH' ? 'positive' : item.decision === 'BEARISH' ? 'negative' : ''}>{item.decision}</b></div>)}</div>
    </> : <div className="research-state">Belum ada data fundamental.</div>}
    <small className="api-note">Sumber: {apiBaseUrl.replace('https://', '')}</small>
  </aside>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function formatPercent(value: number | null | undefined) { return value == null ? '—' : `${(value * 100).toFixed(2)}%`; }
function formatMultiple(value: number | null | undefined) { return value == null ? '—' : `${value.toFixed(2)}x`; }
