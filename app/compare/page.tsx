'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Target, Activity, Search, RefreshCw, ChevronLeft, ArrowRightLeft } from 'lucide-react';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';

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
      
      if (res.status === 402 || res.status === 403 || json.code === 'SUBSCRIPTION_REQUIRED') {
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
              <Search className="w-5 h-5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 z-10" />
              <SymbolAutocomplete
                value={input1}
                onChange={(val) => setInput1(val)}
                className="bg-[#0f172a] border border-[#334155] text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-teal-500 font-mono text-center w-full sm:w-64 font-bold"
                placeholder="Symbol 1 (e.g. BBCA)"
              />
            </div>

            <div className="bg-[#1e293b] text-gray-400 font-bold font-mono px-4 py-2 rounded-lg italic">VS</div>

            <div className="relative">
              <Search className="w-5 h-5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 z-10" />
              <SymbolAutocomplete
                value={input2}
                onChange={(val) => setInput2(val)}
                className="bg-[#0f172a] border border-[#334155] text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-teal-500 font-mono text-center w-full sm:w-64 font-bold"
                placeholder="Symbol 2 (e.g. BBRI)"
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
                      <th className="py-4 px-6 text-gray-400 text-sm font-mono font-normal uppercase tracking-wider w-1/5">Metric</th>
                      <th className="py-4 px-6 text-xl text-center border-l border-[#1e293b] text-white font-bold">{data.data1.symbol}</th>
                      <th className="py-4 px-6 text-xl text-center border-l border-[#1e293b] text-white font-bold">{data.data2.symbol}</th>
                      <th className="py-4 px-6 text-teal-400 text-sm font-mono font-bold uppercase tracking-wider text-center border-l border-[#1e293b] w-1/3">Penjelasan Council AI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e293b] font-mono">
                    <tr className="hover:bg-[#1e293b]/30 transition-colors">
                      <td className="py-4 px-6 text-gray-300">Harga Terakhir</td>
                      <td className="py-4 px-6 text-center text-white font-bold border-l border-[#1e293b]">Rp {data.data1.price.toLocaleString('id-ID')}</td>
                      <td className="py-4 px-6 text-center text-white font-bold border-l border-[#1e293b]">Rp {data.data2.price.toLocaleString('id-ID')}</td>
                      <td className="py-4 px-6 text-center text-gray-500 border-l border-[#1e293b] text-xs">-</td>
                    </tr>
                    {data.rows.map((row: any) => (
                      <tr key={row.key} className="hover:bg-[#1e293b]/30 transition-colors align-top">
                        <td className="py-4 px-6 text-gray-300">{row.label}</td>
                        <td className={`py-4 px-6 text-center border-l border-[#1e293b] ${row.winner === data.data1.symbol ? 'text-teal-400 font-bold' : 'text-gray-300'}`}>{row.a}</td>
                        <td className={`py-4 px-6 text-center border-l border-[#1e293b] ${row.winner === data.data2.symbol ? 'text-teal-400 font-bold' : 'text-gray-300'}`}>{row.b}</td>
                        <td className="py-3 px-6 border-l border-[#1e293b] text-left">
                          {row.winner !== '-' && (
                            <span className="inline-block mb-1 text-teal-400 font-bold bg-teal-500/10 px-2 py-0.5 rounded text-[10px]">{row.winner} unggul</span>
                          )}
                          <p className="text-[11px] text-gray-400 font-sans leading-relaxed normal-case">{row.reason}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 bg-slate-900 border-t border-[#1e293b]">
                <h3 className="text-sm font-bold text-gray-400 font-mono mb-2">KESIMPULAN COUNCIL AI</h3>
                <p className="text-base text-white font-sans leading-relaxed">
                  {data.conclusion}
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
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 149k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE',
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
