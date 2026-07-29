'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Target, Activity, Search, RefreshCw, ChevronLeft, ArrowRightLeft } from 'lucide-react';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';

const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');


function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialSym1 = searchParams.get('symbol1') || 'BBCA.JK';
  const initialSym2 = searchParams.get('symbol2') || 'BBRI.JK';

  const [symbol1, setSymbol1] = useState(initialSym1);
  const [symbol2, setSymbol2] = useState(initialSym2);

  const [input1, setInput1] = useState(initialSym1);
  const [input2, setInput2] = useState(initialSym2);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);

  useEffect(() => {
    fetchCompare();
  }, [symbol1, symbol2]);

  const fetchCompare = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/compare?symbol1=${symbol1}&symbol2=${symbol2}`);
      const json = await res.json();
      
      if (res.status === 429 || res.status === 403 || json.error === 'Limit analisa harian habis') {
        setUsedSymbolsToday(getUsedSymbolsToday());
        setShowPaywall(true);
        return;
      }

      if (res.ok) {
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = (e: React.FormEvent) => {
    e.preventDefault();
    setSymbol1(input1.toUpperCase());
    setSymbol2(input2.toUpperCase());
    router.push(`/compare?symbol1=${input1.toUpperCase()}&symbol2=${input2.toUpperCase()}`);
  };

  return (
    <div className="flex h-screen bg-[#0f172a]">
      {/* Sidebar removed, handled by layout */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto custom-scrollbar">
        {/* Header */}
        <header className="bg-[#131c2e] border-b border-[#1e293b] px-6 py-4 sticky top-0 z-20 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-teal-500/10 border border-teal-500/30 text-teal-400">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-xl text-white tracking-tight">Stock Compare</h1>
                <p className="text-xs text-gray-500 font-mono">Head-to-head Fundamental & Technical Analysis</p>
              </div>
            </div>
            <button onClick={() => router.push('/')} className="text-sm font-mono text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>
          </div>
        </header>

        <div className="p-6 max-w-[1200px] mx-auto w-full space-y-6">

          <form onSubmit={handleCompare} className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-6 shadow-xl flex flex-col sm:flex-row items-center gap-4 justify-center">
            <div className="relative">
              <Search className="w-5 h-5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={input1}
                onChange={(e) => setInput1(e.target.value)}
                className="bg-[#0f172a] border border-[#334155] text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-teal-500 font-mono text-center w-48 font-bold"
                placeholder="Symbol 1"
              />
            </div>

            <div className="bg-[#1e293b] text-gray-400 font-bold font-mono px-4 py-2 rounded-lg italic">VS</div>

            <div className="relative">
              <Search className="w-5 h-5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={input2}
                onChange={(e) => setInput2(e.target.value)}
                className="bg-[#0f172a] border border-[#334155] text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-teal-500 font-mono text-center w-48 font-bold"
                placeholder="Symbol 2"
              />
            </div>

            <button type="submit" disabled={loading} className="bg-teal-500 hover:bg-teal-400 text-[#0f172a] font-bold font-mono px-6 py-3 rounded-lg transition-colors flex items-center gap-2">
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Target className="w-5 h-5" />}
              BANDINGKAN
            </button>
          </form>

          {loading ? (
            <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl h-64 flex items-center justify-center shadow-xl">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-teal-500 animate-spin" />
                <span className="text-sm font-mono text-gray-500">Menganalisis dua saham...</span>
              </div>
            </div>
          ) : data ? (
            <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl shadow-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/80 border-b border-[#1e293b]">
                      <th className="py-4 px-6 text-gray-400 text-sm font-mono font-normal uppercase tracking-wider w-1/4">Metric</th>
                      <th className="py-4 px-6 text-xl text-center border-l border-[#1e293b] text-white font-bold">{data.data1.symbol}</th>
                      <th className="py-4 px-6 text-xl text-center border-l border-[#1e293b] text-white font-bold">{data.data2.symbol}</th>
                      <th className="py-4 px-6 text-teal-400 text-sm font-mono font-bold uppercase tracking-wider text-center border-l border-[#1e293b]">Winner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e293b] font-mono">
                    <tr className="hover:bg-[#1e293b]/30 transition-colors">
                      <td className="py-4 px-6 text-gray-300">Harga Terakhir</td>
                      <td className="py-4 px-6 text-center text-white font-bold border-l border-[#1e293b]">Rp {data.data1.price.toLocaleString()}</td>
                      <td className="py-4 px-6 text-center text-white font-bold border-l border-[#1e293b]">Rp {data.data2.price.toLocaleString()}</td>
                      <td className="py-4 px-6 text-center text-gray-500 border-l border-[#1e293b]">-</td>
                    </tr>
                    <tr className="hover:bg-[#1e293b]/30 transition-colors">
                      <td className="py-4 px-6 text-gray-300">SahamLens Score</td>
                      <td className="py-4 px-6 text-center border-l border-[#1e293b]">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${data.data1.score > 60 ? 'bg-teal-500/20 text-teal-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {data.data1.score} {data.data1.score > 60 ? 'BUY' : 'HOLD'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center border-l border-[#1e293b]">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${data.data2.score > 60 ? 'bg-teal-500/20 text-teal-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {data.data2.score} {data.data2.score > 60 ? 'BUY' : 'HOLD'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center border-l border-[#1e293b]">
                        <span className="text-teal-400 font-bold bg-teal-500/10 px-3 py-1 rounded">{data.winners.score}</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#1e293b]/30 transition-colors">
                      <td className="py-4 px-6 text-gray-300">MA Status</td>
                      <td className="py-4 px-6 text-center text-gray-300 text-xs border-l border-[#1e293b]">{data.data1.maStatus}</td>
                      <td className="py-4 px-6 text-center text-gray-300 text-xs border-l border-[#1e293b]">{data.data2.maStatus}</td>
                      <td className="py-4 px-6 text-center border-l border-[#1e293b]">
                        <span className="text-teal-400 font-bold bg-teal-500/10 px-3 py-1 rounded">{data.winners.ma}</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#1e293b]/30 transition-colors">
                      <td className="py-4 px-6 text-gray-300">PER (Valuasi)</td>
                      <td className="py-4 px-6 text-center text-gray-300 border-l border-[#1e293b]">{data.data1.per.toFixed(1)}x</td>
                      <td className="py-4 px-6 text-center text-gray-300 border-l border-[#1e293b]">{data.data2.per.toFixed(1)}x</td>
                      <td className="py-4 px-6 text-center border-l border-[#1e293b]">
                        <span className="text-teal-400 font-bold bg-teal-500/10 px-3 py-1 rounded">{data.winners.per}</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#1e293b]/30 transition-colors">
                      <td className="py-4 px-6 text-gray-300">PBV</td>
                      <td className="py-4 px-6 text-center text-gray-300 border-l border-[#1e293b]">{data.data1.pbv.toFixed(2)}x</td>
                      <td className="py-4 px-6 text-center text-gray-300 border-l border-[#1e293b]">{data.data2.pbv.toFixed(2)}x</td>
                      <td className="py-4 px-6 text-center border-l border-[#1e293b]">
                        <span className="text-teal-400 font-bold bg-teal-500/10 px-3 py-1 rounded">{data.winners.pbv}</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#1e293b]/30 transition-colors">
                      <td className="py-4 px-6 text-gray-300">Foreign 20D</td>
                      <td className={`py-4 px-6 text-center font-bold border-l border-[#1e293b] ${data.data1.foreignNet > 0 ? 'text-teal-400' : 'text-red-400'}`}>
                        {data.data1.foreignNet > 0 ? '+' : ''}{data.data1.foreignNet}M
                      </td>
                      <td className={`py-4 px-6 text-center font-bold border-l border-[#1e293b] ${data.data2.foreignNet > 0 ? 'text-teal-400' : 'text-red-400'}`}>
                        {data.data2.foreignNet > 0 ? '+' : ''}{data.data2.foreignNet}M
                      </td>
                      <td className="py-4 px-6 text-center border-l border-[#1e293b]">
                        <span className="text-teal-400 font-bold bg-teal-500/10 px-3 py-1 rounded">{data.winners.foreign}</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#1e293b]/30 transition-colors">
                      <td className="py-4 px-6 text-gray-300">Risk/Reward</td>
                      <td className="py-4 px-6 text-center text-gray-300 text-xs border-l border-[#1e293b]">{data.data1.rr}</td>
                      <td className="py-4 px-6 text-center text-gray-300 text-xs border-l border-[#1e293b]">{data.data2.rr}</td>
                      <td className="py-4 px-6 text-center border-l border-[#1e293b]">
                        <span className="text-teal-400 font-bold bg-teal-500/10 px-3 py-1 rounded">{data.winners.rr}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-6 bg-slate-900 border-t border-[#1e293b]">
                <h3 className="text-sm font-bold text-gray-400 font-mono mb-2">KESIMPULAN AI</h3>
                <p className="text-lg text-white font-serif leading-relaxed">
                  "{data.conclusion}"
                </p>
              </div>
            </div>
          ) : null}

        </div>
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0f172a; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}} />
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 149k/bulan untuk unlimited 10 filters + Breakout Radar LIVE.`}
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'Breakout Radar LIVE',
          'Fundamental Analyzer + Watchlist unlimited',
        ]}
        waText="Halo, saya mau upgrade ke SahamLens Pro (Rp149.000/bulan) - kena limit analisa harian"
        ctaLabel="Upgrade Pro"
        secondaryLabel="Tunggu Besok"
      />
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompareContent />
    </Suspense>
  );
}
