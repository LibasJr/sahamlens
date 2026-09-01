import { AlertCircle, CalendarDays, LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { requestFeature } from '../api';

type EventItem = { symbol?: string; type?: string; title?: string; description?: string };
type CalendarPayload = { events?: Record<string, EventItem[]> };
export function CalendarWorkspace() {
  const [data, setData] = useState<CalendarPayload | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = () => { setLoading(true); setError(''); void requestFeature('/api/calendar').then((value) => setData(value as CalendarPayload)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Kalender belum dapat dimuat.')).finally(() => setLoading(false)); };
  useEffect(load, []);
  const dates = Object.entries(data?.events ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return <section className="calendar-workspace"><div className="calendar-heading"><div><span className="section-kicker">KALENDER PASAR</span><h2>Aksi korporasi & earnings</h2><p>Agenda dari sumber SahamLens. Estimasi tetap diberi konteks pada setiap event.</p></div><button className="screener-tool" onClick={load}><RefreshCw className={loading ? 'spin' : ''} size={14} /> Refresh</button></div>{loading ? <div className="stock-research-state"><LoaderCircle className="spin" size={19} /> Memuat kalender…</div> : error ? <div className="stock-research-state error"><AlertCircle size={19} /> {error}</div> : dates.length ? <div className="calendar-list">{dates.map(([date, events]) => <div className="calendar-day" key={date}><time>{new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</time>{events.map((event, index) => <article key={`${event.symbol}-${event.title}-${index}`}><span>{event.symbol ?? 'IDX'}</span><div><strong>{event.title ?? event.type ?? 'Event pasar'}</strong><p>{event.description ?? 'Keterangan belum tersedia dari sumber.'}</p></div><small>{event.type ?? 'EVENT'}</small></article>)}</div>)}</div> : <div className="stock-research-state"><CalendarDays size={19} /> Tidak ada event kalender dari API saat ini.</div>}</section>;
}
