'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useModalBehavior } from '@/lib/hooks/useModalBehavior';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Trophy, Download, FileText, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
// xlsx/jsPDF/jspdf-autotable TIDAK di-import statis (optimasi loading 2026-08-05) -
// ketiganya berat dan cuma dipakai saat tombol Export diklik; di-import dinamis di
// dalam downloadExcel()/downloadPDF() supaya tidak ikut terunduh & ter-parse di setiap
// kunjungan /portfolio. Lihat pola sama di app/dashboard/page.tsx.
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Card, Input, Button, PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar, AnimatedNumber } from '@/components/ui';
import Toast, { type ToastVariant } from '@/components/ui/Toast';
import { PortfolioAuthGate } from '@/components/portfolio/PortfolioAuthGate';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { fadeUp } from '@/lib/motion';
import { getDecisionPresentation } from '@/modules/eligibility';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';
import MenuUsageGuide from '@/components/MenuUsageGuide';

const formatIDR = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? 'N/A' : 'Rp ' + Math.round(n).toLocaleString('id-ID');

// AVATAR_COLORS + tickerAvatarColor() dihapus: keduanya implementasi avatar
// berwarna-per-emiten yang kini sudah ada sebagai komponen bersama
// (components/ui/TickerAvatar.tsx), dipakai di seluruh halaman lain. Versi lokal
// ini juga masih memakai warna Tailwind mentah (purple-500/pink-500/orange-500)
// di luar palet.

const tickerCode = (symbol: string) => symbol.replace('.JK', '');

export default function PortfolioPage() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<any>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'HOLDINGS' | 'RIWAYAT'>('HOLDINGS');
  const [badges, setBadges] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);
  const { user: authUser, loading: authStateLoading, resolved: authResolved, refresh: refreshAuth } = useAuthUser();
  const isLoggedIn = Boolean(authUser);
  const authError = !authStateLoading && !authResolved;
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  // BUG FIX (2026-08-01, audit dummy-data): form ini sebelumnya kirim {username,
  // password} tapi loginSchema/signupSchema (modules/user/validator/auth.validator.ts)
  // mewajibkan {email, password} - login/signup lewat form ini selalu gagal validasi.
  // Signup juga butuh verifikasi OTP (handleSignup TIDAK langsung membuat sesi) -
  // step ini sebelumnya tidak ada sama sekali di form, ditambahkan di bawah.
  const [pendingVerification, setPendingVerification] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>('info');

  const showToast = (message: string, variant: ToastVariant = 'info') => {
    setToastVariant(variant);
    setToastMessage(null);
    window.setTimeout(() => setToastMessage(message), 0);
  };

  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');
  const [orderSymbol, setOrderSymbol] = useState('');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderLots, setOrderLots] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  // BUG FIX (2026-08-22): modal order ini di-hand-roll langsung di halaman tanpa
  // role="dialog"/aria-modal dan tanpa Escape/focus-trap - lima dialog lain di app ini
  // (PaywallModal, PromoUpgradeModal, StockNewsModal, UserProfileModal, CommandPalette)
  // sudah memakai hook bersama untuk perilaku ini, lihat lib/hooks/useModalBehavior.ts.
  const orderModalRef = useRef<HTMLElement>(null);
  useModalBehavior({ open: showOrderModal, onClose: () => setShowOrderModal(false), containerRef: orderModalRef });

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderLoading(true);
    try {
      const endpoint = orderType === 'BUY' ? '/api/portfolio/buy' : '/api/portfolio/sell';
      await apiRequest(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: orderSymbol.toUpperCase(),
          price: Number(orderPrice),
          lots: Number(orderLots),
          note: 'Manual ' + orderType,
        }),
      });
      setShowOrderModal(false);
      setOrderSymbol('');
      setOrderPrice('');
      setOrderLots('');
      showToast(`Order ${orderType} virtual berhasil dicatat.`, 'success');
      void loadData();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Order virtual gagal dikirim. Coba lagi.', true), 'error');
    } finally {
      setOrderLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (authMode === 'SIGNUP' && password !== confirmPassword) {
      setLoginError('Konfirmasi password tidak sama');
      return;
    }
    setAuthLoading(true);
    try {
      const endpoint = authMode === 'SIGNUP' ? '/api/auth/signup' : '/api/auth/login';
      await apiRequest<any>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (authMode === 'SIGNUP') setPendingVerification(true);
      else await refreshAuth();
    } catch (error) {
      setLoginError(apiErrorMessage(error, authMode === 'SIGNUP' ? 'Gagal daftar' : 'Login gagal', true));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setAuthLoading(true);
    try {
      await apiRequest('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode }),
      });
      await refreshAuth();
    } catch (error) {
      setLoginError(apiErrorMessage(error, 'Kode verifikasi salah/kadaluarsa', true));
    } finally {
      setAuthLoading(false);
    }
  };

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await apiRequest<any>('/api/portfolio', { signal });
      if (!data?.portfolio) throw new Error('Portfolio response tidak lengkap');

      setPortfolio(data.portfolio);
      setTransactions(data.transactions || []);

      const hWithPrices = await Promise.all((data.holdings || []).map(async (h: any) => {
        // BUG FIX (2026-08-06): `currentPrice` sebelumnya di-default ke h.avgPrice.
        // Kalau pengambilan harga gagal (jaringan, emiten delisting, sumber down),
        // harga sekarang menjadi PERSIS sama dengan harga rata-rata beli, sehingga
        // P&L dihitung tepat nol dan halaman menampilkan posisi itu sebagai "impas".
        // Kegagalan mengambil data dirender sebagai fakta pasar. Sekarang keadaan
        // itu ditandai (priceStale) supaya UI bisa menyebutnya apa adanya.
        let currentPrice: number | null = null;
        let priceStale = true;
        let scoreLabel: string | null = null;
        try {
          const stockData = await apiRequest<any>(`/api/stock/${h.symbol}`, { signal });
          const s = stockData;
          if (typeof s?.stock?.current_price === 'number' && Number.isFinite(s.stock.current_price) && s.stock.current_price > 0) {
            currentPrice = s.stock.current_price;
            priceStale = false;
          }
          if (s?.scoring) {
            const presentation = getDecisionPresentation(s.scoring.kategori, s.decision);
            if (presentation.actionable && s.decision?.action) {
              scoreLabel = `${s.scoring.total_score} · ${s.decision.action}`;
            } else if (presentation.kind === 'MODEL_UNVALIDATED') {
              scoreLabel = `${s.scoring.total_score} · sinyal ${presentation.modelSignal || 'N/A'} · model belum tervalidasi`;
            } else if (presentation.kind === 'INELIGIBLE') {
              scoreLabel = `${s.scoring.total_score} · sinyal ${presentation.modelSignal || 'N/A'} · tidak layak direkomendasikan`;
            } else {
              scoreLabel = `${s.scoring.total_score} · ${presentation.modelSignal || 'sinyal N/A'} · rekomendasi tidak tersedia`;
            }
          }
        } catch(e) {
          if (e instanceof DOMException && e.name === 'AbortError') throw e;
        }

        const currentValue = currentPrice != null ? currentPrice * h.lots * 100 : null;
        const pnl = currentValue != null ? currentValue - h.totalCost : null;
        const pnlPct = pnl != null && h.totalCost > 0 ? (pnl / h.totalCost) * 100 : null;

        return { ...h, currentPrice, currentValue, pnl, pnlPct, scoreLabel, priceStale };
      }));

      setHoldings(hWithPrices);

      // Pencapaian - BUG FIX (2026-08-01): sebelumnya "Cut Loss Master" selalu
      // ditambahkan lewat `hasCutLoss || true` (selalu true, apa pun histori
      // transaksinya) - badge yang secara harfiah selalu benar untuk siapa saja,
      // pola yang sama seperti temuan hardcode GGRM/DGWG di breakout.service.ts.
      // Sekarang murni dari kondisi transaksi nyata.
      const newBadges: string[] = [];
      const tx: any[] = data.transactions || [];
      const hasCutLoss = tx.some((t) => t.type === 'SELL' && t.pnl != null && t.pnl < 0);
      const hasProfitTake = tx.some((t) => t.type === 'SELL' && t.pnl != null && t.pnl > 0);
      if (hasCutLoss) newBadges.push('Disiplin Cut Loss');
      if (hasProfitTake) newBadges.push('Profit Taker');
      if (tx.length >= 10) newBadges.push('Trader Aktif');
      else if (tx.length > 0) newBadges.push('Paper Trader');
      setBadges(newBadges);

    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error(e);
      setLoadError(true);
    }
    if (!signal?.aborted) setLoading(false);
  }, []);

  useEffect(() => {
    if (authStateLoading) return;
    if (!authResolved || !authUser) {
      if (authResolved) setLoading(false);
      return;
    }

    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [authStateLoading, authResolved, authUser?.id, loadData]);

  const downloadExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const wsHoldings = XLSX.utils.json_to_sheet(holdings.map(h => ({
      Symbol: h.symbol,
      'Avg Buy': h.avgPrice,
      Current: h.currentPrice ?? 'N/A',
      Lots: h.lots,
      'P/L Rp': h.pnl ?? 'N/A',
      'P/L %': h.pnlPct != null ? (h.pnlPct / 100).toFixed(4) : 'N/A',
      Score: h.scoreLabel || 'N/A'
    })));
    XLSX.utils.book_append_sheet(wb, wsHoldings, 'Holdings');
    XLSX.writeFile(wb, 'SahamLens_Portfolio.xlsx');
  };

  const downloadPDF = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`SahamLens Portfolio Report`, 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [['Symbol', 'Avg Buy', 'Current', 'Lots', 'P/L Rp', 'P/L %']],
      body: holdings.map(h => [
        h.symbol, h.avgPrice, h.currentPrice ?? 'N/A', h.lots, h.pnl ?? 'N/A', h.pnlPct != null ? h.pnlPct.toFixed(2) + '%' : 'N/A'
      ])
    });
    doc.save('SahamLens_Portfolio.pdf');
  };

  if (authStateLoading) {
    return <div className="min-h-screen bg-tv-bg p-4"><Skeleton className="mx-auto mt-24 h-64 max-w-sm" /></div>;
  }

  if (authError) {
    return <div className="min-h-screen bg-tv-bg flex items-center justify-center p-4"><Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="w-full max-w-md border-tv-border"><EmptyState illustration="empty" title="Status akun belum dapat diperiksa" description="Koneksi ke server sedang bermasalah. Coba lagi agar akun yang sudah masuk tidak terlihat sebagai tamu." action={{ label: 'Coba lagi', onClick: () => window.location.reload() }} /></Card></div>;
  }

  if (!isLoggedIn) {
    return (
      <PortfolioAuthGate
        mode={authMode}
        pendingVerification={pendingVerification}
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        otpCode={otpCode}
        showPassword={showPassword}
        showConfirmPassword={showConfirmPassword}
        error={loginError}
        loading={authLoading}
        onModeChange={(mode) => { setAuthMode(mode); setLoginError(''); }}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onOtpCodeChange={setOtpCode}
        onTogglePassword={() => setShowPassword((value) => !value)}
        onToggleConfirmPassword={() => setShowConfirmPassword((value) => !value)}
        onSubmit={handleLogin}
        onVerify={handleVerify}
        onBack={() => router.push('/')}
      />
    );
  }

  if (loading && !portfolio) {
    return (
      <div className="min-h-screen bg-tv-bg p-4 lg:p-6">
        <div className="mx-auto max-w-[1600px] grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
          <Skeleton className="h-64 w-full" />
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            <LoadingFact />
          </div>
        </div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-tv-bg flex items-center justify-center p-4">
        {/* Sebelumnya satu baris teks merah "Gagal memuat portfolio." tanpa tombol
            apa pun - jalan buntu total. */}
        <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="w-full max-w-md border-tv-border">
          <EmptyState
            illustration="empty"
            title="Portofolio gagal dimuat"
            description={loadError
              ? 'Permintaan ke server tidak sampai. Saldo dan posisimu tersimpan di server - tidak ada yang hilang, hanya belum berhasil diambil.'
              : 'Data portofolio belum tersedia untuk akun ini.'}
            action={{ label: 'Coba lagi', onClick: loadData }}
          />
        </Card>
      </div>
    );
  }

  const stalePriceCount = holdings.filter((h) => h.priceStale || h.currentValue == null).length;
  const allHoldingsPriced = stalePriceCount === 0;
  const holdingsValue = allHoldingsPriced ? holdings.reduce((sum, h) => sum + (h.currentValue as number), 0) : null;
  const totalEquity = holdingsValue != null ? portfolio.cash + holdingsValue : null;
  const totalPnl = totalEquity != null ? totalEquity - portfolio.initial_cash : null;
  const totalPnlPct = totalPnl != null && portfolio.initial_cash > 0 ? (totalPnl / portfolio.initial_cash) * 100 : null;
  const isPositive = totalPnl != null ? totalPnl >= 0 : false;
  // Akun yang belum pernah bertransaksi punya totalPnl tepat 0, dan `>= 0` membuatnya
  // lolos sebagai "positif" - badge UNTUNG hijau menyala di akun yang belum melakukan
  // apa pun. Keadaan netral dipisahkan.
  const isUntouched = totalPnl === 0 && holdings.length === 0;

  return (
    <div className="min-h-screen bg-tv-bg text-white font-sans pb-20">
      <Toast message={toastMessage} variant={toastVariant} />
      {/* Portfolio workspace header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-tv-bg/80 px-4 py-4 backdrop-blur-xl md:px-6">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-tv-blue">Paper portfolio</div>
            <h1 className="lens-page-title">Akun Demo</h1>
            <p className="mt-0.5 text-xs text-tv-muted">Simulasikan posisi, pantau P/L, dan evaluasi disiplin trading tanpa dana riil.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="bare" size="none" onClick={() => { setOrderType('BUY'); setShowOrderModal(true); }} className="rounded-xl border border-tv-green/20 bg-tv-green/10 px-4 py-2 text-xs font-bold text-tv-green transition-colors hover:bg-tv-green hover:text-[#06130E]">BUY Virtual</Button>
            <Button variant="bare" size="none" onClick={() => { setOrderType('SELL'); setShowOrderModal(true); }} className="rounded-xl border border-tv-red/20 bg-tv-red/10 px-4 py-2 text-xs font-bold text-tv-red transition-colors hover:bg-tv-red hover:text-white">SELL Virtual</Button>
          </div>
        </div>
      </header>

      {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental. Isinya direstruktur
          jadi 2 kolom di layar lebar (kartu ekuitas sticky di kiri, holdings/riwayat di
          kanan) - sebelumnya max-w-4xl (896px) satu kolom menyisakan ruang kosong besar
          di kanan-kiri pada layar lebar. */}
      <PageContainer className="mt-4 px-4 lg:px-6">
        <MenuUsageGuide
          menuKey="portfolio"
          whatItAnswers="Bagaimana rasanya menjalankan strategi ini tanpa mempertaruhkan uang sungguhan?"
          steps={[
            "Ini akun latihan - seluruh transaksinya simulasi, bukan uang nyata.",
            "Catat beli dan jual seperti biasa; posisi dan hasilnya dihitung otomatis.",
            "Komposisinya bisa langsung diimpor ke Risk Matrix untuk diuji ketahanannya.",
          ]}
        />
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        <div className="space-y-4 lg:sticky lg:top-[73px]">
        {/* Hero Equity Card */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="overflow-hidden rounded-2xl border border-white/[0.075] bg-tv-card shadow-1">
          <div className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-tv-muted text-sm font-medium">Total Ekuitas</span>
              {totalEquity == null ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tv-warning/15 text-tv-warning">HARGA BELUM LENGKAP</span>
              ) : isUntouched ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tv-hover text-tv-muted">BELUM ADA TRANSAKSI</span>
              ) : isPositive ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tv-green/15 text-tv-green">UNTUNG</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tv-red/15 text-tv-red">RUGI</span>
              )}
            </div>
            <div className="flex items-end gap-3 mb-4">
              {totalEquity != null ? (
                <AnimatedNumber
                  value={totalEquity}
                  format={formatIDR}
                  className="text-3xl font-bold text-white tracking-tight font-number tabular-nums"
                />
              ) : (
                <span className="text-3xl font-bold text-tv-warning tracking-tight font-number">N/A</span>
              )}
            </div>

            {/* Peringatan harga basi ditempatkan tepat di bawah angka ekuitas karena
                angka itulah yang terpengaruh - bukan disembunyikan di baris posisi. */}
            {stalePriceCount > 0 && (
              <p className="mb-4 rounded-md border border-tv-warning/30 bg-tv-warning/10 px-2.5 py-2 text-[11px] leading-relaxed text-tv-warning">
                Harga pasar {stalePriceCount} posisi gagal diambil. SahamLens tidak mengganti harga yang hilang dengan harga beli, sehingga total ekuitas dan return ditampilkan N/A sampai semua posisi memiliki harga pasar.
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-tv-muted mb-1 block">Return (Rp)</span>
                <div className={`font-semibold font-number tabular-nums flex items-center gap-1 ${totalPnl == null ? 'text-tv-warning' : isUntouched ? 'text-tv-muted' : isPositive ? 'text-tv-green' : 'text-tv-red'}`}>
                  {totalPnl == null || isUntouched ? null : isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {totalPnl == null ? 'N/A' : `${isPositive && !isUntouched ? '+' : ''}${formatIDR(totalPnl)}`}
                </div>
              </div>
              <div>
                <span className="text-xs text-tv-muted mb-1 block">Return (%)</span>
                <div className={`font-semibold font-number tabular-nums flex items-center gap-1 ${totalPnl == null ? 'text-tv-warning' : isUntouched ? 'text-tv-muted' : isPositive ? 'text-tv-green' : 'text-tv-red'}`}>
                  {totalPnlPct == null ? 'N/A' : `${isPositive && !isUntouched ? '+' : ''}${totalPnlPct.toFixed(2)}%`}
                </div>
              </div>
            </div>

            {badges.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-tv-border">
                {badges.map((b) => (
                  <span key={b} className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-tv-gold/10 text-tv-gold border border-tv-gold/30">
                    <Trophy className="w-3 h-3" /> {b}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="bg-tv-bg border-t border-tv-border px-5 py-3 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-tv-muted uppercase font-semibold">Buying Power</span>
              <div className="text-sm font-bold text-white font-number tabular-nums">{formatIDR(portfolio.cash)}</div>
              {/* Storytelling: porsi kas vs saham menentukan seberapa terekspos akun
                  ini ke pergerakan pasar - angka kas sendirian tidak menyatakan itu. */}
              {totalEquity != null && totalEquity > 0 && (
                <div className="text-[10px] text-tv-muted mt-0.5">
                  {Math.round((portfolio.cash / totalEquity) * 100)}% dari ekuitas masih kas
                </div>
              )}
            </div>
            <div className="text-right flex items-center justify-end gap-2">
              <Button variant="bare" size="none" onClick={downloadExcel} title="Export Excel" aria-label="Unduh portofolio sebagai Excel" className="p-1.5 bg-tv-card border border-tv-border rounded text-tv-muted hover:text-white transition-colors"><Download className="w-4 h-4" /></Button>
              <Button variant="bare" size="none" onClick={downloadPDF} title="Export PDF" aria-label="Unduh portofolio sebagai PDF" className="p-1.5 bg-tv-card border border-tv-border rounded text-tv-muted hover:text-white transition-colors"><FileText className="w-4 h-4" /></Button>
            </div>
          </div>
        </motion.div>
        </div>

        <div className="space-y-4">
        {/* Tabs - "Order" (dulu selalu kosong, tidak menampilkan apa pun) diganti
            "Riwayat" yang benar-benar menampilkan transaksi nyata (data sudah
            difetch sejak awal tapi sebelumnya tidak pernah dirender). */}
        <Card padding="none" radius="xl" elevation="none" highlight={false} className="rounded-b-none border-tv-border flex px-2 sticky top-[57px] z-40">
          {(['HOLDINGS', 'RIWAYAT'] as const).map((tab) => (
            <Button variant="bare" size="none"
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-center py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-tv-green text-tv-green' : 'border-transparent text-tv-muted hover:text-tv-text'}`}
            >
              {tab === 'HOLDINGS' ? 'Holdings' : 'Riwayat'}
            </Button>
          ))}
        </Card>

        {/* Holdings List */}
        {activeTab === 'HOLDINGS' && (
          <Card padding="none" radius="xl" elevation="sm" highlight={false} className="rounded-t-none border-tv-border min-h-[300px]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-tv-border bg-tv-bg text-xs font-semibold text-tv-muted">
              <div>SAHAM</div>
              <div className="text-right">RETURN</div>
            </div>

            {holdings.length === 0 ? (
              <EmptyState
                illustration="collecting"
                title="Belum ada posisi terbuka"
                description={`Saldo virtual ${formatIDR(portfolio.cash)} siap dipakai. Semua transaksi di sini simulasi - tidak ada uang sungguhan yang berpindah, jadi ini tempat yang tepat untuk menguji strategi sebelum memakainya di akun asli.`}
                action={{ label: 'Buat order pertama', onClick: () => { setOrderType('BUY'); setShowOrderModal(true); } }}
              />
            ) : (
              <div className="divide-y divide-tv-border/60">
                {holdings.map(h => {
                  const isProfit = h.pnl != null ? h.pnl >= 0 : false;
                  return (
                    <div key={h.symbol} className="p-4 hover:bg-tv-bg transition-colors cursor-pointer" onClick={() => router.push(`/dashboard?symbol=${h.symbol}`)}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <TickerAvatar symbol={h.symbol} size="md" />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white leading-tight font-number">{tickerCode(h.symbol)}</span>
                              {h.scoreLabel && (
                                <span className={`lens-chip font-bold px-1.5 py-0.5 rounded ${h.scoreLabel.includes('BUY') ? 'bg-tv-green/15 text-tv-green' : h.scoreLabel.includes('SELL') ? 'bg-tv-red/15 text-tv-red' : 'bg-tv-hover text-tv-muted'}`}>
                                  {h.scoreLabel}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-tv-muted">{h.lots.toLocaleString('id-ID')} Lot</div>
                          </div>
                        </div>
                        {/* Posisi yang harganya gagal diambil TIDAK boleh menampilkan
                            P&L "0.00%" seolah itu hasil pengukuran - angka nol di sini
                            semata akibat currentPrice jatuh balik ke avgPrice. */}
                        <div className="text-right shrink-0">
                          {h.priceStale ? (
                            <>
                              <div className="text-xs font-semibold text-tv-warning">harga tak terambil</div>
                              <div className="text-[10px] text-tv-muted">P&amp;L belum bisa dihitung</div>
                            </>
                          ) : (
                            <>
                              <div className={`font-bold text-sm font-number tabular-nums ${isProfit ? 'text-tv-green' : 'text-tv-red'}`}>
                                {isProfit ? '+' : ''}{formatIDR(h.pnl)}
                              </div>
                              <div className={`text-xs font-medium font-number tabular-nums ${isProfit ? 'text-tv-green' : 'text-tv-red'}`}>
                                {isProfit ? '+' : ''}{h.pnlPct.toFixed(2)}%
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs mt-3 pt-3 border-t border-tv-border/60">
                        <div className="text-tv-muted">
                          Avg: <span className="font-semibold text-tv-text font-number tabular-nums">{h.avgPrice.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="text-tv-muted">
                          Last: <span className={`font-semibold font-number tabular-nums ${h.priceStale ? 'text-tv-warning' : 'text-tv-text'}`}>
                            {h.currentPrice == null ? '—' : h.currentPrice.toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="text-tv-muted">
                          Value: <span className="font-semibold text-tv-text font-number tabular-nums">{formatIDR(h.currentValue)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* Riwayat Transaksi - sebelumnya tab ini (dulu bernama "History") SELALU
            menampilkan "Belum ada history transaksi" apa pun isi datanya, padahal
            transactions sudah difetch sejak awal, cuma tidak pernah dirender. */}
        {activeTab === 'RIWAYAT' && (
          <Card padding="none" radius="xl" elevation="sm" highlight={false} className="rounded-t-none border-tv-border min-h-[300px]">
            {transactions.length === 0 ? (
              <EmptyState
                illustration="empty"
                title="Belum ada riwayat transaksi"
                description="Setiap order beli dan jual tercatat di sini lengkap dengan harga dan realisasi untung/ruginya - berguna untuk melihat pola keputusanmu sendiri, bukan cuma hasil akhirnya."
              />
            ) : (
              <div className="divide-y divide-tv-border/60">
                {transactions.map((t) => {
                  const isBuy = t.type === 'BUY';
                  return (
                    <div key={t.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isBuy ? 'bg-tv-blue/15 text-tv-blue' : 'bg-tv-red/15 text-tv-red'}`}>
                          {isBuy ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <TickerAvatar symbol={t.symbol} size="sm" />
                            <span className="font-bold text-white text-sm font-number">{tickerCode(t.symbol)}</span>
                            <span className={`lens-chip font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-tv-blue/15 text-tv-blue' : 'bg-tv-red/15 text-tv-red'}`}>{t.type}</span>
                          </div>
                          <div className="text-[11px] text-tv-muted">
                            {t.lots.toLocaleString('id-ID')} lot @ {t.price.toLocaleString('id-ID')} · {new Date(t.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      {t.pnl != null && (
                        <div className={`text-sm font-bold font-number tabular-nums ${t.pnl >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {t.pnl >= 0 ? '+' : ''}{formatIDR(t.pnl)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
        </div>
        </div>
      </PageContainer>

      {/* Order Modal */}
      {showOrderModal && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowOrderModal(false); }}
        >
          <Card
            ref={orderModalRef}
            as="div"
            role="dialog"
            aria-modal="true"
            aria-label={`${orderType === 'BUY' ? 'Beli' : 'Jual'} Saham`}
            padding="none" radius="xl" elevation="none" overflow="visible" highlight={false}
            className="border-tv-border w-full max-w-sm p-6"
          >
            <h2 className={`font-heading text-xl font-bold mb-4 ${orderType === 'BUY' ? 'text-tv-blue' : 'text-tv-red'}`}>{orderType === 'BUY' ? 'Beli' : 'Jual'} Saham</h2>
            <form onSubmit={submitOrder} className="space-y-4">
              <div>
                <label className="text-xs text-tv-muted block mb-1.5">Simbol (mis. BBCA)</label>
                <SymbolAutocomplete
                  required
                  value={orderSymbol}
                  onChange={(val)=>setOrderSymbol(val)}
                  className="w-full bg-tv-bg/60 border border-tv-border text-tv-text rounded-md p-2 focus:outline-none focus:border-tv-blue transition-colors"
                />
              </div>
              <Input label="Harga (Rp)" required type="number" value={orderPrice} onChange={e=>setOrderPrice(e.target.value)} className="font-number" />
              <Input label="Lot" required type="number" value={orderLots} onChange={e=>setOrderLots(e.target.value)} className="font-number" />
              <div className="flex gap-3 mt-6">
                <Button type="button" variant="secondary" onClick={() => setShowOrderModal(false)} className="flex-1">Batal</Button>
                <Button type="submit" variant={orderType === 'BUY' ? 'primary' : 'danger'} loading={orderLoading} className="flex-1">
                  {orderLoading ? 'Memproses...' : 'Konfirmasi'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
