'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Target, Activity, Zap, TrendingUp, TrendingDown, BarChart2, ArrowUpRight, CheckCircle2, ChevronDown, Play } from 'lucide-react';
import { WA_NUMBER } from '@/lib/constants';

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

// Mock dashboard preview (SVG + CSS statis) - dipakai sebagai preview visual, tidak bergantung file
// gambar/URL eksternal yang bisa gagal load kalau tidak ada koneksi internet.
const CHART_SERIES = [78, 82, 74, 76, 70, 68, 71, 64, 60, 62, 56, 52, 54, 48, 44, 46, 40, 38, 35, 30];

function smoothPath(points: [number, number][]) {
  if (points.length < 2) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    d += ` Q ${px} ${py} ${(px + cx) / 2} ${(py + cy) / 2}`;
  }
  const [lx, ly] = points[points.length - 1];
  d += ` T ${lx} ${ly}`;
  return d;
}

interface Chip { label: string; value: string; decision: 'BEARISH' | 'BULLISH' | 'NEUTRAL'; }

function DashboardMock({ symbol, price, changePct, score, chips, compact = false }: {
  symbol: string; price: number; changePct: number; score: number; chips: Chip[]; compact?: boolean;
}) {
  const width = 600;
  const height = compact ? 200 : 260;
  const max = Math.max(...CHART_SERIES);
  const min = Math.min(...CHART_SERIES);
  const range = max - min || 1;
  const stepX = width / (CHART_SERIES.length - 1);
  const toY = (v: number) => 20 + (1 - (v - min) / range) * (height - 40);
  const points: [number, number][] = CHART_SERIES.map((v, i) => [i * stepX, toY(v)]);
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  const chipColor = (d: Chip['decision']) =>
    d === 'BEARISH' ? { text: 'text-tv-red', border: 'border-tv-red/20' }
    : d === 'BULLISH' ? { text: 'text-tv-green', border: 'border-tv-green/20' }
    : { text: 'text-gray-300', border: 'border-white/10' };

  return (
    <div className={`w-full bg-[#0a0a0f] rounded-xl overflow-hidden border border-[#1e293b] flex flex-col font-mono relative ${compact ? 'h-48' : 'h-80'}`}>
      
      {/* Mock Browser Header */}
      <div className="h-6 bg-[#131c2e] flex items-center px-3 gap-1.5 border-b border-[#1e293b]">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
        <div className="flex-1 flex justify-center">
          <div className="text-[9px] text-gray-500 truncate bg-black/20 px-2 py-0.5 rounded">sahamlens.app/dashboard?symbol={symbol} • 🟢 Real-time (Max 10m Delay)</div>
        </div>
      </div>

      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-mono font-bold text-sm">{symbol}</span>
          <span className="text-gray-400 font-mono text-xs">Rp {price.toLocaleString('id-ID')}</span>
          <span className={`font-mono text-xs font-bold ${changePct < 0 ? 'text-tv-red' : 'text-tv-green'}`}>
            {changePct > 0 ? '+' : ''}{changePct}%
          </span>
        </div>
        <span className="bg-tv-red/20 text-tv-red text-[10px] font-bold px-2.5 py-1 rounded border border-tv-red/40 whitespace-nowrap">
          {score} SELL
        </span>
      </div>

      {/* chart */}
      <div className="flex-1 min-h-0 px-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sahamlens-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2].map(i => (
            <line key={i} x1={0} x2={width} y1={(height / 3) * i} y2={(height / 3) * i} stroke="#1e293b" strokeWidth={1} />
          ))}
          <path d={areaPath} fill="url(#sahamlens-area)" />
          <path d={linePath} fill="none" stroke="#f87171" strokeWidth={2.5} strokeLinecap="round" />
        </svg>
      </div>

      {/* stat chips */}
      <div className={`grid grid-cols-2 gap-2 px-4 pb-3 pt-1 flex-shrink-0 ${compact ? 'gap-1.5' : ''}`}>
        {chips.map(c => {
          const cc = chipColor(c.decision);
          return (
            <div key={c.label} className={`flex items-center justify-between px-2.5 py-1.5 rounded-md bg-white/[0.03] border ${cc.border}`}>
              <span className="text-[10px] text-gray-400 font-mono truncate">{c.label}</span>
              <span className={`text-[10px] font-bold font-mono ${cc.text}`}>{c.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [pulseData, setPulseData] = useState<any>(null);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const DEMO_SYMBOLS = ['BMRI.JK', 'BBCA.JK', 'BBRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK'];
  const [demoSymbol, setDemoSymbol] = useState(DEMO_SYMBOLS[0]);
  const [demoStock, setDemoStock] = useState<any>(null);

  useEffect(() => {
    fetch('/api/market-pulse')
      .then(res => res.json())
      .then(data => setPulseData(data))
      .catch(err => console.error("Error fetching market pulse", err));

    const randomSymbol = DEMO_SYMBOLS[Math.floor(Math.random() * DEMO_SYMBOLS.length)];

    fetch(`/api/stock/${randomSymbol}?_t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.stock) {
          setDemoStock(data);
          setDemoSymbol(randomSymbol);
        } else {
          setDemoStock({ stock: { current_price: 462.5, change_pct: 0.12, name: 'IHSG Placeholder' }, analyzers: [], scoring: { total_score: 5, kategori: 'HOLD' } });
        }
      })
      .catch(err => {
        console.error(`Error fetching ${randomSymbol} proof data`, err);
        setDemoStock({ stock: { current_price: 462.5, change_pct: 0.12, name: 'IHSG Placeholder' }, analyzers: [], scoring: { total_score: 5, kategori: 'HOLD' } });
      });
  }, []);

  const demoFallback = {
    price: 4100, ma20: 4172, ma50: 4146, ma200: 4604,
    score: 30, momentum5d: -8.48, recentHigh: 4640, drawdownPct: -11.64
  };

  const demoStats = useMemo(() => {
    if (!demoStock?.stock?.history?.length) return demoFallback;
    const history = demoStock.stock.history;
    const maAnalyzer = demoStock.analyzers?.find((a: any) => a.label.includes('MA Trend'));
    const momentumAnalyzer = demoStock.analyzers?.find((a: any) => a.label.includes('Momentum'));
    const maMatch = maAnalyzer?.value?.match(/P:(-?\d+),\s*MA20:(-?\d+),\s*MA50:(-?\d+),\s*MA200:(-?\d+)/);
    const momentumMatch = momentumAnalyzer?.value?.match(/5D:\s*(-?[\d.]+)%/);

    const recentBars = history.slice(-60);
    const highBar = recentBars.reduce((a: any, b: any) => (b.close > a.close ? b : a), recentBars[0]);
    const currentClose = history[history.length - 1].close;
    const drawdownPct = ((currentClose - highBar.close) / highBar.close) * 100;

    return {
      price: currentClose,
      ma20: maMatch ? Number(maMatch[2]) : demoFallback.ma20,
      ma50: maMatch ? Number(maMatch[3]) : demoFallback.ma50,
      ma200: maMatch ? Number(maMatch[4]) : demoFallback.ma200,
      score: demoStock.scoring?.total_score ?? demoFallback.score,
      momentum5d: momentumMatch ? Number(momentumMatch[1]) : demoFallback.momentum5d,
      recentHigh: highBar.close,
      drawdownPct: Number(drawdownPct.toFixed(2))
    };
  }, [demoStock]);

  const demoChangePct = demoStock?.stock?.change_pct ?? (demoStock?.stock?.history?.length > 1 ? Number((((demoStock.stock.history[demoStock.stock.history.length-1].close - demoStock.stock.history[demoStock.stock.history.length-2].close) / demoStock.stock.history[demoStock.stock.history.length-2].close) * 100).toFixed(2)) : 0);

  const demoChips: Chip[] = useMemo(() => {
    const find = (needle: string) => demoStock?.analyzers?.find((a: any) => a.label.includes(needle));
    const maAn = find('MA Trend');
    const rsiAn = find('RSI');
    const macdAn = find('MACD');
    const rsiVal = rsiAn?.value?.match(/RSI:\s*([\d.]+)/)?.[1];
    return [
      { label: 'MA Trend', value: maAn?.decision ?? 'BEARISH', decision: (maAn?.decision ?? 'BEARISH') as Chip['decision'] },
      { label: 'RSI 14', value: rsiVal ?? '55.5', decision: (rsiAn?.decision ?? 'BULLISH') as Chip['decision'] },
      { label: 'MACD', value: macdAn?.decision ?? 'BEARISH', decision: (macdAn?.decision ?? 'BEARISH') as Chip['decision'] },
      { label: 'Momentum 5D', value: `${demoStats.momentum5d}%`, decision: demoStats.momentum5d < 0 ? 'BEARISH' : 'BULLISH' }
    ];
  }, [demoStock, demoStats]);

  const demoNarrative = useMemo(() => {
    const find = (needle: string) => demoStock?.analyzers?.find((a: any) => a.label.includes(needle));
    const emaAn = find('EMA 20/50');
    const smaAn = find('SMA Score');
    const rsiAn = find('RSI');
    const smaLabel = smaAn?.value?.match(/Score:\s*([\d/]+)/)?.[1] ?? '1/5';
    const rsiVal = rsiAn?.value?.match(/RSI:\s*([\d.]+)/)?.[1] ?? '55.5';
    return {
      emaText: `EMA 20/50 ${emaAn?.decision ?? 'BEARISH'} Cross`,
      smaText: `SMA Score ${smaLabel}`,
      macdText: `MACD ${demoChips[2]?.decision ?? 'BEARISH'}`,
      rsiOversold: Number(rsiVal) < 30
    };
  }, [demoStock, demoChips]);

  const formatIDR = (n: number) => n.toLocaleString('id-ID');
  const proMonthly = 149000;
  const instMonthly = 499000;
  const proPrice = billing === 'monthly' ? proMonthly : proMonthly * 10;
  const instPrice = billing === 'monthly' ? instMonthly : instMonthly * 10;
  const periodLabel = billing === 'monthly' ? '/bulan' : '/tahun';

  const waLink = (plan: string, price: string) =>
    `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Halo min mau upgrade ${plan} SahamLens (${price}) - username telegram: ...`)}`;

  const faqs = [
    {
      q: 'Apakah ini saran finansial?',
      a: `Bukan. Disclaimer: Bukan saran finansial, untuk edukasi. SahamLens 100% pure math, semua keputusan di tangan kamu. Contoh ${demoSymbol} Score ${demoStats.score} ${demoStats.score < 40 ? 'SELL' : 'BUY'} ${demoStats.drawdownPct}% floating loss di watchlist kami adalah data historis (update otomatis tiap hari setelah market tutup).`
    },
    {
      q: 'Data dari mana?',
      a: 'Empowered by yfinance IDX Market Data (.JK) & AI Agent Engine. 10 Pure Math Filters, Hist Accuracy 45-69%.'
    },
    {
      q: 'Bedanya sama Stockbit?',
      a: 'Stockbit fokus sosmed & rumor. SahamLens fokus matematika murni: MA Trend 92% Conf, Bandar Flow Detection, RR 1:4.33 - No Opinion, Just Data.'
    },
    {
      q: `Cara pakai Score ${demoStats.score} ${demoStats.score < 40 ? 'SELL' : 'BUY'}?`,
      a: `Tergantung score. Jika SELL: Jangan entry, tunggu divergensi bullish + breakout MA20. Jika BUY: Pertimbangkan masuk saat koreksi kecil. Lihat demo ${demoSymbol}.`
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-tv-text font-sans selection:bg-[#14b8a6]/30 overflow-x-hidden">
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-50 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-[#14b8a6]/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-[#14b8a6]/10 p-2 rounded-lg border border-[#14b8a6]/30 text-[#14b8a6]">
            <Target className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white font-mono">Saham<span className="text-[#14b8a6]">Lens</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
          <a href="#fitur" className="hover:text-[#14b8a6] transition-colors">Fitur</a>
          <a href="#bukti" className="hover:text-[#14b8a6] transition-colors">Social Proof</a>
          <a href="#pricing" className="hover:text-[#14b8a6] transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-[#14b8a6] transition-colors">FAQ</a>
        </div>
        <button 
          onClick={() => router.push('/dashboard')}
          className="bg-[#14b8a6] hover:bg-[#0d9488] text-white px-5 py-2.5 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(20,184,166,0.4)] flex items-center gap-2"
        >
          Open Terminal
        </button>
      </nav>

      <main className="pt-28 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
        
        {/* SECTION 1 - HERO */}
        <motion.section 
          className="flex flex-col items-center text-center py-16 md:py-24 relative"
          initial="initial"
          animate="animate"
          variants={staggerContainer}
        >
          {/* Background Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#14b8a6]/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
          
          <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-tv-card border border-[#14b8a6]/30 text-[#14b8a6] text-xs font-bold uppercase tracking-widest mb-8 shadow-[0_0_10px_rgba(20,184,166,0.2)]">
            <Activity className="w-3.5 h-3.5" />
            10 Pure Math Filters • No Opinion • Just Data
          </motion.div>
          
          <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-extrabold text-white tracking-tight leading-tight mb-6">
            Stock Screener IDX <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#14b8a6] to-blue-500">Institutional AI</span>
          </motion.h1>
          
          <motion.p variants={fadeIn} className="text-lg md:text-xl text-gray-400 max-w-3xl mb-10 leading-relaxed font-mono">
            Pure Algorithmic Trading (TS Analyzers) - Empowered by yfinance IDX Market Data (.JK) & AI Agent Engine. Tinggalkan tebakan, gunakan matematika murni.
          </motion.p>
          
          <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
            <button 
              onClick={() => router.push('/dashboard')}
              className="w-full sm:w-auto bg-gradient-to-r from-[#14b8a6] to-blue-600 hover:from-[#0d9488] hover:to-blue-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)] flex items-center justify-center gap-2"
            >
              <Zap className="w-5 h-5" /> Mulai Gratis - 100% Pure Algo
            </button>
            <button
              onClick={() => router.push(`/dashboard?symbol=${demoSymbol}`)}
              className="w-full sm:w-auto bg-tv-card hover:bg-tv-card/80 border border-tv-border text-white px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 group"
            >
              <Play className="w-5 h-5 text-tv-red group-hover:scale-110 transition-transform" /> Lihat Demo {demoSymbol} ({demoStats.score} {demoStats.score < 40 ? 'SELL' : 'BUY'})
            </button>
          </motion.div>

          {/* Chart Preview */}
          <motion.div variants={fadeIn} className="mt-16 w-full max-w-5xl rounded-2xl overflow-hidden border border-[#14b8a6]/20 shadow-[0_0_50px_rgba(20,184,166,0.15)] relative">
             <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent z-10" />
             <div className="w-full aspect-[16/9] relative">
                <DashboardMock symbol={demoSymbol} price={demoStats.price} changePct={demoChangePct} score={demoStats.score} chips={demoChips} />
             </div>
          </motion.div>
        </motion.section>

        {/* SECTION 2 - LIVE TICKER (Marquee) */}
        <div className="w-full overflow-hidden bg-tv-card border-y border-tv-border py-3 mb-24">
          <div className="flex gap-8 whitespace-nowrap animate-[marquee_20s_linear_infinite] items-center text-sm font-mono text-gray-300">
            {pulseData?.indices ? (
              pulseData.indices.map((idx: any, i: number) => (
                <span key={`idx-${i}`} className="flex items-center gap-2">
                  <span className="font-bold text-white">{idx.name || idx.symbol}</span>
                  <span className={idx.changePct >= 0 ? 'text-[#14b8a6]' : 'text-tv-red'}>
                    {idx.price.toLocaleString('id-ID')} ({idx.changePct >= 0 ? '+' : ''}{idx.changePct}%)
                  </span>
                  <span className="text-gray-600 mx-2">|</span>
                </span>
              ))
            ) : (
              <>
                <span className="flex items-center gap-2"><span className="font-bold text-white">IHSG</span><span className="text-tv-red">6.131 (-0.89%)</span><span className="text-gray-600 mx-2">|</span></span>
                <span className="flex items-center gap-2"><span className="font-bold text-white">LQ45</span><span className="text-tv-red">608 (-1.1%)</span><span className="text-gray-600 mx-2">|</span></span>
                <span className="flex items-center gap-2"><span className="font-bold text-white">Financial</span><span className="text-tv-red">-1.11%</span><span className="text-gray-600 mx-2">|</span></span>
                <span className="flex items-center gap-2"><span className="font-bold text-white">Telecom</span><span className="text-[#14b8a6]">+0.66%</span><span className="text-gray-600 mx-2">|</span></span>
                <span className="flex items-center gap-2"><span className="font-bold text-tv-yellow">GGRM.JK</span><span className="text-[#14b8a6]">+4.56% TOP GAINER</span><span className="text-gray-600 mx-2">|</span></span>
              </>
            )}
            
            {pulseData?.sectorHeatmap && pulseData.sectorHeatmap.slice(0,3).map((sec: any, i: number) => (
              <span key={`sec-${i}`} className="flex items-center gap-2">
                <span className="font-bold text-gray-400">{sec.sector}</span>
                <span className={sec.changePct >= 0 ? 'text-[#14b8a6]' : 'text-tv-red'}>
                  {sec.changePct >= 0 ? '+' : ''}{sec.changePct}%
                </span>
                <span className="text-gray-600 mx-2">|</span>
              </span>
            ))}
            
            {pulseData?.breadth?.topGainers && pulseData.breadth.topGainers[0] && (
               <span className="flex items-center gap-2">
                 <span className="font-bold text-tv-yellow">{pulseData.breadth.topGainers[0].symbol}</span>
                 <span className="text-[#14b8a6]">+{pulseData.breadth.topGainers[0].changePct}% TOP GAINER</span>
               </span>
            )}
          </div>
        </div>

        {/* SECTION 2.5 - MARKET SUMMARY (Ringkasan Pasar) */}
        {pulseData && pulseData.breadth && (
          <section className="mb-24">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Ringkasan Pasar Hari Ini</h2>
              <p className="text-gray-400 font-mono text-sm">Top Gainer, Loser, Value, Volume & Foreign Flow</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Top Gainer */}
              <div className="bg-tv-card border border-tv-green/30 p-4 rounded-xl shadow-[0_0_15px_rgba(34,197,94,0.1)] flex flex-col">
                <div className="text-xs text-gray-400 font-mono mb-3 uppercase flex items-center gap-2"><ArrowUpRight className="w-3 h-3 text-tv-green" /> Top Gainer</div>
                <div className="space-y-2">
                  {pulseData.breadth.topGainers?.slice(0, 10).map((g: any, i: number) => (
                    <div key={i} className="flex justify-between items-center border-b border-white/5 pb-1 last:border-0 last:pb-0">
                      <span className="text-white font-bold text-sm">{g.symbol}</span>
                      <span className="text-tv-green text-xs font-mono">+{g.changePct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Loser */}
              <div className="bg-tv-card border border-tv-red/30 p-4 rounded-xl shadow-[0_0_15px_rgba(239,68,68,0.1)] flex flex-col">
                <div className="text-xs text-gray-400 font-mono mb-3 uppercase flex items-center gap-2"><TrendingDown className="w-3 h-3 text-tv-red" /> Top Loser</div>
                <div className="space-y-2">
                  {pulseData.breadth.topLosers?.slice(0, 10).map((l: any, i: number) => (
                    <div key={i} className="flex justify-between items-center border-b border-white/5 pb-1 last:border-0 last:pb-0">
                      <span className="text-white font-bold text-sm">{l.symbol}</span>
                      <span className="text-tv-red text-xs font-mono">{l.changePct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Value */}
              <div className="bg-tv-card border border-tv-border p-4 rounded-xl flex flex-col">
                <div className="text-xs text-gray-400 font-mono mb-3 uppercase flex items-center gap-2"><BarChart2 className="w-3 h-3 text-blue-400" /> Top Value</div>
                <div className="space-y-2">
                  {pulseData.breadth.topValue?.slice(0, 10).map((v: any, i: number) => (
                    <div key={i} className="flex justify-between items-center border-b border-white/5 pb-1 last:border-0 last:pb-0">
                      <span className="text-white font-bold text-sm">{v.symbol}</span>
                      <span className="text-blue-400 text-xs font-mono">Rp {(v.value / 1e9).toFixed(1)}B</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Net Foreign Buy */}
              <div className="bg-tv-card border border-tv-border p-4 rounded-xl flex flex-col">
                <div className="text-xs text-gray-400 font-mono mb-3 uppercase flex items-center gap-2">Net F. Buy</div>
                <div className="space-y-2">
                  {pulseData.breadth.netForeign?.buy?.slice(0, 10).map((b: any, i: number) => (
                    <div key={i} className="flex justify-between items-center border-b border-white/5 pb-1 last:border-0 last:pb-0">
                      <span className="text-white font-bold text-sm">{b.symbol}</span>
                      <span className="text-tv-green text-xs font-mono">{(b.val / 1e9).toFixed(1)}B</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Net Foreign Sell */}
              <div className="bg-tv-card border border-tv-border p-4 rounded-xl flex flex-col">
                <div className="text-xs text-gray-400 font-mono mb-3 uppercase flex items-center gap-2">Net F. Sell</div>
                <div className="space-y-2">
                  {pulseData.breadth.netForeign?.sell?.slice(0, 10).map((s: any, i: number) => (
                    <div key={i} className="flex justify-between items-center border-b border-white/5 pb-1 last:border-0 last:pb-0">
                      <span className="text-white font-bold text-sm">{s.symbol}</span>
                      <span className="text-tv-red text-xs font-mono">{(s.val / 1e9).toFixed(1)}B</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Freq */}
              <div className="bg-tv-card border border-tv-border p-4 rounded-xl flex flex-col">
                <div className="text-xs text-gray-400 font-mono mb-3 uppercase flex items-center gap-2">Top Freq</div>
                <div className="space-y-2">
                  {pulseData.breadth.topFreq?.slice(0, 10).map((f: any, i: number) => (
                    <div key={i} className="flex justify-between items-center border-b border-white/5 pb-1 last:border-0 last:pb-0">
                      <span className="text-white font-bold text-sm">{f.symbol}</span>
                      <span className="text-tv-yellow text-xs font-mono">{f.freq}x</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 3 - FITUR GRID */}
        <section id="fitur" className="mb-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">Institutional-Grade Modules</h2>
            <p className="text-gray-400 font-mono">6 AI Agents working together to analyze IDX data.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div 
              onClick={() => router.push('/dashboard')}
              className="bg-tv-card border border-tv-border p-6 rounded-2xl hover:border-[#14b8a6]/50 transition-all cursor-pointer group hover:-translate-y-1"
            >
              <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Technical Analyzer</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4 font-mono">
                10 Pure Math Filters, Hist Accuracy 45-69%, MA Trend IDX (20,50,200) 92% Conf.
              </p>
            </div>
            
            <div 
              onClick={() => router.push('/dashboard')}
              className="bg-tv-card border border-tv-border p-6 rounded-2xl hover:border-[#14b8a6]/50 transition-all cursor-pointer group hover:-translate-y-1"
            >
              <div className="w-12 h-12 bg-purple-500/10 text-purple-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Bandar & Foreign Flow</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4 font-mono">
                Foreign Net -17M vs Bandar +185k lot. Deteksi divergensi dan akumulasi diam-diam.
              </p>
            </div>
            
            <div 
              onClick={() => router.push('/market-pulse')}
              className="bg-tv-card border border-tv-border p-6 rounded-2xl hover:border-[#14b8a6]/50 transition-all cursor-pointer group hover:-translate-y-1"
            >
              <div className="w-12 h-12 bg-[#14b8a6]/10 text-[#14b8a6] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Market Pulse</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4 font-mono">
                Sector Heatmap, Breadth 17 vs 31 Bearish, Top Gainers & Losers Live tracking.
              </p>
            </div>
            
            <div 
              onClick={() => router.push('/breakout-radar')}
              className="bg-tv-card border border-tv-border p-6 rounded-2xl hover:border-[#14b8a6]/50 transition-all cursor-pointer group hover:-translate-y-1"
            >
              <div className="w-12 h-12 bg-tv-red/10 text-tv-red rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Breakout Radar LIVE</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4 font-mono">
                Scan 15 LQ45 tiap 15 menit, Algoritma Scoring 0-8, Risk/Reward otomatis 1:4.33.
              </p>
            </div>
            
            <div 
              onClick={() => router.push('/compare')}
              className="bg-tv-card border border-tv-border p-6 rounded-2xl hover:border-[#14b8a6]/50 transition-all cursor-pointer group hover:-translate-y-1"
            >
              <div className="w-12 h-12 bg-tv-yellow/10 text-tv-yellow rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ArrowUpRight className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Compare Tool</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4 font-mono">
                BBCA vs BBRI side-by-side analysis, Winner conclusion otomatis dari AI.
              </p>
            </div>
            
            <div 
              onClick={() => router.push('/backtest')}
              className="bg-tv-card border border-tv-border p-6 rounded-2xl hover:border-[#14b8a6]/50 transition-all cursor-pointer group hover:-translate-y-1"
            >
              <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">AI Backtester</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4 font-mono">
                Simulasi strategi: Return +22% vs IHSG -0.89%, Win Rate 67%, Max DD -8.2%.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 4 - BUKTI SOCIAL PROOF */}
        <section id="bukti" className="mb-32">
          <div className="bg-gradient-to-br from-[#131c2e] to-tv-bg border border-tv-border rounded-3xl p-8 md:p-12">
            <span className="font-mono text-sm text-[#14b8a6]">Contoh Kasus: {demoSymbol} ({demoStats.score} {demoStats.score < 40 ? 'SELL' : 'BUY'})</span>
            <h3 className="text-3xl font-extrabold text-white mb-6">Kenapa Saham Bagus Bisa <span className="text-tv-red">Bikin Nyangkut?</span></h3>
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-8">Live dari yfinance, ter-update tiap hari setelah market IDX tutup</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-tv-red/20 text-tv-red flex items-center justify-center font-bold">1</div>
                  <div>
                    <h4 className="text-lg font-bold text-white">Harga & Trendline Fatal</h4>
                    <p className="text-gray-400 font-mono mt-1">Harga {formatIDR(demoStats.price)} di bawah MA20 ({formatIDR(demoStats.ma20)}), MA50 ({formatIDR(demoStats.ma50)}) & MA200 ({formatIDR(demoStats.ma200)}) sekaligus = DOWNTREND penuh jangka pendek sampai panjang.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-tv-red/20 text-tv-red flex items-center justify-center font-bold">2</div>
                  <div>
                    <h4 className="text-lg font-bold text-white">Konflik Filter Momentum</h4>
                    <p className="text-gray-400 font-mono mt-1">{demoNarrative.emaText} + {demoNarrative.smaText} + {demoNarrative.macdText}. Momentum 5D: {demoStats.momentum5d}%.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-tv-yellow/20 text-tv-yellow flex items-center justify-center font-bold">3</div>
                  <div>
                    <h4 className="text-lg font-bold text-white">Ruang Koreksi Masih Terbuka</h4>
                    <p className="text-gray-400 font-mono mt-1">RSI {demoNarrative.rsiOversold ? 'sudah oversold' : 'belum oversold'}, Foreign Flow & Akumulasi/Distribusi netral = belum ada sinyal reversal yang sah.</p>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-tv-card border-l-4 border-tv-red rounded-r-xl">
                  <h4 className="font-bold text-white flex items-center gap-2"><TrendingDown className="w-5 h-5 text-tv-red"/> Hasil Prediksi Algo</h4>
                  <p className="text-tv-red font-mono mt-2 font-bold">{demoStats.drawdownPct}% floating loss jika beli di harga tertinggi 60 hari terakhir ({formatIDR(demoStats.recentHigh)}) dan tetap hold sampai sekarang ({formatIDR(demoStats.price)}).</p>
                </div>
              </div>

              <div className="relative rounded-xl overflow-hidden border border-tv-border shadow-2xl aspect-[4/3]">
                 <DashboardMock symbol={demoSymbol} price={demoStats.price} changePct={demoChangePct} score={demoStats.score} chips={demoChips} compact />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5 - PRICING */}
        <section id="pricing" className="mb-32">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">Pilih Level Trading Kamu</h2>
            <p className="text-gray-400 font-mono">Mulai gratis, upgrade saat butuh data institutional.</p>
          </div>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center mb-16">
            <div className="inline-flex items-center bg-tv-card border border-tv-border rounded-full p-1">
              <button
                onClick={() => setBilling('monthly')}
                className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${billing === 'monthly' ? 'bg-[#14b8a6] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Bulanan
              </button>
              <button
                onClick={() => setBilling('yearly')}
                className={`px-5 py-2 rounded-full text-sm font-bold transition-colors flex items-center gap-2 ${billing === 'yearly' ? 'bg-[#14b8a6] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Tahunan
                <span className="bg-tv-yellow/20 text-tv-yellow text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide">Hemat 2 bulan</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
            {/* Free */}
            <div className="bg-tv-card border border-gray-800 rounded-2xl p-8 flex flex-col">
              <h3 className="text-xl font-bold text-white mb-2">Free</h3>
              <div className="text-3xl font-extrabold text-white mb-6">Rp 0<span className="text-sm text-gray-500 font-normal">/selamanya</span></div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-gray-500 flex-shrink-0" /> 5 analisa saham / hari</li>
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-gray-500 flex-shrink-0" /> Market Pulse (delay 15 menit)</li>
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-gray-500 flex-shrink-0" /> Technical Analyzer (3 filter)</li>
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-gray-500 flex-shrink-0" /> Watchlist 3 saham</li>
              </ul>
              <button onClick={() => router.push('/dashboard')} className="w-full py-3 rounded-lg border border-gray-600 text-white font-bold hover:bg-gray-800 transition-colors">Mulai Gratis</button>
            </div>

            {/* Pro */}
            <div className="bg-gradient-to-b from-[#131c2e] to-tv-bg border border-teal-500 rounded-2xl p-8 flex flex-col relative transform md:scale-105 shadow-[0_0_40px_rgba(20,184,166,0.25)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-tv-yellow text-black px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">Most Popular</div>
              <h3 className="text-xl font-bold text-[#14b8a6] mb-2">Pro</h3>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#14b8a6]/10 border border-[#14b8a6]/30 text-[#14b8a6] text-[11px] font-bold w-fit mb-4">
                Dipakai 34,392 trader
              </div>
              <div className="text-4xl font-extrabold text-white mb-1">Rp {formatIDR(proPrice)}<span className="text-sm text-gray-500 font-normal">{periodLabel}</span></div>
              {billing === 'yearly' && <div className="text-xs text-tv-yellow font-mono mb-5">Setara Rp {formatIDR(Math.round(proPrice / 12))}/bulan</div>}
              {billing === 'monthly' && <div className="mb-5" />}
              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex items-start gap-3 text-white font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-[#14b8a6] flex-shrink-0" /> Unlimited Technical (10 filter + Hist Accuracy)</li>
                <li className="flex items-start gap-3 text-white font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-[#14b8a6] flex-shrink-0" /> Fundamental Analyzer (PER, PBV, ROE, DDM)</li>
                <li className="flex items-start gap-3 text-white font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-[#14b8a6] flex-shrink-0" /> Bandar & Foreign Flow + Divergensi Alert (yang {demoSymbol} tadi)</li>
                <li className="flex items-start gap-3 text-white font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-[#14b8a6] flex-shrink-0" /> Breakout Radar LIVE + Market Pulse Realtime</li>
                <li className="flex items-start gap-3 text-white font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-[#14b8a6] flex-shrink-0" /> Watchlist Unlimited + Telegram Alerts (Libas Bot)</li>
                <li className="flex items-start gap-3 text-white font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-[#14b8a6] flex-shrink-0" /> Risk/Reward Calculator 1:4.33</li>
                <li className="flex items-start gap-3 text-white font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-[#14b8a6] flex-shrink-0" /> Compare Tool</li>
              </ul>
              <div className="mb-4 p-3 rounded-lg bg-tv-yellow/10 border border-tv-yellow/30 text-tv-yellow text-xs font-mono text-center">
                Hemat Rp 1,2jt/tahun vs floating loss {demoStats.drawdownPct}% kayak {demoSymbol}
              </div>
              <a
                href={waLink('Pro', `Rp${formatIDR(proPrice)}${periodLabel}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-lg bg-[#14b8a6] hover:bg-[#0d9488] text-white font-bold transition-colors shadow-lg text-center"
              >
                Upgrade ke Pro - {formatIDR(proMonthly)}
              </a>
            </div>

            {/* Institutional */}
            <div className="bg-tv-card border border-gray-800 rounded-2xl p-8 flex flex-col">
              <h3 className="text-xl font-bold text-tv-yellow mb-2">Institutional</h3>
              <div className="text-3xl font-extrabold text-white mb-1">Rp {formatIDR(instPrice)}<span className="text-sm text-gray-500 font-normal">{periodLabel}</span></div>
              {billing === 'yearly' && <div className="text-xs text-tv-yellow font-mono mb-5">Setara Rp {formatIDR(Math.round(instPrice / 12))}/bulan</div>}
              {billing === 'monthly' && <div className="mb-5" />}
              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-tv-yellow flex-shrink-0" /> Semua fitur Pro, plus:</li>
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-tv-yellow flex-shrink-0" /> AI Backtester + Strategy Builder (Return +22% vs IHSG -0.89%)</li>
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-tv-yellow flex-shrink-0" /> API Access yfinance IDX</li>
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-tv-yellow flex-shrink-0" /> Corporate Calendar + Earnings</li>
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-tv-yellow flex-shrink-0" /> Portfolio Health Check</li>
                <li className="flex items-start gap-3 text-gray-300 font-mono text-sm"><CheckCircle2 className="w-5 h-5 text-tv-yellow flex-shrink-0" /> Priority Support</li>
              </ul>
              <a
                href={waLink('Institutional', `Rp${formatIDR(instPrice)}${periodLabel}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-lg border border-tv-yellow/50 text-tv-yellow font-bold hover:bg-tv-yellow/10 transition-colors text-center"
              >
                Institutional Access
              </a>
            </div>
          </div>
        </section>

        {/* SECTION 6 - FAQ */}
        <section id="faq" className="mb-32 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">FAQ</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={item.q} className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 p-6 text-left"
                  >
                    <h4 className="font-bold text-white text-lg">{item.q}</h4>
                    <ChevronDown className={`w-5 h-5 text-[#14b8a6] flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <p className="text-gray-400 font-mono text-sm px-6 pb-6 -mt-2">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 7 - FOOTER CTA */}
        <section className="text-center py-20 border-t border-tv-border">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">Join 34,392 Dashboard Executions</h2>
          <p className="text-gray-400 font-mono mb-10 max-w-2xl mx-auto">Tinggalkan metode trading kuno. Eksekusi trade Anda berdasarkan sinyal kuantitatif, bukan emosi.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-[#14b8a6] hover:bg-[#0d9488] text-white px-10 py-4 rounded-xl font-bold text-xl transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] mb-8 flex items-center justify-center gap-2 mx-auto"
          >
            Buka Terminal Sekarang -&gt;
          </button>
          <p className="text-gray-600 text-xs font-mono uppercase tracking-widest">
            Bukan saran finansial, untuk edukasi
          </p>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="bg-black border-t border-[#14b8a6]/10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-3">
              <div className="bg-[#14b8a6]/10 p-2 rounded-lg border border-[#14b8a6]/30 text-[#14b8a6]">
                <Target className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-lg tracking-tight text-white font-mono">Saham<span className="text-[#14b8a6]">Lens</span></span>
            </div>
            <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">IDX Analytics - Pure Algo</p>
          </div>

          <div className="flex items-center gap-6 text-sm font-medium text-gray-400">
            <a href="#fitur" className="hover:text-[#14b8a6] transition-colors">Fitur</a>
            <a href="#bukti" className="hover:text-[#14b8a6] transition-colors">Social Proof</a>
            <a href="#pricing" className="hover:text-[#14b8a6] transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-[#14b8a6] transition-colors">FAQ</a>
          </div>

          <div className="flex flex-col items-center md:items-end gap-2">
            <span className="text-[11px] font-mono text-[#14b8a6] bg-[#14b8a6]/10 px-2 py-1 rounded border border-[#14b8a6]/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#14b8a6] animate-pulse" /> IDX Live Feed • yfinance .JK
            </span>
            <span className="text-xs text-gray-600 font-mono">© 2026 SahamLens • Pure Algo</span>
          </div>
        </div>
        <div className="border-t border-[#14b8a6]/10 py-4 px-4 text-center">
          <p className="text-[11px] text-gray-600 font-mono">
            Disclaimer: Bukan saran finansial, untuk edukasi. Perdagangan saham mengandung risiko. Past performance 34,392 Dashboard Executions bukan jaminan.
          </p>
        </div>
      </footer>

      {/* GLOBAL STYLES FOR ANIMATIONS */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        .animate-\\[marquee_20s_linear_infinite\\] {
          animation: marquee 30s linear infinite;
        }
      `}} />
    </div>
  );
}
