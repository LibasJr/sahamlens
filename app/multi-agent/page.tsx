'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import PaywallModal from '@/components/PaywallModal';
import {
  Zap, 
  Target, 
  Activity, 
  BrainCircuit,
  TrendingUp,
  BarChart,
  Newspaper,
  Globe2,
  Users,
  RefreshCw,
  Clock
} from 'lucide-react';

export default function MultiAgentPage() {
  const [ticker, setTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [liveData, setLiveData] = useState<any>(null);
  const [agentData, setAgentData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED'>('CLOSED');
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const checkMarketStatus = () => {
    // Check if market is open (09:00 - 15:00 WIB)
    const now = new Date();
    // Get time in Jakarta (WIB is UTC+7)
    const wibOptions = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false } as const;
    const wibTime = now.toLocaleTimeString('en-US', wibOptions);
    
    // Parse HH:mm
    const [hourStr, minuteStr] = wibTime.split(':');
    const currentHour = parseInt(hourStr, 10);
    const currentMinute = parseInt(minuteStr, 10);
    const timeValue = currentHour * 60 + currentMinute;
    
    // 09:00 is 540, 15:00 is 900
    if (timeValue >= 540 && timeValue <= 900) {
      setMarketStatus('OPEN');
      return true;
    } else {
      setMarketStatus('CLOSED');
      return false;
    }
  };

  const fetchData = async (symbol: string) => {
    setLoading(true);
    try {
      checkMarketStatus();
      
      // Fetch live data
      const liveRes = await fetch(`/api/live/${symbol}`);
      if (liveRes.ok) {
        const liveJson = await liveRes.json();
        setLiveData(liveJson);
      }

      // Fetch AI consensus
      const agentRes = await fetch('/api/agents/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: symbol })
      });
      if (agentRes.status === 401) {
        setShowLoginPrompt(true);
        return;
      }
      if (agentRes.ok) {
        const agentJson = await agentRes.json();
        setAgentData(agentJson);
      }

      const nowWib = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
      setLastUpdated(nowWib);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(ticker);
    
    // Auto polling every 1 minute
    const interval = setInterval(() => {
      const isOpen = checkMarketStatus();
      if (isOpen) {
        fetchData(ticker);
      }
    }, 60000); // 1 minute
    
    return () => clearInterval(interval);
  }, [ticker]);

  const quant = agentData?.quant || {};
  const agents = quant.agent_breakdown || {};
  
  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen text-white">
      <Header
        currentTicker={ticker}
        onTickerChange={setTicker}
        moduleTitle="LensAI — Multi-Agent Consensus"
        moduleBank="ENSEMBLE AI"
      />

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* UI Badge & Refresh */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-tv-card border border-tv-border rounded-lg p-4 gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm font-mono text-tv-muted">
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Last Update: {lastUpdated} WIB</span>
            <span>•</span>
            <span>Yahoo Finance delayed/EOD</span>
            <span>•</span>
            <span>Auto-refresh 1m</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              Market: 
              <span className={`font-bold ${marketStatus === 'OPEN' ? 'text-tv-green' : 'text-tv-red'}`}>
                {marketStatus}
              </span> 
              (09:00-15:00 WIB)
            </span>
          </div>
          <button 
            onClick={() => fetchData(ticker)}
            disabled={loading}
            className="flex items-center gap-2 bg-tv-border hover:bg-tv-borderLight transition-colors px-4 py-2 rounded-md text-sm font-bold disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Manual
          </button>
        </div>

        {loading && !agentData ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tv-green"></div>
          </div>
        ) : (
          <>
            {/* Top Header Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-b border-tv-border pb-6">
              <div>
                <h1 className="text-3xl font-bold font-heading tracking-tight flex items-center gap-3">
                  {ticker}
                </h1>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold font-number tracking-tight">
                  {typeof liveData?.price === 'number' && Number.isFinite(liveData.price)
                    ? `Rp ${liveData.price.toLocaleString('id-ID')}`
                    : 'N/A'}
                </div>
                {typeof liveData?.changePercent === 'number' && Number.isFinite(liveData.changePercent) ? (
                  <div className={`text-lg font-number font-semibold flex items-center justify-end gap-1 ${
                    liveData.changePercent >= 0 ? 'text-tv-green' : 'text-tv-red'
                  }`}>
                    {liveData.changePercent >= 0 ? '+' : ''}{liveData.changePercent}%
                  </div>
                ) : (
                  <div className="text-lg font-number font-semibold text-tv-muted">N/A</div>
                )}
              </div>
            </div>

            {/* Master Agent Dashboard */}
            <div className="bg-tv-card border border-tv-border rounded-xl p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <BrainCircuit className="w-48 h-48" />
              </div>
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1">
                  <h2 className="text-xl text-tv-muted mb-2 font-heading uppercase">Master AI Recommendation</h2>
                  <div className="text-5xl font-bold mb-4">
                    {quant.decision || 'WAITING...'}
                  </div>
                  <p className="text-tv-text font-mono text-sm leading-relaxed max-w-2xl">
                    {quant.master_agent_summary || 'Analyzing 9 specialized AI models...'}
                  </p>
                </div>
                
                <div className="flex flex-col items-center justify-center p-8 bg-tv-bg border border-tv-borderLight rounded-full w-48 h-48">
                  {/* BUG FIX (audit 2026-08-05, temuan H-10): `quant.final_score || 0`
                      merender "0" saat skor tidak dihitung - angka yang terbaca sebagai
                      penilaian terburuk, padahal artinya "tidak dinilai". Sekarang
                      dibedakan. */}
                  <span className="text-tv-muted text-sm uppercase mb-1">Final Score</span>
                  {quant.final_score == null ? (
                    <>
                      <span className="text-2xl font-bold text-tv-muted text-center leading-tight">N/A</span>
                      <span className="text-tv-muted text-[10px] mt-1 text-center px-2">Data agen tidak tersedia</span>
                    </>
                  ) : (
                    <>
                      <span className={`text-6xl font-bold ${quant.final_score >= 60 ? 'text-tv-green' : quant.final_score <= 40 ? 'text-tv-red' : 'text-yellow-500'}`}>
                        {quant.final_score}
                      </span>
                      <span className="text-tv-muted text-xs mt-1">
                        out of 100{quant.coverage_weight_pct != null && quant.coverage_weight_pct < 90 ? ` · bobot terpakai ${quant.coverage_weight_pct}/90` : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Individual Agents */}
            <h3 className="text-lg font-bold font-heading mt-8 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-tv-green" /> 9 Specialized AI Agents Breakdown
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
              
              {/* Technical */}
              <AgentCard 
                title="Technical" icon={<TrendingUp />} color="purple"
                agent={agents.technical_agent}
              />
              
              {/* Bandar */}
              <AgentCard 
                title="Bandarmologi" icon={<Users />} color="blue"
                agent={agents.bandar_agent}
              />

              {/* Fundamental */}
              <AgentCard 
                title="Fundamental" icon={<BarChart />} color="emerald"
                agent={agents.fundamental_agent}
              />

              {/* Risk */}
              <AgentCard 
                title="Risk Mgmt" icon={<Target />} color="rose"
                agent={agents.risk_agent}
              />

              {/* News */}
              <AgentCard 
                title="News Sentiment" icon={<Newspaper />} color="yellow"
                agent={agents.news_agent}
              />

              {/* Flow */}
              <AgentCard 
                title="Money Flow" icon={<Activity />} color="cyan"
                agent={agents.flow_agent}
              />

              {/* Pattern */}
              <AgentCard 
                title="Chart Pattern" icon={<Zap />} color="orange"
                agent={agents.pattern_agent}
              />

              {/* Valuation */}
              <AgentCard 
                title="Valuation" icon={<Globe2 />} color="teal"
                agent={agents.valuation_agent}
              />

              {/* Momentum */}
              <AgentCard 
                title="Momentum" icon={<Activity />} color="pink"
                agent={agents.momentum_agent}
              />
              
            </div>
          </>
        )}
      </div>
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Konsensus AI"
        body="LensAI — Multi-Agent Consensus butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}

function AgentCard({ title, icon, color, agent }: { title: string, icon: any, color: string, agent: any }) {
  // Map simple color names to tailwind classes for the UI
  const colorMap: Record<string, { bg: string, text: string }> = {
    purple: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
    blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    rose: { bg: 'bg-rose-500/20', text: 'text-rose-400' },
    yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
    cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
    orange: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
    teal: { bg: 'bg-teal-500/20', text: 'text-teal-400' },
    pink: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
  };

  const style = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-tv-card border border-tv-border rounded-lg p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className={`p-2 rounded-md ${style.bg} ${style.text}`}>
            {React.cloneElement(icon, { className: 'w-5 h-5' })}
          </div>
          <span className="text-xs font-mono text-tv-muted bg-tv-bg px-2 py-1 rounded">
            Wt: {typeof agent?.weight_pct === 'number' && Number.isFinite(agent.weight_pct) ? `${agent.weight_pct}%` : 'N/A'}
          </span>
        </div>
        <h4 className="text-tv-text font-bold mb-1">{title}</h4>
      </div>
      <div className="mt-2">
        <div className="text-3xl font-mono mb-2">
          {typeof agent?.score === 'number' && Number.isFinite(agent.score) ? agent.score : 'N/A'}
        </div>
        <p className="text-xs text-tv-muted line-clamp-2" title={agent?.summary}>
          {agent?.summary || 'Waiting for analysis...'}
        </p>
      </div>
    </div>
  );
}
