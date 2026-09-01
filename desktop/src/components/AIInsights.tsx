import { AlertCircle, BrainCircuit, CheckCircle2, LoaderCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getAIInsights } from '../api';
import { presentAIInsight } from '../aiInsightPresenter';

export function AIInsights({ ticker }: { ticker?: string }) {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null); setError('');
    if (!ticker) return undefined;
    void getAIInsights(ticker).then((value) => { if (live) setData(value); }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Data tidak tersedia'); });
    return () => { live = false; };
  }, [ticker]);
  const insight = ticker && data ? presentAIInsight(data, ticker) : null;
  const scoreText = insight?.score == null ? '—' : insight.score.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  return <section className="ai-card" aria-live="polite"><div className="ai-card-heading"><span className="ai-icon"><BrainCircuit size={16} /></span><div><span className="section-kicker">SAHAMLENS AI · {ticker ?? '—'}</span><h3>Insight riset berbasis data</h3></div><Sparkles size={15} className="sparkle" /></div>
    {!ticker ? <div className="ai-state">Pilih emiten untuk memuat insight.</div> : error ? <div className="ai-state error"><AlertCircle size={15} /> {error}</div> : !data ? <div className="ai-state"><LoaderCircle className="spin" size={15} /> Memuat evidence {ticker}…</div> : !insight ? <div className="ai-state"><AlertCircle size={15} /> Rekomendasi {ticker} belum tersedia.</div> : <>
      <div className="lens-score"><div><span className="score-label">LENSCORE</span><strong>{scoreText}</strong><span className="score-grade">{insight.category} · {insight.consensus}</span></div><div className="score-ring"><span>{scoreText}</span></div></div>
      <div className="ai-trust-row"><span>{insight.coverage == null ? 'Coverage —' : `Coverage ${insight.coverage.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`}</span><span>{insight.freshness}</span><span className={insight.modelValidated ? 'positive' : 'caution'}>{insight.modelValidated ? <CheckCircle2 size={12} /> : <ShieldAlert size={12} />}{insight.modelValidated ? 'Model tervalidasi' : insight.modelReason}</span></div>
      {insight.evidence.length > 0 && <div className="ai-evidence"><span>EVIDENCE AKTUAL</span>{insight.evidence.map((item) => <div key={item.label}><small>{item.label}</small><strong>{item.value}</strong></div>)}</div>}
      {insight.supportingReasons.length > 0 && <div className="ai-reasons"><span>ALASAN PENDUKUNG</span><ul>{insight.supportingReasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
      {insight.riskFlags.length > 0 && <div className="ai-reasons risk"><span>RISIKO / BATASAN</span><ul>{insight.riskFlags.slice(0, 3).map((flag) => <li key={flag}>{flag}</li>)}</ul></div>}
      <p className="ai-summary">Data SahamLens ditampilkan apa adanya untuk membantu riset, bukan instruksi transaksi.</p>
    </>}
  </section>;
}
