'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw, XCircle } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import type { DecisionAgentDashboard, PaperOrder, PersistedDecisionSignal } from '@/modules/decision-agent';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';

type ActionBody =
  | { action: 'scan' }
  | { action: 'configure-paper-account'; config: { initialCash: number; riskBudgetPct: number; maxPositionPct: number; maxOpenPositions: number } }
  | { action: 'propose-paper-order'; signalId: string }
  | { action: 'execute-paper-order' | 'reject-paper-order' | 'execute-live-order'; orderId: string };

function formatNumber(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value);
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
}

function SignalRow({ signal, busy, onPropose }: { signal: PersistedDecisionSignal; busy: boolean; onPropose: (id: string) => void }) {
  return (
    <tr className="border-t border-tv-border align-top">
      <td className="px-3 py-3 font-bold">{signal.ticker}</td>
      <td className="px-3 py-3"><span className="rounded bg-tv-bg px-2 py-1 text-xs font-bold">{signal.action}</span></td>
      <td className="px-3 py-3 font-number">{formatNumber(signal.price)}</td>
      <td className="px-3 py-3 font-number">{formatNumber(signal.lensScore, 1)} / {formatNumber(signal.coveragePct, 1)}%</td>
      <td className="px-3 py-3 text-xs">
        {signal.riskSetup ? <>stop {formatNumber(signal.riskSetup.stop)} · target {formatNumber(signal.riskSetup.target1)} · RR {formatNumber(signal.riskSetup.riskReward, 2)}</> : '—'}
      </td>
      <td className="max-w-sm px-3 py-3 text-xs text-tv-muted">
        <div>{signal.news.basis === 'HEADLINE_ONLY' ? `Headline: +${signal.news.positive} / netral ${signal.news.neutral} / -${signal.news.negative}` : 'Berita tidak tersedia'}</div>
        <div className="mt-1">{[...signal.supportingReasons, ...signal.opposingReasons, ...signal.invalidationReasons].join(' · ') || 'Tidak ada alasan tambahan.'}</div>
      </td>
      <td className="px-3 py-3">
        {signal.paperReadiness === 'PAPER_READY' && (signal.action === 'BUY_CANDIDATE' || signal.action === 'EXIT_REVIEW') ? (
          <Button size="sm" disabled={busy} onClick={() => onPropose(signal.id)}>Usulkan paper</Button>
        ) : <span className="text-xs text-tv-muted">{signal.paperReadiness}</span>}
      </td>
    </tr>
  );
}

function OrderRow({ order, busy, onAction }: { order: PaperOrder; busy: boolean; onAction: (body: ActionBody) => void }) {
  return (
    <tr className="border-t border-tv-border">
      <td className="px-3 py-3">{order.ticker}</td>
      <td className="px-3 py-3">{order.side}</td>
      <td className="px-3 py-3 font-number">{formatNumber(order.lots)} lot @ {formatNumber(order.limitPrice)}</td>
      <td className="px-3 py-3">{order.status}</td>
      <td className="px-3 py-3 text-xs text-tv-muted">{order.rationale}</td>
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
  const [initialCash, setInitialCash] = useState('');
  const [riskBudgetPct, setRiskBudgetPct] = useState('');
  const [maxPositionPct, setMaxPositionPct] = useState('');
  const [maxOpenPositions, setMaxOpenPositions] = useState('');

  async function load() {
    setBusy(true); setError(null);
    try {
      const data = await apiRequest<DecisionAgentDashboard>('/api/admin/decision-lab', { cache: 'no-store' });
      setDashboard(data);
    } catch (cause) { setError(apiErrorMessage(cause, 'Gagal memuat dashboard', true)); }
    finally { setBusy(false); }
  }

  async function act(body: ActionBody, success = 'Aksi berhasil dicatat.') {
    setBusy(true); setError(null); setNotice(null);
    try {
      const data = await apiRequest<{ dashboard: DecisionAgentDashboard }>('/api/admin/decision-lab', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setDashboard(data.dashboard); setNotice(success);
    } catch (cause) { setError(apiErrorMessage(cause, 'Aksi gagal', true)); }
    finally { setBusy(false); }
  }

  function configure() {
    const config = { initialCash: Number(initialCash), riskBudgetPct: Number(riskBudgetPct), maxPositionPct: Number(maxPositionPct), maxOpenPositions: Number(maxOpenPositions) };
    if (Object.values(config).some((value) => !Number.isFinite(value) || value <= 0)) {
      setError('Isi seluruh kebijakan akun dengan angka positif yang Anda tentukan sendiri.'); return;
    }
    void act({ action: 'configure-paper-account', config }, 'Akun paper dan batas risiko tersimpan.');
  }

  const account = dashboard.paperAccount;
  const nav = account ? account.cash + dashboard.positions.reduce((sum, item) => sum + item.lots * 100 * item.lastPrice, 0) : null;

  return <div className="mt-6 space-y-6">
    <div className="rounded-xl border border-tv-yellow/40 bg-tv-yellow/10 p-4 text-sm">
      <div className="flex gap-2"><AlertTriangle className="h-5 w-5 shrink-0 text-tv-yellow" /><div><b>Mode internal, bukan rekomendasi publik.</b> Harga order paper adalah harga snapshot sinyal, bukan klaim fill bursa. Eksekusi broker nyata sengaja terkunci sampai model tervalidasi dan adapter broker diaudit.</div></div>
    </div>
    {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    {notice && <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">{notice}</div>}

    <Card as="section" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-heading text-lg font-bold">Snapshot keputusan aktual</h2><p className="text-xs text-tv-muted">As of {formatTime(dashboard.latestRun?.dataAsOf)} · model validated: {dashboard.latestRun?.modelValidated ? 'YA' : 'BELUM'}</p></div>
        <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Muat ulang</Button><Button disabled={busy} onClick={() => void act({ action: 'scan' }, 'Scan aktual tersimpan.')}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Jalankan scan</Button></div>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs text-tv-muted"><tr><th className="px-3 py-2">Ticker</th><th className="px-3 py-2">Aksi</th><th className="px-3 py-2">Harga</th><th className="px-3 py-2">Score / Coverage</th><th className="px-3 py-2">Risiko aktual</th><th className="px-3 py-2">Evidence</th><th className="px-3 py-2">Paper</th></tr></thead><tbody>{dashboard.signals.map((signal) => <SignalRow key={signal.id} signal={signal} busy={busy} onPropose={(signalId) => void act({ action: 'propose-paper-order', signalId }, 'Paper order diusulkan; belum dieksekusi.')} />)}</tbody></table></div>
      {!busy && dashboard.signals.length === 0 && <p className="py-6 text-center text-sm text-tv-muted">Belum ada run tersimpan.</p>}
    </Card>

    <Card as="section" className="p-5">
      <h2 className="font-heading text-lg font-bold">Akun paper terisolasi</h2>
      {account ? <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div>Kas<br/><b className="font-number">Rp {formatNumber(account.cash)}</b></div><div>NAV mark-to-market<br/><b className="font-number">Rp {formatNumber(nav)}</b></div><div>Risk/order<br/><b>{formatNumber(account.riskBudgetPct, 2)}%</b></div><div>Maks posisi<br/><b>{formatNumber(account.maxPositionPct, 2)}% · {account.maxOpenPositions} saham</b></div></div> : <p className="mt-2 text-sm text-tv-muted">Belum dikonfigurasi. Tidak ada saldo awal otomatis.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <input aria-label="Modal awal paper" className="rounded border border-tv-border bg-tv-bg px-3 py-2" placeholder="Modal awal (Rp)" inputMode="decimal" value={initialCash} onChange={(e) => setInitialCash(e.target.value)} />
        <input aria-label="Risk budget persen" className="rounded border border-tv-border bg-tv-bg px-3 py-2" placeholder="Risk/order % (maks 5)" inputMode="decimal" value={riskBudgetPct} onChange={(e) => setRiskBudgetPct(e.target.value)} />
        <input aria-label="Maksimal posisi persen" className="rounded border border-tv-border bg-tv-bg px-3 py-2" placeholder="Maks posisi % (maks 25)" inputMode="decimal" value={maxPositionPct} onChange={(e) => setMaxPositionPct(e.target.value)} />
        <input aria-label="Maksimal jumlah posisi" className="rounded border border-tv-border bg-tv-bg px-3 py-2" placeholder="Maks jumlah saham" inputMode="numeric" value={maxOpenPositions} onChange={(e) => setMaxOpenPositions(e.target.value)} />
        <Button disabled={busy} onClick={configure}>Simpan kebijakan</Button>
      </div>
    </Card>

    <Card as="section" className="p-5">
      <h2 className="font-heading text-lg font-bold">Audit paper order</h2>
      <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs text-tv-muted"><tr><th className="px-3 py-2">Ticker</th><th className="px-3 py-2">Side</th><th className="px-3 py-2">Ukuran</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Dasar</th><th className="px-3 py-2">Tindakan</th></tr></thead><tbody>{dashboard.orders.map((order) => <OrderRow key={order.id} order={order} busy={busy} onAction={(body) => void act(body)} />)}</tbody></table></div>
      {!busy && dashboard.orders.length === 0 && <p className="py-6 text-center text-sm text-tv-muted">Belum ada paper order.</p>}
    </Card>
  </div>;
}
