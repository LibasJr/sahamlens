'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Search, Download, Sparkles, PieChart, ShieldCheck,
  TrendingUp, RefreshCw, Layers, CheckCircle2, Image as ImageIcon,
  Building2, Sliders, FileText, Check, AlertTriangle, ChevronDown,
  LineChart, Landmark, ZoomIn, ZoomOut, Maximize2, Zap, Dices, Palette
} from 'lucide-react';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import TechnicalExportCard3D from '@/components/export/TechnicalExportCard3D';
import FundamentalMoatEarningsExportCard3D from '@/components/export/FundamentalMoatEarningsExportCard3D';
import {
  Card3DTheme,
  CARD_3D_THEMES,
  THEME_KEYS,
  getSector3DTheme,
  getRandomTheme,
  getThemeById,
} from '@/components/export/card-3d-themes';
import { buildMoatProxy } from '@/modules/fundamental/service/moat-proxy.service';
import { buildTechnicalSuite } from '@/lib/technical/technical-levels';
import { getKategoriPresentationLabel, getKategoriTone } from '@/shared/presentation/signal-labels';
import Toast, { type ToastVariant } from '@/components/ui/Toast';
import { TICKERS } from '@/lib/tickers';

type StudioCardMode = 'technical' | 'fundamental_moat_earnings';

const POPULAR_TICKERS = ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'ITMG', 'BREN', 'UNVR', 'ICBP'];

export default function InfographicStudioPage() {
  const { effectiveRole, loading: authLoading } = useAuthUser();
  const [tickerInput, setTickerInput] = useState('BBCA');
  const [activeTicker, setActiveTicker] = useState('BBCA');
  const [cardMode, setCardMode] = useState<StudioCardMode>('technical');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('auto'); // 'auto' | themeId
  const [zoomScale, setZoomScale] = useState<number>(0.75);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>('info');
  const [exporting, setExporting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, variant: ToastVariant = 'info') => {
    setToastMessage(message);
    setToastVariant(variant);
  };

  // Autocomplete Suggestions Filter
  const filteredTickers = React.useMemo(() => {
    const query = tickerInput.trim().toUpperCase();
    if (!query) return TICKERS.slice(0, 8);
    return TICKERS.filter(
      (t) =>
        t.symbol.replace('.JK', '').toUpperCase().includes(query) ||
        t.name.toUpperCase().includes(query)
    ).slice(0, 10);
  }, [tickerInput]);

  const selectTicker = (symbol: string) => {
    const cleanSym = symbol.replace('.JK', '').toUpperCase();
    setTickerInput(cleanSym);
    setIsDropdownOpen(false);
    fetchStockData(cleanSym);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const fetchStockData = async (symbol: string) => {
    const rawUpper = symbol.trim().toUpperCase();
    const isIhsg = rawUpper === 'IHSG' || rawUpper === '^JKSE' || rawUpper === 'JKSE' || rawUpper.includes('JKSE');
    const cleanSym = isIhsg ? 'IHSG' : rawUpper.replace('.JK', '');
    if (!cleanSym) return;

    setLoading(true);
    setActiveTicker(cleanSym);
    try {
      const apiTicker = isIhsg ? '^JKSE' : `${cleanSym}.JK`;
      const displaySymbol = isIhsg ? 'IHSG' : `${cleanSym}.JK`;

      // Parallel fetch payload technical, fundamental, earnings, intrinsic & ownership
      const [stockRes, fundRes, earningsRes, intrinsicRes, ownershipRes] = await Promise.all([
        fetch(`/api/stock/${encodeURIComponent(apiTicker)}`).then((r) => r.json()).catch(() => null),
        isIhsg ? null : fetch(`/api/fundamental/${cleanSym}.JK`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        isIhsg ? null : fetch(`/api/earnings/${cleanSym}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        isIhsg ? null : fetch(`/api/intrinsic/${cleanSym}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        isIhsg ? null : fetch(`/api/ownership-flow/${cleanSym}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      const stockPrice = stockRes?.price ?? fundRes?.stock?.current_price ?? null;
      const changePct = stockRes?.stock?.change_pct ?? fundRes?.stock?.change_pct ?? null;
      const stockVolume = stockRes?.stock?.volume ?? fundRes?.stock?.volume ?? null;

      // Extract raw analyzers
      const techAnalyzers = stockRes?.analyzers || [];
      const fundAnalyzers = fundRes?.analyzers || [];

      // Calculate Technical Suite (Pivots, 52W range, Timeframe trends, Trading plan)
      const candleHistory = stockRes?.stock?.history || [];
      const technicalSuite = candleHistory.length >= 5 ? buildTechnicalSuite(candleHistory) : null;

      // Calculate Moat proxy dynamically from fundamental analyzers
      const calculatedMoat = fundAnalyzers.length > 0 ? buildMoatProxy(fundAnalyzers) : null;

      // Technical scoring (snake_case + camelCase fallback)
      const totalScore = typeof stockRes?.scoring?.total_score === 'number'
        ? stockRes.scoring.total_score
        : (typeof stockRes?.scoring?.totalScore === 'number' ? stockRes.scoring.totalScore : null);

      const technicalScore = typeof stockRes?.scoring?.technical_score === 'number'
        ? stockRes.scoring.technical_score
        : (typeof stockRes?.scoring?.technicalScore === 'number' ? stockRes.scoring.technicalScore : null);

      const flowScore = typeof stockRes?.scoring?.flow_score === 'number'
        ? stockRes.scoring.flow_score
        : (typeof stockRes?.scoring?.flowScore === 'number' ? stockRes.scoring.flowScore : null);

      const fundamentalScore = typeof stockRes?.scoring?.fundamental_score === 'number'
        ? stockRes.scoring.fundamental_score
        : (typeof stockRes?.scoring?.fundamentalScore === 'number' ? stockRes.scoring.fundamentalScore : (typeof fundRes?.scoring?.totalScore === 'number' ? fundRes.scoring.totalScore : null));

      // Consensus & Voting
      const consensusObj = stockRes?.consensusData || (typeof stockRes?.consensus === 'object' ? stockRes?.consensus : null);
      const rawKategori = consensusObj?.kategori || stockRes?.scoring?.kategori || (typeof stockRes?.consensus === 'string' ? stockRes.consensus : null);
      const consensusLabel = typeof rawKategori === 'string'
        ? (rawKategori.startsWith('SINYAL') ? rawKategori : getKategoriPresentationLabel(rawKategori))
        : 'DATA N/A';
      const consensusTone = typeof rawKategori === 'string' ? getKategoriTone(rawKategori) : 'neutral';

      const bullPct = typeof consensusObj?.bull_pct === 'number' ? consensusObj.bull_pct : 60;
      const bearPct = typeof consensusObj?.bear_pct === 'number' ? consensusObj.bear_pct : 15;
      const neutralPct = typeof consensusObj?.neutral_pct === 'number'
        ? consensusObj.neutral_pct
        : Math.max(0, 100 - bullPct - bearPct);

      // Flow details
      const cmfAnalyzer = techAnalyzers.find((a: any) => (a.label || '').includes('Bandarmology') || (a.label || '').includes('CMF'));
      const foreignAnalyzer = techAnalyzers.find((a: any) => (a.label || '').includes('LensFlow') || (a.label || '').includes('Asing'));

      const flowDetails = {
        cmf20: cmfAnalyzer?.raw?.cmf20 ?? null,
        netPressurePct: cmfAnalyzer?.raw?.netPressurePct ?? null,
        bandarmologyStatus: cmfAnalyzer?.decision ?? null,
        foreignFlowStatus: foreignAnalyzer?.value ?? null,
      };

      // Earnings latest quarter
      const latestQuarter = earningsRes?.quarters && earningsRes.quarters.length > 0
        ? earningsRes.quarters[earningsRes.quarters.length - 1]
        : null;

      const combinedData = {
        symbol: displaySymbol,
        stock: {
          symbol: displaySymbol,
          name: isIhsg ? 'Indeks Harga Saham Gabungan (IHSG)' : (fundRes?.stock?.name || fundRes?.profile?.name || stockRes?.stock?.name || cleanSym),
          current_price: stockPrice,
          change_pct: changePct,
          volume: stockVolume,
        },
        technical: {
          score: totalScore,
          breakdown: {
            technical: technicalScore,
            flow: flowScore,
            fundamental: fundamentalScore,
            momentum: technicalScore,
            moneyFlow: flowScore,
            risk: stockRes?.scoring?.riskScore ?? null,
          },
          consensusLabel,
          consensusTone,
          bullPct,
          bearPct,
          neutralPct,
          analyzers: techAnalyzers,
          pivots: technicalSuite?.pivots?.CLASSIC || null,
          range52w: technicalSuite?.range52w || null,
          trends: technicalSuite?.trends || [],
          tradingPlan: technicalSuite?.tradingPlan || null,
          tradeSetup: stockRes?.tradeSetup || null,
          flowDetails,
        },
        fundamental: {
          scoring: {
            totalScore: fundamentalScore ?? totalScore,
            breakdown: stockRes?.scoring?.breakdown,
          },
          fundamentals: fundRes?.fundamentals || {},
          profile: fundRes?.profile || {
            sector: stockRes?.scoring?.sector?.yahooSector || 'Financial',
            industry: stockRes?.scoring?.sector?.yahooIndustry || 'Banking',
            description: fundRes?.profile?.description || '',
            website: '',
          },
          moat: calculatedMoat,
          durability: fundRes?.moatDurability || null,
          upcomingEarnings: earningsRes?.upcoming || null,
          earningsExpectation: earningsRes?.expectation || null,
          latestEarningsQuarter: latestQuarter || null,
          valuation: {
            fairValue: intrinsicRes?.fair_value ?? null,
            mos: intrinsicRes?.mos ?? null,
            valuation: intrinsicRes?.valuation ?? null,
            method: intrinsicRes?.method ?? null,
          },
          ownership: {
            foreignPct: ownershipRes?.foreignPct ?? null,
            localPct: ownershipRes?.localPct ?? null,
            scriplessPct: ownershipRes?.scriplessPct ?? null,
            delta: ownershipRes?.delta ?? null,
            trend: ownershipRes?.trend ?? null,
            observedDate: ownershipRes?.observedDate ?? null,
          },
        },
      };

      setData(combinedData);
      showToast(`Data 360° ${cleanSym} berhasil dimuat!`, 'success');
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

  // Compute Active 3D Theme (Auto sector-based vs manual override)
  const active3DTheme: Card3DTheme = React.useMemo(() => {
    if (selectedThemeId === 'auto' || !selectedThemeId) {
      return getSector3DTheme(
        data?.fundamental?.profile?.sector,
        data?.fundamental?.profile?.industry,
        activeTicker
      );
    }
    return getThemeById(selectedThemeId);
  }, [selectedThemeId, data?.fundamental?.profile?.sector, data?.fundamental?.profile?.industry, activeTicker]);

  const handleShuffleTheme = () => {
    const random = getRandomTheme();
    setSelectedThemeId(random.id);
    showToast(`Tema 3D diacak: ${random.name}`, 'info');
  };

  const handleDownloadImage = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(canvasRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      const typeLabel = cardMode === 'technical' ? 'Technical-3D' : 'Fundamental-Moat-Earnings-3D';
      link.download = `SahamLens-${typeLabel}-${activeTicker}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      showToast(`Infografis 3D ${cardMode === 'technical' ? 'Teknikal' : 'Fundamental+Moat'} berhasil diekspor (HD PNG)!`, 'success');
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
    <div className="min-h-screen bg-[#030610] text-tv-text p-4 sm:p-8 font-sans">
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
            <span className={`rounded-full ${active3DTheme.accentBg} border ${active3DTheme.accentBorder} px-3 py-0.5 text-[11px] font-bold ${active3DTheme.accentText}`}>
              Studio 3D: {active3DTheme.sectorLabel}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={exporting || loading || !data}
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-xl transition-all duration-150 hover:brightness-110 active:scale-95 disabled:opacity-50 bg-gradient-to-r ${active3DTheme.buttonGrad} ${active3DTheme.accentShadow}`}
            >
              <Download className="w-4 h-4" />
              <span>
                {exporting
                  ? 'Merender Gambar HD 3D...'
                  : cardMode === 'technical'
                  ? 'Download PNG 3D (Teknikal)'
                  : 'Download PNG 3D (Fundamental + Moat)'}
              </span>
            </button>
          </div>
        </div>

        {/* Title & Description */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <Sparkles className={`w-7 h-7 ${active3DTheme.accentText}`} />
            Infographic Studio 360° (Sector-Adaptive 3D)
          </h1>
          <p className="mt-1 text-sm text-tv-muted max-w-3xl">
            Generator Infografis Finansial 3D dengan <b>Pewarnaan &amp; Pencahayaan Otomatis Sesuai Sektor Emiten</b> (Perbankan: Biru Safir, Tambang/Energi: Emas Solar, Teknologi: Violet Cyber, FMCG: Mawar Sampanye, dsb).
          </p>
        </div>

        {/* Emiten Input Bar with Autocomplete Dropdown */}
        <div className="mb-6 rounded-2xl border border-slate-700/80 bg-tv-card/90 p-5 shadow-sm">
          <div ref={searchContainerRef} className="relative">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setIsDropdownOpen(false);
                fetchStockData(tickerInput);
              }}
              className="flex flex-col sm:flex-row items-center gap-3"
            >
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tv-muted" />
                <input
                  type="text"
                  value={tickerInput}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setTickerInput(e.target.value.toUpperCase());
                    setIsDropdownOpen(true);
                  }}
                  placeholder="Ketik kode saham (misal: BBCA, TLKM, ITMG, ASII, BREN, UNVR)..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#060c18] border border-slate-700 text-white font-number font-bold text-base placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r ${active3DTheme.buttonGrad} hover:brightness-110 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-md shrink-0`}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Memuat Data...' : 'Generate 3D Visual'}</span>
              </button>
            </form>

            {/* Autocomplete Dropdown Suggestions */}
            {isDropdownOpen && filteredTickers.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-slate-700 bg-[#081020] shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                <div className="px-3.5 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 bg-[#050b16]">
                  Pilih Emiten ({filteredTickers.length} hasil ditemukan):
                </div>
                {filteredTickers.map((t) => {
                  const sym = t.symbol.replace('.JK', '');
                  return (
                    <button
                      key={t.symbol}
                      type="button"
                      onClick={() => selectTicker(sym)}
                      className="w-full px-4 py-2.5 text-left hover:bg-white/10 flex items-center justify-between border-b border-slate-800/60 last:border-0 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-sm text-white px-2 py-0.5 rounded-lg bg-[#111c34] border border-slate-700">
                          {sym}
                        </span>
                        <span className="text-xs text-slate-300 font-medium truncate max-w-[340px]">
                          {t.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-cyan-400">Pilih</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Emiten Chips */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap text-xs text-tv-muted">
            <span className="font-semibold text-slate-400">Pilihan Cepat:</span>
            {POPULAR_TICKERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => selectTicker(s)}
                className={`px-2.5 py-1 rounded-lg border font-number text-xs font-bold transition-all ${
                  activeTicker === s
                    ? `${active3DTheme.accentBorder} ${active3DTheme.accentBg} ${active3DTheme.accentText} shadow-xs`
                    : 'border-slate-700 bg-[#070d18] text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* =========================================================================
         * MODULAR CONTROLS: 1. OUTPUT SELECTOR + 2. TEMA 3D SEKTOR + 3. ZOOM SLIDER
         * ========================================================================= */}
        <div className="mb-6 flex flex-col gap-4 bg-gradient-to-r from-[#060e1f] to-[#0a1835] border border-slate-700/80 p-4 rounded-2xl shadow-lg">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            {/* 1. Output Card Switcher */}
            <div className="flex items-center gap-2 p-1 bg-[#030612] rounded-xl border border-slate-800 w-full lg:w-auto">
              <button
                type="button"
                onClick={() => setCardMode('technical')}
                className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-heading text-xs font-bold transition-all ${
                  cardMode === 'technical'
                    ? `bg-gradient-to-r ${active3DTheme.buttonGrad} text-white ${active3DTheme.accentShadow}`
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <LineChart className="w-4 h-4" />
                <span>1. Output Teknikal 3D</span>
              </button>

              <button
                type="button"
                onClick={() => setCardMode('fundamental_moat_earnings')}
                className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-heading text-xs font-bold transition-all ${
                  cardMode === 'fundamental_moat_earnings'
                    ? `bg-gradient-to-r ${active3DTheme.buttonGrad} text-white ${active3DTheme.accentShadow}`
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Landmark className="w-4 h-4" />
                <span>2. Fundamental + Moat + Earnings 3D</span>
              </button>
            </div>

            {/* 2. Theme Selector & Randomize Button */}
            <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
              <div className="flex items-center gap-1.5 bg-[#030612] border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
                <Palette className={`w-3.5 h-3.5 ${active3DTheme.accentText}`} />
                <span className="text-slate-400 text-[11px] hidden sm:inline">Tema 3D:</span>
                <select
                  value={selectedThemeId}
                  onChange={(e) => setSelectedThemeId(e.target.value)}
                  className="bg-transparent text-white font-mono text-xs font-bold focus:outline-none cursor-pointer"
                >
                  <option value="auto" className="bg-[#0c162c] text-white">🏛️ Sesuai Sektor Emiten (Otomatis)</option>
                  <option value="sapphire-bank" className="bg-[#0c162c] text-cyan-400">💎 Biru Safir &amp; Titanium (Banking)</option>
                  <option value="solar-mining" className="bg-[#0c162c] text-amber-400">⚡ Emas Solar Flare (Mining/Energy)</option>
                  <option value="violet-cyber" className="bg-[#0c162c] text-fuchsia-400">🔮 Violet Cyberpunk (Tech/Telco)</option>
                  <option value="rose-fmcg" className="bg-[#0c162c] text-pink-400">🌸 Mawar Sampanye (Consumer/FMCG)</option>
                  <option value="emerald-infra" className="bg-[#0c162c] text-emerald-400">🌿 Matrix Zamrud (Infra/ESG)</option>
                  <option value="luxury-gold" className="bg-[#0c162c] text-yellow-400">👑 Emas Kemewahan (Property)</option>
                  <option value="ruby-health" className="bg-[#0c162c] text-rose-400">💉 Ruby Merah (Healthcare)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleShuffleTheme}
                title="Acak Tema Warna & Pencahayaan 3D"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-colors shadow-sm"
              >
                <Dices className="w-4 h-4 text-cyan-400" />
                <span className="hidden sm:inline">Acak Tema</span>
              </button>
            </div>

            {/* 3. Zoom Control */}
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 w-full lg:w-auto justify-end">
              <span className="hidden xl:inline">Zoom:</span>
              <div className="flex items-center gap-1 bg-[#030612] border border-slate-800 rounded-lg p-1">
                {[0.5, 0.65, 0.75, 0.88, 1.0].map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    onClick={() => setZoomScale(scale)}
                    className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-colors ${
                      zoomScale === scale
                        ? `${active3DTheme.accentBg} ${active3DTheme.accentText} border ${active3DTheme.accentBorder}`
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {Math.round(scale * 100)}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Canvas Preview Section */}
        <div className="rounded-3xl border border-slate-700/80 bg-[#01040a] p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <ImageIcon className={`w-5 h-5 ${active3DTheme.accentText}`} />
              <span className="font-heading text-sm font-bold text-white">
                Live 3D Preview: {cardMode === 'technical' ? 'Laporan Teknikal & Smart Money' : 'Laporan Fundamental, Moat & Earnings'}
              </span>
              <span className="hidden md:inline text-[11px] font-mono text-slate-400">
                • Tema Sektor: <b className={active3DTheme.accentText}>{active3DTheme.name}</b>
              </span>
            </div>

            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={exporting || loading || !data}
              className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh PNG HD</span>
            </button>
          </div>

          {/* Scaled Preview Wrapper to comfortably fit on screen */}
          <div className="flex justify-center overflow-x-auto py-6 bg-[#000205] rounded-2xl border border-white/[0.04] p-2 sm:p-4">
            <div
              className="shadow-[0_20px_60px_rgba(0,0,0,0.95)] rounded-3xl overflow-hidden border-2 border-slate-700/80 transform-gpu origin-top transition-transform duration-200"
              style={{ transform: `scale(${zoomScale})` }}
            >
              <div ref={canvasRef} style={{ width: '1080px' }}>
                {data ? (
                  cardMode === 'technical' ? (
                    <TechnicalExportCard3D
                      symbol={data.symbol}
                      stockName={data.stock.name}
                      currentPrice={data.stock.current_price}
                      changePct={data.stock.change_pct}
                      volume={data.stock.volume}
                      consensusLabel={data.technical.consensusLabel}
                      consensusTone={data.technical.consensusTone}
                      score={data.technical.score}
                      scoreBreakdown={data.technical.breakdown}
                      buyPct={data.technical.bullPct}
                      sellPct={data.technical.bearPct}
                      neutralPct={data.technical.neutralPct}
                      analyzers={data.technical.analyzers}
                      pivots={data.technical.pivots}
                      range52w={data.technical.range52w}
                      trends={data.technical.trends}
                      tradingPlan={data.technical.tradingPlan}
                      tradeSetup={data.technical.tradeSetup}
                      flowDetails={data.technical.flowDetails}
                      theme={active3DTheme}
                      exportedAt={new Date()}
                    />
                  ) : (
                    <FundamentalMoatEarningsExportCard3D
                      ticker={data.symbol}
                      stock={data.stock}
                      scoring={data.fundamental.scoring}
                      fundamentals={data.fundamental.fundamentals}
                      profile={data.fundamental.profile}
                      moat={data.fundamental.moat}
                      durability={data.fundamental.durability}
                      upcomingEarnings={data.fundamental.upcomingEarnings}
                      earningsExpectation={data.fundamental.earningsExpectation}
                      latestEarningsQuarter={data.fundamental.latestEarningsQuarter}
                      valuation={data.fundamental.valuation}
                      ownership={data.fundamental.ownership}
                      theme={active3DTheme}
                      exportedAt={new Date()}
                    />
                  )
                ) : (
                  <div className="w-[1080px] h-[1420px] bg-[#030610] flex flex-col items-center justify-center text-slate-500 font-mono gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                    <span>Memuat data emiten dan merender visual 3D sektor...</span>
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
