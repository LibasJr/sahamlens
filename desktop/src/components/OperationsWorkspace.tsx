import { Activity, AlertCircle, BrainCircuit, Database, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MarketPulse, MarketSummary } from '../api';
import { requestFeature } from '../api';
import { MarketOverview } from './MarketOverview';
import { RadarWorkspace } from './RadarWorkspace';

export function IntelligenceWorkspace({ market, error, onSelect }: { market: { summary: MarketSummary; pulse: MarketPulse } | null; error: string; onSelect: (symbol: string) => void }) {
  return <div className="operations-workspace"><div className="operations-intro"><BrainCircuit size={26} /><div><span className="section-kicker">MARKET INTELLIGENCE</span><h2>Konteks sebelum keputusan</h2><p>Regime, breadth, sektor, movers, dan kandidat scanner dari data SahamLens.</p></div></div><MarketOverview market={market} error={error} onSelect={onSelect} /><RadarWorkspace onSelect={onSelect} /></div>;
}

type AdminPayload = { redis?: string; jobs?: Array<{ job_name?: string; last_status?: string; last_success_at?: string | null; failures_24h?: number }>; sources?: Array<{ sourceId?: string; status?: string; message?: string }> };
export function AdminConsole() {
  const [data, setData] = useState<AdminPayload | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); setError(''); void requestFeature('/api/admin/desktop-overview').then((value) => setData(value as AdminPayload)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Console admin tidak dapat dimuat.')).finally(() => setLoading(false)); };
  useEffect(load, []);
  return <section className="admin-console"><div className="operations-intro"><ShieldCheck size={26} /><div><span className="section-kicker">ADMIN CONSOLE</span><h2>Operasional SahamLens</h2><p>Status ini hanya dapat dibuka oleh akun dengan role admin.</p></div><button className="screener-tool" onClick={load}><RefreshCw className={loading ? 'spin' : ''} size={14} /> Refresh</button></div>{loading ? <div className="stock-research-state"><LoaderCircle className="spin" size={19} /> Memuat status operasional…</div> : error ? <div className="stock-research-state error"><AlertCircle size={19} /> {error}</div> : <><div className="admin-status-grid"><Status label="REDIS" value={data?.redis ?? '—'} icon={Database} /><Status label="SUMBER DATA" value={`${data?.sources?.length ?? 0} diperiksa`} icon={Activity} /><Status label="JOB TERPANTAU" value={`${data?.jobs?.length ?? 0}`} icon={ShieldCheck} /></div><div className="admin-list"><h3>Sumber data</h3>{data?.sources?.length ? data.sources.map((source, index) => <div key={`${source.sourceId}-${index}`}><strong>{source.sourceId ?? 'Sumber'}</strong><span className={source.status === 'ok' ? 'positive' : 'negative'}>{source.status ?? 'UNKNOWN'}</span><small>{source.message ?? 'Tidak ada pesan status.'}</small></div>) : <p>Belum ada status sumber yang dikembalikan.</p>}</div><div className="admin-list"><h3>Job terbaru</h3>{data?.jobs?.length ? data.jobs.map((job, index) => <div key={`${job.job_name}-${index}`}><strong>{job.job_name ?? 'Job'}</strong><span className={job.last_status === 'success' ? 'positive' : 'negative'}>{job.last_status ?? 'BELUM ADA RUN'}</span><small>{job.last_success_at ? new Date(job.last_success_at).toLocaleString('id-ID') : 'Belum ada sukses tercatat.'}</small></div>) : <p>Belum ada job yang dikembalikan.</p>}</div></>}</section>;
}
function Status({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Database }) { return <div><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>; }
