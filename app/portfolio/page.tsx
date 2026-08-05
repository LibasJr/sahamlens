'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Trophy, Download, FileText, Wallet, Search, Bell, ArrowUpRight, ArrowDownRight, Clock, Menu } from 'lucide-react';
// xlsx/jsPDF/jspdf-autotable TIDAK di-import statis (optimasi loading 2026-08-05) -
// ketiganya berat dan cuma dipakai saat tombol Export diklik; di-import dinamis di
// dalam downloadExcel()/downloadPDF() supaya tidak ikut terunduh & ter-parse di setiap
// kunjungan /portfolio. Lihat pola sama di app/dashboard/page.tsx.
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Input, Button, PageContainer } from '@/components/ui';
import { fadeUp } from '@/lib/motion';

const formatIDR = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

// Warna avatar disesuaikan ke token tv-* (dark theme) - versi sebelumnya pakai
// warna pastel light-mode (bg-blue-100 dst.) yang jadi terlihat pudar/salah di atas
// latar gelap, salah satu sebab tampilan halaman ini terasa beda sendiri dari
// halaman lain (Beranda/Dashboard/dst. semua sudah konsisten pakai token tv-*).
const AVATAR_COLORS = [
  'bg-tv-blue/15 text-tv-blue',
  'bg-tv-green/15 text-tv-green',
  'bg-purple-500/15 text-purple-400',
  'bg-tv-gold/15 text-tv-gold',
  'bg-pink-500/15 text-pink-400',
  'bg-orange-500/15 text-orange-400',
];

function tickerAvatarColor(symbol: string) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const tickerCode = (symbol: string) => symbol.replace('.JK', '');

export default function PortfolioPage() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<any>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'HOLDINGS' | 'RIWAYAT'>('HOLDINGS');
  const [badges, setBadges] = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string } | null>(null);
  // BUG FIX (2026-08-01, audit dummy-data): form ini sebelumnya kirim {username,
  // password} tapi loginSchema/signupSchema (modules/user/validator/auth.validator.ts)
  // mewajibkan {email, password} - login/signup lewat form ini selalu gagal validasi.
  // Signup juga butuh verifikasi OTP (handleSignup TIDAK langsung membuat sesi) -
  // step ini sebelumnya tidak ada sama sekali di form, ditambahkan di bawah.
  const [pendingVerification, setPendingVerification] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');
  const [orderSymbol, setOrderSymbol] = useState('');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderLots, setOrderLots] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderLoading(true);
    try {
      const endpoint = orderType === 'BUY' ? '/api/portfolio/buy' : '/api/portfolio/sell';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: orderSymbol.toUpperCase(),
          price: Number(orderPrice),
          lots: Number(orderLots),
          note: 'Manual ' + orderType
        })
      });
      if (res.ok) {
        setShowOrderModal(false);
        setOrderSymbol('');
        setOrderPrice('');
        setOrderLots('');
        loadData();
      } else {
        const err = await res.json();
        alert('Gagal: ' + err.error);
      }
    } catch(err) {
      alert('Error submitting order');
    }
    setOrderLoading(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (res.ok) {
        setIsLoggedIn(true);
        setCurrentUser({ email: data.user?.email, role: data.user?.role });
        loadData();
      } else {
        setLoading(false);
      }
    } catch (e) {
      setLoading(false);
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (authMode === 'SIGNUP') {
          // Signup TIDAK membuat sesi - butuh verifikasi kode OTP dulu (dikirim ke
          // email), baru login sungguhan lewat /api/auth/verify.
          setPendingVerification(true);
        } else {
          setIsLoggedIn(true);
          window.location.reload();
        }
      } else {
        setLoginError(data.error || (authMode === 'SIGNUP' ? 'Gagal daftar' : 'Login gagal'));
      }
    } catch (e) {
      setLoginError('Network error');
    }
    setAuthLoading(false);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsLoggedIn(true);
        window.location.reload();
      } else {
        setLoginError(data.error || 'Kode verifikasi salah/kadaluarsa');
      }
    } catch (e) {
      setLoginError('Network error');
    }
    setAuthLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portfolio');
      const data = await res.json();

      setPortfolio(data.portfolio);
      setTransactions(data.transactions || []);

      const hWithPrices = await Promise.all(data.holdings.map(async (h: any) => {
        let currentPrice = h.avgPrice;
        let scoreLabel: string | null = null;
        try {
          const res = await fetch(`/api/stock/${h.symbol}`);
          const s = await res.json();
          if (s?.stock?.current_price) {
            currentPrice = s.stock.current_price;
          }
          if (s?.scoring) {
            // Phase 0 / P0-3: label BUY/SELL hanya ditampilkan kalau saham lolos gerbang
            // kelayakan. Skornya tetap ditampilkan (informasional) - pemilik saham berhak
            // melihat angkanya; yang dicabut cuma ajakan bertindaknya.
            scoreLabel = s?.decision && s.decision.advisory === false
              ? `${s.scoring.total_score} (tidak direkomendasikan)`
              : `${s.scoring.total_score} ${s.scoring.kategori}`;
          }
        } catch(e) {}

        const currentValue = currentPrice * h.lots * 100;
        const pnl = currentValue - h.totalCost;
        const pnlPct = h.totalCost > 0 ? (pnl / h.totalCost) * 100 : 0;

        return { ...h, currentPrice, currentValue, pnl, pnlPct, scoreLabel };
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
      console.error(e);
    }
    setLoading(false);
  };

  const downloadExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const wsHoldings = XLSX.utils.json_to_sheet(holdings.map(h => ({
      Symbol: h.symbol,
      'Avg Buy': h.avgPrice,
      Current: h.currentPrice,
      Lots: h.lots,
      'P/L Rp': h.pnl,
      'P/L %': (h.pnlPct / 100).toFixed(4),
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
        h.symbol, h.avgPrice, h.currentPrice, h.lots, h.pnl, h.pnlPct.toFixed(2) + '%'
      ])
    });
    doc.save('SahamLens_Portfolio.pdf');
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-tv-bg flex items-center justify-center font-sans p-4">
        <div className="bg-tv-card border border-tv-border p-8 rounded-xl shadow-1 max-w-sm w-full">
          <div className="flex justify-center mb-6">
            <div className="bg-tv-green/10 p-4 rounded-full text-tv-green">
              <Wallet className="w-8 h-8" />
            </div>
          </div>
          <h2 className="font-heading text-2xl font-bold text-center text-white mb-2">Akun Demo</h2>

          {pendingVerification ? (
            <>
              <p className="text-sm text-tv-muted text-center mb-6">
                Kode verifikasi sudah dikirim ke {email}. Masukkan kodenya untuk selesaikan pendaftaran.
              </p>
              <form onSubmit={handleVerify} className="space-y-4">
                <Input
                  label="Kode Verifikasi"
                  type="text"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value)}
                  placeholder="6 digit dari email"
                />
                {loginError && <p className="text-tv-red text-xs text-center font-medium">{loginError}</p>}
                <Button type="submit" variant="success" loading={authLoading} className="w-full mt-2">
                  {authLoading ? 'Memverifikasi...' : 'Verifikasi & Masuk'}
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-tv-muted text-center mb-6">
                {authMode === 'LOGIN' ? 'Masuk ke akun demo kamu.' : 'Daftar akun demo gratis.'}
              </p>

              <div className="flex bg-tv-bg p-1 rounded-lg mb-6 border border-tv-border">
                <button
                  onClick={() => { setAuthMode('LOGIN'); setLoginError(''); }}
                  className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${authMode === 'LOGIN' ? 'bg-tv-card shadow text-white' : 'text-tv-muted hover:text-gray-300'}`}
                >
                  Login
                </button>
                <button
                  onClick={() => { setAuthMode('SIGNUP'); setLoginError(''); }}
                  className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${authMode === 'SIGNUP' ? 'bg-tv-card shadow text-white' : 'text-tv-muted hover:text-gray-300'}`}
                >
                  Daftar
                </button>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Alamat email kamu"
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                />
                {authMode === 'SIGNUP' && (
                  <Input
                    label="Konfirmasi Password"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi password"
                  />
                )}
                {loginError && <p className="text-tv-red text-xs text-center font-medium">{loginError}</p>}
                <Button type="submit" variant="success" loading={authLoading} className="w-full mt-2">
                  {authLoading ? 'Loading...' : authMode === 'LOGIN' ? 'Masuk' : 'Daftar'}
                </Button>
              </form>
            </>
          )}
          <div className="mt-6 text-center">
            <button onClick={() => router.push('/')} className="text-xs text-tv-muted hover:text-white font-medium">
              Kembali ke Beranda
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !portfolio) return <div className="min-h-screen bg-tv-bg flex items-center justify-center text-tv-muted">Memuat portfolio...</div>;
  if (!portfolio) return <div className="min-h-screen bg-tv-bg flex items-center justify-center text-tv-red">Gagal memuat portfolio.</div>;

  const holdingsValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalEquity = portfolio.cash + holdingsValue;
  const totalPnl = totalEquity - portfolio.initial_cash;
  const totalPnlPct = portfolio.initial_cash > 0 ? (totalPnl / portfolio.initial_cash) * 100 : 0;
  const isPositive = totalPnl >= 0;

  return (
    <div className="min-h-screen bg-tv-bg text-white font-sans pb-20">
      {/* Top Navbar */}
      <nav className="bg-tv-card border-b border-tv-border px-4 py-3 sticky top-0 z-50 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
            className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/dashboard')}>
            <div className="w-8 h-8 rounded-full bg-tv-green flex items-center justify-center">
              <span className="text-white font-bold text-sm">SL</span>
            </div>
            <span className="font-bold text-lg text-white tracking-tight">Akun Demo</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { setOrderType('BUY'); setShowOrderModal(true); }} className="bg-tv-blue hover:opacity-90 text-white px-3 py-1.5 rounded text-xs font-bold transition-opacity">BUY</button>
          <button onClick={() => { setOrderType('SELL'); setShowOrderModal(true); }} className="bg-tv-red hover:opacity-90 text-white px-3 py-1.5 rounded text-xs font-bold transition-opacity">SELL</button>
          <Search className="w-5 h-5 text-tv-muted hidden sm:block" />
          <Bell className="w-5 h-5 text-tv-muted hidden sm:block" />
          <div className="flex flex-col text-right">
            <span className="text-xs font-bold text-white">{currentUser?.email}</span>
            <span className="text-[10px] text-tv-muted">{currentUser?.role === 'admin' ? 'Admin' : 'Virtual'}</span>
          </div>
        </div>
      </nav>

      {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental. Isinya direstruktur
          jadi 2 kolom di layar lebar (kartu ekuitas sticky di kiri, holdings/riwayat di
          kanan) - sebelumnya max-w-4xl (896px) satu kolom menyisakan ruang kosong besar
          di kanan-kiri pada layar lebar. */}
      <PageContainer className="mt-4 px-4 lg:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        <div className="space-y-4 lg:sticky lg:top-[73px]">
        {/* Hero Equity Card */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="bg-tv-card rounded-xl shadow-1 border border-tv-border overflow-hidden">
          <div className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-tv-muted text-sm font-medium">Total Ekuitas</span>
              {isPositive ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tv-green/15 text-tv-green">UNTUNG</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tv-red/15 text-tv-red">RUGI</span>
              )}
            </div>
            <div className="flex items-end gap-3 mb-4">
              <h2 className="text-3xl font-bold text-white tracking-tight font-number tabular-nums">{formatIDR(totalEquity)}</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-tv-muted mb-1 block">Return (Rp)</span>
                <div className={`font-semibold font-number tabular-nums ${isPositive ? 'text-tv-green' : 'text-tv-red'} flex items-center gap-1`}>
                  {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {isPositive ? '+' : ''}{formatIDR(totalPnl)}
                </div>
              </div>
              <div>
                <span className="text-xs text-tv-muted mb-1 block">Return (%)</span>
                <div className={`font-semibold font-number tabular-nums ${isPositive ? 'text-tv-green' : 'text-tv-red'} flex items-center gap-1`}>
                  {isPositive ? '+' : ''}{totalPnlPct.toFixed(2)}%
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
            </div>
            <div className="text-right flex items-center justify-end gap-2">
              <button onClick={downloadExcel} title="Export Excel" className="p-1.5 bg-tv-card border border-tv-border rounded text-tv-muted hover:text-white transition-colors"><Download className="w-4 h-4" /></button>
              <button onClick={downloadPDF} title="Export PDF" className="p-1.5 bg-tv-card border border-tv-border rounded text-tv-muted hover:text-white transition-colors"><FileText className="w-4 h-4" /></button>
            </div>
          </div>
        </motion.div>
        </div>

        <div className="space-y-4">
        {/* Tabs - "Order" (dulu selalu kosong, tidak menampilkan apa pun) diganti
            "Riwayat" yang benar-benar menampilkan transaksi nyata (data sudah
            difetch sejak awal tapi sebelumnya tidak pernah dirender). */}
        <div className="bg-tv-card border border-tv-border rounded-t-xl flex px-2 sticky top-[57px] z-40">
          {(['HOLDINGS', 'RIWAYAT'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-center py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-tv-green text-tv-green' : 'border-transparent text-tv-muted hover:text-gray-300'}`}
            >
              {tab === 'HOLDINGS' ? 'Holdings' : 'Riwayat'}
            </button>
          ))}
        </div>

        {/* Holdings List */}
        {activeTab === 'HOLDINGS' && (
          <div className="bg-tv-card border border-tv-border rounded-b-xl shadow-sm min-h-[300px]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-tv-border bg-tv-bg text-xs font-semibold text-tv-muted">
              <div>SAHAM</div>
              <div className="text-right">RETURN</div>
            </div>

            {holdings.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-tv-muted">
                <Wallet className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm font-medium">Belum ada posisi terbuka</p>
                <button
                  onClick={() => { setOrderType('BUY'); setShowOrderModal(true); }}
                  className="mt-4 text-xs font-bold text-tv-green hover:underline"
                >
                  Mulai trading virtual →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-tv-border/60">
                {holdings.map(h => {
                  const isProfit = h.pnl >= 0;
                  return (
                    <div key={h.symbol} className="p-4 hover:bg-tv-bg transition-colors cursor-pointer" onClick={() => router.push(`/dashboard?symbol=${h.symbol}`)}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${tickerAvatarColor(h.symbol)}`}>
                            {tickerCode(h.symbol).substring(0,2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white leading-tight font-number">{tickerCode(h.symbol)}</span>
                              {h.scoreLabel && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${h.scoreLabel.includes('BUY') ? 'bg-tv-green/15 text-tv-green' : h.scoreLabel.includes('SELL') ? 'bg-tv-red/15 text-tv-red' : 'bg-tv-hover text-tv-muted'}`}>
                                  {h.scoreLabel}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-tv-muted">{h.lots.toLocaleString('id-ID')} Lot</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold text-sm font-number tabular-nums ${isProfit ? 'text-tv-green' : 'text-tv-red'}`}>
                            {isProfit ? '+' : ''}{formatIDR(h.pnl)}
                          </div>
                          <div className={`text-xs font-medium font-number tabular-nums ${isProfit ? 'text-tv-green' : 'text-tv-red'}`}>
                            {isProfit ? '+' : ''}{h.pnlPct.toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs mt-3 pt-3 border-t border-tv-border/60">
                        <div className="text-tv-muted">
                          Avg: <span className="font-semibold text-gray-300 font-number tabular-nums">{h.avgPrice.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="text-tv-muted">
                          Last: <span className="font-semibold text-gray-300 font-number tabular-nums">{h.currentPrice.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="text-tv-muted">
                          Value: <span className="font-semibold text-gray-300 font-number tabular-nums">{formatIDR(h.currentValue)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Riwayat Transaksi - sebelumnya tab ini (dulu bernama "History") SELALU
            menampilkan "Belum ada history transaksi" apa pun isi datanya, padahal
            transactions sudah difetch sejak awal, cuma tidak pernah dirender. */}
        {activeTab === 'RIWAYAT' && (
          <div className="bg-tv-card border border-tv-border rounded-b-xl shadow-sm min-h-[300px]">
            {transactions.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-tv-muted">
                <Clock className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm font-medium">Belum ada riwayat transaksi</p>
              </div>
            ) : (
              <div className="divide-y divide-tv-border/60">
                {transactions.map((t) => {
                  const isBuy = t.type === 'BUY';
                  return (
                    <div key={t.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isBuy ? 'bg-tv-blue/15 text-tv-blue' : 'bg-tv-red/15 text-tv-red'}`}>
                          {isBuy ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm font-number">{tickerCode(t.symbol)}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-tv-blue/15 text-tv-blue' : 'bg-tv-red/15 text-tv-red'}`}>{t.type}</span>
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
          </div>
        )}
        </div>
        </div>
      </PageContainer>

      {/* Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-tv-card border border-tv-border rounded-xl w-full max-w-sm p-6">
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
          </div>
        </div>
      )}
    </div>
  );
}
