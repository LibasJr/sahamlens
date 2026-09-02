import { AlertCircle, BrainCircuit, ChevronLeft, LoaderCircle, Maximize2, Minimize2, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getAIInsights, getFundamentalSnapshot, type FundamentalSnapshot } from '../api';

type Props = { open: boolean; symbol?: string; workspace: string; onClose: () => void };
type Loaded = { insight: Record<string, unknown>; fundamental: FundamentalSnapshot; retrievedAt: string };

function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }
function value(value: unknown): string { return value == null ? 'Tidak tersedia' : typeof value === 'number' ? value.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : String(value); }

export function LensAIDrawer({ open, symbol, workspace, onClose }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'assistant' | 'consensus'>('assistant');
  const [question, setQuestion] = useState('Ringkas kondisi emiten ini');
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !symbol) return;
    let active = true; setLoading(true); setError('');
    void Promise.all([getAIInsights(symbol), getFundamentalSnapshot(symbol)]).then(([insight, fundamental]) => {
      if (active) setData({ insight: (insight && typeof insight === 'object' ? insight : {}) as Record<string, unknown>, fundamental, retrievedAt: new Date().toISOString() });
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Data Lens AI tidak tersedia.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, symbol]);
  const answer = useMemo(() => {
    if (!data) return [];
    const metrics = data.fundamental.fundamentals;
    const score = data.insight.lensScore ?? data.insight.lens_score ?? data.insight.score;
    const consensus = text(data.fundamental.consensus);
    if (mode === 'consensus') return [
      ['Konsensus SahamLens', consensus ?? 'Belum tersedia dari server'],
      ['LensScore', value(score)],
      ['Kualitas fundamental', data.fundamental.fundamentalQuality?.label ?? 'Belum dinilai'],
    ];
    if (question.includes('valuasi')) return [['P/E', value(metrics?.trailingPE)], ['PBV', value(metrics?.priceToBook)], ['ROE', metrics?.returnOnEquity == null ? 'Tidak tersedia' : `${(metrics.returnOnEquity * 100).toFixed(2)}%`]];
    if (question.includes('risiko')) return [['Konsensus', consensus ?? 'Tidak tersedia'], ['Sumber', data.fundamental.source?.provider ?? 'Tidak tersedia'], ['Catatan', 'Periksa chart, invalidasi, dan kualitas data sebelum mengambil keputusan.']];
    return [['LensScore', value(score)], ['Konsensus', consensus ?? 'Tidak tersedia'], ['Kualitas fundamental', data.fundamental.fundamentalQuality?.label ?? 'Belum dinilai'], ['ROE', metrics?.returnOnEquity == null ? 'Tidak tersedia' : `${(metrics.returnOnEquity * 100).toFixed(2)}%`]];
  }, [data, mode, question]);
  if (!open) return null;
  return <aside className={`lens-ai-drawer${expanded ? ' expanded' : ''}`} aria-label="Lens AI">
    <header><span className="lens-ai-mark"><BrainCircuit size={18} /></span><div><strong>Lens AI</strong><small>{symbol ? `${symbol} · ${workspace}` : `Konteks ${workspace}`}</small></div><button onClick={() => setExpanded((v) => !v)} aria-label={expanded ? 'Perkecil Lens AI' : 'Perbesar Lens AI'}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button onClick={onClose} aria-label="Tutup Lens AI"><X size={17} /></button></header>
    <nav aria-label="Mode Lens AI"><button className={mode === 'assistant' ? 'active' : ''} onClick={() => setMode('assistant')}><Sparkles size={14} /> Asisten</button><button className={mode === 'consensus' ? 'active' : ''} onClick={() => setMode('consensus')}><ChevronLeft size={14} /> Consensus Agent</button></nav>
    {!symbol ? <div className="lens-ai-state">Pilih emiten agar Lens AI memperoleh konteks data.</div> : loading ? <div className="lens-ai-state"><LoaderCircle className="spin" size={18} /> Memuat data nyata {symbol}…</div> : error ? <div className="lens-ai-state error"><AlertCircle size={18} /> {error}</div> : <><div className="lens-ai-questions">{['Ringkas kondisi emiten ini', 'Bagaimana valuasinya?', 'Apa risiko utamanya?'].map((item) => <button key={item} className={question === item ? 'active' : ''} onClick={() => setQuestion(item)}>{item}</button>)}</div><section className="lens-ai-answer"><span>{mode === 'consensus' ? 'KONSENSUS EMITEN' : question.toUpperCase()}</span>{answer.map(([label, item]) => <div key={label}><small>{label}</small><strong>{item}</strong></div>)}</section><small className="lens-ai-source">Sumber: {data?.fundamental.source?.provider ?? 'SahamLens API'} · Data diperbarui {data?.fundamental.source?.retrievedAt ?? data?.retrievedAt ?? 'tidak tersedia'}</small></>}
    <footer>SahamLens adalah alat riset, bukan jaminan atau rekomendasi investasi.</footer>
  </aside>;
}
