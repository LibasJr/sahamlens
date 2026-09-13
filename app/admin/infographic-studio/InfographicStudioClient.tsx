'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Search, Download, Sparkles, RefreshCw, Layers,
  Image as ImageIcon, AlertTriangle, LineChart, Landmark, Palette,
} from 'lucide-react';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import TechnicalResearchCard from '@/components/export/TechnicalResearchCard';
import FundamentalResearchCard from '@/components/export/FundamentalResearchCard';
import InvestmentSnapshot360Card from '@/components/export/InvestmentSnapshot360Card';
import {
  Card3DTheme,
  getSector3DTheme,
  getThemeById,
} from '@/components/export/card-3d-themes';
import { buildMoatProxy } from '@/modules/fundamental/service/moat-proxy.service';
import { buildTechnicalSuite } from '@/lib/technical/technical-levels';
import { getKategoriPresentationLabel, getKategoriTone } from '@/shared/presentation/signal-labels';
import Toast, { type ToastVariant } from '@/components/ui/Toast';
import { TICKERS } from '@/lib/tickers';
import { apiRequest } from '@/shared/http/api-client';

type StudioCardMode = 'snapshot_360' | 'technical' | 'fundamental_moat_earnings';

const POPULAR_TICKERS = ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'ITMG', 'BREN', 'UNVR', 'ICBP'];

export default function InfographicStudioClient() {
  const { effectiveRole, loading: authLoading } = useAuthUser();
  const [tickerInput, setTickerInput] = useState('BBCA');
  const [activeTicker, setActiveTicker] = useState('BBCA');
  const [cardMode, setCardMode] = useState<StudioCardMode>('snapshot_360');
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

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    setToastMessage(message);
    setToastVariant(variant);
  }, []);

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

  const fetchStockData = useCallback(async (symbol: string) => {
    const rawUpper = symbol.trim().toUpperCase();
    const isIhsg = rawUpper === 'IHSG' || rawUpper === '^JKSE' || rawUpper === 'JKSE' || rawUpper.includes('JKSE');
    const cleanSym = isIhsg ? 'IHSG' : rawUpper.replace('.JK', '');
    if (!cleanSym) return;

    setLoading(true);
    setActiveTicker(cleanSym);
    try {
      const apiTicker = isIhsg ? '^JKSE' : `${cleanSym}.JK`;
      const displaySymbol = isIhsg ? 'IHSG' : cleanSym;

      // Parallel fetch payload technical, fundamental, earnings, intrinsic & ownership
      // Gunakan endpoint teknikal yang sama dengan halaman Technical/Dashboard dan
      // jangan memakai cache browser. Request teknikal wajib berhasil; sebelumnya
      // error-nya ditelan menjadi `null`, lalu Studio tetap menampilkan kartu kosong
      // dengan toast "berhasil" sehingga tampak seperti data tidak pernah diperbarui.
      const [stockRes, fundRes, earningsRes, intrinsicRes, ownershipRes] = await Promise.all([
        apiRequest<any>(`/api/stock/${encodeURIComponent(apiTicker)}`, { cache: 'no-store' }),
        isIhsg ? null : apiRequest<any>(`/api/fundamental/${cleanSym}.JK`, { cache: 'no-store' }).catch(() => null),
        isIhsg ? null : apiRequest<any>(`/api/earnings/${cleanSym}`, { cache: 'no-store' }).catch(() => null),
        isIhsg ? null : apiRequest<any>(`/api/intrinsic/${cleanSym}`, { cache: 'no-store' }).catch(() => null),
        isIhsg ? null : apiRequest<any>(`/api/ownership-flow/${cleanSym}`, { cache: 'no-store' }).catch(() => null),
      ]);

      // `/api/stock` menaruh harga canonical pada `stock.current_price`, sama seperti
      // yang dirender halaman Technical. `price` dipertahankan hanya sebagai fallback
      // kompatibilitas payload lama.
      const stockPrice = stockRes?.stock?.current_price ?? stockRes?.price ?? fundRes?.stock?.current_price ?? null;
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

      const bullPct = typeof consensusObj?.bull_pct === 'number' ? consensusObj.bull_pct : null;
      const bearPct = typeof consensusObj?.bear_pct === 'number' ? consensusObj.bear_pct : null;
      const neutralPct = typeof consensusObj?.neutral_pct === 'number'
        ? consensusObj.neutral_pct
        : (bullPct != null && bearPct != null ? Math.max(0, 100 - bullPct - bearPct) : null);

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
        dataTimestamp: stockRes?._meta?.dataTimestamp ?? stockRes?._meta?.computedAt ?? null,
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
          // Pola candlestick sudah dihitung buildTechnicalSuite dan sudah tampil di menu
          // Teknikal, tapi kartu ekspor tidak pernah menerimanya - satu-satunya bagian
          // suite yang dihitung lalu dibuang.
          patterns: technicalSuite?.patterns || [],
          patternAsOf: technicalSuite?.dataQuality?.patternAsOf || null,
          flowDetails,
        },
        fundamental: {
          scoring: {
            // Kartu mencetak angka ini sebagai "LensScore ... / 100" DAN membariskan tiga
            // komponennya persis di bawahnya. Mengirim skor fundamental ke slot itu membuat
            // kop membantah barisnya sendiri: BBCA 23 Agustus 2026 tampil "15 / 100" di atas
            // Fundamental 15/30 + Teknikal 17/40 + Arus dana 22/30 - yang berjumlah 54.
            totalScore,
            // `stockRes.scoring` TIDAK punya field `breakdown`. Komponennya datang sebagai
            // technical_score / fundamental_score / flow_score, jadi baris ini sebelumnya
            // selalu `undefined` dan ketiga barnya kosong tanpa ada yang memerah.
            breakdown: {
              fundamental: fundamentalScore,
              technical: technicalScore,
              moneyFlow: flowScore,
            },
          },
          fundamentals: fundRes?.fundamentals || {},
          // Metrik bank (NIM/NPL/CASA/LDR/CAR) sudah dihitung service fundamental dan
          // sudah tampil di menu Fundamental, tapi kartu ekspor tidak pernah menerimanya.
          // Untuk emiten perbankan, gross margin dan current ratio bukan metrik yang
          // relevan - Yahoo bahkan mengirim 0 untuk keduanya.
          bankFundamentals: fundRes?.bankFundamentals || null,
          profile: fundRes?.profile || {
            sector: stockRes?.scoring?.sector?.yahooSector ?? null,
            industry: stockRes?.scoring?.sector?.yahooIndustry ?? null,
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
            previous: ownershipRes?.previous ?? null,
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
  }, [showToast]);

  useEffect(() => {
    void fetchStockData('BBCA');
  }, [fetchStockData]);

  // Tema menentukan aksen laporan; struktur dan kontras dokumen tetap konsisten.
  const activeTheme: Card3DTheme = React.useMemo(() => {
    if (selectedThemeId === 'auto' || !selectedThemeId) {
      return getSector3DTheme(
        data?.fundamental?.profile?.sector,
        data?.fundamental?.profile?.industry,
        activeTicker
      );
    }
    return getThemeById(selectedThemeId);
  }, [selectedThemeId, data?.fundamental?.profile?.sector, data?.fundamental?.profile?.industry, activeTicker]);

  const handleDownloadImage = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(canvasRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      const typeLabel = cardMode === 'snapshot_360'
        ? 'Investment-Snapshot-360'
        : cardMode === 'technical'
          ? 'Technical-Research'
          : 'Fundamental-Research';
      link.download = `SahamLens-${typeLabel}-${activeTicker}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      showToast(`Infografis ${typeLabel.replaceAll('-', ' ')} berhasil diekspor (HD PNG)!`, 'success');
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
        <Card as="div" className="max-w-md border-tv-border p-6 text-center" padding="none" radius="2xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
          <AlertTriangle className="h-10 w-10 text-tv-gold mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white">Khusus Hak Akses Admin</h2>
          <p className="text-xs text-tv-muted mt-2">
            Studio Pembuat Infografis Finansial ini hanya dapat diakses oleh Admin SahamLens.
          </p>
          <Link href="/admin-login" className="mt-4 inline-block px-4 py-2 bg-tv-blue text-white text-xs font-bold rounded-xl">
            Login Admin
          </Link>
        </Card>
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
            <span className="rounded-full border border-white/[0.12] bg-white/[0.05] px-3 py-0.5 text-[11px] font-bold text-slate-300">
              Institutional Editorial · {activeTheme.sectorLabel}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="bare" size="none"
              type="button"
              onClick={handleDownloadImage}
              disabled={exporting || loading || !data}
              className="inline-flex items-center gap-2 rounded-xl bg-[#5e6ad2] px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-[#707bf0] active:bg-[#4f59b8] disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>
                {exporting
                  ? 'Merender Gambar HD...'
                  : cardMode === 'snapshot_360'
                    ? 'Download Snapshot 360°'
                    : cardMode === 'technical'
                      ? 'Download Catatan Teknikal'
                      : 'Download Catatan Fundamental'}
              </span>
            </Button>
          </div>
        </div>

        {/* Title & Description */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-[#828fff]" />
            Studio Infografis 360°
          </h1>
          <p className="mt-1 text-sm text-tv-muted max-w-3xl">
            Tiga lembar riset konsisten: Snapshot untuk keputusan cepat, Teknikal untuk eksekusi, dan Fundamental untuk kualitas bisnis serta valuasi.
          </p>
        </div>

        {/* Emiten Input Bar with Autocomplete Dropdown */}
        <Card as="div" className="mb-6 border-slate-700/80 p-5 shadow-sm" padding="none" radius="2xl" surface="90" elevation="none" overflow="visible" highlight={false}>
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
              <Button variant="bare" size="none"
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#5e6ad2] hover:bg-[#707bf0] text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-md shrink-0"
                >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Memuat Data...' : 'Buat Infografis'}</span>
              </Button>
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
                    <Button variant="bare" size="none"
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
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Emiten Chips */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap text-xs text-tv-muted">
            <span className="font-semibold text-slate-400">Pilihan Cepat:</span>
            {POPULAR_TICKERS.map((s) => (
              <Button variant="bare" size="none"
                key={s}
                type="button"
                onClick={() => selectTicker(s)}
                className={`px-2.5 py-1 rounded-lg border font-number text-xs font-bold transition-all ${
                  activeTicker === s
                    ? `${activeTheme.accentBorder} ${activeTheme.accentBg} ${activeTheme.accentText} shadow-xs`
                    : 'border-slate-700 bg-[#070d18] text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                {s}
              </Button>
            ))}
          </div>
        </Card>

        <div className="mb-6 rounded-2xl border border-white/[0.08] bg-[#080d18] p-4 shadow-lg">
          <div className="grid gap-3 lg:grid-cols-3">
            {[
              { id: 'snapshot_360' as const, icon: Layers, title: 'Snapshot 360°', note: 'Keputusan cepat & risiko' },
              { id: 'technical' as const, icon: LineChart, title: 'Teknikal', note: 'Timing, level & arus dana' },
              { id: 'fundamental_moat_earnings' as const, icon: Landmark, title: 'Fundamental', note: 'Kualitas, valuasi & earnings' },
            ].map(({ id, icon: Icon, title, note }) => (
              <Button
                key={id}
                variant="bare"
                size="none"
                type="button"
                onClick={() => setCardMode(id)}
                className={`flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  cardMode === id
                    ? 'border-[#828fff]/60 bg-[#5e6ad2]/20 text-white'
                    : 'border-white/[0.08] bg-white/[0.025] text-slate-400 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{note}</span>
                </span>
              </Button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.08] pt-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <Palette className="h-4 w-4" />
              <span>Aksen laporan</span>
              <select
                value={selectedThemeId}
                onChange={(e) => setSelectedThemeId(e.target.value)}
                className="rounded-lg border border-white/[0.1] bg-[#030612] px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#828fff]/40"
              >
                <option value="auto">Otomatis sesuai sektor</option>
                <option value="sapphire-bank">Biru finansial</option>
                <option value="imperial-gold">Emas properti</option>
                <option value="solar-mining">Tembaga energi</option>
                <option value="tokyo-neon">Ungu teknologi</option>
                <option value="rose-fmcg">Rose konsumer</option>
                <option value="ruby-health">Merah kesehatan</option>
                <option value="emerald-infra">Hijau infrastruktur</option>
                <option value="obsidian-cyber">Teal netral</option>
              </select>
            </label>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Ukuran pratinjau</span>
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#030612] p-1">
                {[0.5, 0.65, 0.75, 0.88, 1.0].map((scale) => (
                  <Button
                    key={scale}
                    variant="bare"
                    size="none"
                    type="button"
                    onClick={() => setZoomScale(scale)}
                    className={`rounded px-2 py-1 text-[11px] font-bold transition-colors ${
                      zoomScale === scale ? 'bg-[#5e6ad2] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {Math.round(scale * 100)}%
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Canvas Preview Section */}
        <div className="rounded-3xl border border-slate-700/80 bg-[#01040a] p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <ImageIcon className={`w-5 h-5 ${activeTheme.accentText}`} />
              <span className="font-heading text-sm font-bold text-white">
                Pratinjau: {cardMode === 'snapshot_360'
                  ? 'Investment Snapshot 360°'
                  : cardMode === 'technical'
                    ? 'Catatan Teknikal & Smart Money'
                    : 'Catatan Fundamental, Moat & Earnings'}
              </span>
              <span className="hidden md:inline text-[11px] text-slate-400">
                • Aksen laporan: <b className={activeTheme.accentText}>{activeTheme.sectorLabel}</b>
              </span>
            </div>

            <Button variant="bare" size="none"
              type="button"
              onClick={handleDownloadImage}
              disabled={exporting || loading || !data}
              className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh PNG HD</span>
            </Button>
          </div>

          {/* Scaled Preview Wrapper to comfortably fit on screen */}
          <div className="flex justify-center overflow-x-auto py-6 bg-[#000205] rounded-2xl border border-white/[0.04] p-2 sm:p-4">
            <div
              className="shadow-[0_20px_60px_rgba(0,0,0,0.95)] rounded-3xl overflow-hidden border-2 border-slate-700/80 transform-gpu origin-top transition-transform duration-200"
              style={{ transform: `scale(${zoomScale})` }}
            >
              <div ref={canvasRef} className="w-[1080px]">
                {data ? (
                  cardMode === 'snapshot_360' ? (
                    <InvestmentSnapshot360Card
                      symbol={data.symbol}
                      stockName={data.stock.name}
                      currentPrice={data.stock.current_price}
                      changePct={data.stock.change_pct}
                      volume={data.stock.volume}
                      dataTimestamp={data.dataTimestamp}
                      consensusLabel={data.technical.consensusLabel}
                      consensusTone={data.technical.consensusTone}
                      score={data.technical.score}
                      scoreBreakdown={data.technical.breakdown}
                      bullPct={data.technical.bullPct}
                      bearPct={data.technical.bearPct}
                      neutralPct={data.technical.neutralPct}
                      range52w={data.technical.range52w}
                      pivots={data.technical.pivots}
                      trends={data.technical.trends}
                      patterns={data.technical.patterns}
                      patternAsOf={data.technical.patternAsOf}
                      tradingPlan={data.technical.tradingPlan}
                      flowDetails={data.technical.flowDetails}
                      fundamentals={data.fundamental.fundamentals}
                      bankFundamentals={data.fundamental.bankFundamentals}
                      profile={data.fundamental.profile}
                      moat={data.fundamental.moat}
                      durability={data.fundamental.durability}
                      valuation={data.fundamental.valuation}
                      latestEarningsQuarter={data.fundamental.latestEarningsQuarter}
                      upcomingEarnings={data.fundamental.upcomingEarnings}
                      ownership={data.fundamental.ownership}
                      theme={activeTheme}
                      exportedAt={data.dataTimestamp ? new Date(data.dataTimestamp) : new Date()}
                    />
                  ) : cardMode === 'technical' ? (
                    <TechnicalResearchCard
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
                      patterns={data.technical.patterns}
                      patternAsOf={data.technical.patternAsOf}
                      flowDetails={data.technical.flowDetails}
                      theme={activeTheme}
                      exportedAt={data.dataTimestamp ? new Date(data.dataTimestamp) : new Date()}
                    />
                  ) : (
                    <FundamentalResearchCard
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
                      theme={activeTheme}
                      exportedAt={data.dataTimestamp ? new Date(data.dataTimestamp) : new Date()}
                    />
                  )
                ) : (
                  <div className="w-[1080px] h-[1420px] bg-[#030610] flex flex-col items-center justify-center text-slate-500 font-mono gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                    <span>Memuat data emiten dan menyusun catatan riset...</span>
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
