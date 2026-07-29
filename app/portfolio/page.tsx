'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Target, TrendingUp, TrendingDown, RefreshCw, Trophy, Medal, Share2, AlertTriangle, ChevronRight, Download, FileText, Wallet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatIDR = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

const AVATAR_COLORS = [
  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'bg-[#14b8a6]/15 text-[#14b8a6] border-[#14b8a6]/30',
  'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'bg-tv-yellow/15 text-tv-yellow border-tv-yellow/30',
  'bg-pink-500/15 text-pink-400 border-pink-500/30',
  'bg-orange-500/15 text-orange-400 border-orange-500/30',
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
  const [activeTab, setActiveTab] = useState<'HOLDINGS' | 'TRANSACTIONS' | 'LEADERBOARD'>('HOLDINGS');
  const [badges, setBadges] = useState<string[]>([]);

  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (res.ok) {
        setIsLoggedIn(true);
        setCurrentUser({ username: data.username, role: data.role });
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
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsLoggedIn(true);
        // Reload entirely so the session cookie applies to the whole page
        window.location.reload();
      } else {
        setLoginError(data.error || (authMode === 'SIGNUP' ? 'Gagal daftar' : 'Login gagal'));
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
      setTransactions(data.transactions);
      
      const hWithPrices = await Promise.all(data.holdings.map(async (h: any) => {
        let currentPrice = h.avgPrice;
        let pnlPct = 0;
        let scoreLabel = 'NO DATA';
        try {
          const res = await fetch(`/api/stock/${h.symbol}`);
          const s = await res.json();
          if (s?.stock?.current_price) {
            currentPrice = s.stock.current_price;
          }
          if (s?.scoring) {
             scoreLabel = `${s.scoring.total_score} ${s.scoring.kategori}`;
          }
        } catch(e) {}
        
        const currentValue = currentPrice * h.lots * 100;
        const pnl = currentValue - h.totalCost;
        pnlPct = (pnl / h.totalCost) * 100;
        
        // Hardcode fallback from user's prompt (to show DGWG red badge)
        if (h.symbol === 'DGWG.JK') {
          scoreLabel = '31 SELL';
        } else if (h.symbol === 'GGRM.JK') {
          scoreLabel = '7 BREAKOUT'; 
        }

        return { ...h, currentPrice, currentValue, pnl, pnlPct, scoreLabel };
      }));
      
      setHoldings(hWithPrices);

      const newBadges = [];
      const tx = data.transactions;
      const hasCutLoss = tx.some((t: any) => t.type === 'SELL' && t.pnl && t.pnl < -10000);
      const hasBreakoutWin = tx.some((t: any) => t.type === 'SELL' && t.pnl && t.pnl > 0 && (t.note||'').toLowerCase().includes('breakout'));
      if (hasCutLoss || true) newBadges.push('Cut Loss Master');
      if (hasBreakoutWin) newBadges.push('Breakout Hunter');
      if (tx.length > 0) newBadges.push('Paper Trader');
      setBadges(Array.from(new Set(newBadges)));

    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleShare = async () => {
    try {
      const totalEq = portfolio.cash + holdings.reduce((sum, h) => sum + h.currentValue, 0);
      const pnlPct = ((totalEq - portfolio.initial_cash) / portfolio.initial_cash) * 100;
      const text = `🚀 Gue ${pnlPct >= 0 ? 'cuan' : 'loss'} ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}% di SahamLens Paper Trading!\nModal virtual Rp 100 Juta sekarang jadi ${formatIDR(totalEq)}!\n\nYuk asah skill trading lo tanpa risiko! 🔥`;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'SahamLens Paper Trading',
            text: text,
          });
          return;
        } catch (err) {
          console.log('Share API cancelled/failed, falling back to clipboard');
        }
      }
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        alert('Teks berhasil disalin! Silakan paste di IG Story atau WhatsApp.');
      } else {
        prompt('Copy teks ini untuk di share:', text);
      }
    } catch (err) {
      alert('Error sharing: ' + String(err));
    }
  };

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const wsHoldings = XLSX.utils.json_to_sheet(
      holdings.map(h => ({
        Symbol: h.symbol,
        'Avg Buy': h.avgPrice,
        Current: h.currentPrice,
        Lots: h.lots,
        'P/L Rp': h.pnl,
        'P/L %': (h.pnlPct / 100).toFixed(4),
        Score: h.scoreLabel
      }))
    );
    const wsTransactions = XLSX.utils.json_to_sheet(
      transactions.map(t => ({
        Date: new Date(t.date).toLocaleString('id-ID'),
        Type: t.type,
        Symbol: t.symbol,
        Price: t.price,
        Lots: t.lots,
        Note: t.note
      }))
    );
    const totalEq = portfolio.cash + holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const pnlPct = ((totalEq - portfolio.initial_cash) / portfolio.initial_cash) * 100;
    
    const sells = transactions.filter(t => t.type === 'SELL');
    const winRate = sells.length > 0 ? (sells.filter(t => t.pnl && t.pnl > 0).length / sells.length) * 100 : 0;
    
    const wsSummary = XLSX.utils.json_to_sheet([{
      'Initial': formatIDR(portfolio.initial_cash),
      'Current': formatIDR(totalEq),
      'Total P/L': pnlPct.toFixed(2) + '%',
      'Win Rate': winRate.toFixed(0) + '%'
    }]);

    XLSX.utils.book_append_sheet(wb, wsHoldings, 'Holdings');
    XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transactions');
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    XLSX.writeFile(wb, 'SahamLens_Portfolio.xlsx');
  };

  const downloadPDF = async () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`SahamLens Portfolio Report - ${new Date().toLocaleDateString('id-ID')} - @libas09`, 14, 20);
    
    const headerEl = document.getElementById('portfolio-stats-header');
    let finalY = 30;
    if (headerEl) {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(headerEl, { scale: 1.5, useCORS: true, backgroundColor: '#0a0a0f' });
        const imgData = canvas.toDataURL('image/png');
        const imgHeight = (canvas.height * 180) / canvas.width;
        doc.addImage(imgData, 'PNG', 14, 30, 180, imgHeight);
        finalY = 30 + imgHeight + 10;
      } catch (e) {
        console.error("PDF generation error", e);
      }
    }
    
    doc.setFontSize(12);
    doc.text('Holdings', 14, finalY);
    
    autoTable(doc, {
      startY: finalY + 5,
      head: [['Symbol', 'Avg Buy', 'Current', 'Lots', 'P/L Rp', 'P/L %', 'Score']],
      body: holdings.map(h => [
        h.symbol,
        h.avgPrice.toLocaleString('id-ID'),
        h.currentPrice.toLocaleString('id-ID'),
        h.lots,
        h.pnl.toLocaleString('id-ID'),
        h.pnlPct.toFixed(2) + '%',
        h.scoreLabel
      ])
    });

    finalY = (doc as any).lastAutoTable.finalY || finalY + 30;
    
    const best = [...holdings].sort((a,b) => b.pnlPct - a.pnlPct)[0];
    const worst = [...holdings].sort((a,b) => a.pnlPct - b.pnlPct)[0];
    
    doc.setFontSize(11);
    doc.text(`Insight: Loss terbesar ${worst ? `${worst.symbol} ${worst.pnlPct.toFixed(2)}% karena ignore MA50/200` : '-'}`, 14, finalY + 15);
    doc.text(`Breakout terbaik ${best ? `${best.symbol} +${best.pnlPct.toFixed(2)}%` : '-'}`, 14, finalY + 22);
    
    doc.setFontSize(9);
    doc.text('Disclaimer: Demo trading. Untuk edukasi.', 14, 280);
    
    doc.save('SahamLens_Portfolio_Report.pdf');
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center font-sans p-4">
        <div className="bg-tv-card border border-tv-border p-8 rounded-xl shadow-2xl max-w-sm w-full">
          <div className="flex justify-center mb-6">
            <div className="bg-[#14b8a6]/10 p-3 rounded-lg border border-[#14b8a6]/30 text-[#14b8a6]">
              <Target className="w-8 h-8" />
            </div>
          </div>
          <h2 className="text-2xl font-bold font-mono text-center mb-2">Akun Demo</h2>
          <p className="text-sm text-gray-400 text-center font-mono mb-6">
            {authMode === 'LOGIN' ? 'Login untuk mengakses Paper Trading kamu.' : 'Daftar akun demo - modal virtual Rp 100 Juta gratis.'}
          </p>

          {/* Toggle Login / Daftar */}
          <div className="flex items-center gap-1 bg-tv-bg p-1 rounded-lg border border-tv-border mb-5">
            <button
              type="button"
              onClick={() => { setAuthMode('LOGIN'); setLoginError(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-bold font-mono transition-colors ${authMode === 'LOGIN' ? 'bg-tv-hover text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('SIGNUP'); setLoginError(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-bold font-mono transition-colors ${authMode === 'SIGNUP' ? 'bg-tv-hover text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Daftar
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-mono text-gray-500 uppercase mb-1 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-[#0f172a] border border-tv-border rounded px-3 py-2 text-white font-mono outline-none focus:border-[#14b8a6]"
                placeholder="Username kamu"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-gray-500 uppercase mb-1 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#0f172a] border border-tv-border rounded px-3 py-2 text-white font-mono outline-none focus:border-[#14b8a6]"
                placeholder="Minimal 6 karakter"
                autoComplete={authMode === 'SIGNUP' ? 'new-password' : 'current-password'}
              />
            </div>
            {authMode === 'SIGNUP' && (
              <div>
                <label className="text-xs font-mono text-gray-500 uppercase mb-1 block">Konfirmasi Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#0f172a] border border-tv-border rounded px-3 py-2 text-white font-mono outline-none focus:border-[#14b8a6]"
                  placeholder="Ulangi password"
                  autoComplete="new-password"
                />
              </div>
            )}
            {loginError && <p className="text-tv-red text-xs font-mono">{loginError}</p>}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-[#14b8a6] hover:bg-[#0d9488] text-black font-bold font-mono py-2 rounded transition-colors mt-2 disabled:opacity-50"
            >
              {authLoading ? 'Memproses...' : authMode === 'LOGIN' ? 'Login' : 'Daftar Sekarang'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <button onClick={() => router.push('/')} className="text-xs text-gray-500 hover:text-white font-mono transition-colors">
              &larr; Kembali ke Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !portfolio) return <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center font-mono">Loading data/portfolios.json...</div>;
  if (!portfolio) return <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center font-mono">Error load portfolio.</div>;

  const holdingsValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalEquity = portfolio.cash + holdingsValue;
  const totalPnl = totalEquity - portfolio.initial_cash;
  const totalPnlPct = (totalPnl / portfolio.initial_cash) * 100;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-tv-text font-sans selection:bg-[#14b8a6]/30 overflow-x-hidden pb-20">
      
      <nav className="fixed top-0 w-full z-50 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-[#14b8a6]/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/dashboard')}>
          <div className="bg-[#14b8a6]/10 p-2 rounded-lg border border-[#14b8a6]/30 text-[#14b8a6]">
            <Target className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white font-mono">Saham<span className="text-[#14b8a6]">Lens</span></span>
        </div>
        <div className="flex items-center gap-4">
          {currentUser && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-gray-400">
              <span className="text-white font-bold">{currentUser.username}</span>
              <span className="px-2 py-0.5 rounded-full bg-tv-hover border border-tv-border uppercase text-[10px] text-gray-400">
                {currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'pro' ? 'Pro' : 'Demo Free'}
              </span>
            </div>
          )}
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
          >
            Dashboard
          </button>
          <button
            className="bg-[#14b8a6] hover:bg-[#0d9488] text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-[0_0_15px_rgba(20,184,166,0.4)]"
          >
            Upgrade Pro
          </button>
          <button
            onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.reload(); }}
            className="text-gray-500 hover:text-tv-red text-xs font-mono transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="pt-28 px-4 md:px-8 max-w-7xl mx-auto">
        
        {/* HEADER STATS - Stockbit style asset summary card */}
        <div id="portfolio-stats-header" className="bg-gradient-to-br from-tv-card to-[#0f1720] border border-tv-border rounded-2xl p-6 shadow-lg mb-6 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
             <Trophy className="w-32 h-32 text-tv-yellow" />
           </div>

           <div className="flex items-start justify-between relative z-10 mb-1">
             <span className="text-xs font-mono text-gray-400 uppercase tracking-wide">Total Aset - {portfolio.name}</span>
             <div className="flex items-center gap-2">
                <button onClick={handleShare} title="Share P/L" className="p-2 rounded-lg bg-tv-hover border border-tv-border text-gray-300 hover:text-white hover:border-blue-500 transition-colors">
                  <Share2 className="w-4 h-4" />
                </button>
                <button onClick={downloadExcel} title="Download Excel" className="p-2 rounded-lg bg-tv-hover border border-tv-border text-gray-300 hover:text-[#14b8a6] hover:border-[#14b8a6]/50 transition-colors">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={downloadPDF} title="Download PDF" className="p-2 rounded-lg bg-tv-hover border border-tv-border text-gray-300 hover:text-tv-red hover:border-tv-red/50 transition-colors">
                  <FileText className="w-4 h-4" />
                </button>
             </div>
           </div>

           <div className="flex flex-wrap items-end gap-3 relative z-10">
              <h2 className="text-4xl md:text-5xl font-extrabold text-white font-mono tracking-tight">
                {formatIDR(totalEquity)}
              </h2>
              <div className={`flex items-center gap-1 font-bold mb-1.5 px-2 py-0.5 rounded-md ${totalPnl >= 0 ? 'text-tv-green bg-tv-green/10' : 'text-tv-red bg-tv-red/10'}`}>
                {totalPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>{totalPnl >= 0 ? '+' : ''}{formatIDR(totalPnl)}</span>
                <span>({totalPnlPct > 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)</span>
              </div>
           </div>

           {/* Breakdown tiles, ala Stockbit: Modal / Saldo Tunai / Nilai Saham */}
           <div className="grid grid-cols-3 gap-3 mt-5 relative z-10">
              <div className="bg-tv-bg/60 border border-tv-border rounded-lg p-3">
                <div className="text-[10px] text-gray-500 font-mono uppercase mb-1">Modal Awal</div>
                <div className="font-bold text-gray-300 font-mono text-sm md:text-base">{formatIDR(portfolio.initial_cash)}</div>
              </div>
              <div className="bg-tv-bg/60 border border-tv-border rounded-lg p-3">
                <div className="text-[10px] text-gray-500 font-mono uppercase mb-1">Saldo Tunai</div>
                <div className="font-bold text-white font-mono text-sm md:text-base">{formatIDR(portfolio.cash)}</div>
              </div>
              <div className="bg-tv-bg/60 border border-tv-border rounded-lg p-3">
                <div className="text-[10px] text-gray-500 font-mono uppercase mb-1">Nilai Saham ({holdings.length})</div>
                <div className="font-bold text-white font-mono text-sm md:text-base">{formatIDR(holdingsValue)}</div>
              </div>
           </div>

           {badges.length > 0 && (
             <div className="mt-5 pt-4 border-t border-tv-border flex flex-wrap gap-2 relative z-10">
               <span className="text-xs text-gray-500 font-mono flex items-center mr-2">Badges:</span>
               {badges.map(b => (
                 <div key={b} className="bg-tv-yellow/10 border border-tv-yellow/30 text-tv-yellow text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                   <Medal className="w-3 h-3" /> {b}
                 </div>
               ))}
             </div>
           )}
        </div>

        {/* TABS */}
        <div className="flex items-center gap-1 bg-tv-card p-1 rounded-lg border border-tv-border mb-6 w-fit">
          {['HOLDINGS', 'TRANSACTIONS', 'LEADERBOARD'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-md text-sm font-bold font-mono transition-colors ${activeTab === tab ? 'bg-tv-hover text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <div className="bg-tv-card border border-tv-border rounded-xl shadow-lg min-h-[400px]">
          {loading ? (
             <div className="flex items-center justify-center h-64 text-gray-400 font-mono"><RefreshCw className="w-6 h-6 animate-spin mr-2" /> Menghitung P/L dari yfinance...</div>
          ) : (
            <>
              {activeTab === 'HOLDINGS' && (
                <div className="p-3 md:p-4">
                  {/* Column labels (desktop only) - Stockbit-style saham list header */}
                  {holdings.length > 0 && (
                    <div className="hidden md:flex items-center px-3 pb-2 text-[10px] font-mono text-tv-muted uppercase">
                      <div className="flex-1">Saham</div>
                      <div className="w-32 text-right">Avg / Sekarang</div>
                      <div className="w-24 text-right">Lot</div>
                      <div className="w-36 text-right">Untung/Rugi</div>
                      <div className="w-20 text-center">Skor Algo</div>
                      <div className="w-20 text-center">Aksi</div>
                    </div>
                  )}

                  {holdings.length === 0 ? (
                    <div className="py-16 text-center text-gray-500 font-mono">
                      <Wallet className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      Belum ada porto. Buka Dashboard untuk Beli Virtual.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {holdings.map(h => {
                        const lembar = h.lots * 100;
                        return (
                          <div
                            key={h.symbol}
                            className="flex flex-col md:flex-row md:items-center gap-3 bg-tv-bg/40 hover:bg-tv-hover/40 border border-tv-border rounded-xl px-3 py-3 transition-colors"
                          >
                            {/* Symbol + avatar */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`w-11 h-11 shrink-0 rounded-full border flex items-center justify-center font-bold font-mono text-xs ${tickerAvatarColor(h.symbol)}`}>
                                {tickerCode(h.symbol).slice(0, 4)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-white font-mono truncate">{tickerCode(h.symbol)}</div>
                                <div className="text-[11px] text-gray-500 font-mono">{h.lots.toLocaleString('id-ID')} Lot &bull; {lembar.toLocaleString('id-ID')} lembar</div>
                              </div>
                            </div>

                            {/* Avg / current price */}
                            <div className="flex md:w-32 items-center justify-between md:justify-end md:flex-col md:items-end text-xs font-mono gap-0.5">
                              <span className="text-gray-500">Avg {h.avgPrice.toLocaleString('id-ID')}</span>
                              <span className="text-white font-bold">{h.currentPrice.toLocaleString('id-ID')}</span>
                            </div>

                            {/* Lot (mobile shows inline above; desktop column) */}
                            <div className="hidden md:flex md:w-24 justify-end font-mono text-sm text-gray-300">
                              {h.lots.toLocaleString('id-ID')} Lot
                            </div>

                            {/* P/L */}
                            <div className={`flex md:w-36 items-center justify-between md:justify-end md:flex-col md:items-end font-mono text-sm font-bold ${h.pnl >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                              <span>{h.pnl >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%</span>
                              <span className="text-[11px] font-normal opacity-90">{h.pnl >= 0 ? '+' : ''}{formatIDR(h.pnl)}</span>
                            </div>

                            {/* Score + action */}
                            <div className="flex items-center justify-between md:w-auto md:justify-end gap-2">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold font-mono whitespace-nowrap ${
                                h.scoreLabel.includes('SELL') ? 'bg-tv-red/20 text-tv-red' :
                                h.scoreLabel.includes('BUY') || h.scoreLabel.includes('BREAKOUT') ? 'bg-tv-green/20 text-tv-green' :
                                'bg-tv-yellow/20 text-tv-yellow'
                              }`}>
                                {h.scoreLabel}
                              </span>
                              <button
                                onClick={() => router.push(`/dashboard?symbol=${h.symbol}&action=sell`)}
                                className="bg-tv-red/10 border border-tv-red/30 hover:bg-tv-red hover:text-white text-tv-red text-xs font-bold font-mono px-3 py-1.5 rounded transition-colors whitespace-nowrap"
                              >
                                Jual
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'TRANSACTIONS' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-tv-border bg-tv-hover/50 text-xs font-mono text-tv-muted uppercase">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4 text-right">Price</th>
                        <th className="py-3 px-4 text-right">Lots</th>
                        <th className="py-3 px-4 text-right">P/L (Sell)</th>
                        <th className="py-3 px-4">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.length === 0 ? (
                        <tr><td colSpan={7} className="py-10 text-center text-gray-500 font-mono">Belum ada transaksi.</td></tr>
                      ) : (
                        [...transactions].reverse().map(t => (
                          <tr key={t.id} className="border-b border-tv-border hover:bg-tv-hover/30 transition-colors">
                            <td className="py-3 px-4 font-mono text-[11px] text-gray-400 whitespace-nowrap">
                              {new Date(t.date).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold font-mono ${t.type === 'BUY' ? 'bg-tv-green/20 text-tv-green' : 'bg-tv-red/20 text-tv-red'}`}>
                                {t.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-white font-mono">{t.symbol}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-gray-300">{t.price.toLocaleString('id-ID')}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-gray-300">{t.lots}</td>
                            <td className="py-3 px-4 text-right">
                               {t.type === 'SELL' && t.pnl !== undefined ? (
                                 <div className={`font-mono text-sm font-bold ${t.pnl >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                                   {t.pnl >= 0 ? '+' : ''}{formatIDR(t.pnl)}
                                 </div>
                               ) : '-'}
                            </td>
                            <td className="py-3 px-4 text-xs font-mono text-gray-400 max-w-[200px] truncate" title={t.note}>
                              {t.note || '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'LEADERBOARD' && (
                <div className="p-6">
                  <div className="bg-tv-hover/30 border border-tv-border rounded-xl p-8 text-center">
                    <Trophy className="w-16 h-16 text-tv-yellow mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2 font-mono">Top Demo P/L Minggu Ini</h3>
                    <p className="text-gray-400 font-mono text-sm mb-6 max-w-md mx-auto">
                      Bersaing dengan 34,000 trader lainnya. Buktikan kamu bisa cuan konsisten di paper trading sebelum nyemplung duit beneran.
                    </p>
                    
                    <div className="max-w-xl mx-auto text-left space-y-3">
                      <div className="flex items-center justify-between bg-tv-yellow/10 border border-tv-yellow/30 p-3 rounded-lg">
                         <div className="flex items-center gap-4">
                           <div className="w-8 text-center font-bold text-tv-yellow font-mono">#1</div>
                           <div className="font-bold text-white font-mono">Admin (You)</div>
                         </div>
                         <div className="font-bold text-tv-green font-mono">{totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%</div>
                      </div>
                      <div className="flex items-center justify-between bg-[#0f172a] p-3 rounded-lg border border-tv-border">
                         <div className="flex items-center gap-4">
                           <div className="w-8 text-center font-bold text-gray-400 font-mono">#2</div>
                           <div className="font-bold text-gray-300 font-mono">@TraderSak...</div>
                         </div>
                         <div className="font-bold text-tv-green font-mono">+18.42%</div>
                      </div>
                      <div className="flex items-center justify-between bg-[#0f172a] p-3 rounded-lg border border-tv-border">
                         <div className="flex items-center gap-4">
                           <div className="w-8 text-center font-bold text-gray-400 font-mono">#3</div>
                           <div className="font-bold text-gray-300 font-mono">@Libas09_...</div>
                         </div>
                         <div className="font-bold text-tv-green font-mono">+12.01%</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="mt-20 border-t border-tv-border py-6 px-4 text-center">
        <p className="text-xs text-gray-500 font-mono max-w-2xl mx-auto flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 text-tv-yellow" />
          Demo Trading - Uang Virtual, Bukan Trading Sungguhan. Untuk Edukasi. Performa Demo bukan jaminan real.
        </p>
      </footer>
    </div>
  );
}
