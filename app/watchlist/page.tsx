'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, AlertCircle, Plus, Activity, Bell, ArrowDownCircle, ArrowUpCircle, Gauge, Sparkles } from 'lucide-react';
import PortfolioHealth from '@/components/PortfolioHealth';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import PaywallModal from '@/components/PaywallModal';
import { checkWatchlistLimit } from '@/lib/limits';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { hasProAccessFor, useAuthUser } from '@/lib/hooks/useAuthUser';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import { getTickerName } from '@/lib/trendingTickers';
import { Card, Input, Select, Button, Badge, EmptyState, PageContainer, Skeleton, LoadingFact, TickerAvatar } from '@/components/ui';
import { getDecisionPresentation } from '@/modules/eligibility';
import { getKategoriPresentationLabel } from '@/shared/presentation/signal-labels';
import Toast, { type ToastVariant } from '@/components/ui/Toast';
import { WatchlistHeader } from '@/components/watchlist/WatchlistHeader';
import { apiErrorMessage, apiRequest, isApiClientError } from '@/shared/http/api-client';

interface WatchlistItem {
  symbol: string;
  buy_price: number;
  lot?: number;
  created_at: string;
}

interface AlertItem {
  id: string;
  symbol: string;
  conditionType: string;
  targetValue: string;
  isActive: boolean;
  createdAt: string;
}

export default function WatchlistPage() {
  const { user: authUser, resolved: authResolved } = useAuthUser();
  const isAdmin = authResolved && authUser?.role === 'admin';
  const hasPro = authResolved && hasProAccessFor(authUser);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistError, setWatchlistError] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveData, setLiveData] = useState<Record<string, any>>({});

  // Form states
  const [newSymbol, setNewSymbol] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [lotAmount, setLotAmount] = useState('');

  const [alertSymbol, setAlertSymbol] = useState('');
  const [alertCondition, setAlertCondition] = useState('PRICE_BELOW');
  const [alertValue, setAlertValue] = useState('');

  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  // Batas watchlist gratis hanya berlaku kalau user memang TIDAK punya akses Pro.
  // Sebelumnya diendus dari cookie yang tidak pernah ditulis untuk pelanggan Pro,
  // jadi pelanggan berbayar tetap mentok di 3 saham (lihat lib/limits.ts).
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>('info');

  const showToast = (message: string, variant: ToastVariant = 'info') => {
    setToastVariant(variant);
    setToastMessage(null);
    window.setTimeout(() => setToastMessage(message), 0);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchWatchlist(controller.signal);
    fetchAlerts(controller.signal);
    return () => controller.abort();
  }, []);

  const fetchWatchlist = async (signal?: AbortSignal) => {
    try {
      const json = await apiRequest<any>('/api/watchlist', { signal });
      setWatchlist(json?.data || []);
      setWatchlistError(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') {
        if (await shouldShowLoginPromptFor401()) setShowLoginPrompt(true);
        else setWatchlistError(true);
        return;
      }
      console.error('Failed to fetch watchlist', error);
      setWatchlistError(true);
      if (isApiClientError(error) && error.requestId) {
        showToast(`Watchlist gagal dimuat. ID request: ${error.requestId}`, 'error');
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    // Fetch live data for watchlist items. Request lama dibatalkan bila isi watchlist
    // berubah supaya harga dari daftar lama tidak menimpa daftar yang baru.
    if (watchlist.length > 0) {
      fetchLiveData(controller.signal);
    } else {
      setLoading(false);
    }
    return () => controller.abort();
  }, [watchlist]);

  const fetchAlerts = async (signal?: AbortSignal) => {
    try {
      const json = await apiRequest<any>('/api/alert', { signal });
      setAlerts(json?.data || []);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Failed to fetch alerts', error);
    }
  };

  const fetchLiveData = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const results = await Promise.all(watchlist.map(async (item) => {
        try {
          const data = await apiRequest<any>(`/api/stock/${item.symbol.replace('.JK', '')}`, { signal });
          return [item.symbol, data] as const;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error;
          console.error(`Failed to fetch data for ${item.symbol}`, error);
          return null;
        }
      }));
      const newData: Record<string, any> = {};
      results.forEach((result) => { if (result) newData[result[0]] = result[1]; });
      if (!signal?.aborted) setLiveData(newData);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Failed to refresh watchlist prices', error);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const addWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol) return;

    const symbol = newSymbol.toUpperCase().replace('.JK', '') + '.JK';
    const price = parseFloat(buyPrice) || 0;
    const isNewSymbol = !watchlist.some((item) => item.symbol === symbol);
    if (isNewSymbol) {
      const limit = checkWatchlistLimit(watchlist.length, hasPro);
      if (!limit.allowed) { setShowPaywall(true); return; }
    }

    try {
      await apiRequest('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, buy_price: price, lot: lotAmount ? parseInt(lotAmount) : null }),
      });
      void fetchWatchlist();
      setNewSymbol('');
      setBuyPrice('');
      setLotAmount('');
    } catch (error) {
      console.error('Failed to add to watchlist', error);
      showToast(apiErrorMessage(error, 'Saham gagal ditambahkan ke watchlist. Coba lagi.', true), 'error');
    }
  };

  const removeWatchlist = async (symbol: string) => {
    try {
      await apiRequest(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      void fetchWatchlist();
      setLiveData((current) => {
        const next = { ...current };
        delete next[symbol];
        return next;
      });
    } catch (error) {
      console.error('Failed to remove from watchlist', error);
      showToast(apiErrorMessage(error, 'Saham gagal dihapus dari watchlist. Coba lagi.', true), 'error');
    }
  };

  const addAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertSymbol) return;

    const needsValue = alertCondition === 'PRICE_BELOW' || alertCondition === 'PRICE_ABOVE';
    const parsedValue = alertValue.trim() ? Number(alertValue) : null;
    if (needsValue && (parsedValue === null || Number.isNaN(parsedValue))) {
      showToast('Target Nilai wajib diisi dengan angka.', 'error');
      return;
    }

    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        await Notification.requestPermission();
      }
      await apiRequest('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: alertSymbol.toUpperCase().replace('.JK', '') + '.JK',
          conditionType: alertCondition,
          targetValue: needsValue ? parsedValue : null,
        }),
      });
      void fetchAlerts();
      setAlertSymbol('');
      setAlertValue('');
      showToast('Alert berhasil dibuat.', 'success');
    } catch (error) {
      console.error('Failed to add alert', error);
      showToast(apiErrorMessage(error, 'Gagal membuat alert. Coba lagi.', true), 'error');
    }
  };

  const removeAlert = async (id: string) => {
    try {
      await apiRequest(`/api/alert?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      void fetchAlerts();
    } catch (error) {
      console.error('Failed to remove alert', error);
      showToast(apiErrorMessage(error, 'Gagal menghapus alert.', true), 'error');
    }
  };

  const triggerCron = async () => {
    try {
      const json = await apiRequest<any>('/api/alerts/check');
      if (json.triggeredAlerts?.length > 0) {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          json.triggeredAlerts.forEach((alert: any) => new Notification('SahamLens LensAlert', { body: alert.message }));
        } else {
          showToast(`${json.triggeredAlerts.length} alert berhasil dipicu.`, 'success');
        }
      } else {
        showToast(`Pemeriksaan selesai. Tidak ada alert baru (${json.checked ?? 0} diperiksa).`, 'info');
      }
      void fetchAlerts();
    } catch (error) {
      console.error('Failed to trigger alert check', error);
      showToast(apiErrorMessage(error, 'Pemeriksaan alert gagal.', true), 'error');
    }
  };

  const positioned = watchlist.filter((w): w is typeof w & { lot: number } =>
    w.buy_price > 0 &&
    typeof w.lot === 'number' &&
    Number.isFinite(w.lot) &&
    w.lot > 0 &&
    typeof liveData[w.symbol]?.price === 'number' &&
    Number.isFinite(liveData[w.symbol].price) &&
    liveData[w.symbol].price > 0
  );
  const totalInvested = positioned.reduce((sum, w) => sum + w.buy_price * w.lot * 100, 0);
  const totalCurrent = positioned.reduce((sum, w) => sum + liveData[w.symbol].price * w.lot * 100, 0);
  const totalPnlPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;
  const activeAlertsCount = alerts.filter(a => a.isActive).length;

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Toast message={toastMessage} variant={toastVariant} />
      <WatchlistHeader
        loading={loading}
        totalCurrent={totalCurrent}
        totalInvested={totalInvested}
        totalPnlPct={totalPnlPct}
        watchlistCount={watchlist.length}
        watchlistLimit={hasPro || FREE_LIMITS.WATCHLIST === Infinity ? '∞' : FREE_LIMITS.WATCHLIST}
        activeAlertsCount={activeAlertsCount}
        onRefresh={() => fetchLiveData()}
      />

      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Watchlist Section */}
        <div className="lg:col-span-2 space-y-6">
          <PortfolioHealth
            watchlist={watchlist.map(item => {
              return {
                simbol: item.symbol,
                hargaBeli: item.buy_price,
                hargaSekarang: liveData[item.symbol]?.price,
                lot: item.lot,
                pnl: item.buy_price > 0 && liveData[item.symbol]?.price > 0 ? ((liveData[item.symbol]?.price - item.buy_price) / item.buy_price) * 100 : 0
              };
            })}
          />

          <Card padding="none" radius="lg" elevation="sm" highlight={false} className="border-tv-border p-5">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
              <Activity className="w-5 h-5 text-tv-blue" />
              My Watchlist
            </h3>

            <form onSubmit={addWatchlist} className="space-y-3 mb-6">
              <div>
                <label className="text-[11px] text-tv-muted uppercase tracking-wide mb-1 block">Simbol Saham</label>
                <SymbolAutocomplete
                  containerClassName="relative w-full"
                  placeholder="Contoh: BBCA"
                  value={newSymbol}
                  onChange={(val) => setNewSymbol(val)}
                  className="w-full bg-tv-bg/60 border border-tv-border text-tv-text rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-tv-blue transition-colors"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-tv-muted uppercase tracking-wide mb-1 block">Harga Beli (opsional)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    className="w-full font-number"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-tv-muted uppercase tracking-wide mb-1 block">Total Lot</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={lotAmount}
                    onChange={(e) => setLotAmount(e.target.value)}
                    className="w-full font-number"
                  />
                </div>
              </div>
              <Button type="submit" variant="primary" className="w-full">
                <Plus className="w-4 h-4" /> Tambah ke Watchlist
              </Button>
            </form>

            <div className="space-y-2.5">
              {watchlist.map((item) => {
                const data = liveData[item.symbol];
                const currentPrice = typeof data?.price === 'number' && Number.isFinite(data.price) ? data.price : null;
                const pnl = item.buy_price > 0 && currentPrice != null && currentPrice > 0
                  ? ((currentPrice - item.buy_price) / item.buy_price) * 100
                  : 0;
                const isProfit = pnl >= 0;
                const code = item.symbol.replace('.JK', '');
                const companyName = getTickerName(code);

                const srAnalyzer = data?.analyzers?.find((a: any) => a.label?.includes('Support & Resistance'));
                const supportMatch = srAnalyzer?.value?.match(/Sup: ([\d.]+)/);
                const supportTarget = supportMatch ? supportMatch[1] : '';

                const scoreVal = data?.scoring?.total_score;
                const scorePresentation = data?.scoring
                  ? getDecisionPresentation(data.scoring.kategori, data.decision)
                  : null;
                const scoreSignal = scorePresentation?.actionable
                  ? data?.decision?.action
                  : scorePresentation?.modelSignal;
                // Jangan membuat threshold BUY/HOLD/SELL kedua di UI. Arah sinyal selalu
                // memakai kategori dari scoring engine; action hanya dari decision.action.
                const scoreColor = scoreVal == null ? '#94A3B8'
                  : scoreSignal === 'STRONG BUY' || scoreSignal === 'BUY' ? '#22C55E'
                  : scoreSignal === 'HOLD' || scoreSignal === 'DATA TIDAK CUKUP' ? '#F59E0B'
                  : scoreSignal === 'SELL' ? '#EF4444'
                  : '#94A3B8';
                const scoreLabel = scoreVal == null
                  ? (loading ? 'memuat' : 'skor N/A')
                  : scorePresentation?.actionable && data?.decision?.action
                    ? getKategoriPresentationLabel(data.decision.action)
                    : scorePresentation?.modelSignal
                      ? getKategoriPresentationLabel(scorePresentation.modelSignal)
                      : 'sinyal N/A';

                return (
                  <div key={item.symbol} className="group rounded-lg border border-tv-border bg-tv-bg hover:border-tv-blue/40 hover:bg-tv-hover/40 transition-colors p-3.5 flex items-center gap-3">
                    {/* Avatar lama memakai warna biru yang SAMA untuk setiap emiten -
                        tidak membantu membedakan baris. TickerAvatar memberi warna
                        deterministik per kode, konsisten dengan halaman lain. */}
                    <TickerAvatar symbol={item.symbol} size="lg" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-tv-text font-number">{code}</span>
                        <span
                          className="lens-chip font-bold px-1.5 py-0.5 rounded border"
                          style={{ backgroundColor: `${scoreColor}22`, borderColor: scoreColor, color: scoreColor }}
                        >
                          {scoreLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-tv-muted truncate">{companyName}</div>
                      {scorePresentation && !scorePresentation.actionable && scorePresentation.statusLabel && (
                        <div className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${
                          scorePresentation.kind === 'INELIGIBLE' ? 'text-tv-red' : 'text-tv-yellow'
                        }`}>
                          {scorePresentation.statusLabel}
                        </div>
                      )}
                      {pnl < -20 && data?.scoring?.kategori?.includes('SELL') && supportTarget && (
                        <Button variant="bare" size="none"
                          type="button"
                          onClick={() => { setAlertSymbol(item.symbol); setAlertCondition('PRICE_BELOW'); setAlertValue(supportTarget); }}
                          className="mt-1 flex items-center gap-1 text-[10px] text-tv-warning hover:text-tv-warning/80"
                        >
                          <AlertCircle className="w-3 h-3" /> Suggest: Alert Support {supportTarget}
                        </Button>
                      )}
                    </div>

                    <div className="hidden sm:flex flex-col items-end text-right shrink-0 w-28">
                      {currentPrice != null ? (
                        <span className="text-tv-text font-bold text-sm font-number">Rp {currentPrice.toLocaleString('id-ID')}</span>
                      ) : loading ? (
                        <Skeleton variant="text" className="w-20 h-4" />
                      ) : (
                        <span className="text-[10px] text-tv-muted">harga tak terambil</span>
                      )}
                      <span className="text-[10px] text-tv-muted font-number">
                        {item.buy_price
                          ? `Beli: Rp ${item.buy_price.toLocaleString('id-ID')}${item.lot ? ` • ${item.lot} lot` : ''}`
                          : 'harga beli belum diisi'}
                      </span>
                    </div>

                    <div className="shrink-0 w-20 text-right">
                      {item.buy_price && currentPrice != null ? (
                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-1 rounded-md text-xs font-number ${isProfit ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'}`}>
                          {isProfit ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                        </span>
                      ) : (
                        // Sebelumnya '-' polos. Dua sebab berbeda dinamai: harga beli
                        // belum diisi (P&L memang tidak bisa dihitung) vs harga pasar
                        // belum masuk (perhitungannya tertunda, bukan mustahil).
                        <span className="text-[10px] text-tv-muted leading-tight">
                          {!item.buy_price ? 'P&L perlu harga beli' : 'menunggu harga'}
                        </span>
                      )}
                    </div>

                    <Button variant="bare" size="none" onClick={() => removeWatchlist(item.symbol)} className="shrink-0 p-2 text-tv-muted hover:text-tv-red hover:bg-tv-red/10 rounded-md transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
              {watchlist.length === 0 && watchlistError && (
                <EmptyState
                  icon={<AlertCircle className="w-5 h-5 text-tv-red" />}
                  title="Gagal memuat watchlist"
                  description="Terjadi masalah saat mengambil data watchlist Anda (bukan berarti kosong). Coba refresh halaman ini."
                  className="rounded-lg border border-dashed border-tv-red/40"
                />
              )}
              {watchlist.length === 0 && !watchlistError && (
                <EmptyState
                  illustration="collecting"
                  title="Belum ada saham di watchlist"
                  description="Mulai dengan cari emiten, baca ringkasannya, lalu simpan di sini. Harga beli dan lot boleh diisi belakangan bila ingin P&L serta nilai posisi ikut terhitung."
                  progress={{ current: 0, total: FREE_LIMITS.WATCHLIST === Infinity ? 5 : FREE_LIMITS.WATCHLIST, unit: 'saham', label: 'Watchlist terisi' }}
                  action={{ label: 'Cari saham dulu', onClick: () => { window.location.href = '/dashboard'; } }}
                  className="rounded-lg border border-dashed border-tv-border"
                />
              )}

              {loading && watchlist.length > 0 && <LoadingFact className="mt-3" />}

              {/* Storytelling: daftar menampilkan P&L per baris, tapi tidak pernah
                  menyebut mana yang paling menopang dan paling menekan portofolio -
                  padahal itu yang dicari orang saat membuka halaman ini. */}
              {(() => {
                const withPnl = positioned
                  .map((w) => ({
                    code: displayTicker(w.symbol),
                    pnl: ((liveData[w.symbol].price - w.buy_price) / w.buy_price) * 100,
                  }))
                  .sort((a, b) => b.pnl - a.pnl);
                if (withPnl.length < 2) return null;
                const best = withPnl[0];
                const worst = withPnl[withPnl.length - 1];
                return (
                  <p className="mt-3 border-t border-tv-border pt-3 text-[11px] leading-relaxed text-tv-muted">
                    Dari {withPnl.length} posisi berharga beli:{' '}
                    <span className="font-number font-semibold text-tv-green">{best.code}</span> paling menopang
                    ({best.pnl >= 0 ? '+' : ''}{best.pnl.toFixed(1)}%),{' '}
                    <span className="font-number font-semibold text-tv-red">{worst.code}</span> paling menekan
                    ({worst.pnl >= 0 ? '+' : ''}{worst.pnl.toFixed(1)}%).
                    {' '}Total P&amp;L di atas menimbang tiap posisi menurut nilainya, bukan rata-rata persentase.
                  </p>
                );
              })()}
            </div>
          </Card>
        </div>

        {/* Alerts Section - h-full pada kartu ini WAJIB, bukan cuma pada pembungkusnya.
            Grid 3 kolom di atas default align-items:stretch, jadi pembungkus
            "space-y-6" ini sudah otomatis setinggi kolom kiri (Health Check + My
            Watchlist) - tapi kartu di DALAMNYA tidak ikut memanjang tanpa h-full,
            menyisakan celah kosong tak terlihat di bawah kartu sampai batas kolom. */}
        <div className="space-y-6 h-full">
          <Card padding="none" radius="lg" elevation="sm" highlight={false} className="border-tv-border p-5 h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-tv-border pb-3 mb-4">
              <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
                <Bell className="w-5 h-5 text-tv-yellow" />
                LensAlert
              </h3>
              {/* BUG FIX (2026-08-06): `isAdmin` dihitung dari /api/auth/me sejak awal
                  (lihat checkAdmin) tapi TIDAK PERNAH dibaca di mana pun, sehingga
                  tombol debug ini tampil untuk semua pengguna. Menekannya memicu
                  pemeriksaan cron manual dan menampilkan notifikasi hasil
                  mentahnya - tampilan internal yang tidak seharusnya sampai ke
                  pengguna biasa. Sekarang benar-benar digerbangi. */}
              {isAdmin && (
                <Button variant="bare" size="none" onClick={triggerCron} className="text-[10px] text-tv-muted hover:text-tv-text underline">
                  Test Cron
                </Button>
              )}
            </div>

            <form onSubmit={addAlert} className="space-y-3 mb-6">
              <SymbolAutocomplete
                containerClassName="relative w-full"
                placeholder="Simbol (BBCA)"
                value={alertSymbol}
                onChange={(val) => setAlertSymbol(val)}
                className="w-full bg-tv-bg/60 border border-tv-border text-tv-text rounded-md px-3 py-2 text-sm focus:outline-none focus:border-tv-yellow transition-colors"
                required
              />
              <Select value={alertCondition} onChange={(e) => setAlertCondition(e.target.value)}>
                <option value="PRICE_BELOW">Harga Turun Di Bawah</option>
                <option value="PRICE_ABOVE">Harga Naik Di Atas</option>
                <option value="CONSENSUS_STRONG_BUY">Konsensus Sangat Positif</option>
                <option value="RSI_OVERSOLD">RSI Oversold (&lt; 30)</option>
              </Select>
              {(alertCondition === 'PRICE_BELOW' || alertCondition === 'PRICE_ABOVE') && (
                <Input
                  type="number"
                  placeholder="Target Nilai"
                  value={alertValue}
                  onChange={(e) => setAlertValue(e.target.value)}
                  required
                  className="font-number"
                />
              )}
              <Button type="submit" variant="secondary" className="w-full">
                <Plus className="w-4 h-4" /> Set Alert
              </Button>
            </form>

            {/* flex-1 supaya area ini mengisi sisa tinggi kartu (bukan cuma numpuk di
                atas), max-h-[400px] tetap dipertahankan untuk membatasi scroll kalau
                alert-nya banyak. */}
            {/* Kelas `custom-scrollbar` dilepas: tidak ada blok <style> yang
                mendefinisikannya di file ini, jadi selama ini inert. Scrollbar
                sudah ditata global di app/globals.css. */}
            <div className="space-y-2 flex-1 min-h-[120px] max-h-[400px] overflow-y-auto pr-1">
              {alerts.map(alert => {
                const AlertIcon = alert.conditionType === 'PRICE_BELOW' ? ArrowDownCircle
                  : alert.conditionType === 'PRICE_ABOVE' ? ArrowUpCircle
                  : alert.conditionType === 'RSI_OVERSOLD' ? Gauge
                  : Sparkles;
                return (
                  <div key={alert.id} className={`p-3 rounded-md border flex flex-col gap-2 ${alert.isActive ? 'bg-tv-bg border-tv-border' : 'bg-tv-bg/50 border-tv-border/50 opacity-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-tv-text font-number">{displayTicker(alert.symbol)}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={alert.isActive ? 'success' : 'neutral'}>{alert.isActive ? 'Active' : 'Triggered'}</Badge>
                        <Button variant="bare" size="none" onClick={() => removeAlert(alert.id)} className="text-tv-muted hover:text-tv-red">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-tv-muted flex items-center gap-1.5">
                      <AlertIcon className="w-3.5 h-3.5 shrink-0" />
                      {alert.conditionType === 'PRICE_BELOW' && `Harga < ${alert.targetValue}`}
                      {alert.conditionType === 'PRICE_ABOVE' && `Harga > ${alert.targetValue}`}
                      {alert.conditionType === 'CONSENSUS_STRONG_BUY' && `Konsensus Sangat Positif`}
                      {alert.conditionType === 'RSI_OVERSOLD' && `RSI Oversold`}
                    </div>
                  </div>
                );
              })}
              {alerts.length === 0 && (
                <EmptyState
                  illustration="empty"
                  title="Belum ada alert"
                  description="Alert berjalan di server, jadi tetap aktif walau halaman ini ditutup. Notifikasi hp butuh izin browser - izinnya diminta saat alert pertama dibuat."
                />
              )}
            </div>
          </Card>
        </div>
      </PageContainer>

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title={`Watchlist Free Max ${FREE_LIMITS.WATCHLIST} Saham`}
        body={`Kamu sudah punya ${watchlist.slice(0, 3).map(w => displayTicker(w.symbol)).join(', ')}. Upgrade Pro untuk watchlist & alert unlimited.`}
        benefits={[
          'LensWatch unlimited (bukan cuma 3 saham)',
          'LensAlert unlimited (bukan cuma 2)',
          'LensRadar scan berkala, LensConsensus & fitur Pro lainnya',
        ]}
        secondaryLabel="Nanti"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Pakai Watchlist"
        body="LensWatch butuh akun gratis. Daftar untuk memakai fitur selama masa pengujian."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}

function displayTicker(symbol: string) {
  return symbol.replace('.JK', '');
}
