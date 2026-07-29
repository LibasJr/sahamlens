'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap,
  Building2,
  ChevronRight,
  Target,
  Activity,
  Bell,
  Calendar,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

const MODULES = [
  {
    id: 'home',
    name: 'Dashboard Utama',
    subtitle: 'Overview & Market',
    bank: 'HOME',
    path: '/',
    icon: Activity,
    badge: 'NEW',
    color: 'text-white',
    bgColor: 'bg-white/10'
  },
  {
    id: 'dashboard',
    name: 'Technical Analyzer',
    subtitle: '10 Pure Math Filters',
    bank: 'SYSTEM',
    path: '/dashboard',
    icon: Zap,
    badge: 'TECHNICAL',
    color: 'text-tv-yellow',
    bgColor: 'bg-tv-yellow/10'
  },
  {
    id: 'fundamental',
    name: 'Fundamental Analyzer',
    subtitle: 'Value & Health Metrics',
    bank: 'SYSTEM',
    path: '/fundamental',
    icon: Building2,
    badge: 'FUNDAMENTAL',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10'
  },
  {
    id: 'recommendations',
    name: 'Stock Recommendations',
    subtitle: 'Daily AI Consensus',
    bank: 'SYSTEM',
    path: '/recommendations',
    icon: Target,
    badge: 'SIGNALS',
    color: 'text-tv-green',
    bgColor: 'bg-tv-green/10'
  },
  {
    id: 'market-pulse',
    name: 'Market Pulse',
    subtitle: 'Index, Sector & Breadth',
    bank: 'SYSTEM',
    path: '/market-pulse',
    icon: Activity,
    badge: 'LIVE',
    color: 'text-teal-400',
    bgColor: 'bg-teal-400/10'
  },
  {
    id: 'breakout-radar',
    name: 'Breakout Radar',
    subtitle: 'Top LQ45 Momentum',
    bank: 'SYSTEM',
    path: '/breakout-radar',
    icon: Target,
    badge: 'LIVE NEW',
    color: 'text-teal-400',
    bgColor: 'bg-teal-400/10'
  },
  {
    id: 'watchlist',
    name: 'Watchlist & Alerts',
    subtitle: 'Portfolio & Telegram Bot',
    bank: 'USER',
    path: '/watchlist',
    icon: Bell,
    badge: 'ALERTS',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10'
  },
  {
    id: 'calendar',
    name: 'Corporate Calendar',
    subtitle: 'Dividen, RUPS, & Corp Action',
    bank: 'EVENTS',
    path: '/calendar',
    icon: Calendar,
    badge: 'NEW',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10'
  },
  {
    id: 'backtest',
    name: 'Strategy Builder',
    subtitle: 'Simulasi Performa Historis',
    bank: 'SYSTEM',
    path: '/backtest',
    icon: TrendingUp,
    badge: 'FINAL',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10'
  },
  {
    id: 'compare',
    name: 'Compare Tool',
    subtitle: 'Side-by-Side Analysis',
    bank: 'SYSTEM',
    path: '/compare',
    icon: Target,
    badge: 'NEW',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10'
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    const handleClose = () => setIsOpen(false);
    
    window.addEventListener('toggle-sidebar', handleToggle);
    window.addEventListener('close-sidebar', handleClose);
    return () => {
      window.removeEventListener('toggle-sidebar', handleToggle);
      window.removeEventListener('close-sidebar', handleClose);
    };
  }, []);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0F141D] border-r border-white/5 flex flex-col h-screen select-none transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl shadow-black/50' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex items-center -space-x-1">
            <div className="bg-tv-green/20 p-1.5 rounded-l-lg border border-tv-green/30">
              <TrendingUp className="w-4 h-4 text-tv-green" />
            </div>
            <div className="bg-tv-red/20 p-1.5 rounded-r-lg border border-tv-red/30">
              <TrendingDown className="w-4 h-4 text-tv-red" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-tv-green to-tv-red">
              Stock Screener
            </h1>
            <p className="text-[10px] font-medium text-white/50 uppercase tracking-widest">
              IDX Analytics
            </p>
          </div>
        </div>
      </div>

      {/* Module List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-3 py-2 text-[10px] font-mono font-semibold uppercase text-tv-muted tracking-wider">
          Main Dashboard
        </div>

        {MODULES.map((mod) => {
          const isActive = pathname === mod.path;
          const Icon = mod.icon;

          return (
            <Link
              key={mod.id}
              href={mod.path}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs relative ${
                isActive
                  ? 'bg-tv-hover border border-tv-borderLight text-white shadow-md'
                  : 'text-tv-text hover:bg-tv-hover/60 hover:text-white border border-transparent'
              }`}
            >
              {/* Active Indicator Bar */}
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-tv-green shadow-sm shadow-tv-green" />
              )}

              <div className={`p-2 rounded-md ${mod.bgColor} ${mod.color} group-hover:scale-105 transition-transform`}>
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold truncate text-[13px]">{mod.name}</span>
                  <span className={`text-[9px] font-mono px-1 rounded uppercase tracking-tighter ${
                    isActive ? 'bg-tv-green/20 text-tv-green font-bold' : 'bg-tv-bg text-tv-muted'
                  }`}>
                    {mod.badge}
                  </span>
                </div>
                <div className="text-[10px] text-tv-muted truncate font-mono">
                  {mod.bank} • {mod.subtitle}
                </div>
              </div>

              <ChevronRight className={`w-3.5 h-3.5 text-tv-muted opacity-0 group-hover:opacity-100 transition-opacity ${
                isActive ? 'opacity-100 text-tv-green' : ''
              }`} />
            </Link>
          );
        })}
      </div>

      {/* Akun Demo - Pinned at bottom before footer */}
      <div className="p-2 border-t border-tv-border/50 bg-[#0a0a0f]">
        <Link
          href="/portfolio"
          className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs relative ${
            pathname === '/portfolio'
              ? 'bg-tv-hover border border-tv-borderLight text-white shadow-md'
              : 'text-tv-text hover:bg-tv-hover/60 hover:text-white border border-transparent'
          }`}
        >
          {pathname === '/portfolio' && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-tv-yellow shadow-sm shadow-tv-yellow" />
          )}
          <div className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 group-hover:scale-105 transition-transform">
            <Target className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold truncate text-[13px]">Akun Demo</span>
              <span className={`text-[9px] font-mono px-1 rounded uppercase tracking-tighter ${
                pathname === '/portfolio' ? 'bg-tv-yellow/20 text-tv-yellow font-bold' : 'bg-tv-bg text-tv-muted'
              }`}>
                NEW
              </span>
            </div>
            <div className="text-[10px] text-tv-muted truncate font-mono">
              USER • Paper Trading & P/L
            </div>
          </div>
          <ChevronRight className={`w-3.5 h-3.5 text-tv-muted opacity-0 group-hover:opacity-100 transition-opacity ${
            pathname === '/portfolio' ? 'opacity-100 text-tv-yellow' : ''
          }`} />
        </Link>
      </div>

      {/* Institutional Legal Footer */}
      <div className="p-3 border-t border-tv-border bg-tv-bg/50">
        <div className="flex items-center justify-between text-[11px] font-mono text-tv-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-tv-green animate-pulse" />
            IDX Live Feed
          </span>
          <span className="text-[10px] text-tv-green bg-tv-green/10 px-1.5 py-0.5 rounded border border-tv-green/20">
            yfinance .JK
          </span>
        </div>
        <p className="text-[10px] text-tv-muted mt-2 text-center border-t border-tv-border/50 pt-2 font-mono">
          © 2026 SahamLens • Pure Algo
        </p>
      </div>
      </aside>
    </>
  );
}
