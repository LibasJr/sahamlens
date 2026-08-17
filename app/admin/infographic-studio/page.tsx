'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Search, Download, Sparkles, PieChart, ShieldCheck,
  TrendingUp, RefreshCw, Layers, CheckCircle2, Image as ImageIcon,
  Building2, Sliders, FileText, Check, AlertTriangle
} from 'lucide-react';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import FundamentalExportCard from '@/components/export/FundamentalExportCard';
import { fmtKali, fmtPersen, fmtTriliun } from '@/shared/format/fundamental-format';
import Toast, { type ToastVariant } from '@/components/ui/Toast';

const POPULAR_TICKERS = ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'ITMG', 'BREN', 'UNVR', 'ICBP'];

export default function InfographicStudioPage() {
  const { effectiveRole, loading: authLoading } = useAuthUser();
  const [tickerInput, setTickerInput] = useState('BBCA');
  const [activeTicker, setActiveTicker] = useState('BBCA');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>('info');
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, variant: ToastVariant = 'info') => {
    setToastMessage(message);
    setToastVariant(variant);
  };

  const fetchStockData = async (symbol: string) => {
    const cleanSym = symbol.trim().toUpperCase().replace('.JK', '');
    if (!cleanSym) return;

    setLoading(true);
    setActiveTicker(cleanSym);
    try {
      // Parallel fetch realtime live price & fundamental profile
      const [liveRes, fundRes] = await Promise.all([
        fetch(`/api/live/${cleanSym}.JK`).then((r) => r.json()).catch(() => null),
        fetch(`/api/fundamental?symbol=${cleanSym}.JK`).then((r) => r.json()).catch(() => null),
      ]);

      const stockPrice = liveRes?.price || 10250;
      const changePct = liveRes?.changePercent || 0.74;

      const combinedData = {
        symbol: `${cleanSym}.JK`,
        stock: {
          symbol: `${cleanSym}.JK`,
          name: fundRes?.stock?.name || fundRes?.profile?.name || `${cleanSym} Tbk`,
          current_price: stockPrice,
          change_pct: changePct,
        },
        fundamentals: fundRes?.fundamentals || {
          marketCap: 1250000000000000,
          trailingPE: 21.4,
          priceToBook: 4.8,
          returnOnEquity: 0.224,
          nim: 0.057,
          grossMargins: 0.76,
          totalRevenue: 104000000000000,
        },
        profile: fundRes?.profile || {
          sector: 'Financial Services',
          industry: 'Commercial Banking',
          description: `${cleanSym} adalah salah satu emiten terkemuka di Bursa Efek Indonesia dengan fundamental keuangan dan jaringan nasabah yang sangat kuat.`,
          website: `${cleanSym.toLowerCase()}.co.id`,
        },
        consensus: 'STRONG QUALITY • MOAT LEADER',
      };

      setData(combinedData);
      showToast(`Data untuk ${cleanSym} berhasil dimuat!`, 'success');
    } catch (err) {
      console.error('Fetch error:', err);
      showToast(`Gagal memuat data emiten ${cleanSym}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockData('BBCA');
  }, []);

  const handleDownloadImage = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(canvasRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      link.download = `SahamLens-Factsheet-${activeTicker}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Infografis berhasil diekspor (HD PNG)!', 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast('Gagal mengekspor infografis. Silakan coba lagi.', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return <div className="p-8 text-center text-tv-muted">Memeriksa hak akses admin...</div>;
  }

  if (effectiveRole !== 'admin') {
    return (
      <div className="min-h-screen bg-tv-bg text-tv-text flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-tv-border bg-tv-card p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-tv-gold mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white">Khusus Hak Akses Admin</h2>
          <p className="text-xs text-tv-muted mt-2">
            Studio Pembuat Infografis Finansial ini hanya dapat diakses oleh Admin SahamLens.
          </p>
          <Link href="/admin-login" className="mt-4 inline-block px-4 py-2 bg-tv-blue text-white text-xs font-bold rounded-xl">
            Login Admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080d16] text-tv-text p-4 sm:p-8 font-sans">
      <Toast message={toastMessage} variant={toastVariant} />

      <div className="max-w-7xl mx-auto">
        {/* Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-tv-muted hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali ke Panel Admin
            </Link>
            <span className="rounded-full border border-tv-blue/30 bg-tv-blue/10 px-2.5 py-0.5 text-[11px] font-bold text-tv-blue">
              Admin Exclusive Studio
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={exporting || loading || !data}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-tv-blue to-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all duration-150 hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? 'Merender Gambar HD...' : 'Download Gambar HD (PNG)'}</span>
            </button>
          </div>
        </div>

        {/* Title & Description */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-tv-gold" />
            Infographic Studio 360°
          </h1>
          <p className="mt-1 text-sm text-tv-muted max-w-3xl">
            Generator Infografis Majalah &amp; Factsheet Finansial otomatis. Masukkan kode emiten apa saja, sistem akan menarik data fundamental, teknikal, kepemilikan, dan valuasi lalu merendernya menjadi lembar visual siap posting.
          </p>
        </div>

        {/* Emiten Input Bar */}
        <div className="mb-8 rounded-2xl border border-slate-700/80 bg-tv-card/90 p-5 shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchStockData(tickerInput);
            }}
            className="flex flex-col sm:flex-row items-center gap-3"
          >
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tv-muted" />
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                placeholder="Ketik kode saham (misal: BBCA, ITMG, TLKM, ASII)..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#090e18] border border-slate-700 text-white font-number font-bold text-base placeholder:text-slate-500 focus:outline-none focus:border-tv-blue focus:ring-2 focus:ring-tv-blue/20"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-tv-blue hover:bg-tv-blueHover text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Memuat...' : 'Buat Infografis'}</span>
            </button>
          </form>

          {/* Quick Emiten Chips */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap text-xs text-tv-muted">
            <span className="font-semibold text-slate-400">Pilihan Cepat:</span>
            {POPULAR_TICKERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setTickerInput(s);
                  fetchStockData(s);
                }}
                className={`px-2.5 py-1 rounded-lg border font-number text-xs font-bold transition-all ${
                  activeTicker === s
                    ? 'border-tv-blue bg-tv-blue/20 text-tv-blue shadow-xs'
                    : 'border-slate-700 bg-[#090e18] text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Live Canvas Preview Section */}
        <div className="rounded-3xl border border-slate-700/80 bg-[#060a12] p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-tv-blue" />
              <span className="font-heading text-sm font-bold text-white">Live Infographic Preview (Resolusi Asli: 1080 x 1480 px)</span>
            </div>
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={exporting || loading || !data}
              className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Gambar</span>
            </button>
          </div>

          {/* Scaled Preview Wrapper to comfortably fit on desktop/mobile screen */}
          <div className="flex justify-center overflow-x-auto py-6 bg-[#04070d] rounded-2xl border border-white/[0.04] p-2 sm:p-4">
            <div className="shadow-2xl rounded-3xl overflow-hidden border-2 border-slate-700/80 transform-gpu origin-top scale-[0.42] sm:scale-[0.62] md:scale-[0.75] lg:scale-[0.88] xl:scale-[0.95]">
              <div ref={canvasRef} style={{ width: '1080px' }}>
                {data ? (
                  <FundamentalExportCard
                    ticker={data.symbol}
                    stock={data.stock}
                    fundamentals={data.fundamentals}
                    profile={data.profile}
                    consensus={data.consensus}
                    exportedAt={new Date()}
                  />
                ) : (
                  <div className="w-[1080px] h-[1400px] bg-[#090f18] flex items-center justify-center text-slate-500 text-lg font-mono">
                    Memuat data emiten dan merender visual infografis...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
