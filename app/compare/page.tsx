'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Target, Search, RefreshCw, ArrowRightLeft, Menu } from 'lucide-react';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Button } from '@/components/ui';

const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlSym1 = searchParams.get('symbol1');
  const urlSym2 = searchParams.get('symbol2');

  // BUG FIX (2026-08-01): symbol1 sebelumnya hardcode 'BBCA.JK' dan symbol2 hardcode
  // 'BBRI.JK' apa pun ticker yang sedang dilihat user di Teknikal/Fundamental/DCF -
  // buka /compare tanpa ?symbol1= selalu jatuh ke BBCA, bukan ticker terakhir dicari.
  // Sekarang ikut pola yang sama dengan /dcf & /fundamental: ?symbol1= dulu, lalu
  // localStorage 'last_searched_ticker' (dipakai bersama lintas halaman analisa),
  // baru default BBCA kalau memang belum pernah cari apa-apa.
  const [symbol1, setSymbol1] = useState(urlSym1 || 'BBCA.JK');
  // symbol2 SENGAJA tidak di-hardcode BBRI - kalau user belum pilih simbol kedua,
  // dikosongkan supaya /api/compare yang pilihkan peer 1 sektor dengan symbol1
  // (lihat pickSameSectorPeer di app/api/compare/route.ts), bukan default bank
  // yang bisa saja beda sektor total dari symbol1.
  const [symbol2, setSymbol2] = useState(urlSym2 || '');

  const [input1, setInput1] = useState(urlSym1 || 'BBCA.JK');
  const [input2, setInput2] = useState(urlSym2 || '');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  // Effect restore-dari-localStorage (di bawah) dan effect fetch (setelahnya) sama-sama
  // jalan saat mount - fetch pertama berangkat dengan symbol1 default 'BBCA.JK' SEBELUM
  // state ke-update dari localStorage, jadi dua request keluar. Sequence number ini
  // memastikan hanya response dari request TERAKHIR yang dipakai, walau response duluan
  // (BBCA) resolve belakangan karena jitter jaringan.
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    if (!urlSym1) {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('last_searched_ticker') : null;
      if (saved) {
        setSymbol1(saved);
        setInput1(saved);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol1, symbol2]);

  const fetchCompare = async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const qs = `symbol1=${symbol1}${symbol2 ? `&symbol2=${symbol2}` : ''}`;
      const res = await fetch(`/api/compare?${qs}`);
      const json = await res.json();

      if (seq !== fetchSeqRef.current) return; // response basi, sudah ada request lebih baru

      if (res.status === 401) {
        setShowLoginPrompt(true);
        return;
      }
      if (res.status === 402 || res.status === 403 || json.code === 'SUBSCRIPTION_REQUIRED') {
        setUsedSymbolsToday(getUsedSymbolsToday());
        setShowPaywall(true);
        return;
      }

      if (res.ok) {
        setData(json);
        // symbol2 mungkin dipilihkan otomatis oleh server (peer 1 sektor) - sinkronkan
        // balik ke state/input supaya kotak kedua tidak kosong dan klik "Bandingkan"
        // berikutnya tidak diam-diam ganti peer lagi.
        if (!symbol2 && json.data2?.symbol) {
          setSymbol2(json.data2.symbol);
          setInput2(json.data2.symbol);
        }
      }
    } catch (e) {
      if (seq === fetchSeqRef.current) console.error(e);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  };

  const handleCompare = (e: React.FormEvent) => {
    e.preventDefault();
    const sym1 = input1.toUpperCase();
    const sym2 = input2.toUpperCase();
    setSymbol1(sym1);
    setSymbol2(sym2);
    if (typeof window !== 'undefined') localStorage.setItem('last_searched_ticker', sym1);
    router.push(`/compare?symbol1=${sym1}&symbol2=${sym2}`);
  };

  return (
    <div className="flex h-screen bg-tv-bg">
      {/* Sidebar removed, handled by layout */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto custom-scrollbar">
        {/* Header */}
        <header className="bg-tv-surface border-b border-tv-border px-6 py-4 sticky top-0 z-20 shadow-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
                className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="p-2 rounded-md bg-tv-blue text-white">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight">Stock Compare</h1>
                <p className="text-xs text-tv-muted">Head-to-head Fundamental & Technical Analysis</p>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 max-w-[1200px] mx-auto w-full space-y-6">

          <form onSubmit={handleCompare} className="bg-tv-card border border-tv-border rounded-lg p-6 shadow-2 flex flex-col sm:flex-row items-center gap-4 justify-center">
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <div className="relative flex-1 min-w-0 sm:flex-initial">
                <Search className="w-5 h-5 text-tv-muted absolute left-3 top-1/2 -translate-y-1/2 z-10" />
                <SymbolAutocomplete
                  value={input1}
                  onChange={(val) => setInput1(val)}
                  className="bg-tv-bg/60 border border-tv-border text-tv-text pl-10 pr-4 py-3 rounded-md focus:outline-none focus:border-tv-blue font-number text-center w-full sm:w-64 font-bold transition-colors"
                  placeholder="Symbol 1 (e.g. BBCA)"
                />
              </div>

              <div className="bg-tv-hover text-tv-muted font-bold px-3 sm:px-4 py-2 rounded-md italic shrink-0">VS</div>

              <div className="relative flex-1 min-w-0 sm:flex-initial">
                <Search className="w-5 h-5 text-tv-muted absolute left-3 top-1/2 -translate-y-1/2 z-10" />
                <SymbolAutocomplete
                  value={input2}
                  onChange={(val) => setInput2(val)}
                  className="bg-tv-bg/60 border border-tv-border text-tv-text pl-10 pr-4 py-3 rounded-md focus:outline-none focus:border-tv-blue font-number text-center w-full sm:w-64 font-bold transition-colors"
                  placeholder="Symbol 2 (e.g. BBRI)"
                />
              </div>
            </div>

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full sm:w-auto">
              {!loading && <Target className="w-5 h-5" />}
              Bandingkan
            </Button>
          </form>

          {loading ? (
            <div className="bg-tv-card border border-tv-border rounded-lg h-64 flex items-center justify-center shadow-2">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-tv-blue animate-spin" />
                <span className="text-sm text-tv-muted">Menganalisis dua saham...</span>
              </div>
            </div>
          ) : data ? (
            <div className="bg-tv-card border border-tv-border rounded-lg shadow-2 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-tv-bg border-b border-tv-border">
                      <th className="py-4 px-6 text-tv-muted text-sm font-normal uppercase tracking-wide w-1/5">Metric</th>
                      <th className="py-4 px-6 text-xl text-center border-l border-tv-border text-tv-text font-bold font-number">{data.data1.symbol}</th>
                      <th className="py-4 px-6 text-xl text-center border-l border-tv-border text-tv-text font-bold font-number">{data.data2.symbol}</th>
                      <th className="py-4 px-6 text-tv-blue text-sm font-bold uppercase tracking-wide text-center border-l border-tv-border w-1/3">Penjelasan Council AI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tv-border">
                    <tr className="hover:bg-tv-hover/30 transition-colors">
                      <td className="py-4 px-6 text-tv-muted">Harga Terakhir</td>
                      <td className="py-4 px-6 text-center text-tv-text font-bold border-l border-tv-border font-number">Rp {data.data1.price.toLocaleString('id-ID')}</td>
                      <td className="py-4 px-6 text-center text-tv-text font-bold border-l border-tv-border font-number">Rp {data.data2.price.toLocaleString('id-ID')}</td>
                      <td className="py-4 px-6 text-center text-tv-muted border-l border-tv-border text-xs">-</td>
                    </tr>
                    {data.rows.map((row: any) => (
                      <tr key={row.key} className="hover:bg-tv-hover/30 transition-colors align-top">
                        <td className="py-4 px-6 text-tv-muted">{row.label}</td>
                        <td className={`py-4 px-6 text-center border-l border-tv-border ${row.winner === data.data1.symbol ? 'text-tv-blue font-bold' : 'text-tv-text'}`}>{row.a}</td>
                        <td className={`py-4 px-6 text-center border-l border-tv-border ${row.winner === data.data2.symbol ? 'text-tv-blue font-bold' : 'text-tv-text'}`}>{row.b}</td>
                        <td className="py-3 px-6 border-l border-tv-border text-left">
                          {row.winner !== '-' && (
                            <span className="inline-block mb-1 text-tv-blue font-bold bg-tv-blue/10 px-2 py-0.5 rounded text-[10px]">{row.winner} unggul</span>
                          )}
                          <p className="text-[11px] text-tv-muted leading-relaxed">{row.reason}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 bg-tv-bg border-t border-tv-border">
                <h3 className="font-heading text-sm font-bold text-tv-muted mb-2 uppercase tracking-wide">Kesimpulan Council AI</h3>
                <p className="text-base text-tv-text leading-relaxed">
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
        .custom-scrollbar::-webkit-scrollbar-track { background: #0F141D; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2C3A5A; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3A4B75; }
      `}} />
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE',
          'Fundamental Analyzer + Watchlist unlimited',
        ]}
        secondaryLabel="Tunggu Besok"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="Compare Tool butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
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
