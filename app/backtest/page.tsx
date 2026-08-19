'use client';

import React, { useState } from 'react';
import { Target, Play, Settings2, CheckSquare, Square, Zap, Lock } from 'lucide-react';

import { Card, Input, Select, Button, PageContainer } from '@/components/ui';
import PaywallModal from '@/components/PaywallModal';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { type ReplayCandle } from '@/components/backtest/CandleReplayChart';
import SingleStockReplayPanel from '@/components/backtest/SingleStockReplayPanel';
import BacktestResultsPanel from '@/components/backtest/BacktestResultsPanel';
// Import LANGSUNG dari file konstanta (bukan barrel modules/backtest) - pengecualian
// disengaja: komponen ini 'use client', barrel modules/backtest re-export service yang
// pakai fetch/logger server-only (precompute/simulate/live-filter-check), ikut kebawa ke
// bundle client kalau lewat barrel. File ini murni data (cuma import type), aman diimpor
// langsung. Sama BACKTEST_PRESETS dipakai modules/market/service/screener.service.ts
// (server, lewat barrel) supaya preset Backtest & tag pola Screener tidak bercabang.
import { BACKTEST_PRESETS } from '@/modules/backtest/constants/presets';
import { BACKTEST_PERIOD_MONTHS, TRADING_DAYS_PER_MONTH } from '@/modules/backtest/constants/backtest-periods';
import { apiErrorMessage, apiRequest, isApiClientError } from '@/shared/http/api-client';

export default function BacktestPage() {
  const { user, resolved: authResolved, loading: authLoading } = useAuthUser();
  const isGuest = authResolved && !authLoading && !user;
  const isPresetLocked = (index: number) => isGuest && index >= 2;

  const [modal, setModal] = useState(100000000);
  const [period, setPeriod] = useState(12);

  // BARU (2026-08-14, permintaan pengguna) - "Backtest Saham Tunggal": pilih SATU emiten
  // lewat search, pilih periode, klik Backtest -> chart candle-nya "terbuka" bertahap kiri
  // ke kanan (lihat components/backtest/CandleReplayChart.tsx). SENGAJA state terpisah
  // dari builder filter di atas (modal/period/selectedFilters) - keduanya independen,
  // fitur ini murni visualisasi harga histori, bukan simulasi strategi multi-saham.
  const [replayInput, setReplayInput] = useState('');
  const [replaySymbol, setReplaySymbol] = useState('');
  const [replayPeriod, setReplayPeriod] = useState(12);
  const [replayCandles, setReplayCandles] = useState<ReplayCandle[]>([]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState('');
  const [replayToken, setReplayToken] = useState(0);
  // BARU (2026-08-14, permintaan pengguna: "tombol bactes, start, stop") - tiga tombol
  // terpisah dengan urutan jelas: Backtest MENYIAPKAN data (fetch, TIDAK langsung
  // memutar), Start memulai/melanjutkan animasi, Stop membekukan pada candle yang
  // sedang tampil. replayPlaying dikontrol di sini, BUKAN state internal chart.
  const [replayPlaying, setReplayPlaying] = useState(false);

  const runReplay = async () => {
    const raw = (replaySymbol || replayInput).trim().toUpperCase();
    if (!raw) { setReplayError('Pilih emiten terlebih dahulu'); return; }
    const code = raw.endsWith('.JK') || raw.startsWith('^') ? raw : `${raw}.JK`;
    setReplayError('');
    setReplayPlaying(false);
    setReplayLoading(true);
    try {
      // tf=10Y selalu diminta (satu jalur kode untuk semua periode, bukan tf=1Y vs tf=10Y
      // bercabang) - candle yang dipakai TETAP dipotong ke jendela periode di bawah, jadi
      // permintaan Yahoo-nya sama persis dengan yang dipakai StockChartPanel untuk 10Y.
      const data = await apiRequest<any>(`/api/public-chart/${encodeURIComponent(code)}?tf=10Y`);
      const history: ReplayCandle[] = Array.isArray(data?.history) ? data.history : [];
      if (history.length === 0) { setReplayError('Data harga tidak tersedia untuk emiten ini'); setReplayCandles([]); return; }
      // Jendela periode dipotong dari BELAKANG (candle terbaru), konsisten dengan
      // TRADING_DAYS_PER_MONTH yang sudah dipakai builder filter di atas (satu sumber,
      // bukan aproksimasi baru yang berbeda sendiri).
      const windowSize = Math.min(history.length, replayPeriod * TRADING_DAYS_PER_MONTH);
      setReplayCandles(history.slice(-windowSize));
      setReplayToken(Date.now());
      // TIDAK langsung setReplayPlaying(true) - tunggu tombol Start ditekan.
    } catch (e: any) {
      setReplayError(apiErrorMessage(e, 'Gagal memuat data harga', true));
      setReplayCandles([]);
    } finally {
      setReplayLoading(false);
    }
  };

  const availableFilters = [
    'EMA 20/50 Cross',
    'Volume vs Avg 20D',
    'RSI 14',
    'MACD',
    'Volatility (ATR 14)',
    'MA Trend IDX (20,50,200)',
    'Support & Resistance',
    'Market Flow Index',
    'SMA Score (5,10,20)'
  ];

  const presets = BACKTEST_PRESETS;

  const [selectedFilters, setSelectedFilters] = useState<string[]>(presets[0].filters);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  // "Live Filter Check" - BUKAN versi lama "Sinyal Hari Ini" yang dihapus 2026-08-03
  // (itu baca cache precompute harian, bisa berjam-jam basi). Ini fetch LIVE ke Yahoo
  // saat tombol diklik - state terpisah dari `results` (historis) supaya dua mode
  // tidak saling menimpa tampilan.
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveResults, setLiveResults] = useState<any>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const toggleFilter = (f: string) => {
    if (selectedFilters.includes(f)) {
      setSelectedFilters(selectedFilters.filter(item => item !== f));
    } else {
      setSelectedFilters([...selectedFilters, f]);
    }
  };

  // Semua filter preset harus BULLISH bareng (lihat allBullish() di simulate.service.ts) -
  // makin banyak filter, sinyal makin jarang. Win rate tetap dihitung live dari data
  // historis tiap kombinasi, bukan angka tetap yang diklaim di sini.
  const applyPreset = (filters: string[]) => setSelectedFilters(filters);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<any>('/api/backtest', {
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
      const data = await apiRequest<any>('/api/backtest/live-filter-check', {
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

  const chartData = results?.equityCurve?.map((eq: number, idx: number) => ({
    month: `M${idx}`,
    Strategy: eq,
    IHSG: Array.isArray(results?.ihsgCurve) ? results.ihsgCurve[idx] : null
  })) || [];

  const dataAsOfLabel = results?.dataAsOf
    ? new Date(results.dataAsOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    // `flex h-screen` + anak `overflow-y-auto` membuat kontainer gulir kedua di dalam
    // <main> AppShell yang sudah menggulir. Disamakan dengan halaman lain.
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

        {/* Tab "Sinyal Hari Ini" (baca cache precompute harian, bisa berjam-jam basi)
            dihapus 2026-08-03, dianggap tumpang tindih dengan AI Pick. Dibangun ulang
            sebagai "Live Filter Check" (arsitektur beda: fetch live ke Yahoo saat
            diklik, bukan baca cache) - beda dari AI Pick karena mengecek kombinasi
            filter SPESIFIK pilihan pengguna sendiri (mis. buat menerjemahkan bonus
            "Golden Cross" AI Pick ke saham lain yang kondisinya serupa SEKARANG),
            bukan skor komposit generik. */}
        <PageContainer className="px-6 pt-6">
          <p className="text-xs text-tv-muted">
            <b>Backtest Sekarang</b>: uji kombinasi filter ini ke data masa lalu (return, win rate,
            drawdown, 3-60 bulan terakhir). <b>Live Filter Check</b>: cek saham mana yang memenuhi
            kombinasi filter yang sama SEKARANG (data live, bukan simulasi).
          </p>
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
              <p className="text-[10px] text-tv-muted mb-3">Win rate dihitung live dari data historis tiap kombinasi - bisa berubah, bukan angka tetap.</p>
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
                        <span className="block text-[10px] text-tv-muted font-normal">{p.filters.length} filter</span>
                      </div>
                      {locked && (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/40 px-2 py-0.5 rounded-full">
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
                {availableFilters.map(f => {
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
                {/* Daftar periode dari satu sumber bersama dengan API dan precompute -
                    lihat modules/backtest/constants/backtest-periods.ts. Menulisnya ulang
                    di sini pernah menjadi cara ketiganya berpisah tanpa ada yang tahu. */}
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

                {/* BARU (2026-08-14) - dua tombol ini SEBELUMNYA variant="secondary"
                    (basisnya bg-white/[0.045]) ditimpa `!bg-tv-blue`/`!bg-tv-green
                    !text-white`. Di tema terang, `.light .bg-white\/\[0.045\] {... !important}`
                    (app/globals.css) punya SPESIFISITAS LEBIH TINGGI (dua class selector)
                    daripada `.\!bg-tv-blue`/`.\!bg-tv-green` (satu class selector) - importance
                    keduanya sama, jadi spesifisitas yang menang, dan latar tombol jatuh balik
                    ke bg-white/[0.045] yang di-patch jadi nyaris transparan (rgb(15 23 42 / .035)).
                    Hasilnya teks putih di atas latar nyaris putih - persis laporan pengguna
                    "tulisan Backtest Sekarang dan Live Filter Check tidak kelihatan" di tema
                    terang.
                    - Tombol biru: variant="primary" memakai bg-tv-blue+text-white POLOS
                      (bukan `!`), sudah cocok dengan carve-out kontras di globals.css.
                    - Tombol hijau: variant="ghost" (basis bg-transparent, bukan
                      bg-white/[0.045]) + class POLOS `bg-tv-green text-white` (bukan `!`) -
                      dites lolos build Tailwind: .bg-tv-green ditulis SETELAH .bg-transparent
                      di CSS terkompilasi jadi menang tanpa !important. Sengaja TIDAK
                      memakai `!text-white` di sini: warna teks di atas hijau harus BERBEDA
                      per tema (gelap di tema gelap, putih di tema terang - lihat carve-out
                      `[class~='bg-tv-green'] .text-white{color:rgb(var(--lens-on-accent))}`)
                      - memaksa putih lewat `!` akan lolos di tema terang tapi merusak
                      kontras di tema gelap (2,26:1, persis bug yang sudah pernah diperbaiki
                      untuk lencana lain). */}
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
                <p className="text-[10px] text-tv-muted -mt-2">
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
      {/* Blok <style> .custom-scrollbar dihapus - warna hex palet lama, dan scrollbar
          global sudah ditata di app/globals.css. */}
    </div>
  );
}
