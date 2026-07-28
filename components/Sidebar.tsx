'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Zap,
  Building2,
  ChevronRight,
} from 'lucide-react';

const MODULES = [
  {
    id: 'dashboard',
    name: 'Technical Analyzer',
    subtitle: '10 Pure Math Filters',
    bank: 'SYSTEM',
    path: '/',
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
  }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-72 bg-tv-card border-r border-tv-border flex flex-col h-screen sticky top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-tv-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-tv-green to-tv-blue flex items-center justify-center shadow-lg shadow-tv-green/20">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-wider text-white flex items-center gap-1.5">
              SahamLens <span className="text-xs px-1.5 py-0.5 rounded bg-tv-green/20 text-tv-green border border-tv-green/30">SUPER</span>
            </h1>
            <p className="text-[10px] text-tv-muted uppercase font-mono tracking-widest">
              IDX Algorithmic Suite
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
  );
}
