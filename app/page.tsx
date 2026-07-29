'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
  Target, Activity, Zap, TrendingUp, TrendingDown, 
  Search, Command, CheckCircle2, ChevronDown, Play,
  Lock, ArrowRight, Star, ShieldCheck, Flame
} from 'lucide-react';
import { WA_NUMBER } from '@/lib/constants';

// --- ANIMATIONS ---
const fadeIn = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6 } };
const staggerContainer = { animate: { transition: { staggerChildren: 0.1 } } };

// --- MOCK COMPONENTS (STORY & CHARTS) ---
function VisualChartMock({ symbol, score, maStatus }: { symbol: string, score: number, maStatus: string }) {
  const isDowntrend = maStatus.includes('DOWNTREND');
  const color = isDowntrend ? '#FF3366' : '#00F090'; // genz.red / genz.green

  return (
    <div className="relative w-full h-48 bg-genz-surface rounded-2xl border border-genz-border p-4 flex flex-col justify-between overflow-hidden group">
      <div className="flex justify-between items-start z-10">
        <div>
          <h3 className="font-heading font-bold text-xl text-white">{symbol}</h3>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2 h-2 rounded-full ${isDowntrend ? 'bg-genz-red animate-pulse' : 'bg-genz-green shadow-[0_0_10px_#00F090]'}`} />
            <span className="font-mono text-xs text-genz-muted uppercase">{maStatus}</span>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full font-mono text-xs font-bold border ${isDowntrend ? 'bg-genz-red/10 border-genz-red/30 text-genz-red' : 'bg-genz-green/10 border-genz-green/30 text-genz-green'}`}>
          SCORE: {score}/100
        </div>
      </div>
      
      {/* Decorative Chart Line */}
      <svg className="absolute bottom-0 left-0 w-full h-24 z-0 opacity-50 group-hover:opacity-100 transition-opacity" preserveAspectRatio="none" viewBox="0 0 100 40">
        <path 
          d={isDowntrend ? "M0,10 Q25,15 50,25 T100,35" : "M0,35 Q25,25 50,15 T100,5"} 
          fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" 
        />
        <path 
          d={isDowntrend ? "M0,10 Q25,15 50,25 T100,35 L100,40 L0,40 Z" : "M0,35 Q25,25 50,15 T100,5 L100,40 L0,40 Z"} 
          fill={color} opacity="0.1" 
        />
      </svg>
      
      {/* Gen Z Annotation */}
      <div className="absolute top-1/2 right-4 transform -translate-y-1/2 bg-genz-base/80 backdrop-blur text-xs font-mono px-3 py-2 rounded-lg border border-genz-border z-10 shadow-glass">
        {isDowntrend ? '🚨 Fatal: Dead Cross!' : '🚀 Breakout Confirmed!'}
      </div>
    </div>
  );
}

// --- MAIN PAGE ---
export default function LandingPage() {
  const router = useRouter();
  const [marketSummary, setMarketSummary] = useState<any>(null);
  const [pulseData, setPulseData] = useState<any>(null);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Floating IHSG Ticker
  const ihsgValue = marketSummary?.summary?.find((s:any) => s.ticker === '^JKSE');
  
  useEffect(() => {
    fetch('/api/market-summary').then(r => r.json()).then(setMarketSummary).catch(console.error);
    fetch('/api/market-pulse').then(r => r.json()).then(data => { if (!data.error) setPulseData(data); }).catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-genz-base text-genz-text selection:bg-genz-lime selection:text-genz-base font-sans pb-24">
      
      {/* FLOATING NAVBAR */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl bg-genz-surface/70 backdrop-blur-xl border border-genz-border/50 rounded-full px-6 py-3 flex items-center justify-between z-50 shadow-glass">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-genz-lime flex items-center justify-center text-genz-base font-bold shadow-neo-lime">
            <Activity size={18} />
          </div>
          <span className="font-heading font-bold text-lg hidden sm:block">SahamLens</span>
        </div>
        
        {/* Live IHSG Ticker */}
        {ihsgValue && (
          <div className="flex items-center gap-2 bg-genz-base px-4 py-1.5 rounded-full border border-genz-border text-xs font-mono hidden md:flex">
            <span className="text-genz-muted">IHSG</span>
            <span className="font-bold">{ihsgValue.price.toLocaleString('id-ID')}</span>
            <span className={ihsgValue.change >= 0 ? 'text-genz-green' : 'text-genz-red'}>
              {ihsgValue.change >= 0 ? '+' : ''}{ihsgValue.change}%
            </span>
            <div className="w-1.5 h-1.5 bg-genz-green rounded-full animate-pulse ml-2" />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/login')} className="text-sm font-semibold hover:text-genz-lime transition-colors">Log In</button>
          <button onClick={() => router.push('/signup')} className="bg-genz-purple hover:bg-genz-purpleHover text-white text-sm font-bold px-5 py-2 rounded-full shadow-neo transition-all active:translate-y-1 active:shadow-none">
            Get Pro
          </button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main className="pt-32 px-6 max-w-6xl mx-auto flex flex-col items-center text-center">
        <motion.div initial="initial" animate="animate" variants={staggerContainer} className="max-w-3xl flex flex-col items-center">
          <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-genz-surface border border-genz-border text-xs font-mono mb-6 text-genz-lime">
            <Flame size={14} /> 10 Pure Math Filters • No Opinion • Just Data
          </motion.div>
          
          <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-heading font-extrabold tracking-tight leading-[1.1] mb-6">
            Stop FOMO. <br/>
            Start <span className="text-transparent bg-clip-text bg-gradient-to-r from-genz-lime to-genz-green">Winning.</span>
          </motion.h1>
          
          <motion.p variants={fadeIn} className="text-genz-muted text-lg md:text-xl mb-10 max-w-xl">
            Screener institusional yang disederhanakan untuk Gen Z. Ketahui kapan Bandar beli dan kapan harga siap Breakout.
          </motion.p>

          {/* COMMAND PALETTE SEARCH */}
          <motion.div variants={fadeIn} className="w-full max-w-md relative group">
            <div className="absolute inset-0 bg-genz-lime/20 blur-xl rounded-full group-hover:bg-genz-lime/30 transition-all" />
            <div className="relative flex items-center bg-genz-surface border-2 border-genz-border hover:border-genz-lime/50 rounded-full px-4 py-2 transition-all">
              <Search className="text-genz-muted w-5 h-5 mr-3" />
              <input 
                type="text" 
                placeholder="Cari emiten... (cth: BBCA)" 
                className="bg-transparent border-none outline-none flex-1 text-white font-mono placeholder:text-genz-muted/50 py-2"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if(e.key === 'Enter' && searchQuery) router.push(`/dashboard?symbol=${searchQuery.toUpperCase()}`);
                }}
              />
              <div className="hidden sm:flex items-center gap-1 bg-genz-base px-2 py-1 rounded border border-genz-border text-xs font-mono text-genz-muted">
                <Command size={12}/> K
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* BENTO GRID PREVIEW */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* Visual Storytelling Card */}
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{delay:0.3}} className="md:col-span-2 bg-genz-surface border border-genz-border p-6 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-glow-purple pointer-events-none" />
            <h3 className="font-heading font-bold text-2xl mb-2">Visual Storytelling</h3>
            <p className="text-genz-muted text-sm mb-6">Pahami teknikal tanpa bahasa alien. Merah = Jangan disentuh.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <VisualChartMock symbol="BMRI" score={24} maStatus="DOWNTREND FATAL" />
              <VisualChartMock symbol="BREN" score={85} maStatus="UPTREND STRONG" />
            </div>
          </motion.div>

          {/* Gamification Card */}
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{delay:0.4}} className="bg-genz-surface border border-genz-border p-6 rounded-3xl flex flex-col justify-between relative overflow-hidden">
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-glow-lime pointer-events-none" />
            <div>
              <h3 className="font-heading font-bold text-2xl mb-2">Level Up</h3>
              <p className="text-genz-muted text-sm">Mainkan market layaknya game.</p>
            </div>
            
            <div className="mt-6 space-y-3">
              <div className="bg-genz-base p-3 rounded-xl border border-genz-border flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center"><Star size={20}/></div>
                <div>
                  <div className="text-xs font-mono text-genz-muted">RANK</div>
                  <div className="font-bold">Whale Hunter</div>
                </div>
              </div>
              <div className="bg-genz-base p-3 rounded-xl border border-genz-border flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-genz-purple/20 text-genz-purple flex items-center justify-center"><Target size={20}/></div>
                <div>
                  <div className="text-xs font-mono text-genz-muted">STREAK</div>
                  <div className="font-bold">14 Hari Cuan</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* PRICING */}
        <div className="mt-32 w-full max-w-4xl text-center">
          <h2 className="font-heading font-bold text-4xl mb-4">Invest in Your Edge</h2>
          <p className="text-genz-muted mb-10">Pilih senjata andalanmu. Stop donasi ke market.</p>
          
          <div className="flex justify-center items-center gap-4 mb-8 bg-genz-surface p-1.5 rounded-full inline-flex border border-genz-border">
            <button onClick={() => setBilling('monthly')} className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${billing === 'monthly' ? 'bg-genz-base text-white shadow' : 'text-genz-muted hover:text-white'}`}>Bulanan</button>
            <button onClick={() => setBilling('yearly')} className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${billing === 'yearly' ? 'bg-genz-base text-white shadow' : 'text-genz-muted hover:text-white'}`}>Tahunan <span className="text-genz-lime text-xs ml-1">-20%</span></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
            {/* Free */}
            <div className="bg-genz-surface border border-genz-border p-8 rounded-3xl flex flex-col">
              <h3 className="text-2xl font-bold font-heading mb-2">Newbie</h3>
              <p className="text-genz-muted text-sm mb-6">Buat kamu yang masih coba-coba.</p>
              <div className="text-4xl font-bold font-mono mb-6">Gratis</div>
              <ul className="space-y-3 mb-8 flex-1">
                {['3x Analisis Saham / Hari', 'Data Delay 15 Menit', 'Basic Technical Score'].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm"><CheckCircle2 className="text-genz-muted w-5 h-5"/> {f}</li>
                ))}
              </ul>
              <button onClick={() => router.push('/signup')} className="w-full py-3 rounded-xl border border-genz-border hover:bg-genz-border transition-colors font-bold text-sm">Mulai Gratis</button>
            </div>
            
            {/* Pro */}
            <div className="bg-genz-surface border-2 border-genz-purple p-8 rounded-3xl flex flex-col relative transform md:-translate-y-4 shadow-neo">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-genz-purple text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider">Most Popular</div>
              <h3 className="text-2xl font-bold font-heading mb-2">Pro Trader</h3>
              <p className="text-genz-muted text-sm mb-6">Unlock semua fitur rahasia bandar.</p>
              <div className="text-4xl font-bold font-mono mb-2">
                {billing === 'monthly' ? 'Rp 99k' : 'Rp 79k'}<span className="text-lg text-genz-muted">/bln</span>
              </div>
              <p className="text-xs text-genz-lime mb-6">Dipakai 34,392 trader aktif</p>
              
              <ul className="space-y-3 mb-8 flex-1">
                {['Unlimited Analisis Saham', 'Real-time Data (No Delay)', 'Bandar & Foreign Flow Detector', 'Breakout Radar (Live 15m)', 'AI Assistant Gemini', 'Telegram Alerts'].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm"><CheckCircle2 className="text-genz-lime w-5 h-5"/> {f}</li>
                ))}
              </ul>
              <button onClick={() => router.push('/signup')} className="w-full py-3 rounded-xl bg-genz-lime text-genz-base hover:bg-genz-limeHover transition-colors font-bold text-sm">Upgrade ke Pro</button>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-32 w-full max-w-2xl text-left mb-20">
          <h2 className="font-heading font-bold text-3xl mb-8 text-center">FAQ Bahasa Manusia</h2>
          <div className="space-y-4">
            {[
              { q: 'Ini aplikasi apaan sih bro?', a: 'Screener saham super pintar yang pakai 10 rumus matematika buat nentuin kapan saham mau naik atau turun. Gak ada opini, murni data.' },
              { q: 'Kalau gue awam banget gimana?', a: 'Santai. UI kita sengaja dibikin kayak main game. Merah = Jauhin. Hijau = Gass. Sesimpel itu. Ada tooltip juga buat bantu jelasin istilah alien.' },
              { q: 'Bedanya sama sekuritas biasa?', a: 'Sekuritas lu cuma ngasih tombol Buy/Sell. Kita ngasih tau **kapan** lu harus pencet tombol itu berdasarkan data bandar dan teknikal.' }
            ].map((faq, idx) => (
              <div key={idx} className="bg-genz-surface border border-genz-border rounded-2xl overflow-hidden">
                <button 
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full px-6 py-4 flex justify-between items-center text-left font-bold"
                >
                  {faq.q}
                  <ChevronDown className={`w-5 h-5 transition-transform ${activeFaq === idx ? 'rotate-180 text-genz-lime' : 'text-genz-muted'}`} />
                </button>
                <AnimatePresence>
                  {activeFaq === idx && (
                    <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden">
                      <div className="px-6 pb-4 text-genz-muted text-sm">{faq.a}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </main>
      
      {/* Mobile Bottom Nav Spacer */}
      <div className="h-16 md:hidden block" />
    </div>
  );
}
