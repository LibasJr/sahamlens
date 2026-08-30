'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw, XCircle } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import type { DecisionAgentDashboard, PaperOrder, PersistedDecisionSignal } from '@/modules/decision-agent';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';
import { mapEvidenceLabels } from '@/shared/presentation/hybrid-evidence-labels';

const PAPER_READINESS_LABEL: Record<string, string> = {
  PAPER_READY: 'Siap paper',
  RESEARCH_ONLY: 'Untuk riset saja',
};

const LIVE_READINESS_LABEL: Record<string, string> = {
  BLOCKED_MODEL_UNVALIDATED: 'Terkunci: model belum tervalidasi',
  BLOCKED_STALE_DATA: 'Terkunci: data terlalu lama',
  BLOCKED_DATA_QUALITY: 'Terkunci: kualitas data kurang',
  BLOCKED_BROKER_NOT_CONFIGURED: 'Terkunci: broker belum terkonfigurasi',
};

function describePaperReadiness(value: string): string {
  return PAPER_READINESS_LABEL[value] ?? value;
}

function describeLiveReadiness(value: string): string {
  return LIVE_READINESS_LABEL[value] ?? value;
}

type ActionBody =
  | { action: 'scan' }
  | { action: 'freeze-pilot-protocol' }
  | { action: 'import-idx-ic'; csvText: string; sourceUrl: string; sourceAsOf: string }
  | { action: 'import-stockbit'; csvText: string; filename: string; sourceType: 'TRANSACTION_HISTORY' | 'E_STATEMENT' }
  | { action: 'configure-paper-account'; config: {
      initialCash: number; riskBudgetPct: number; maxPositionPct: number; maxOpenPositions: number;
      maxTotalExposurePct: number; maxSectorExposurePct: number; maxAdvParticipationPct: number;
      maxPositionsPerSector: number;
      maxDrawdownPct: number; buyFeePct: number; sellFeePct: number; slippageBps: number;
    } }
  | { action: 'propose-paper-order'; signalId: string; thesis?: {
      thesis: string; invalidationCriteria: string[]; catalyst: string | null; reviewAt: string;
    } }
  | { action: 'execute-paper-order' | 'reject-paper-order' | 'execute-live-order'; orderId: string }
  | { action: 'get-ticker-review'; ticker: string };

function formatNumber(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value);
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
}

function SignalRow({ signal, busy, onPrepare, viewMode }: { signal: PersistedDecisionSignal; busy: boolean; onPrepare: (signal: PersistedDecisionSignal) => void; viewMode: 'ringkas' | 'detail' }) {
  const hybridEvidence = signal.hybridReview ? mapEvidenceLabels(signal, signal.hybridReview.evidenceRefs) : [];
  return (
    <tr className="border-t border-tv-border align-top">
      <td className="px-3 py-3 font-bold">{signal.ticker}</td>
      <td className="px-3 py-3"><span className="rounded bg-tv-bg px-2 py-1 text-xs font-bold">{signal.action}</span></td>
      <td className="px-3 py-3 font-number">{formatNumber(signal.price)}</td>
      <td className="px-3 py-3 font-number">Skor {formatNumber(signal.lensScore, 1)} · coverage {formatNumber(signal.coveragePct, 1)}%</td>
      <td className="px-3 py-3 text-xs">
        {signal.riskSetup ? <>stop {formatNumber(signal.riskSetup.stop)} · target {formatNumber(signal.riskSetup.target1)} · RR {formatNumber(signal.riskSetup.riskReward, 2)}</> : 'Belum ada setup risiko'}
      </td>
      <td className="max-w-sm px-3 py-3 text-xs text-tv-muted">
        <div>{[...signal.supportingReasons, ...signal.opposingReasons, ...signal.invalidationReasons].slice(0, 3).join(' · ') || 'Tidak ada alasan tambahan.'}</div>
        {viewMode === 'detail' && <>
          <div className="mt-1">{signal.news.basis !== 'UNAVAILABLE' ? `${signal.news.basis}: positif ${signal.news.positive} · netral ${signal.news.neutral} · negatif ${signal.news.negative}` : 'Berita tidak tersedia'}</div>
          <div className="mt-1">Sektor: {signal.sector ?? '—'} · ADV20: {signal.avgValue20d == null ? '—' : `Rp ${formatNumber(signal.avgValue20d)}`}</div>
          {signal.news.matchedArticles?.slice(0, 2).map((article) => (
            <a key={`${article.url}:${article.title}`} className="mt-1 block text-tv-blue hover:underline" href={article.url} target="_blank" rel="noreferrer">
              {article.source} · {article.eventType} · {article.basis}
            </a>
          ))}
        </>}
      </td>
      <td className="max-w-xs px-3 py-3 text-xs">
        <div className="font-bold">{signal.hybridStatus}</div>
        {viewMode === 'detail' && signal.hybridReview ? <>
          <div className="mt-1 text-tv-muted">{signal.hybridReview.model} · confidence {signal.hybridReview.confidence}</div>
          {signal.hybridReview.concerns.length > 0 && <div className="mt-1 text-tv-muted">Concern: {signal.hybridReview.concerns.join(', ')}</div>}
          {hybridEvidence.length > 0 && <div className="mt-2 rounded border border-tv-border bg-tv-bg/60 p-2">
            <div className="mb-1 font-semibold text-tv-muted">Evidence aktual yang dirujuk:</div>
            <ul className="space-y-1">
              {hybridEvidence.slice(0, 6).map((item) => (
                <li key={item.ref} className="leading-snug" title={item.ref}>
                  <span className="font-semibold">{item.label}:</span> <span className="text-tv-muted">{item.value}</span>
                </li>
              ))}
            </ul>
            {hybridEvidence.length > 6 && <div className="mt-1 text-tv-muted">+{hybridEvidence.length - 6} evidence lain</div>}
          </div>}
        </> : (viewMode === 'detail' && <div className="mt-1 text-tv-muted">Belum ada second opinion terstruktur.</div>)}
      </td>
      <td className="px-3 py-3">
        {signal.paperReadiness === 'PAPER_READY' && (signal.action === 'BUY_CANDIDATE' || signal.action === 'EXIT_REVIEW') ? (
          <Button size="sm" disabled={busy} onClick={() => onPrepare(signal)}>{signal.action === 'BUY_CANDIDATE' ? 'Siapkan tesis & paper' : 'Usulkan exit paper'}</Button>
        ) : <span className="text-xs text-tv-muted">{describePaperReadiness(signal.paperReadiness)}</span>}
      </td>
    </tr>
  );
}

function OrderRow({ order, busy, onAction }: { order: PaperOrder; busy: boolean; onAction: (body: ActionBody) => void }) {
  return (
    <tr className="border-t border-tv-border">
      <td className="px-3 py-3">{order.ticker}</td>
      <td className="px-3 py-3">{order.side}</td>
      <td className="px-3 py-3 font-number">
        {formatNumber(order.lots)} lot · referensi {formatNumber(order.limitPrice)}
        {order.fillPrice != null && <div className="mt-1 text-xs text-tv-muted">fill {formatNumber(order.fillPrice)} · fee Rp {formatNumber(order.feeValue)} · slip {formatNumber(order.slippageBps, 1)} bps</div>}
      </td>
      <td className="px-3 py-3">{order.status}</td>
      <td className="px-3 py-3 text-xs text-tv-muted">{order.rationale}{order.priceSource && <div className="mt-1">{order.priceSource} · {order.freshness} · {formatTime(order.priceAsOf)}</div>}</td>
      <td className="px-3 py-3">
        {order.status === 'PROPOSED' ? <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => onAction({ action: 'execute-paper-order', orderId: order.id })}><CheckCircle2 className="h-4 w-4" /> Konfirmasi</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAction({ action: 'reject-paper-order', orderId: order.id })}><XCircle className="h-4 w-4" /> Tolak</Button>
        </div> : formatTime(order.executedAt ?? order.proposedAt)}
      </td>
    </tr>
  );
}

export default function DecisionLabClient({ initialDashboard }: { initialDashboard: DecisionAgentDashboard }) {
  const [dashboard, setDashboard] = useState<DecisionAgentDashboard>(initialDashboard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [policy, setPolicy] = useState({
    initialCash: '', riskBudgetPct: '', maxPositionPct: '', maxOpenPositions: '',
    maxTotalExposurePct: '', maxSectorExposurePct: '', maxAdvParticipationPct: '',
    maxPositionsPerSector: '',
    maxDrawdownPct: '', buyFeePct: '', sellFeePct: '', slippageBps: '',
  });
  const [selectedSignal, setSelectedSignal] = useState<PersistedDecisionSignal | null>(null);
  const [tickerQuery, setTickerQuery] = useState('');
  const [tickerReview, setTickerReview] = useState<PersistedDecisionSignal | null>(null);
  const [thesis, setThesis] = useState('');
  const [invalidation, setInvalidation] = useState('');
  const [catalyst, setCatalyst] = useState('');
  const [reviewAt, setReviewAt] = useState('');
  const [idxSourceUrl, setIdxSourceUrl] = useState('');
  const [idxSourceAsOf, setIdxSourceAsOf] = useState('');
  const [viewMode, setViewMode] = useState<'ringkas' | 'detail'>('ringkas');

  async function importFile(file: File | undefined, kind: 'IDX_IC' | 'STOCKBIT') {
    if (!file) return;
    if (file.size > 5_000_000) { setError('File maksimal 5 MB.'); return; }
    const csvText = await file.text();
    if (kind === 'IDX_IC') {
      if (!idxSourceUrl || !idxSourceAsOf) { setError('URL sumber resmi IDX dan tanggal as-of wajib diisi.'); return; }
      await act({ action: 'import-idx-ic', csvText, sourceUrl: idxSourceUrl, sourceAsOf: idxSourceAsOf }, 'Klasifikasi IDX-IC resmi diimpor.');
    } else {
      await act({ action: 'import-stockbit', csvText, filename: file.name, sourceType: 'TRANSACTION_HISTORY' }, 'Transaction History Stockbit diimpor dan direkonsiliasi.');
    }
  }

  async function load() {
    setBusy(true); setError(null);
    try {
      const data = await apiRequest<DecisionAgentDashboard>('/api/admin/decision-lab', { cache: 'no-store' });
      setDashboard(data);
    } catch (cause) { setError(apiErrorMessage(cause, 'Gagal memuat dashboard', true)); }
    finally { setBusy(false); }
  }

  async function act(body: ActionBody, success = 'Aksi berhasil dicatat.'): Promise<boolean> {
    setBusy(true); setError(null); setNotice(null);
    try {
      const data = await apiRequest<{ dashboard: DecisionAgentDashboard }>('/api/admin/decision-lab', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setDashboard(data.dashboard); setNotice(success); return true;
    } catch (cause) { setError(apiErrorMessage(cause, 'Aksi gagal', true)); return false; }
    finally { setBusy(false); }
  }

  async function reviewTicker() {
    const ticker = tickerQuery.trim().toUpperCase();
    if (!ticker) {
      setError('Isi ticker dulu, mis. BBCA atau TLKM.');
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      const data = await apiRequest<{ result: PersistedDecisionSignal | null }>('/api/admin/decision-lab', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-ticker-review', ticker }),
      });
      setTickerReview(data.result);
      setNotice(data.result ? `Review ${ticker} dimuat.` : `Belum ada review untuk ${ticker}.`);
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Gagal memuat review ticker', true));
    } finally {
      setBusy(false);
    }
  }

  function configure() {
    const config = Object.fromEntries(Object.entries(policy).map(([key, value]) => [key, Number(value)])) as Extract<ActionBody, { action: 'configure-paper-account' }>['config'];
    const nonNegative = new Set(['buyFeePct', 'sellFeePct', 'slippageBps']);
    if (Object.entries(config).some(([key, value]) => !Number.isFinite(value) || (nonNegative.has(key) ? value < 0 : value <= 0))) {
      setError('Isi seluruh kebijakan akun; fee/slippage boleh nol, field lainnya harus positif.'); return;
    }
    void act({ action: 'configure-paper-account', config }, 'Akun paper dan batas risiko tersimpan.');
  }

  function prepareSignal(signal: PersistedDecisionSignal) {
    if (signal.action === 'EXIT_REVIEW') {
      void act({ action: 'propose-paper-order', signalId: signal.id }, 'Paper exit diusulkan; belum dieksekusi.');
      return;
    }
    setSelectedSignal(signal);
  }

  async function proposeBuy() {
    if (!selectedSignal) return;
    const invalidationCriteria = invalidation.split('\n').map((item) => item.trim()).filter(Boolean);
    const parsedReviewAt = new Date(reviewAt);
    if (thesis.trim().length < 20 || invalidationCriteria.length === 0 || !Number.isFinite(parsedReviewAt.getTime())) {
      setError('Isi tesis minimal 20 karakter, sedikitnya satu invalidasi, dan tanggal review.');
      return;
    }
    const succeeded = await act({
      action: 'propose-paper-order', signalId: selectedSignal.id,
      thesis: { thesis: thesis.trim(), invalidationCriteria, catalyst: catalyst.trim() || null, reviewAt: parsedReviewAt.toISOString() },
    }, 'Tesis append-only dicatat dan paper order diusulkan.');
    if (!succeeded) return;
    setSelectedSignal(null); setThesis(''); setInvalidation(''); setCatalyst(''); setReviewAt('');
  }

  const account = dashboard.paperAccount;
  const nav = account ? account.cash + dashboard.positions.reduce((sum, item) => sum + item.lots * 100 * item.lastPrice, 0) : null;

  return <div className="mt-6 space-y-6">
    <div className="rounded-xl border border-tv-yellow/40 bg-tv-yellow/10 p-4 text-sm">
      <div className="flex gap-2"><AlertTriangle className="h-5 w-5 shrink-0 text-tv-yellow" /><div><b>Mode internal, bukan rekomendasi publik.</b> Fill paper memakai quote pasar aktual yang tersedia dengan slippage, tick size, dan fee sesuai kebijakan pengguna; ini tetap bukan fill bursa nyata. Eksekusi broker nyata sengaja terkunci sampai model tervalidasi dan adapter broker diaudit.</div></div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full border border-tv-border bg-tv-bg/70 px-2 py-1">Skor total v1.6.1</span>
        <span className="rounded-full border border-tv-border bg-tv-bg/70 px-2 py-1">Default: gpt-5.4</span>
        <span className="rounded-full border border-tv-border bg-tv-bg/70 px-2 py-1">Fallback: gpt-5.5</span>
        <span className="rounded-full border border-tv-border bg-tv-bg/70 px-2 py-1">Data real only</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" variant="bare" size="none" className={`rounded-full px-3 py-1 text-xs font-semibold ${viewMode === 'ringkas' ? 'bg-tv-blue text-white' : 'bg-tv-bg/70 text-tv-muted'}`} onClick={() => setViewMode('ringkas')}>Ringkas</Button>
        <Button type="button" variant="bare" size="none" className={`rounded-full px-3 py-1 text-xs font-semibold ${viewMode === 'detail' ? 'bg-tv-blue text-white' : 'bg-tv-bg/70 text-tv-muted'}`} onClick={() => setViewMode('detail')}>Detail</Button>
      </div>
    </div>
    {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    {notice && <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">{notice}</div>}

    <Card as="section" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-heading text-lg font-bold">Evaluasi pilot 90 hari</h2><p className="mt-1 text-xs text-tv-muted">Metrik hanya berasal dari fill paper aktual yang tersimpan. MAE/MFE adalah jalur harga yang teramati saat scan, bukan rekonstruksi intraday.</p></div>
        <span className="rounded border border-tv-border px-2 py-1 text-xs font-bold">{dashboard.performance.closedTrades} trade selesai</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>NAV<br/><b className="font-number">{dashboard.performance.nav == null ? '—' : `Rp ${formatNumber(dashboard.performance.nav)}`}</b></div>
        <div>Return bersih<br/><b className="font-number">{dashboard.performance.totalReturnPct == null ? '—' : `${formatNumber(dashboard.performance.totalReturnPct, 2)}%`}</b></div>
        <div>Win rate<br/><b className="font-number">{dashboard.performance.winRatePct == null ? '—' : `${formatNumber(dashboard.performance.winRatePct, 1)}%`}</b></div>
        <div>Expectancy/trade<br/><b className="font-number">{dashboard.performance.expectancy == null ? '—' : `Rp ${formatNumber(dashboard.performance.expectancy)}`}</b></div>
        <div>Realized P/L<br/><b className="font-number">Rp {formatNumber(dashboard.performance.realizedPnl)}</b></div>
        <div>Unrealized P/L<br/><b className="font-number">Rp {formatNumber(dashboard.performance.unrealizedPnl)}</b></div>
        <div>Max drawdown<br/><b className="font-number">{dashboard.performance.maxDrawdownPct == null ? '—' : `${formatNumber(dashboard.performance.maxDrawdownPct, 2)}%`}</b></div>
        <div>Avg MAE / MFE<br/><b className="font-number">{dashboard.performance.averageMaePct == null ? '—' : `${formatNumber(dashboard.performance.averageMaePct, 2)}% / ${formatNumber(dashboard.performance.averageMfePct, 2)}%`}</b></div>
        <div>Biaya eksternal<br/><b className="font-number">Rp {formatNumber(dashboard.performance.externalCosts)}</b></div>
      </div>
      <div className="mt-4 border-t border-tv-border pt-4">
        <div className="text-sm font-bold">Konteks risiko portofolio</div>
        <div className="mt-2 text-xs text-tv-muted">Total exposure {dashboard.riskContext.totalExposurePct == null ? '—' : `${formatNumber(dashboard.riskContext.totalExposurePct, 2)}% NAV`} · drawdown saat ini {dashboard.riskContext.currentDrawdownPct == null ? '—' : `${formatNumber(dashboard.riskContext.currentDrawdownPct, 2)}%`}</div>
        {dashboard.riskContext.sectorExposure.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{dashboard.riskContext.sectorExposure.map((item) => <span key={item.sector} className="rounded border border-tv-border px-2 py-1 text-xs">{item.sector}: {formatNumber(item.pctNav, 1)}%</span>)}</div>}
        {dashboard.riskContext.blockers.map((blocker) => <div key={blocker} className="mt-2 text-xs font-semibold text-tv-yellow">{blocker}</div>)}
      </div>
      <div className="mt-4 border-t border-tv-border pt-4">
        <div className="text-sm font-bold">Shadow evaluation rule vs hybrid</div>
        <p className="mt-1 text-xs text-tv-muted">Entry = penutupan perdagangan teramati berikutnya; T+5/T+20 memakai kalender tanggal pasar yang tersedia di database. Baris tanpa horizon lengkap tidak dihitung.</p>
        <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-tv-muted"><tr><th className="px-2 py-2">Cohort</th><th className="px-2 py-2">N T+5</th><th className="px-2 py-2">Avg T+5</th><th className="px-2 py-2">Hit T+5</th><th className="px-2 py-2">N T+20</th><th className="px-2 py-2">Avg T+20</th><th className="px-2 py-2">Hit T+20</th></tr></thead><tbody>{dashboard.shadowEvaluation.cohorts.map((item) => <tr key={item.cohort} className="border-t border-tv-border"><td className="px-2 py-2 font-bold">{item.cohort}</td><td className="px-2 py-2">{item.t5Count}</td><td className="px-2 py-2">{item.t5AverageReturnPct == null ? '—' : `${formatNumber(item.t5AverageReturnPct, 2)}%`}</td><td className="px-2 py-2">{item.t5HitRatePct == null ? '—' : `${formatNumber(item.t5HitRatePct, 1)}%`}</td><td className="px-2 py-2">{item.t20Count}</td><td className="px-2 py-2">{item.t20AverageReturnPct == null ? '—' : `${formatNumber(item.t20AverageReturnPct, 2)}%`}</td><td className="px-2 py-2">{item.t20HitRatePct == null ? '—' : `${formatNumber(item.t20HitRatePct, 1)}%`}</td></tr>)}</tbody></table></div>
      </div>
    </Card>

    <Card as="section" className="p-5">
      <h2 className="font-heading text-lg font-bold">Kontrol data & protokol</h2>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
        <div>Protokol pilot<br/><b>{dashboard.pilotProtocol ? `${dashboard.pilotProtocol.status} sampai ${formatTime(dashboard.pilotProtocol.endsAt)}` : 'BELUM DIBEKUKAN'}</b></div>
        <div>IDX-IC resmi<br/><b>{dashboard.dataControls.idxIcCount} ticker · as-of {dashboard.dataControls.idxIcLatestAsOf ?? '—'}</b></div>
        <div>Telegram<br/><b>{dashboard.dataControls.telegramConfigured ? 'TERKONFIGURASI' : 'BELUM TERKONFIGURASI'}</b></div>
        <div>Impor Stockbit<br/><b>{dashboard.dataControls.brokerImportCount} file · {dashboard.dataControls.brokerTransactionCount} transaksi</b></div>
        <div>Belum cocok<br/><b>{dashboard.dataControls.unmatchedBrokerTransactions} transaksi</b></div>
        <div>Live order<br/><b>TERKUNCI</b></div>
      </div>
      {!dashboard.pilotProtocol && <Button className="mt-4" disabled={busy || !account} onClick={() => void act({ action: 'freeze-pilot-protocol' }, 'Protokol 90 hari dibekukan dan diaktifkan.')}>Bekukan protokol 90 hari</Button>}
      <div className="mt-5 grid gap-4 border-t border-tv-border pt-4 md:grid-cols-2">
        <div className="space-y-2"><b className="text-sm">Impor klasifikasi IDX-IC resmi</b><input className="w-full rounded border border-tv-border bg-tv-bg px-3 py-2 text-sm" placeholder="URL dokumen resmi IDX" value={idxSourceUrl} onChange={(event)=>setIdxSourceUrl(event.target.value)}/><input type="date" className="w-full rounded border border-tv-border bg-tv-bg px-3 py-2 text-sm" value={idxSourceAsOf} onChange={(event)=>setIdxSourceAsOf(event.target.value)}/><input aria-label="File CSV IDX-IC" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event)=>void importFile(event.target.files?.[0], 'IDX_IC')}/><p className="text-xs text-tv-muted">Header minimal: ticker,sector_name. BUY fail-closed bila ticker belum ada.</p></div>
        <div className="space-y-2"><b className="text-sm">Impor Transaction History Stockbit</b><input aria-label="File CSV Stockbit" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event)=>void importFile(event.target.files?.[0], 'STOCKBIT')}/><p className="text-xs text-tv-muted">Transaksi: trade_date,ticker,side,lots,price,gross_value,fee_value. Biaya aktual: record_type=COST,cost_type,amount. Tidak memakai PIN, cookie, atau scraping.</p></div>
      </div>
    </Card>

    {selectedSignal && <Card as="section" className="border-tv-blue/40 p-5">
      <h2 className="font-heading text-lg font-bold">Tesis paper {selectedSignal.ticker}</h2>
      <p className="mt-1 text-xs text-tv-muted">Ditulis dan disetujui pengguna; setiap perubahan berikutnya disimpan sebagai event append-only.</p>
      <div className="mt-4 grid gap-3">
        <textarea aria-label="Tesis investasi" className="min-h-24 rounded border border-tv-border bg-tv-bg px-3 py-2 text-sm" placeholder="Alasan utama posisi ini layak diuji..." value={thesis} onChange={(event) => setThesis(event.target.value)} />
        <textarea aria-label="Kriteria invalidasi" className="min-h-20 rounded border border-tv-border bg-tv-bg px-3 py-2 text-sm" placeholder={'Satu kriteria invalidasi per baris'} value={invalidation} onChange={(event) => setInvalidation(event.target.value)} />
        <input aria-label="Katalis" className="rounded border border-tv-border bg-tv-bg px-3 py-2" placeholder="Katalis nyata bila ada (opsional)" value={catalyst} onChange={(event) => setCatalyst(event.target.value)} />
        <input aria-label="Tanggal review tesis" type="datetime-local" className="rounded border border-tv-border bg-tv-bg px-3 py-2" value={reviewAt} onChange={(event) => setReviewAt(event.target.value)} />
        <div className="flex gap-2"><Button disabled={busy} onClick={() => void proposeBuy()}>Catat tesis & usulkan paper</Button><Button variant="secondary" disabled={busy} onClick={() => setSelectedSignal(null)}>Batal</Button></div>
      </div>
    </Card>}

    <Card as="section" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Review 1 emiten</h2>
          <p className="mt-1 text-xs text-tv-muted">Masukkan ticker untuk melihat review keputusan AI terbaru dari admin, tanpa pindah ke halaman teknikal.</p>
        </div>
        <div className="flex gap-2">
          <SymbolAutocomplete
            aria-label="Ticker review"
            containerClassName="relative min-w-[240px] flex-1"
            className="w-full rounded border border-tv-border bg-tv-bg px-3 py-2 text-sm uppercase"
            placeholder="BB"
            value={tickerQuery}
            onChange={setTickerQuery}
            onSelect={(symbol) => setTickerQuery(symbol.replace('.JK', ''))}
            maxSuggestions={8}
          />
          <Button disabled={busy} onClick={() => void reviewTicker()}>Lihat review</Button>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-tv-border bg-tv-bg/60 p-4 text-sm">
        {tickerReview ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-lg font-bold">{tickerReview.ticker}</div>
              <span className="rounded-full border border-tv-border bg-tv-card px-2 py-1 text-xs font-semibold">{tickerReview.hybridStatus}</span>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <div>Action<br/><b>{tickerReview.action}</b></div>
              <div>Skor total<br/><b className="font-number">{formatNumber(tickerReview.lensScore, 1)} / 100</b></div>
              <div>Coverage<br/><b className="font-number">{formatNumber(tickerReview.coveragePct, 1)}%</b></div>
              <div>Harga<br/><b className="font-number">Rp {formatNumber(tickerReview.price)}</b></div>
              <div>Paper readiness<br/><b>{describePaperReadiness(tickerReview.paperReadiness)}</b></div>
              <div>Live readiness<br/><b>{describeLiveReadiness(tickerReview.liveReadiness)}</b></div>
            </div>
            <div className="mt-3 text-xs text-tv-muted">{tickerReview.supportingReasons.join(' · ') || 'Tidak ada alasan pendukung.'}</div>
            <div className="mt-2 text-xs text-tv-muted">{tickerReview.opposingReasons.join(' · ') || 'Tidak ada alasan penolak.'}</div>
            <div className="mt-2 text-xs text-tv-muted">{tickerReview.hybridReview ? `Hybrid ${tickerReview.hybridReview.verdict} · confidence ${tickerReview.hybridReview.confidence} · model ${tickerReview.hybridReview.model}` : 'Belum ada second opinion terstruktur.'}</div>
          </>
        ) : (
          <p className="text-sm text-tv-muted">Cari ticker untuk memunculkan review keputusan AI terbaru di sini.</p>
        )}
      </div>
    </Card>

    <Card as="section" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-heading text-lg font-bold">Snapshot keputusan aktual</h2><p className="text-xs text-tv-muted">As of {formatTime(dashboard.latestRun?.dataAsOf)} · model validated: {dashboard.latestRun?.modelValidated ? 'YA' : 'BELUM'} · review: {dashboard.latestRun?.hybrid.status ?? '—'} {dashboard.latestRun?.hybrid.model ? `(${dashboard.latestRun.hybrid.model})` : ''}</p></div>
        <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Muat ulang</Button><Button disabled={busy} onClick={() => void act({ action: 'scan' }, 'Scan aktual tersimpan.')}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Jalankan scan</Button></div>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs text-tv-muted"><tr><th className="px-3 py-2">Ticker</th><th className="px-3 py-2">Aksi rule</th><th className="px-3 py-2">Harga</th><th className="px-3 py-2">Score / Coverage</th><th className="px-3 py-2">Risiko aktual</th><th className="px-3 py-2">Evidence aktual</th><th className="px-3 py-2">Hybrid analyst</th><th className="px-3 py-2">Paper</th></tr></thead><tbody>{dashboard.signals.map((signal) => <SignalRow key={signal.id} signal={signal} busy={busy} onPrepare={prepareSignal} viewMode={viewMode} />)}</tbody></table></div>
      {!busy && dashboard.signals.length === 0 && <p className="py-6 text-center text-sm text-tv-muted">Belum ada run tersimpan.</p>}
    </Card>

    <Card as="section" className="p-5">
      <h2 className="font-heading text-lg font-bold">Akun paper terisolasi</h2>
      {account ? <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div>Kas<br/><b className="font-number">Rp {formatNumber(account.cash)}</b></div><div>NAV mark-to-market<br/><b className="font-number">Rp {formatNumber(nav)}</b></div><div>Risk/order<br/><b>{formatNumber(account.riskBudgetPct, 2)}%</b></div><div>Maks posisi<br/><b>{formatNumber(account.maxPositionPct, 2)}% · {account.maxOpenPositions} saham</b></div><div>Total exposure<br/><b>{formatNumber(account.maxTotalExposurePct, 2)}%</b></div><div>Exposure sektor<br/><b>{formatNumber(account.maxSectorExposurePct, 2)}% · {formatNumber(account.maxPositionsPerSector)} saham/sektor</b></div><div>Partisipasi ADV20<br/><b>{formatNumber(account.maxAdvParticipationPct, 2)}%</b></div><div>Kill-switch drawdown<br/><b>{formatNumber(account.maxDrawdownPct, 2)}%</b></div></div> : <p className="mt-2 text-sm text-tv-muted">Belum dikonfigurasi. Tidak ada saldo awal, fee, atau batas risiko otomatis.</p>}
      <p className="mt-4 text-xs text-tv-muted">Masukkan kebijakan aktual yang akan dipakai selama pilot. Sistem tidak mengisi asumsi broker atau toleransi risiko secara otomatis.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ['initialCash', 'Modal awal paper (Rp)'], ['riskBudgetPct', 'Risk/order % (maks 5)'],
          ['maxPositionPct', 'Maks posisi tunggal %'], ['maxOpenPositions', 'Maks jumlah saham'],
          ['maxTotalExposurePct', 'Maks total exposure %'], ['maxSectorExposurePct', 'Maks exposure sektor %'],
          ['maxPositionsPerSector', 'Maks saham per sektor'],
          ['maxAdvParticipationPct', 'Maks partisipasi ADV20 %'], ['maxDrawdownPct', 'Kill-switch drawdown %'],
          ['buyFeePct', 'Fee beli broker %'], ['sellFeePct', 'Fee jual broker %'], ['slippageBps', 'Slippage (bps)'],
        ] as const).map(([key, label]) => (
          <input key={key} aria-label={label} className="rounded border border-tv-border bg-tv-bg px-3 py-2" placeholder={label} inputMode="decimal" value={policy[key]} onChange={(event) => setPolicy((current) => ({ ...current, [key]: event.target.value }))} />
        ))}
        <Button disabled={busy} onClick={configure}>Simpan kebijakan</Button>
      </div>
    </Card>

    <Card as="section" className="p-5">
      <h2 className="font-heading text-lg font-bold">Thesis tracker</h2>
      <p className="mt-1 text-xs text-tv-muted">Tesis aktif dan histori status berasal dari input yang disetujui pengguna, bukan narasi buatan model.</p>
      <div className="mt-3 space-y-3">{dashboard.theses.map((item) => <div key={item.id} className="rounded border border-tv-border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><b>{item.ticker} · {item.status}</b><span className="text-xs text-tv-muted">Review {formatTime(item.reviewAt)}</span></div><p className="mt-2">{item.thesis}</p><div className="mt-2 text-xs text-tv-muted">Invalidasi: {item.invalidationCriteria.join(' · ')}</div>{item.catalyst && <div className="mt-1 text-xs text-tv-muted">Katalis: {item.catalyst}</div>}</div>)}</div>
      {dashboard.theses.length === 0 && <p className="py-5 text-center text-sm text-tv-muted">Belum ada tesis paper yang disetujui.</p>}
    </Card>

    <Card as="section" className="p-5">
      <h2 className="font-heading text-lg font-bold">Audit paper order</h2>
      <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs text-tv-muted"><tr><th className="px-3 py-2">Ticker</th><th className="px-3 py-2">Side</th><th className="px-3 py-2">Ukuran</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Dasar</th><th className="px-3 py-2">Tindakan</th></tr></thead><tbody>{dashboard.orders.map((order) => <OrderRow key={order.id} order={order} busy={busy} onAction={(body) => void act(body)} />)}</tbody></table></div>
      {!busy && dashboard.orders.length === 0 && <p className="py-6 text-center text-sm text-tv-muted">Belum ada paper order.</p>}
    </Card>
  </div>;
}
