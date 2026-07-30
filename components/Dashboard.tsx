'use client';

import React from 'react';
import { 
  ArrowUpRight, ArrowDownRight, Activity, TrendingUp, 
  TrendingDown, DollarSign, BarChart2, Globe 
} from 'lucide-react';

// Mock Data untuk Ringkasan Pasar
const mockIHSG = { price: 7350.25, change: 0.45, status: 'OPEN' };
const mockCards = {
  topGainer: [{ symbol: 'CUAN', change: 24.5 }, { symbol: 'PREN', change: 15.2 }],
  topLoser: [{ symbol: 'GOTO', change: -6.5 }, { symbol: 'BUKA', change: -4.2 }],
  topValue: [{ symbol: 'BBCA', value: '1.2T' }, { symbol: 'BMRI', value: '980M' }],
  topVolume: [{ symbol: 'GOTO', volume: '15.4M' }, { symbol: 'BIPI', volume: '8.2M' }],
  topFreq: [{ symbol: 'AWAN', freq: '45K' }, { symbol: 'CUAN', freq: '42K' }],
  netForeignBuy: [{ symbol: 'BBRI', value: '450M' }, { symbol: 'BREN', value: '320M' }],
  netForeignSell: [{ symbol: 'TLKM', value: '150M' }, { symbol: 'ASII', value: '120M' }]
};

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-[#0A1931] text-gray-100 font-sans p-4 md:p-8 selection:bg-[#3A86FF] selection:text-white">
      {/* 1. HEADER IHSG LIVE */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-[#1E293B]">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Ringkasan Pasar</h1>
          <p className="text-gray-400 text-sm">Pantauan metrik utama secara real-time dan objektif.</p>
        </div>
        <div className="mt-6 md:mt-0 flex items-center gap-4 bg-[#1E293B] px-6 py-4 rounded-2xl border border-gray-700/50 shadow-lg">
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">IHSG (Live)</span>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold">{mockIHSG.price.toLocaleString('id-ID')}</span>
              <span className={`flex items-center text-sm font-semibold px-2 py-0.5 rounded-full ${mockIHSG.change >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {mockIHSG.change >= 0 ? <ArrowUpRight size={16} className="mr-1"/> : <ArrowDownRight size={16} className="mr-1"/>}
                {mockIHSG.change}%
              </span>
            </div>
          </div>
          <div className="w-px h-10 bg-gray-700 mx-2"></div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-green-400">MARKET {mockIHSG.status}</span>
          </div>
        </div>
      </header>

      {/* 2. FEATURED CHART CARD (BBCA.JK) */}
      <section className="mb-10">
        <div className="bg-[#1E293B] rounded-3xl p-6 md:p-8 border border-gray-700/50 shadow-xl relative overflow-hidden group">
          {/* Subtle Glow */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#3A86FF]/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 relative z-10">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-white">BBCA.JK</h2>
                <span className="bg-[#3A86FF]/20 text-[#3A86FF] text-xs font-bold px-3 py-1 rounded-full border border-[#3A86FF]/30">Uptrend Terkonfirmasi</span>
              </div>
              <p className="text-gray-400 text-sm">PT Bank Central Asia Tbk • Analisis Pergerakan Harga (Intraday)</p>
            </div>
            <div className="mt-4 md:mt-0 text-left md:text-right">
              <div className="text-3xl font-bold text-white">Rp 10.050</div>
              <div className="text-green-400 text-sm font-semibold flex items-center md:justify-end mt-1">
                <ArrowUpRight size={16} className="mr-1"/> +1.5%
              </div>
            </div>
          </div>

          {/* SVG Canvas Mock Chart */}
          <div className="w-full h-64 md:h-80 relative z-10 bg-[#0A1931]/50 rounded-2xl border border-gray-700/30 p-4">
            <svg viewBox="0 0 800 300" className="w-full h-full overflow-visible" preserveAspectRatio="none">
              {/* Grid Lines */}
              <line x1="0" y1="75" x2="800" y2="75" stroke="#2C3A5A" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="0" y1="150" x2="800" y2="150" stroke="#2C3A5A" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="0" y1="225" x2="800" y2="225" stroke="#2C3A5A" strokeWidth="1" strokeDasharray="4 4" />
              
              {/* Price Line (Accent Blue) */}
              <path d="M0,280 C100,260 200,240 300,190 C500,100 650,80 800,40" fill="none" stroke="#3A86FF" strokeWidth="3" strokeLinecap="round" className="drop-shadow-[0_0_8px_rgba(58,134,255,0.5)]" />
              <path d="M0,280 C100,260 200,240 300,190 C500,100 650,80 800,40 L800,300 L0,300 Z" fill="url(#blue-gradient)" opacity="0.15" />
              
              {/* MA20 Line (Green) */}
              <path d="M0,290 L100,270 L200,250 L300,210 L500,130 L650,110 L800,70" fill="none" stroke="#10B981" strokeWidth="2" strokeDasharray="6 6" />
              
              {/* MA50 Line (Gold) */}
              <path d="M0,300 L100,290 L200,270 L300,240 L500,180 L650,150 L800,110" fill="none" stroke="#D4AF37" strokeWidth="2" strokeDasharray="2 4" />

              {/* Signals */}
              <g transform="translate(650, 80)">
                <circle cx="0" cy="0" r="6" fill="#3A86FF" className="animate-pulse"/>
                <text x="-10" y="-15" fill="#F3F4F6" fontSize="14" fontWeight="bold" className="font-sans" textAnchor="end">Momentum Breakout</text>
              </g>

              <defs>
                <linearGradient id="blue-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3A86FF" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
            </svg>
            
            {/* Legend */}
            <div className="absolute bottom-4 left-6 flex gap-6 text-xs font-semibold text-gray-400">
              <span className="flex items-center gap-2"><div className="w-3 h-3 bg-[#3A86FF] rounded-full shadow-[0_0_8px_#3A86FF]"></div> Harga Saat Ini</span>
              <span className="flex items-center gap-2"><div className="w-3 h-3 bg-[#10B981] rounded-full"></div> MA20</span>
              <span className="flex items-center gap-2"><div className="w-3 h-3 bg-[#D4AF37] rounded-full"></div> MA50</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. GRID 7 KARTU DATA HARI INI */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Activity className="text-[#3A86FF]"/> Pergerakan Pasar Terkini
        </h3>
        <span className="text-xs text-gray-500 font-mono">Real-time Data Update</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        
        {/* Top Gainer */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-gray-700/50 hover:border-[#3A86FF]/50 transition-colors">
          <div className="flex items-center gap-3 mb-5 text-gray-300">
            <div className="p-2 bg-green-500/10 rounded-lg text-green-400"><TrendingUp size={20}/></div>
            <h4 className="font-semibold text-sm">Peringkat Keuntungan Tertinggi (Top Gainer)</h4>
          </div>
          <div className="space-y-4">
            {mockCards.topGainer.map(s => (
              <div key={s.symbol} className="flex justify-between items-center border-b border-gray-700/30 pb-2 last:border-0 last:pb-0">
                <span className="font-bold text-white">{s.symbol}</span>
                <span className="text-green-400 text-sm font-semibold">+{s.change}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Loser */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-gray-700/50 hover:border-[#3A86FF]/50 transition-colors">
          <div className="flex items-center gap-3 mb-5 text-gray-300">
            <div className="p-2 bg-red-500/10 rounded-lg text-red-400"><TrendingDown size={20}/></div>
            <h4 className="font-semibold text-sm">Penurunan Terdalam (Top Loser)</h4>
          </div>
          <div className="space-y-4">
            {mockCards.topLoser.map(s => (
              <div key={s.symbol} className="flex justify-between items-center border-b border-gray-700/30 pb-2 last:border-0 last:pb-0">
                <span className="font-bold text-white">{s.symbol}</span>
                <span className="text-red-400 text-sm font-semibold">{s.change}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Value */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-gray-700/50 hover:border-[#3A86FF]/50 transition-colors">
          <div className="flex items-center gap-3 mb-5 text-gray-300">
            <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-400"><DollarSign size={20}/></div>
            <h4 className="font-semibold text-sm">Nilai Transaksi Tertinggi (Top Value)</h4>
          </div>
          <div className="space-y-4">
            {mockCards.topValue.map(s => (
              <div key={s.symbol} className="flex justify-between items-center border-b border-gray-700/30 pb-2 last:border-0 last:pb-0">
                <span className="font-bold text-white">{s.symbol}</span>
                <span className="text-gray-300 text-sm font-mono">Rp {s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Volume */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-gray-700/50 hover:border-[#3A86FF]/50 transition-colors">
          <div className="flex items-center gap-3 mb-5 text-gray-300">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><BarChart2 size={20}/></div>
            <h4 className="font-semibold text-sm">Volume Tertinggi (Top Volume)</h4>
          </div>
          <div className="space-y-4">
            {mockCards.topVolume.map(s => (
              <div key={s.symbol} className="flex justify-between items-center border-b border-gray-700/30 pb-2 last:border-0 last:pb-0">
                <span className="font-bold text-white">{s.symbol}</span>
                <span className="text-gray-300 text-sm font-mono">{s.volume} Lot</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Frekuensi */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-gray-700/50 hover:border-[#3A86FF]/50 transition-colors">
          <div className="flex items-center gap-3 mb-5 text-gray-300">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400"><Activity size={20}/></div>
            <h4 className="font-semibold text-sm">Frekuensi Tertinggi (Top Frequency)</h4>
          </div>
          <div className="space-y-4">
            {mockCards.topFreq.map(s => (
              <div key={s.symbol} className="flex justify-between items-center border-b border-gray-700/30 pb-2 last:border-0 last:pb-0">
                <span className="font-bold text-white">{s.symbol}</span>
                <span className="text-gray-300 text-sm font-mono">{s.freq}x</span>
              </div>
            ))}
          </div>
        </div>

        {/* Net Foreign Buy */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-gray-700/50 hover:border-[#3A86FF]/50 transition-colors">
          <div className="flex items-center gap-3 mb-5 text-gray-300">
            <div className="p-2 bg-green-500/10 rounded-lg text-green-400"><Globe size={20}/></div>
            <h4 className="font-semibold text-sm">Akumulasi Asing (Net Foreign Buy)</h4>
          </div>
          <div className="space-y-4">
            {mockCards.netForeignBuy.map(s => (
              <div key={s.symbol} className="flex justify-between items-center border-b border-gray-700/30 pb-2 last:border-0 last:pb-0">
                <span className="font-bold text-white">{s.symbol}</span>
                <span className="text-green-400 text-sm font-mono">+ Rp {s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Net Foreign Sell */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-gray-700/50 hover:border-[#3A86FF]/50 transition-colors xl:col-span-2">
          <div className="flex items-center gap-3 mb-5 text-gray-300">
            <div className="p-2 bg-red-500/10 rounded-lg text-red-400"><Globe size={20}/></div>
            <h4 className="font-semibold text-sm">Distribusi Asing (Net Foreign Sell)</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            <div className="space-y-4">
              {mockCards.netForeignSell.map(s => (
                <div key={s.symbol} className="flex justify-between items-center border-b border-gray-700/30 pb-2 last:border-0 last:pb-0">
                  <span className="font-bold text-white">{s.symbol}</span>
                  <span className="text-red-400 text-sm font-mono">- Rp {s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
