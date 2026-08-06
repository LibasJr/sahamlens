'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, AlertCircle, BellRing, Download, Plus, Activity, Search, Bell, RefreshCw, TrendingUp, TrendingDown, Wallet, ArrowDownCircle, ArrowUpCircle, Gauge, Sparkles, Menu } from 'lucide-react';
import PortfolioHealth from '@/components/PortfolioHealth';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import PaywallModal from '@/components/PaywallModal';
import { checkWatchlistLimit, refreshAdminStatus, FREE_LIMITS } from '@/lib/limits';
import { getTickerName } from '@/lib/trendingTickers';
import { Input, Select, Button, Badge, EmptyState, PageContainer, Skeleton, LoadingFact, TickerAvatar, AnimatedNumber } from '@/components/ui';

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
  const [isAdmin, setIsAdmin] = useState(false);
  // Batas watchlist gratis hanya berlaku kalau user memang TIDAK punya akses Pro.
  // Sebelumnya diendus dari cookie yang tidak pernah ditulis untuk pelanggan Pro,
  // jadi pelanggan berbayar tetap mentok di 3 saham (lihat lib/limits.ts).
  const [hasPro, setHasPro] = useState(false);

  useEffect(() => {
    refreshAdminStatus().then(setHasPro);
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user?.role === 'admin') {
          setIsAdmin(true);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchWatchlist();
    fetchAlerts();
  }, []);

  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/watchlist');
      if (res.status === 401) {
        setShowLoginPrompt(true);
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setWatchlist(json?.data || []);
        setWatchlistError(false);
      } else {
        // Sebelumnya kegagalan (401 session expired, 500, dst) diam-diam meninggalkan
        // watchlist=[] - tampilannya identik dengan watchlist kosong asli, user dengan
        // watchlist terisi bisa mengira datanya terhapus padahal cuma gagal fetch.
        setWatchlistError(true);
      }
    } catch (e) {
      console.error('Failed to fetch watchlist', e);
      setWatchlistError(true);
    }
  };

  useEffect(() => {
    // Fetch live data for watchlist items
    if (watchlist.length > 0) {
      fetchLiveData();
    } else {
      setLoading(false);
    }
  }, [watchlist]);

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alert');
      if (res.ok) {
        const json = await res.json();
        setAlerts(json?.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch alerts', e);
    }
  };

  const fetchLiveData = async () => {
    setLoading(true);
    // BUG FIX (2026-08-01, audit dummy-data): sebelumnya for-await sekuensial - total
    // waktu = JUMLAH semua fetch simbol di watchlist, bukan MAKSIMUM salah satu (pola
    // sama yang sudah diperbaiki di modules/notification/service/alert-evaluation.service.ts).
    const results = await Promise.all(watchlist.map(async (item) => {
      try {
        const res = await fetch(`/api/stock/${item.symbol.replace('.JK', '')}`);
        if (res.ok) return [item.symbol, await res.json()] as const;
      } catch (e) {
        console.error(`Failed to fetch data for ${item.symbol}`);
      }
      return null;
    }));
    const newData: Record<string, any> = {};
    results.forEach((r) => { if (r) newData[r[0]] = r[1]; });
    setLiveData(newData);
    setLoading(false);
  };

  const addWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol) return;

    const symbol = newSymbol.toUpperCase().replace('.JK', '') + '.JK';
    const price = parseFloat(buyPrice) || 0;
    const isNewSymbol = !watchlist.some(w => w.symbol === symbol);

    if (isNewSymbol) {
      const limit = checkWatchlistLimit(watchlist.length, hasPro);
      if (!limit.allowed) {
        setShowPaywall(true);
        return;
      }
    }

    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, buy_price: price, lot: lotAmount ? parseInt(lotAmount) : null })
      });
      if (res.ok) {
        fetchWatchlist();
      }
    } catch (err) {
      console.error('Failed to add to watchlist', err);
    }

    setNewSymbol('');
    setBuyPrice('');
    setLotAmount('');
  };

  const removeWatchlist = async (symbol: string) => {
    try {
      await fetch(`/api/watchlist?symbol=${symbol}`, { method: 'DELETE' });
      fetchWatchlist();

      const newLiveData = { ...liveData };
      delete newLiveData[symbol];
      setLiveData(newLiveData);
    } catch (err) {
      console.error('Failed to remove from watchlist', err);
    }
  };

  const addAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertSymbol) return;

    const needsValue = alertCondition === 'PRICE_BELOW' || alertCondition === 'PRICE_ABOVE';
    // Backend (alertSchema) mewajibkan targetValue berupa number, tapi state ini bersumber
    // dari <input type="number"> yang selalu berupa string di React - sebelumnya string
    // mentah ("400") dikirim langsung dan ditolak validasi Zod, gagal 400 tanpa pesan apa
    // pun ke user (klik "Set Alert" terlihat seperti tidak terjadi apa-apa).
    const parsedValue = alertValue.trim() ? Number(alertValue) : null;
    if (needsValue && (parsedValue === null || Number.isNaN(parsedValue))) {
      alert('Target Nilai wajib diisi dengan angka.');
      return;
    }

    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
          await Notification.requestPermission();
        }
      }

      const res = await fetch('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: alertSymbol.toUpperCase().replace('.JK', '') + '.JK',
          conditionType: alertCondition,
          targetValue: needsValue ? parsedValue : null
        })
      });

      if (res.ok) {
        fetchAlerts();
        setAlertSymbol('');
        setAlertValue('');
      } else {
        const errBody = await res.json().catch(() => null);
        alert(errBody?.error || errBody?.message || 'Gagal membuat alert. Coba lagi.');
      }
    } catch (err) {
      console.error('Failed to add alert', err);
      alert('Gagal membuat alert. Coba lagi.');
    }
  };

  const removeAlert = async (id: string) => {
    try {
      await fetch(`/api/alert?id=${id}`, { method: 'DELETE' });
      fetchAlerts();
    } catch (err) {
      console.error('Failed to remove alert', err);
    }
  };

  const triggerCron = async () => {
    try {
      const res = await fetch('/api/alerts/check');
      const json = await res.json();

      if (json.triggeredAlerts && json.triggeredAlerts.length > 0) {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          json.triggeredAlerts.forEach((alert: any) => {
            new Notification('SahamLens LensAlert', {
              body: alert.message
            });
          });
        } else {
          alert(`Cron triggered! Alerts:\n` + json.triggeredAlerts.map((a: any) => a.message).join('\n\n'));
        }
      } else {
        alert(`Cron triggered. No new alerts triggered. (Checked ${json.checked})`);
      }

      fetchAlerts();
    } catch (e) {
      console.error('Failed to trigger cron', e);
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
      <header className="bg-tv-surface border-b border-tv-border px-6 py-6 sticky top-0 z-20 shadow-2">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
              className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="p-2.5 rounded-lg bg-tv-blue text-white">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-xl text-white tracking-tight">LensWatch</h2>
              <p className="text-xs text-white/50">Pantau portofolio dan set notifikasi hp (Push Notification)</p>
            </div>
          </div>
          <button
            onClick={fetchLiveData}
            disabled={loading}
            className="bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Ketiga kartu ini dulu jatuh ke '-' saat belum ada posisi. Tanda hubung
              tidak membedakan "belum mengisi harga beli" dari "gagal memuat harga",
              padahal jalan keluarnya berbeda: yang satu perlu diisi user, yang satu
              perlu dicoba ulang. */}
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40"><Wallet className="w-3 h-3" /> Nilai Posisi</div>
            <div className="mt-1 text-[16px] font-bold text-white font-number">
              {totalCurrent > 0
                ? <AnimatedNumber value={totalCurrent} format={(n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`} />
                : <span className="text-[11px] font-normal text-white/40">isi harga beli &amp; lot dulu</span>}
            </div>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            {/* Panah dulu memakai `totalPnlPct >= 0` tanpa syarat, jadi saat belum ada
                posisi sama sekali (P&L = 0) ikon panah HIJAU tetap menyala di sebelah
                nilai yang kosong. */}
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">
              {totalInvested <= 0 ? <Activity className="w-3 h-3" /> : totalPnlPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} Total P&amp;L
            </div>
            <div className={`mt-1 text-[16px] font-bold font-number ${totalInvested <= 0 ? 'text-white/40' : totalPnlPct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
              {totalInvested > 0
                ? `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`
                : <span className="text-[11px] font-normal">belum ada posisi</span>}
            </div>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40"><Activity className="w-3 h-3" /> Saham Dipantau</div>
            <div className="mt-1 text-[16px] font-bold text-white font-number">{watchlist.length} / {FREE_LIMITS.WATCHLIST === Infinity ? '∞' : FREE_LIMITS.WATCHLIST}</div>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40"><BellRing className="w-3 h-3" /> Alert Aktif</div>
            <div className="mt-1 text-[16px] font-bold text-white font-number">{activeAlertsCount}</div>
          </div>
        </div>
      </header>

      <PageContainer className="p-6 space-y-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

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

          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
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
                // #8B94B6 (muted lama) dan #10B981 (hijau lama) diganti nilai palet Lens.
                const scoreColor = scoreVal == null ? '#94A3B8' : scoreVal < 40 ? '#EF4444' : scoreVal < 60 ? '#F59E0B' : '#22C55E';
                // "..." terbaca seperti sedang memuat padahal bisa jadi skornya memang
                // tidak tersedia untuk emiten ini. Dibedakan dari keadaan loading nyata.
                const scoreLabel = scoreVal == null ? (loading ? 'memuat' : 'skor N/A') : scoreVal < 40 ? 'SELL' : scoreVal < 60 ? 'HOLD' : 'BUY';

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
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                          style={{ backgroundColor: `${scoreColor}22`, borderColor: scoreColor, color: scoreColor }}
                        >
                          {scoreLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-tv-muted truncate">{companyName}</div>
                      {pnl < -20 && data?.scoring?.kategori?.includes('SELL') && supportTarget && (
                        <button
                          type="button"
                          onClick={() => { setAlertSymbol(item.symbol); setAlertCondition('PRICE_BELOW'); setAlertValue(supportTarget); }}
                          className="mt-1 flex items-center gap-1 text-[10px] text-tv-warning hover:text-tv-warning/80"
                        >
                          <AlertCircle className="w-3 h-3" /> Suggest: Alert Support {supportTarget}
                        </button>
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

                    <button onClick={() => removeWatchlist(item.symbol)} className="shrink-0 p-2 text-tv-muted hover:text-tv-red hover:bg-tv-red/10 rounded-md transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                  description="Tambahkan simbol lewat form di atas. Isi juga harga beli dan lot kalau ingin P&L dan nilai posisi ikut terhitung - tanpa keduanya, watchlist hanya memantau harga."
                  progress={{ current: 0, total: FREE_LIMITS.WATCHLIST === Infinity ? 5 : FREE_LIMITS.WATCHLIST, unit: 'saham', label: 'Watchlist terisi' }}
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
          </div>
        </div>

        {/* Alerts Section - h-full pada kartu ini WAJIB, bukan cuma pada pembungkusnya.
            Grid 3 kolom di atas default align-items:stretch, jadi pembungkus
            "space-y-6" ini sudah otomatis setinggi kolom kiri (Health Check + My
            Watchlist) - tapi kartu di DALAMNYA tidak ikut memanjang tanpa h-full,
            menyisakan celah kosong tak terlihat di bawah kartu sampai batas kolom. */}
        <div className="space-y-6 h-full">
          <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1 h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-tv-border pb-3 mb-4">
              <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
                <Bell className="w-5 h-5 text-tv-yellow" />
                LensAlert
              </h3>
              {/* BUG FIX (2026-08-06): `isAdmin` dihitung dari /api/auth/me sejak awal
                  (lihat checkAdmin) tapi TIDAK PERNAH dibaca di mana pun, sehingga
                  tombol debug ini tampil untuk semua pengguna. Menekannya memicu
                  pemeriksaan cron manual dan memunculkan alert() berisi keluaran
                  mentahnya - tampilan internal yang tidak seharusnya sampai ke
                  pengguna biasa. Sekarang benar-benar digerbangi. */}
              {isAdmin && (
                <button onClick={triggerCron} className="text-[10px] text-tv-muted hover:text-tv-text underline">
                  Test Cron
                </button>
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
                <option value="CONSENSUS_STRONG_BUY">Konsensus STRONG BUY</option>
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
                        <button onClick={() => removeAlert(alert.id)} className="text-tv-muted hover:text-tv-red">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-tv-muted flex items-center gap-1.5">
                      <AlertIcon className="w-3.5 h-3.5 shrink-0" />
                      {alert.conditionType === 'PRICE_BELOW' && `Harga < ${alert.targetValue}`}
                      {alert.conditionType === 'PRICE_ABOVE' && `Harga > ${alert.targetValue}`}
                      {alert.conditionType === 'CONSENSUS_STRONG_BUY' && `Konsensus STRONG BUY`}
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
          </div>
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
          'LensRadar LIVE, LensAI & fitur Pro lainnya',
        ]}
        secondaryLabel="Nanti"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Pakai Watchlist"
        body="LensWatch butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
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
