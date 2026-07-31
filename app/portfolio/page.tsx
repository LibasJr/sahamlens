'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Target, TrendingUp, TrendingDown, RefreshCw, Trophy, Medal, Share2, AlertTriangle, ChevronRight, Download, FileText, Wallet, Search, Eye, Bell, MoreHorizontal } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';

const formatIDR = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-600',
  'bg-green-100 text-green-600',
  'bg-purple-100 text-purple-600',
  'bg-yellow-100 text-yellow-600',
  'bg-pink-100 text-pink-600',
  'bg-orange-100 text-orange-600',
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
  const [activeTab, setActiveTab] = useState<'HOLDINGS' | 'ORDER' | 'HISTORY'>('HOLDINGS');
  const [badges, setBadges] = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);

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

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const wsHoldings = XLSX.utils.json_to_sheet(holdings.map(h => ({
      Symbol: h.symbol,
      'Avg Buy': h.avgPrice,
      Current: h.currentPrice,
      Lots: h.lots,
      'P/L Rp': h.pnl,
      'P/L %': (h.pnlPct / 100).toFixed(4),
      Score: h.scoreLabel
    })));
    XLSX.utils.book_append_sheet(wb, wsHoldings, 'Holdings');
    XLSX.writeFile(wb, 'SahamLens_Portfolio.xlsx');
  };

  const downloadPDF = async () => {
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
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center font-sans p-4">
        <div className="bg-[#131c2e] border border-[#1e293b] p-8 rounded-xl shadow-1 max-w-sm w-full">
          <div className="flex justify-center mb-6">
            <div className="bg-[#1cb05b]/10 p-4 rounded-full text-[#1cb05b]">
              <Wallet className="w-8 h-8" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-white mb-2">Portfolio Virtual</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            {authMode === 'LOGIN' ? 'Masuk ke akun demo kamu.' : 'Daftar akun demo gratis.'}
          </p>

          <div className="flex bg-[#1e293b] p-1 rounded-lg mb-6">
            <button
              onClick={() => { setAuthMode('LOGIN'); setLoginError(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${authMode === 'LOGIN' ? 'bg-[#131c2e] shadow text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Login
            </button>
            <button
              onClick={() => { setAuthMode('SIGNUP'); setLoginError(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${authMode === 'SIGNUP' ? 'bg-[#131c2e] shadow text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Daftar
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-[#131c2e] border border-[#334155] rounded-lg px-4 py-2.5 text-white outline-none focus:border-[#1cb05b] focus:ring-1 focus:ring-[#1cb05b]"
                placeholder="Username kamu"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#131c2e] border border-[#334155] rounded-lg px-4 py-2.5 text-white outline-none focus:border-[#1cb05b] focus:ring-1 focus:ring-[#1cb05b]"
                placeholder="Password"
              />
            </div>
            {authMode === 'SIGNUP' && (
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Konfirmasi Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#131c2e] border border-[#334155] rounded-lg px-4 py-2.5 text-white outline-none focus:border-[#1cb05b] focus:ring-1 focus:ring-[#1cb05b]"
                  placeholder="Ulangi password"
                />
              </div>
            )}
            {loginError && <p className="text-red-500 text-xs text-center font-medium">{loginError}</p>}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-[#1cb05b] hover:bg-[#189a4f] text-white font-bold py-2.5 rounded-lg transition-colors mt-2"
            >
              {authLoading ? 'Loading...' : authMode === 'LOGIN' ? 'Masuk' : 'Daftar'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <button onClick={() => router.push('/')} className="text-xs text-gray-500 hover:text-white font-medium">
              Kembali ke Beranda
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !portfolio) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-gray-500">Memuat portfolio...</div>;
  if (!portfolio) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-red-500">Gagal memuat portfolio.</div>;

  const holdingsValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalEquity = portfolio.cash + holdingsValue;
  const totalPnl = totalEquity - portfolio.initial_cash;
  const totalPnlPct = (totalPnl / portfolio.initial_cash) * 100;
  const isPositive = totalPnl >= 0;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans pb-20">
      {/* Top Navbar */}
      <nav className="bg-[#131c2e] border-b border-[#1e293b] px-4 py-3 sticky top-0 z-50 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/dashboard')}>
          <div className="w-8 h-8 rounded-full bg-[#1cb05b] flex items-center justify-center">
            <span className="text-white font-bold text-sm">SL</span>
          </div>
          <span className="font-bold text-lg text-white tracking-tight">Portfolio</span>
        </div>
        <div className="flex items-center gap-4">

              <button onClick={() => { setOrderType('BUY'); setShowOrderModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold mr-2">BUY</button>
              <button onClick={() => { setOrderType('SELL'); setShowOrderModal(true); }} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-bold">SELL</button>

          <Search className="w-5 h-5 text-gray-500" />
          <Bell className="w-5 h-5 text-gray-500" />
          <div className="flex flex-col text-right">
             <span className="text-xs font-bold text-white">{currentUser?.username}</span>
             <span className="text-[10px] text-gray-500">{currentUser?.role === 'admin' ? 'Admin' : 'Virtual'}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto mt-4 px-2">
        {/* Total Return Card */}
        <div className="bg-[#131c2e] rounded-xl shadow-sm border border-[#1e293b] overflow-hidden mb-4">
          <div className="p-5">
            <div className="flex items-center justify-between mb-2">
               <span className="text-gray-500 text-sm font-medium">Total Return</span>
               <Eye className="w-4 h-4 text-gray-500" />
            </div>
            <div className="flex items-end gap-3 mb-4">
               <h2 className="text-3xl font-bold text-white tracking-tight">{formatIDR(totalEquity)}</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <span className="text-xs text-gray-500 mb-1 block">Return (Rp)</span>
                  <div className={`font-semibold ${isPositive ? 'text-[#1cb05b]' : 'text-red-500'} flex items-center gap-1`}>
                    {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {isPositive ? '+' : ''}{formatIDR(totalPnl)}
                  </div>
               </div>
               <div>
                  <span className="text-xs text-gray-500 mb-1 block">Return (%)</span>
                  <div className={`font-semibold ${isPositive ? 'text-[#1cb05b]' : 'text-red-500'} flex items-center gap-1`}>
                    {isPositive ? '+' : ''}{totalPnlPct.toFixed(2)}%
                  </div>
               </div>
            </div>
          </div>
          <div className="bg-[#0f172a] border-t border-[#1e293b] px-5 py-3 grid grid-cols-2 gap-4">
             <div>
                <span className="text-[10px] text-gray-500 uppercase font-semibold">Buying Power</span>
                <div className="text-sm font-bold text-white">{formatIDR(portfolio.cash)}</div>
             </div>
             <div className="text-right flex items-center justify-end gap-2">
                <button onClick={downloadExcel} className="p-1.5 bg-[#131c2e] border border-[#1e293b] rounded text-gray-500 hover:text-white"><Download className="w-4 h-4" /></button>
                <button onClick={downloadPDF} className="p-1.5 bg-[#131c2e] border border-[#1e293b] rounded text-gray-500 hover:text-white"><FileText className="w-4 h-4" /></button>
             </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-[#131c2e] border-b border-[#1e293b] flex px-2 sticky top-14 z-40">
          {['HOLDINGS', 'ORDER', 'HISTORY'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex-1 text-center py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-[#1cb05b] text-[#1cb05b]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Holdings List */}
        {activeTab === 'HOLDINGS' && (
          <div className="bg-[#131c2e] border-x border-b border-[#1e293b] rounded-b-xl shadow-sm min-h-[300px]">
             <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e293b] bg-[#0f172a] text-xs font-semibold text-gray-500">
               <div>SAHAM</div>
               <div className="text-right">RETURN</div>
             </div>
             
             {holdings.length === 0 ? (
               <div className="py-16 flex flex-col items-center justify-center text-gray-500">
                 <Wallet className="w-12 h-12 mb-3 text-gray-300" />
                 <p className="text-sm font-medium">Belum ada portofolio</p>
               </div>
             ) : (
               <div className="divide-y divide-gray-100">
                 {holdings.map(h => {
                   const lembar = h.lots * 100;
                   const isProfit = h.pnl >= 0;
                   return (
                     <div key={h.symbol} className="p-4 hover:bg-[#0f172a] transition-colors cursor-pointer" onClick={() => router.push(`/dashboard?symbol=${h.symbol}`)}>
                       <div className="flex justify-between items-start mb-2">
                         <div className="flex items-center gap-3">
                           <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${tickerAvatarColor(h.symbol)}`}>
                             {tickerCode(h.symbol).substring(0,2)}
                           </div>
                           <div>
                             <div className="font-bold text-white leading-tight">{tickerCode(h.symbol)}</div>
                             <div className="text-[11px] text-gray-500">{h.lots.toLocaleString('id-ID')} Lot</div>
                           </div>
                         </div>
                         <div className="text-right">
                           <div className={`font-bold text-sm ${isProfit ? 'text-[#1cb05b]' : 'text-red-500'}`}>
                             {isProfit ? '+' : ''}{formatIDR(h.pnl)}
                           </div>
                           <div className={`text-xs font-medium ${isProfit ? 'text-[#1cb05b]' : 'text-red-500'}`}>
                             {isProfit ? '+' : ''}{h.pnlPct.toFixed(2)}%
                           </div>
                         </div>
                       </div>
                       
                       <div className="flex justify-between items-center text-xs mt-3 pt-3 border-t border-gray-50">
                          <div className="text-gray-500">
                            Avg: <span className="font-semibold text-gray-300">{h.avgPrice.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="text-gray-500">
                            Last: <span className="font-semibold text-gray-300">{h.currentPrice.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="text-gray-500">
                            Value: <span className="font-semibold text-gray-300">{formatIDR(h.currentValue)}</span>
                          </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
             )}
          </div>
        )}

        {/* History Tab placeholder */}
        {activeTab !== 'HOLDINGS' && (
          <div className="bg-[#131c2e] border-x border-b border-[#1e293b] rounded-b-xl shadow-sm min-h-[300px] flex items-center justify-center">
             <p className="text-gray-500 text-sm font-medium">Belum ada history transaksi</p>
          </div>
        )}
      </main>

      {/* Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl w-full max-w-sm p-6">
            <h2 className={`text-xl font-bold mb-4 ${orderType === 'BUY' ? 'text-blue-400' : 'text-red-400'}`}>{orderType} Stock</h2>
            <form onSubmit={submitOrder} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Symbol (e.g. BBCA.JK)</label>
                <SymbolAutocomplete 
                  required 
                  value={orderSymbol} 
                  onChange={(val)=>setOrderSymbol(val)} 
                  className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded p-2" 
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Price (Rp)</label>
                <input required type="number" value={orderPrice} onChange={e=>setOrderPrice(e.target.value)} className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded p-2" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Lots</label>
                <input required type="number" value={orderLots} onChange={e=>setOrderLots(e.target.value)} className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded p-2" />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setShowOrderModal(false)} className="flex-1 py-2 rounded bg-[#1e293b] text-white">Cancel</button>
                <button type="submit" disabled={orderLoading} className={`flex-1 py-2 rounded text-white font-bold ${orderType === 'BUY' ? 'bg-blue-600' : 'bg-red-600'}`}>
                  {orderLoading ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
