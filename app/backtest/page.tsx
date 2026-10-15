'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Target, Play, Settings2, CheckSquare, Square, Zap, Lock } from 'lucide-react';

import { Card, Input, Select, Button, PageContainer, Skeleton } from '@/components/ui';
import PaywallModal from '@/components/PaywallModal';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { type ReplayCandle } from '@/components/backtest/CandleReplayChart';
import SingleStockReplayPanel from '@/components/backtest/SingleStockReplayPanel';
import BacktestResultsPanel from '@/components/backtest/BacktestResultsPanel';
import { BACKTEST_PRESETS } from '@/modules/backtest/constants/presets';
import { BACKTEST_PERIOD_MONTHS, TRADING_DAYS_PER_MONTH } from '@/modules/backtest/constants/backtest-periods';
import { apiErrorMessage, apiRequest, isApiClientError } from '@/shared/http/api-client';
import MenuUsageGuide from '@/components/MenuUsageGuide';
import type {
  BacktestApiResponse,
  BacktestChartPoint,
  BacktestLiveFilterResponse,
  PublicChartReplayResponse,
} from '@/modules/backtest/contracts';

const AVAILABLE_FILTERS = [
  'EMA 20/50 Cross',
  'Volume vs Avg 20D',
  'RSI 14',
  'MACD',
  'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)',
  'Support & Resistance',
  'Market Flow Index',
  'SMA Score (5,10,20)',
];

function BacktestContent() {
  const searchParams = useSearchParams();
  const { user, resolved: authResolved, loading: authLoading } = useAuthUser();
  const isGuest = authResolved && !authLoading && !user;
  const isPresetLocked = (index: number) => isGuest && index >= 2;

  const [modal, setModal] = useState(100000000);
  const [period, setPeriod] = useState(12);

  const [replayInput, setReplayInput] = useState('');
  const [replaySymbol, setReplaySymbol] = useState('');
  const [replayPeriod, setReplayPeriod] = useState(12);
  const [replayCandles, setReplayCandles] = useState<ReplayCandle[]>([]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState('');
  const [replayToken, setReplayToken] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);

  const presets = BACKTEST_PRESETS;
  const [selectedFilters, setSelectedFilters] = useState<string[]>(presets[0].filters);

  useEffect(() => {
    const rawFilters = searchParams.get('filters');
    if (rawFilters) {
      const requested = rawFilters
        .split(',')
        .map((f) => f.trim())
        .filter((f) => AVAILABLE_FILTERS.includes(f));
      if (requested.length > 0) {
        setSelectedFilters(requested);
      }
    }
    const urlSym = searchParams.get('symbol');
    if (urlSym) {
      const clean = urlSym.trim().toUpperCase();
      setReplayInput(clean);
      setReplaySymbol(clean);
    }
  }, [searchParams]);

  const runReplay = async () => {
    const raw = (replaySymbol || replayInput).trim().toUpperCase();
    if (!raw) { setReplayError('Pilih emiten terlebih dahulu'); return; }
    const code = raw.endsWith('.JK') || raw.startsWith('^') ? raw : `${raw}.JK`;
    setReplayError('');
    setReplayPlaying(false);
    setReplayLoading(true);
    try {
      const data = await apiRequest<PublicChartReplayResponse>(`/api/public-chart/${encodeURIComponent(code)}?tf=10Y`);
      const history: ReplayCandle[] = Array.isArray(data?.history) ? data.history : [];
      if (history.length === 0) { setReplayError('Data harga tidak tersedia untuk emiten ini'); setReplayCandles([]); return; }
      const windowSize = Math.min(history.length, replayPeriod * TRADING_DAYS_PER_MONTH);
      setReplayCandles(history.slice(-windowSize));
      setReplayToken(Date.now());
    } catch (e: unknown) {
      setReplayError(apiErrorMessage(e, 'Gagal memuat data harga', true));
      setReplayCandles([]);
    } finally {
      setReplayLoading(false);
    }
  };

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BacktestApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const [liveLoading, setLiveLoading] = useState(false);
  const [liveResults, setLiveResults] = useState<BacktestLiveFilterResponse | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const toggleFilter = (f: string) => {
    if (selectedFilters.includes(f)) {
      setSelectedFilters(selectedFilters.filter(item => item !== f));
    } else {
      setSelectedFilters([...selectedFilters, f]);
    }
  };

  const applyPreset = (filters: string[]) => setSelectedFilters(filters);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<BacktestApiResponse>('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: selectedFilters, modal, period }),
      });
      setResults(data);
    } catch (error) {
      if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') {
        if (await shouldShowLoginPromptFor401()) setShowLoginPrompt(true);
        else setError('Sesi masih aktif, tetapi akses backtest gagal dibaca. Coba muat ulang halaman.');
      } else if (isApiClientError(error) && error.code === 'SUBSCRIPTION_REQUIRED') {
        setShowPaywall(true);
      } else {
        console.error(error);
        setError(apiErrorMessage(error, 'Gagal menjalankan backtest', true));
        setResults(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const runLiveFilterCheck = async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const data = await apiRequest<BacktestLiveFilterResponse>('/api/backtest/live-filter-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: selectedFilters }),
      });
      setLiveResults(data);
    } catch (error) {
      if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') {
        if (await shouldShowLoginPromptFor401()) setShowLoginPrompt(true);
        else setLiveError('Sesi masih aktif, tetapi akses live check gagal dibaca. Coba muat ulang halaman.');
      } else if (isApiClientError(error) && error.code === 'SUBSCRIPTION_REQUIRED') {
        setShowPaywall(true);
      } else {
        console.error(error);
        setLiveError(apiErrorMessage(error, 'Gagal menjalankan Live Filter Check', true));
        setLiveResults(null);
      }
    } finally {
      setLiveLoading(false);
    }
  };

  const chartData: BacktestChartPoint[] = results?.equityCurve?.map((eq, idx) => ({
    month: `M${idx}`,
    Strategy: eq,
    IHSG: Array.isArray(results?.ihsgCurve) ? results.ihsgCurve[idx] ?? null : null
  })) || [];

  const dataAsOfLabel = results?.dataAsOf
    ? new Date(results.dataAsOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <div className="flex-1 flex flex-col">
        <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-tv-bg/80 px-4 py-4 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-tv-blue text-white">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="lens-page-title">Strategy Builder + Backtester</h1>
              <p className="text-xs text-tv-muted">Build custom rules and backtest on historical data</p>
            </div>
          </div>
        </header>

        <PageContainer className="px-6 pt-6">
        <MenuUsageGuide
          menuKey="backtest"
          whatItAnswers="Kalau strategi ini dijalankan di masa lalu, hasilnya bagaimana?"
          steps={[
            "Tentukan aturan masuk dan keluar, lalu rentang tanggalnya.",
            "Jalankan uji, dan baca kurva ekuitasnya lebih dulu sebelum angka ringkasan.",
            "Perhatikan jumlah transaksi - hasil bagus dari 5 transaksi bukan bukti apa pun.",
          ]}
        />
          <p className="text-xs text-tv-muted">
            <b>Backtest Sekarang</b>: uji kombinasi filter ini ke data masa lalu (return, win rate,
            drawdown, 3-60 bulan terakhir). <b>Live Filter Check</b>: cek saham mana yang memenuhi
            kombinasi filter yang sama SEKARANG (data live, bukan simulasi).
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ['Point-in-time', 'Hasil memakai data historis sesuai periode uji, bukan angka yang ditebak dari kondisi hari ini.'],
              ['Biaya & risiko', 'Baca return bersama win rate, drawdown, jumlah transaksi, dan biaya simulasi.'],
              ['Bukan jaminan', 'Backtest membantu menyaring strategi, tetapi tidak membuktikan performa masa depan.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-tv-border bg-tv-surface p-4">
                <div className="lens-label text-tv-text">{title}</div>
                <p className="mt-2 text-xs leading-relaxed text-tv-muted">{desc}</p>
              </div>
            ))}
          </div>
        </PageContainer>

        <PageContainer className="px-6 pt-4">
          <SingleStockReplayPanel
            replayInput={replayInput}
            setReplayInput={setReplayInput}
            replaySymbol={replaySymbol}
            setReplaySymbol={setReplaySymbol}
            replayPeriod={replayPeriod}
            setReplayPeriod={setReplayPeriod}
            replayCandles={replayCandles}
            replayLoading={replayLoading}
            replayError={replayError}
            replayToken={replayToken}
            replayPlaying={replayPlaying}
            setReplayPlaying={setReplayPlaying}
            runReplay={runReplay}
          />
        </PageContainer>

        <PageContainer className="p-4 md:p-6 lg:p-7 grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Builder Panel */}
          <div className="lg:col-span-1 space-y-6">
            <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5">
              <h3 className="font-heading font-bold text-tv-text flex items-center gap-2 mb-1 border-b border-tv-border pb-3">
                <Target className="w-5 h-5 text-tv-blue" /> Presets
              </h3>
              <p className="lens-label text-tv-muted mb-3">Win rate dihitung live dari data historis tiap kombinasi - bisa berubah, bukan angka tetap.</p>
              <div className="flex flex-col gap-2">
                {presets.map((p, idx) => {
                  const locked = isPresetLocked(idx);
                  return (
                    <Button
                      key={p.label}
                      type="button"
                      variant="bare"
                      size="none"
                      onClick={() => {
                        if (locked) {
                          setShowLoginPrompt(true);
                          return;
                        }
                        applyPreset(p.filters);
                      }}
                      className="text-left px-4 py-2.5 bg-tv-hover hover:bg-tv-borderLight rounded-md text-sm text-tv-text transition-colors flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold">{p.label}</div>
                        <span className="block lens-label text-tv-muted font-normal">{p.filters.length} filter</span>
                      </div>
                      {locked && (
                        <span className="shrink-0 flex items-center gap-1 lens-chip font-bold text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/40 px-2 py-0.5 rounded-full">
                          <Lock className="w-3 h-3" /> Masuk
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </Card>

            <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5">
              <h3 className="font-heading font-bold text-tv-text flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
                <Settings2 className="w-5 h-5 text-tv-blue" /> LensTechnical
              </h3>
              <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto pr-2">
                {AVAILABLE_FILTERS.map(f => {
                  const isSelected = selectedFilters.includes(f);
                  return (
                    <div
                      key={f}
                      onClick={() => toggleFilter(f)}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors border ${isSelected ? 'bg-tv-blue/10 border-tv-blue/30' : 'bg-tv-bg border-tv-border hover:border-tv-borderLight'}`}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4 text-tv-blue" /> : <Square className="w-4 h-4 text-tv-muted" />}
                      <span className={`text-sm ${isSelected ? 'text-tv-blue font-bold' : 'text-tv-muted'}`}>{f}</span>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-4 pt-4 border-t border-tv-border">
                <Input label="Modal Awal (Rp)" type="number" value={modal} onChange={e => setModal(Number(e.target.value))} className="font-number" />
                <Select
                  label="Periode (Bulan)"
                  value={period}
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (isGuest && val > 12) {
                      setShowLoginPrompt(true);
                      return;
                    }
                    setPeriod(val);
                  }}
                >
                  {BACKTEST_PERIOD_MONTHS.map((bulan) => (
                    <option key={bulan} value={bulan}>
                      {bulan} Bulan {isGuest && bulan > 12 ? '(🔒 Masuk)' : ''}
                    </option>
                  ))}
                </Select>

                <Button
                  onClick={runBacktest}
                  disabled={loading || selectedFilters.length === 0}
                  loading={loading}
                  variant="primary"
                  className="w-full mt-4"
                >
                  {!loading && <Play className="w-5 h-5" />}
                  Backtest Sekarang
                </Button>

                <Button
                  onClick={runLiveFilterCheck}
                  disabled={liveLoading || selectedFilters.length === 0}
                  loading={liveLoading}
                  variant="ghost"
                  className="w-full bg-tv-green text-white hover:!bg-tv-green/90"
                >
                  {!liveLoading && <Zap className="w-5 h-5" />}
                  Live Filter Check
                </Button>
                <p className="lens-label text-tv-muted -mt-2">
                  Cek saham mana di universe yang memenuhi kombinasi filter ini SEKARANG (data live, bukan simulasi historis).
                </p>
              </div>
            </Card>
          </div>

          <BacktestResultsPanel
            liveLoading={liveLoading}
            liveError={liveError}
            liveResults={liveResults}
            selectedFilters={selectedFilters}
            error={error}
            results={results}
            loading={loading}
            runBacktest={runBacktest}
            dataAsOfLabel={dataAsOfLabel}
            chartData={chartData}
            modal={modal}
          />
        </PageContainer>
      </div>
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="Backtest butuh akun gratis. Daftar untuk memakai fitur selama masa pengujian."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Akses Akun Belum Tersedia"
        body="Silakan masuk kembali untuk melanjutkan penggunaan Backtest."
        benefits={[
          'Unlimited LensTechnical (10 filter)',
          'LensRadar scan berkala, LensConsensus & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
      />
    </div>
  );
}

function BacktestSuspenseFallback() {
  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="lg:col-span-2 h-96 w-full" />
        </div>
      </PageContainer>
    </div>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={<BacktestSuspenseFallback />}>
      <BacktestContent />
    </Suspense>
  );
}