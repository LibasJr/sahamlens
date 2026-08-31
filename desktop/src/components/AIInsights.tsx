import { BrainCircuit, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getAIInsights } from '../api';
export function AIInsights({ ticker }: { ticker?: string }) {
  const [data, setData] = useState<unknown>(null); const [error, setError] = useState('');
  useEffect(() => { let live = true; if (!ticker) return undefined; setData(null); void getAIInsights(ticker).then(v => { if (live) setData(v); }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Data tidak tersedia'); }); return () => { live = false; }; }, [ticker]);
  const obj = data && typeof data === 'object' ? data as Record<string, unknown> : {}; const score = obj.lensScore ?? obj.lens_score ?? obj.score;
  return <div className="ai-card"><div className="ai-card-heading"><span className="ai-icon"><BrainCircuit size={16} /></span><div><span className="section-kicker">SAHAMLENS AI · {ticker ?? '—'}</span><h3>Real-time AI Insights</h3></div><Sparkles size={15} className="sparkle" /></div><div className="lens-score"><div><span className="score-label">LENSCORE</span><strong>{score == null ? '—' : String(score)}</strong><span className="score-grade">{error || (data ? 'LIVE API DATA' : 'MEMUAT DATA…')}</span></div><div className="score-ring"><span>{score == null ? '—' : String(score)}</span></div></div><p className="ai-summary">{error || (data ? 'Data emiten berhasil dimuat dari API SahamLens.' : 'Mengambil data emiten dari API SahamLens…')}</p></div>;
}
