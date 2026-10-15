'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, AlertCircle, Plus, Activity, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import PortfolioHealth from '@/components/PortfolioHealth';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import PaywallModal from '@/components/PaywallModal';
import { checkWatchlistLimit } from '@/lib/limits';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { hasProAccessFor, useAuthUser } from '@/lib/hooks/useAuthUser';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import { getTickerName } from '@/lib/trendingTickers';
import { ApiErrorHint, Card, Input, Button, EmptyState, PageContainer, Skeleton, LoadingFact, TickerAvatar } from '@/components/ui';
import { getDecisionPresentation } from '@/modules/eligibility';
import { getKategoriPresentationLabel } from '@/shared/presentation/signal-labels';
import { describeFreshness } from '@/shared/presentation/freshness-labels';
import { describeUserConfidenceLabel, describeUserResearchLabel } from '@/shared/presentation/user-status-labels';
import Toast, { type ToastVariant } from '@/components/ui/Toast';
import { WatchlistHeader } from '@/components/watchlist/WatchlistHeader';
import { WatchlistAlertsPanel, getAlertOption, type AlertItem } from '@/components/watchlist/WatchlistAlertsPanel';
import { WatchlistDigestBanner, type WatchlistDigestData } from '@/components/watchlist/WatchlistDigestBanner';
import { JournalBadge, JournalSection, type WatchlistItem } from '@/components/watchlist/WatchlistJournalItem';
import { JourneyBeacon } from '@/components/analytics/JourneyBeacon';
import { apiErrorMessage, apiRequest, isApiClientError } from '@/shared/http/api-client';
import MenuUsageGuide from '@/components/MenuUsageGuide';

export default function WatchlistPage() {
  const { user: authUser, resolved: authResolved } = useAuthUser();
  const isAdmin = authResolved && authUser?.role === 'admin';
  const hasPro = authResolved && hasProAccessFor(authUser);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const [watchlistError, setWatchlistError] = useState(false);
  const [watchlistErrorRequestId, setWatchlistErrorRequestId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [digest, setDigest] = useState<WatchlistDigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveData, setLiveData] = useState<Record<string, any>>({});

  // Form states
  const [newSymbol, setNewSymbol] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [lotAmount, setLotAmount] = useState('');
  const [journalSymbol, setJournalSymbol] = useState<string | null>(null);
  const [journalNote, setJournalNote] = useState('');
  const [journalSaving, setJournalSaving] = useState(false);

  const [alertSymbol, setAlertSymbol] = useState('');
  const [alertCondition, setAlertCondition] = useState('PRICE_BELOW');
  const [alertValue, setAlertValue] = useState('');

  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
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
    fetchDigest(controller.signal);
    return () => controller.abort();
  }, []);

  const fetchDigest = async (signal?: AbortSignal) => {
    try {
      const json = await apiRequest<WatchlistDigestData>('/api/watchlist/digest', { signal });
      if (json && typeof json === 'object') setDigest(json);
    } catch {
      // Digest bersifat pengaya; kegagalan atau tamu 401 tidak boleh mengganggu fungsi utama watchlist.
    }
  };

  const fetchWatchlist = async (signal?: AbortSignal) => {
    try {
      const json = await apiRequest<any>('/api/watchlist', { signal });
      setWatchlist(json?.data || []);
      setWatchlistError(false);
      setWatchlistErrorRequestId(null);
      setWatchlistLoaded(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setWatchlistErrorRequestId(isApiClientError(error) ? error.requestId : null);
      if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') {
        if (await shouldShowLoginPromptFor401()) setShowLoginPrompt(true);
        else setWatchlistError(true);
        setWatchlistLoaded(true);
        return;
      }
      console.error('Failed to fetch watchlist', error);
      setWatchlistError(true);
      setWatchlistLoaded(true);
      if (isApiClientError(error) && error.requestId) {
        showToast(`Watchlist gagal dimuat. ID request: ${error.requestId}`, 'error');
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    if (watchlist.length > 0) {
      fetchLiveData(controller.signal);
    } else if (watchlistLoaded) {
      setLoading(false);
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist, watchlistLoaded]);

  const fetchAlerts = async (signal?: AbortSignal) => {
    try {
      const json = await apiRequest<any>('/api/alert', { signal });
      const rawAlerts = Array.isArray(json?.data) ? json.data : [];
      setAlerts(rawAlerts.map((a: any) => ({
        id: String(a.id),
        symbol: String(a.symbol ?? ''),
        conditionType: String(a.conditionType ?? a.condition_type ?? 'PRICE_BELOW'),
        targetValue: a.targetValue != null ? String(a.targetValue) : a.target_value != null ? String(a.target_value) : '',
        isActive: typeof a.isActive === 'boolean' ? a.isActive : !Boolean(a.triggered),
        createdAt: String(a.createdAt ?? a.created_at ?? ''),
      })));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Failed to fetch alerts', error);
    }
  };

  const fetchLiveData = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const symbolsParam = watchlist.map((item) => item.symbol).join(',');
      const batchRes = await apiRequest<{ data?: Record<string, any> }>(
        `/api/stock/batch?symbols=${encodeURIComponent(symbolsParam)}`,
        { signal },
      );
      if (!signal?.aborted && batchRes?.data && typeof batchRes.data === 'object') {
        setLiveData(batchRes.data);
      }
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
    const parsedPrice = buyPrice.trim() ? parseFloat(buyPrice) : null;
    const price = parsedPrice !== null && Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;
    const parsedLot = lotAmount.trim() ? parseInt(lotAmount, 10) : null;
    const lot = parsedLot !== null && Number.isFinite(parsedLot) && parsedLot > 0 ? parsedLot : null;
    const isNewSymbol = !watchlist.some((item) => item.symbol === symbol);
    if (isNewSymbol) {
      const limit = checkWatchlistLimit(watchlist.length, hasPro);
      if (!limit.allowed) { setShowPaywall(true); return; }
    }

    try {
      await apiRequest('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, buy_price: price, lot }),
      });
      void fetchWatchlist();
      void fetchDigest();
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
      void fetchDigest();
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

    const option = getAlertOption(alertCondition);
    const needsValue = option?.needsValue === true;
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
      void fetchDigest();
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
      void fetchDigest();
    } catch (error) {
      console.error('Failed to remove alert', error);
      showToast(apiErrorMessage(error, 'Gagal menghapus alert.', true), 'error');
    }
  };

  const saveJournal = async (symbol: string, note: string) => {
    setJournalSaving(true);
    try {
      await apiRequest('/api/watchlist/journal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, journal_note: note }),
      });
      void fetchWatchlist();
      void fetchDigest();
      setJournalSymbol(null);
      setJournalNote('');
      showToast(note.trim() ? 'Catatan berhasil disimpan.' : 'Catatan berhasil dihapus.', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error, 'Gagal menyimpan catatan. Coba lagi.', true), 'error');
    } finally {
      setJournalSaving(false);
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

  const nearStopSymbols = watchlist
    .filter((w) => {
      const p = liveData[w.symbol]?.price;
      if (typeof p !== 'number' || p <= 0) return false;
      if (w.alert_price && p <= w.alert_price) return true;
      if (w.buy_price > 0 && p <= w.buy_price * 0.95) return true;
      return false;
    })
    .map((w) => displayTicker(w.symbol));

  const aboveTargetSymbols = watchlist
    .filter((w) => {
      const p = liveData[w.symbol]?.price;
      return typeof p === 'number' && p > 0 && w.buy_price > 0 && p >= w.buy_price * 1.1;
    })
    .map((w) => displayTicker(w.symbol));

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <JourneyBeacon event="watchlist_view" surface="watchlist" />
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
        <MenuUsageGuide
          menuKey="watchlist"
          whatItAnswers="Bagaimana kabar saham-saham yang Anda pantau?"
          steps={[
            "Tambahkan saham lewat kotak pencarian; daftarnya tersimpan di akun Anda.",
            "Pasang alert harga supaya tidak perlu memeriksa manual tiap hari.",
            "Klik satu saham untuk melihat analisis lengkapnya.",
          ]}
        />

        <WatchlistDigestBanner
          digest={digest}
          nearStopSymbols={nearStopSymbols}
          aboveTargetSymbols={aboveTargetSymbols}
        />

        {/* Watchlist Section */}
        <div className="lg:col-span-2 space-y-6">
          <PortfolioHealth
            watchlist={watchlist.map(item => ({
              simbol: item.symbol,
              hargaBeli: item.buy_price,
              hargaSekarang: liveData[item.symbol]?.price,
              lot: item.lot,
              pnl: item.buy_price > 0 && liveData[item.symbol]?.price > 0 ? ((liveData[item.symbol]?.price - item.buy_price) / item.buy_price) * 100 : 0,
            }))}
          />

          <Card padding="none" radius="lg" elevation="sm" highlight={false} className="border-tv-border p-5">
            <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
              <Activity className="w-5 h-5 text-tv-blue" />
              My Watchlist
            </h3>

            <form onSubmit={addWatchlist} className="space-y-3 mb-6">
              <div>
                <label className="lens-meta text-tv-muted uppercase tracking-wide mb-1 block">Simbol Saham</label>
                <SymbolAutocomplete
                  containerClassName="relative w-full"
                  placeholder="Contoh: BBCA"
                  value={newSymbol}
                  onChange={(val) => setNewSymbol(val)}
                  showSearchIcon
                  className="w-full bg-tv-bg/60 border border-tv-border text-tv-text rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-tv-blue transition-colors"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="lens-meta text-tv-muted uppercase tracking-wide mb-1 block">Harga Beli (opsional)</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    className="w-full font-number"
                  />
                </div>
                <div>
                  <label className="lens-meta text-tv-muted uppercase tracking-wide mb-1 block">Total Lot</label>
                  <Input
                    type="number"
                    min="0"
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

                const kesegaran = data?._meta ? describeFreshness(data._meta.freshness, data._meta.dataTimestamp) : null;

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
                const scoreToneClass = scoreVal == null
                  ? 'bg-tv-muted/15 border-tv-muted/40 text-tv-muted'
                  : scoreSignal === 'STRONG BUY' || scoreSignal === 'BUY'
                    ? 'bg-tv-green/15 border-tv-green/50 text-tv-green'
                    : scoreSignal === 'HOLD' || scoreSignal === 'DATA TIDAK CUKUP'
                      ? 'bg-tv-yellow/15 border-tv-yellow/50 text-tv-yellow'
                      : scoreSignal === 'SELL'
                        ? 'bg-tv-red/15 border-tv-red/50 text-tv-red'
                      : 'bg-tv-muted/15 border-tv-muted/40 text-tv-muted';
                const scoreLabel = scoreVal == null
                  ? (loading ? 'memuat' : 'skor N/A')
                  : scorePresentation?.actionable && data?.decision?.action
                    ? getKategoriPresentationLabel(data.decision.action)
                    : scorePresentation?.modelSignal
                      ? scorePresentation.modelSignalLabel
                      : 'Sinyal belum tersedia';
                const explainability = data?.scoring?.explainability;
                const researchLabel = data?.trust?.research_label ?? explainability?.research_label;
                const confidenceLevel = data?.trust?.score_confidence ?? explainability?.confidence_level;
                const confidenceScore = data?.trust?.score_confidence_pct ?? explainability?.confidence_score;
                const riskFlags = Array.isArray(data?.trust?.blocking_reasons)
                  ? data.trust.blocking_reasons
                  : Array.isArray(explainability?.risk_flags)
                    ? explainability.risk_flags
                    : [];
                const dataGaps = Array.isArray(data?.trust?.data_gaps)
                  ? data.trust.data_gaps
                  : Array.isArray(explainability?.data_gaps)
                    ? explainability.data_gaps
                    : [];

                return (
                  <div key={item.symbol} className="group rounded-lg border border-tv-border bg-tv-bg hover:border-tv-blue/40 hover:bg-tv-hover/40 transition-colors p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                    <TickerAvatar symbol={item.symbol} size="lg" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-tv-text font-number">{code}</span>
                        <span className={`lens-chip font-bold px-1.5 py-0.5 rounded border ${scoreToneClass}`}>
                          {scoreLabel}
                        </span>
                        {currentPrice != null && (item.buy_price || item.alert_price) && (
                          <JournalBadge item={item} currentPrice={currentPrice} />
                        )}
                      </div>
                      <div className="lens-meta text-tv-muted truncate">{companyName}</div>
                      {scorePresentation && !scorePresentation.actionable && scorePresentation.statusLabel && (
                        <div className={`lens-meta font-semibold uppercase tracking-wide mt-0.5 ${
                          scorePresentation.kind === 'INELIGIBLE' ? 'text-tv-red' : 'text-tv-yellow'
                        }`}>
                          {scorePresentation.statusLabel}
                        </div>
                      )}
                      {(researchLabel || confidenceLevel || dataGaps.length > 0 || riskFlags.length > 0) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {researchLabel && (
                            <span className="lens-chip rounded border border-tv-blue/40 bg-tv-blue/10 px-1.5 py-0.5 font-semibold text-tv-blue">
                              {describeUserResearchLabel(researchLabel)}
                            </span>
                          )}
                          {confidenceLevel && (
                            <span className="lens-chip rounded border border-tv-border bg-tv-card px-1.5 py-0.5 text-tv-muted">
                              {describeUserConfidenceLabel(confidenceLevel)}{typeof confidenceScore === 'number' ? ` ${confidenceScore}%` : ''}
                            </span>
                          )}
                          {riskFlags.length > 0 && (
                            <span className="lens-chip rounded border border-tv-yellow/40 bg-tv-yellow/10 px-1.5 py-0.5 text-tv-yellow">
                              {riskFlags.length} risiko
                            </span>
                          )}
                          {dataGaps.length > 0 && (
                            <span className="lens-chip rounded border border-tv-muted/40 bg-tv-muted/10 px-1.5 py-0.5 text-tv-muted">
                              {dataGaps.length} data gap
                            </span>
                          )}
                        </div>
                      )}
                      <div className="sm:hidden mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {currentPrice != null ? (
                          <span className="text-tv-text font-bold text-xs font-number">Rp {currentPrice.toLocaleString('id-ID')}</span>
                        ) : loading ? (
                          <Skeleton variant="text" className="w-16 h-3" />
                        ) : (
                          <span className="lens-meta text-tv-muted">harga tak terambil</span>
                        )}
                        {kesegaran && (
                          <span className={`lens-meta ${kesegaran.tone}`} title={kesegaran.detail}>
                            {kesegaran.shortLabel}
                          </span>
                        )}
                      </div>
                      {pnl < -20 && data?.scoring?.kategori?.includes('SELL') && supportTarget && (
                        <Button variant="bare" size="none"
                          type="button"
                          onClick={() => { setAlertSymbol(item.symbol); setAlertCondition('PRICE_BELOW'); setAlertValue(supportTarget); }}
                          className="mt-1 flex items-center gap-1 lens-meta text-tv-warning hover:text-tv-warning/80"
                        >
                          <AlertCircle className="w-3 h-3" /> Suggest: Alert Support {supportTarget}
                        </Button>
                      )}
                      <JournalSection
                        item={item}
                        isEditing={journalSymbol === item.symbol}
                        onStartEdit={() => { setJournalSymbol(item.symbol); setJournalNote(item.journal_note || ''); }}
                        onCancelEdit={() => { setJournalSymbol(null); setJournalNote(''); }}
                        onSave={(note) => saveJournal(item.symbol, note)}
                        journalNote={journalNote}
                        setJournalNote={setJournalNote}
                        saving={journalSaving}
                      />
                    </div>

                    <div className="hidden sm:flex flex-col items-end text-right shrink-0 w-28">
                      {currentPrice != null ? (
                        <span className="text-tv-text font-bold text-sm font-number">Rp {currentPrice.toLocaleString('id-ID')}</span>
                      ) : loading ? (
                        <Skeleton variant="text" className="w-20 h-4" />
                      ) : (
                        <span className="lens-meta text-tv-muted">harga tak terambil</span>
                      )}
                      <span className="lens-meta text-tv-muted font-number">
                        {item.buy_price
                          ? `Beli: Rp ${item.buy_price.toLocaleString('id-ID')}${item.lot ? ` • ${item.lot} lot` : ''}`
                          : 'harga beli belum diisi'}
                      </span>
                      {kesegaran && (
                        <span className={`lens-meta ${kesegaran.tone}`} title={kesegaran.detail}>
                          {kesegaran.shortLabel}
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 w-20 text-right">
                      {item.buy_price && currentPrice != null ? (
                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-1 rounded-md text-xs font-number ${isProfit ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'}`}>
                          {isProfit ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="lens-meta text-tv-muted leading-tight">
                          {!item.buy_price ? 'P&L perlu harga beli' : 'menunggu harga'}
                        </span>
                      )}
                    </div>

                    <Button variant="bare" size="none" aria-label={`Hapus ${displayTicker(item.symbol)} dari watchlist`} onClick={() => removeWatchlist(item.symbol)} className="shrink-0 p-2 text-tv-muted hover:text-tv-red hover:bg-tv-red/10 rounded-md transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
              {watchlist.length === 0 && watchlistError && (
                <>
                  <EmptyState
                    icon={<AlertCircle className="w-5 h-5 text-tv-red" />}
                    title="Gagal memuat watchlist"
                    description="Terjadi masalah saat mengambil data watchlist Anda (bukan berarti kosong). Coba refresh halaman ini."
                    className="rounded-lg border border-dashed border-tv-red/40"
                  />
                  <ApiErrorHint requestId={watchlistErrorRequestId} className="justify-center" />
                </>
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
                  <p className="mt-3 border-t border-tv-border pt-3 lens-meta leading-relaxed text-tv-muted">
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

        <WatchlistAlertsPanel
          alerts={alerts}
          isAdmin={isAdmin}
          alertSymbol={alertSymbol}
          setAlertSymbol={setAlertSymbol}
          alertCondition={alertCondition}
          setAlertCondition={setAlertCondition}
          alertValue={alertValue}
          setAlertValue={setAlertValue}
          onAddAlert={addAlert}
          onRemoveAlert={removeAlert}
          onTriggerCron={triggerCron}
        />
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
