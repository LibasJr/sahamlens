'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Target,
  ShieldAlert,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiRequest } from '@/shared/http/api-client';
import type {
  ShadowLedgerDashboardPayload,
  ShadowLedgerSignalItem,
  ShadowLedgerMetrics,
} from '@/modules/decision-agent';

interface ShadowLedgerClientProps {
  initialData: ShadowLedgerDashboardPayload;
}

function formatWib(iso: string | null): string {
  if (!iso) return 'Belum tercatat';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Waktu tidak valid';
  return (
    d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB'
  );
}

function formatRupiah(val: number | null): string {
  if (val == null || !Number.isFinite(val)) return '—';
  return 'Rp ' + Math.round(val).toLocaleString('id-ID');
}

function formatPct(val: number | null, withSign = false): string {
  if (val == null || !Number.isFinite(val)) return '—';
  const sign = withSign && val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export default function ShadowLedgerClient({ initialData }: ShadowLedgerClientProps) {
  const [data, setData] = useState<ShadowLedgerDashboardPayload>(initialData);
  const [selectedModel, setSelectedModel] = useState<string>('shadow-lengan-b-v1');
  const [searchTicker, setSearchTicker] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'EVALUATED' | 'PENDING'>('ALL');
  const [isRefreshing, startTransition] = useTransition();

  const handleRefresh = async () => {
    startTransition(async () => {
      try {
        const fresh = await apiRequest<ShadowLedgerDashboardPayload>('/api/admin/shadow-ledger', { cache: 'no-store' });
        setData(fresh);
      } catch (err) {
        console.error('Gagal memperbarui data shadow ledger', err);
      }
    });
  };

  const metrics: ShadowLedgerMetrics = data.modelMetrics[selectedModel] || {
    totalSignals: 0,
    t5: { count: 0, winRatePct: null, avgNetReturnPct: null },
    t10: { count: 0, winRatePct: null, avgNetReturnPct: null },
    t20: { count: 0, winRatePct: null, avgNetReturnPct: null },
    exitReasons: {
      targetHitCount: 0,
      targetHitPct: null,
      stopHitCount: 0,
      stopHitPct: null,
      holdExpiryCount: 0,
      holdExpiryPct: null,
      totalEvaluated: 0,
    },
  };

  const rawSignals: ShadowLedgerSignalItem[] = data.signalsByModel[selectedModel] || [];

  const filteredSignals = rawSignals.filter((sig) => {
    if (searchTicker.trim() && !sig.ticker.toLowerCase().includes(searchTicker.trim().toLowerCase())) {
      return false;
    }
    if (actionFilter !== 'ALL' && sig.action !== actionFilter) {
      return false;
    }
    if (statusFilter === 'EVALUATED' && !sig.t5.isEvaluated && !sig.t10.isEvaluated && !sig.t20.isEvaluated) {
      return false;
    }
    if (statusFilter === 'PENDING' && (sig.t5.isEvaluated || sig.t10.isEvaluated || sig.t20.isEvaluated)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Status Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold" dot>
              Shadow Forward Ledger
            </Badge>
            <span className="text-xs text-tv-muted font-medium">Lengan B — Paper Trade</span>
          </div>
          <h1 className="lens-page-title mt-1">Observabilitas Forward Sinyal</h1>
          <p className="mt-1 text-sm text-tv-muted max-w-3xl">
            Sinyal dibekukan point-in-time pada penutupan sesi harian tanpa lookahead bias.
            Outcome dievaluasi pada horizon T+5, T+10, dan T+20 dengan slippage serta fee 60 bps.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="Segarkan data shadow ledger"
          className="self-start text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-tv-accent' : 'text-tv-muted'}`} />
          <span>{isRefreshing ? 'Memuat...' : 'Segarkan Data'}</span>
        </Button>
      </div>

      {/* Status Evaluasi Cron EOD Harian */}
      <Card padding="md" className="border-tv-border bg-tv-card/70">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-tv-muted">
              <Clock className="h-3.5 w-3.5 text-tv-accent" />
              <span>Jadwal & Status Cron EOD Harian (16:35 & 17:30 WIB)</span>
            </div>
            <p className="text-xs text-tv-muted">
              Pencatatan sinyal dan evaluasi realisasi return berjalan otomatis setiap hari bursa via systemd timer.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.cronJobs.map((job) => {
              const isOk = job.status === 'SUCCESS';
              const isRunning = job.status === 'RUNNING';
              const isFailed = job.status === 'FAILED';

              return (
                <Card
                  key={job.jobName}
                  surface="40"
                  padding="none"
                  radius="xl"
                  className="flex items-start gap-3 border-tv-border/80 p-3"
                >
                  <div className="mt-0.5">
                    {isOk ? (
                      <CheckCircle2 className="h-4 w-4 text-tv-green" />
                    ) : isRunning ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-tv-blue" />
                    ) : isFailed ? (
                      <AlertCircle className="h-4 w-4 text-tv-red" />
                    ) : (
                      <Clock className="h-4 w-4 text-tv-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-tv-text truncate">{job.title}</span>
                      <Badge
                        variant={isOk ? 'success' : isRunning ? 'info' : isFailed ? 'danger' : 'neutral'}
                        size="sm"
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-tv-muted">
                      <span>Jadwal: {job.scheduleTime}</span>
                      <span>•</span>
                      <span>Terakhir: {formatWib(job.lastRunAt)}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Model Selection Tabs & Filter Bar */}
      <div className="flex flex-col gap-4 border-b border-tv-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-tv-muted mr-1">Model:</span>
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={() => setSelectedModel('shadow-lengan-b-v1')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedModel === 'shadow-lengan-b-v1'
                ? 'bg-tv-accent text-white shadow-sm'
                : 'border border-tv-border bg-tv-card text-tv-muted hover:text-tv-text'
            }`}
          >
            shadow-lengan-b-v1 (Default)
          </Button>
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={() => setSelectedModel('decision-agent-v2-hybrid')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedModel === 'decision-agent-v2-hybrid'
                ? 'bg-tv-accent text-white shadow-sm'
                : 'border border-tv-border bg-tv-card text-tv-muted hover:text-tv-text'
            }`}
          >
            decision-agent-v2-hybrid
          </Button>
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={() => setSelectedModel('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedModel === 'all'
                ? 'bg-tv-accent text-white shadow-sm'
                : 'border border-tv-border bg-tv-card text-tv-muted hover:text-tv-text'
            }`}
          >
            Semua Model (All)
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Ticker */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tv-muted" />
            <input
              type="text"
              placeholder="Cari emiten (cth: SGER)..."
              value={searchTicker}
              onChange={(e) => setSearchTicker(e.target.value)}
              className="h-8 rounded-lg border border-tv-border bg-tv-card pl-8 pr-3 text-xs text-tv-text placeholder-tv-muted focus:border-tv-accent focus:outline-none"
            />
          </div>

          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Filter jenis aksi sinyal"
            className="h-8 rounded-lg border border-tv-border bg-tv-card px-2.5 text-xs text-tv-text focus:border-tv-accent focus:outline-none"
          >
            <option value="ALL">Semua Aksi</option>
            <option value="BUY">BUY</option>
            <option value="BUY_CANDIDATE">BUY_CANDIDATE</option>
            <option value="WATCH">WATCH</option>
            <option value="HOLD">HOLD</option>
            <option value="EXIT_REVIEW">EXIT_REVIEW</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            aria-label="Filter status evaluasi"
            className="h-8 rounded-lg border border-tv-border bg-tv-card px-2.5 text-xs text-tv-text focus:border-tv-accent focus:outline-none"
          >
            <option value="ALL">Semua Status</option>
            <option value="EVALUATED">Terevaluasi</option>
            <option value="PENDING">Menunggu Outcome</option>
          </select>
        </div>
      </div>

      {/* Kartu Metrik Ringkas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Sinyal */}
        <Card padding="md" className="border-tv-border bg-tv-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-tv-muted uppercase tracking-wider">Total Sinyal</span>
            <Layers className="h-4 w-4 text-tv-accent" />
          </div>
          <div className="mt-3">
            <div className="font-number text-2xl font-bold text-tv-text">{metrics.totalSignals}</div>
            <p className="mt-1 text-xs text-tv-muted">
              Model: <span className="font-semibold text-tv-text">{selectedModel}</span>
            </p>
          </div>
        </Card>

        {/* Realisasi T+5 */}
        <Card padding="md" className="border-tv-border bg-tv-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-tv-muted uppercase tracking-wider">Realisasi T+5</span>
            <Calendar className="h-4 w-4 text-tv-blue" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="font-number text-2xl font-bold text-tv-text">{metrics.t5.count}</span>
              <span className="text-xs text-tv-muted">sinyal matang</span>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-tv-muted">Win Rate:</span>
                <span className="font-number font-semibold text-tv-text">
                  {metrics.t5.winRatePct != null ? `${metrics.t5.winRatePct}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-tv-muted">Rata-rata Net:</span>
                <span
                  className={`font-number font-semibold ${
                    metrics.t5.avgNetReturnPct == null
                      ? 'text-tv-muted'
                      : metrics.t5.avgNetReturnPct >= 0
                        ? 'text-tv-green'
                        : 'text-tv-red'
                  }`}
                >
                  {formatPct(metrics.t5.avgNetReturnPct, true)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Realisasi T+10 */}
        <Card padding="md" className="border-tv-border bg-tv-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-tv-muted uppercase tracking-wider">Realisasi T+10</span>
            <Calendar className="h-4 w-4 text-tv-yellow" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="font-number text-2xl font-bold text-tv-text">{metrics.t10.count}</span>
              <span className="text-xs text-tv-muted">sinyal matang</span>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-tv-muted">Win Rate:</span>
                <span className="font-number font-semibold text-tv-text">
                  {metrics.t10.winRatePct != null ? `${metrics.t10.winRatePct}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-tv-muted">Rata-rata Net:</span>
                <span
                  className={`font-number font-semibold ${
                    metrics.t10.avgNetReturnPct == null
                      ? 'text-tv-muted'
                      : metrics.t10.avgNetReturnPct >= 0
                        ? 'text-tv-green'
                        : 'text-tv-red'
                  }`}
                >
                  {formatPct(metrics.t10.avgNetReturnPct, true)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Realisasi T+20 */}
        <Card padding="md" className="border-tv-border bg-tv-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-tv-muted uppercase tracking-wider">Realisasi T+20</span>
            <Calendar className="h-4 w-4 text-tv-green" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="font-number text-2xl font-bold text-tv-text">{metrics.t20.count}</span>
              <span className="text-xs text-tv-muted">sinyal matang</span>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-tv-muted">Win Rate:</span>
                <span className="font-number font-semibold text-tv-text">
                  {metrics.t20.winRatePct != null ? `${metrics.t20.winRatePct}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-tv-muted">Rata-rata Net:</span>
                <span
                  className={`font-number font-semibold ${
                    metrics.t20.avgNetReturnPct == null
                      ? 'text-tv-muted'
                      : metrics.t20.avgNetReturnPct >= 0
                        ? 'text-tv-green'
                        : 'text-tv-red'
                  }`}
                >
                  {formatPct(metrics.t20.avgNetReturnPct, true)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Rasio Alasan Exit */}
        <Card padding="md" className="border-tv-border bg-tv-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-tv-muted uppercase tracking-wider">Rasio Alasan Exit</span>
            <Target className="h-4 w-4 text-tv-accent" />
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-tv-green font-medium">TP1 Hit:</span>
              <span className="font-number font-semibold text-tv-text">
                {metrics.exitReasons.targetHitCount}{' '}
                <span className="text-tv-muted font-normal">
                  ({metrics.exitReasons.targetHitPct != null ? `${metrics.exitReasons.targetHitPct}%` : '0%'})
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-tv-red font-medium">SL Hit:</span>
              <span className="font-number font-semibold text-tv-text">
                {metrics.exitReasons.stopHitCount}{' '}
                <span className="text-tv-muted font-normal">
                  ({metrics.exitReasons.stopHitPct != null ? `${metrics.exitReasons.stopHitPct}%` : '0%'})
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-tv-yellow font-medium">Expired/Hold:</span>
              <span className="font-number font-semibold text-tv-text">
                {metrics.exitReasons.holdExpiryCount}{' '}
                <span className="text-tv-muted font-normal">
                  ({metrics.exitReasons.holdExpiryPct != null ? `${metrics.exitReasons.holdExpiryPct}%` : '0%'})
                </span>
              </span>
            </div>
            <div className="border-t border-tv-border pt-1 flex justify-between text-tv-muted">
              <span>Total dievaluasi:</span>
              <span className="font-number font-semibold text-tv-text">{metrics.exitReasons.totalEvaluated}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabel Daftar Sinyal Terakhir */}
      <Card padding="none" className="overflow-hidden border-tv-border bg-tv-card">
        <div className="flex flex-col gap-2 border-b border-tv-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-base font-bold text-tv-text">Daftar Sinyal Forward Terakhir</h2>
            <p className="text-xs text-tv-muted">
              Menampilkan {filteredSignals.length} dari {rawSignals.length} sinyal pada model {selectedModel}
            </p>
          </div>
          {selectedModel === 'shadow-lengan-b-v1' && (
            <div className="flex items-center gap-1.5 text-xs text-tv-muted">
              <span className="inline-block h-2 w-2 rounded-full bg-tv-accent" />
              <span>Anti-Microcap (Cap ≥ 1T) & Anti-FCA aktif</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-tv-border bg-tv-bg/80 text-tv-muted uppercase font-semibold">
              <tr>
                <th className="py-3 pl-4 pr-3">Tanggal</th>
                <th className="py-3 px-3">Ticker</th>
                <th className="py-3 px-3">Aksi</th>
                <th className="py-3 px-3 text-right">Close</th>
                <th className="py-3 px-3 text-right">Entry Ref</th>
                <th className="py-3 px-3 text-right">Stop Loss</th>
                <th className="py-3 px-3 text-right">Target (TP1)</th>
                <th className="py-3 px-3 text-right">RR</th>
                <th className="py-3 px-3 text-center">Status T+5</th>
                <th className="py-3 px-3 text-center">Status T+10</th>
                <th className="py-3 pr-4 pl-3 text-center">Status T+20</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tv-border/50 font-sans">
              {filteredSignals.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-tv-muted">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <HelpCircle className="h-8 w-8 text-tv-muted/50" />
                      <p className="text-sm font-medium">Tidak ada sinyal yang cocok dengan filter.</p>
                      <p className="text-xs text-tv-muted/80">
                        Coba ubah filter model, kata kunci emiten, atau status evaluasi.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSignals.map((item) => {
                  return (
                    <tr key={item.signalId} className="hover:bg-tv-hover/40 transition-colors">
                      {/* Tanggal */}
                      <td className="whitespace-nowrap py-3 pl-4 pr-3 font-medium text-tv-text">
                        {item.tradeDate}
                      </td>

                      {/* Ticker */}
                      <td className="whitespace-nowrap py-3 px-3">
                        <Link
                          href={`/saham/${item.ticker}`}
                          className="font-bold text-tv-accent hover:underline inline-flex items-center gap-1"
                        >
                          {item.ticker}
                        </Link>
                      </td>

                      {/* Aksi */}
                      <td className="whitespace-nowrap py-3 px-3">
                        <Badge
                          variant={
                            item.action === 'BUY' || item.action === 'BUY_CANDIDATE'
                              ? 'success'
                              : item.action === 'WATCH'
                                ? 'info'
                                : item.action === 'HOLD'
                                  ? 'warning'
                                  : 'danger'
                          }
                          size="sm"
                        >
                          {item.action}
                        </Badge>
                      </td>

                      {/* Close */}
                      <td className="whitespace-nowrap py-3 px-3 text-right font-number text-tv-text">
                        {formatRupiah(item.closePrice)}
                      </td>

                      {/* Entry Ref */}
                      <td className="whitespace-nowrap py-3 px-3 text-right font-number text-tv-muted">
                        {formatRupiah(item.entryRef)}
                      </td>

                      {/* Stop Loss */}
                      <td className="whitespace-nowrap py-3 px-3 text-right font-number text-tv-red">
                        {formatRupiah(item.stop)}
                      </td>

                      {/* Target (TP1) */}
                      <td className="whitespace-nowrap py-3 px-3 text-right font-number text-tv-green">
                        {formatRupiah(item.target)}
                      </td>

                      {/* RR */}
                      <td className="whitespace-nowrap py-3 px-3 text-right font-number text-tv-text">
                        {item.riskReward != null ? `1:${item.riskReward}` : '—'}
                      </td>

                      {/* T+5 Return */}
                      <td className="whitespace-nowrap py-3 px-3 text-center">
                        <OutcomeBadge outcome={item.t5} label="T+5" />
                      </td>

                      {/* T+10 Return */}
                      <td className="whitespace-nowrap py-3 px-3 text-center">
                        <OutcomeBadge outcome={item.t10} label="T+10" />
                      </td>

                      {/* T+20 Return */}
                      <td className="whitespace-nowrap py-3 pr-4 pl-3 text-center">
                        <OutcomeBadge outcome={item.t20} label="T+20" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function OutcomeBadge({
  outcome,
  label,
}: {
  outcome: ShadowLedgerSignalItem['t5'];
  label: string;
}) {
  if (!outcome.isEvaluated) {
    return (
      <Badge variant="neutral" size="sm" dot>
        Pending
      </Badge>
    );
  }

  const net = outcome.netReturnPct ?? 0;
  const isTarget = outcome.targetHit || outcome.exitReason === 'TARGET_HIT';
  const isStop = outcome.stopHit || outcome.exitReason === 'STOP_HIT';

  const variant = isTarget || net > 0 ? 'success' : isStop || net < 0 ? 'danger' : 'neutral';
  const reasonText = isTarget ? 'TP Hit' : isStop ? 'SL Hit' : 'Hold';

  return (
    <Badge variant={variant} size="sm">
      {formatPct(net, true)} ({reasonText})
    </Badge>
  );
}
