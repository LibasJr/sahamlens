'use client';

import React, { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Target, Activity, ArrowUpRight, ArrowDownRight, Clock, ChevronRight,
  RefreshCw, Search, ArrowUpDown, ChevronUp, ChevronDown, ShieldCheck, Calendar, Menu,
} from 'lucide-react';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Badge, Input } from '@/components/ui';

const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

type CategoryDetail = { symbol: string; price: number; changePct: number; metric: string };
type DailyPickCategory = { count: number; items: string[]; detail: CategoryDetail[] };
type DailyPicks = {
  attractive: DailyPickCategory;
  risky: DailyPickCategory;
  undervalue: DailyPickCategory;
  breakout: DailyPickCategory;
  goldenCross: DailyPickCategory;
  deadCross: DailyPickCategory;
  foreignAccumulation: DailyPickCategory;
};
type TabKey = keyof DailyPicks | 'recommendations';

// Tab per kategori "Hari Ini AI Menemukan" (halaman utama) - sebelumnya semua kategori
// link ke halaman ini tapi selalu menampilkan tabel breakout yang sama persis, jadi klik
// "Golden Cross" atau "Momentum Mingguan" terlihat salah/tidak akurat (isinya sama semua).
// Sekarang tiap kategori delink ke ?cat=<key> dan menampilkan daftar sesuai kategorinya.
// "Rekomendasi" (bekas menu terpisah "Stock Recommendations") juga dipindah ke sini -
// sekarang cuma ada SATU menu sinyal AI (AI Pick), bukan dua menu terpisah.
const CATEGORY_TABS: { key: TabKey; label: string }[] = [
  { key: 'breakout', label: 'Breakout' },
  { key: 'recommendations', label: 'Rekomendasi' },
  { key: 'attractive', label: 'Menarik' },
  { key: 'undervalue', label: 'Undervalue' },
  { key: 'risky', label: 'Berisiko' },
  { key: 'goldenCross', label: 'Golden Cross' },
  { key: 'deadCross', label: 'Dead Cross' },
  { key: 'foreignAccumulation', label: 'Akumulasi Asing' },
];

// Gauge "Sentimen Momentum" yang sama seperti di tab Rekomendasi (yang punya sentimentScore
// asli dari analyzeStock, dihitung dari vote 10 analyzer). Tab lain di sini TIDAK punya vote
// 10 analyzer (cuma perubahan harga %), jadi dipakai proxy sederhana dari %perubahan harga
// yang SUDAH real (bukan dikarang) - formula sama seperti sentimentScore asli tanpa komponen
// bullish/bearish vote yang memang tidak tersedia untuk kategori ini.
function sentimentFromChangePct(changePct: number): { score: number; label: string } {
  const score = Math.min(100, Math.max(0, 50 + changePct * 3));
  let label = 'Netral';
  if (score >= 70) label = 'Sangat Positif';
  else if (score >= 55) label = 'Positif';
  else if (score <= 30) label = 'Sangat Negatif';
  else if (score <= 45) label = 'Negatif';
  return { score, label };
}

function SentimentGauge({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <span className={`text-xs font-bold ${score >= 55 ? 'text-tv-green' : score <= 45 ? 'text-tv-red' : 'text-tv-warning'}`}>
        {label}
      </span>
      <div className="w-24 h-1.5 bg-tv-bg rounded-full overflow-hidden flex">
        <div className="h-full bg-gradient-to-r from-tv-red via-tv-warning to-tv-green" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

const REC_LIQUID_STOCKS = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK', 'GOTO.JK', 'AMMN.JK', 'ADRO.JK', 'UNTR.JK',
  'ICBP.JK', 'KLBF.JK', 'PGAS.JK', 'PTBA.JK', 'ANTM.JK', 'BRPT.JK', 'INKP.JK', 'INDF.JK', 'ITMG.JK', 'MEDC.JK',
  'CPIN.JK', 'UNVR.JK', 'AKRA.JK', 'BRIS.JK', 'TPIA.JK', 'SMGR.JK', 'INTP.JK', 'MDKA.JK', 'CTRA.JK', 'BSDE.JK',
  'SMRA.JK', 'PWON.JK', 'ISAT.JK', 'EXCL.JK', 'BUKA.JK', 'MTEL.JK', 'TOWR.JK', 'TBIG.JK', 'SIDO.JK', 'AMRT.JK',
  'MYOR.JK', 'HMSP.JK', 'GGRM.JK', 'MIDI.JK', 'JPFA.JK', 'ARTO.JK', 'BDMN.JK', 'BNGA.JK', 'BBTN.JK', 'PNBN.JK',
  'NISP.JK', 'MEGA.JK', 'INDY.JK', 'ENRG.JK', 'BUMI.JK', 'BRMS.JK', 'BYAN.JK', 'CUAN.JK', 'PTRO.JK', 'MBMA.JK',
  'NCKL.JK', 'HRUM.JK', 'INCO.JK', 'TINS.JK', 'DGWG.JK', 'ESSA.JK', 'MAPA.JK', 'MAPI.JK', 'SILO.JK', 'HEAL.JK',
  'MIKA.JK', 'BMTR.JK', 'MNCN.JK', 'SCMA.JK', 'EMTK.JK', 'SRTG.JK', 'PTPP.JK', 'WIKA.JK', 'ADHI.JK', 'WSKT.JK',
  'WEGE.JK', 'SSIA.JK', 'ASRI.JK', 'DILD.JK', 'LPKR.JK', 'LPCK.JK', 'MTLA.JK', 'BBHI.JK', 'BBYB.JK', 'AGRO.JK',
  'BTPS.JK', 'BFIN.JK', 'PNLF.JK', 'AVIA.JK', 'MAIN.JK', 'LSIP.JK', 'AALI.JK', 'SSMS.JK', 'SIMP.JK', 'DSNG.JK',
  'TAPG.JK', 'MGRO.JK', 'WIFI.JK', 'FREN.JK', 'CASS.JK', 'BIRD.JK', 'ASLC.JK', 'DRMA.JK', 'AUTO.JK', 'GJTL.JK',
  'IMAS.JK', 'SMSM.JK', 'ACES.JK', 'RALS.JK', 'LPPF.JK', 'EPMT.JK', 'SGRO.JK', 'SMDR.JK', 'TMAS.JK', 'PSSI.JK',
  'TPMA.JK', 'KAEF.JK', 'INAF.JK', 'SMCB.JK', 'ARNA.JK', 'MLIA.JK', 'TOTO.JK', 'MARK.JK', 'CLEO.JK', 'ULTJ.JK',
  'CINT.JK', 'WOOD.JK', 'SLIS.JK', 'KRYA.JK', 'PANI.JK', 'BSBK.JK', 'NELY.JK', 'BESS.JK', 'OMRE.JK', 'JSPT.JK',
  'BAPA.JK', 'BEST.JK', 'BKSL.JK', 'DART.JK', 'ELTY.JK', 'KIJA.JK', 'MDLN.JK', 'PLIN.JK', 'RBMS.JK', 'RDTX.JK',
  'SMDM.JK', 'TRIN.JK', 'BSWD.JK', 'DNAR.JK', 'NOBU.JK', 'BGTG.JK', 'ARKO.JK', 'PGEO.JK', 'KEEN.JK', 'BREN.JK',
  'VKTR.JK', 'DATA.JK', 'GELC.JK', 'AWAN.JK', 'NSSS.JK', 'DOID.JK', 'ABMM.JK', 'GEMS.JK', 'KKGI.JK', 'MBAP.JK',
  'MYOH.JK', 'TOBA.JK', 'MCOL.JK', 'BOSS.JK', 'BSSR.JK', 'GTBO.JK', 'SMMT.JK', 'PKPK.JK', 'ZINC.JK', 'CITA.JK',
  'PSAB.JK', 'DKFT.JK', 'CKRA.JK', 'MRLV.JK', 'ALDO.JK', 'FASW.JK', 'SPMA.JK', 'KDSI.JK', 'LTLS.JK', 'DPNS.JK',
  'IGAR.JK', 'IMPC.JK', 'TRST.JK', 'YPAS.JK', 'AKPI.JK', 'BTON.JK', 'LION.JK', 'BAJA.JK', 'BIMA.JK', 'GDST.JK',
  'INAI.JK', 'ISSP.JK', 'LMSH.JK', 'NIKL.JK', 'PICO.JK', 'TBMS.JK', 'CPRO.JK', 'DSFI.JK', 'CASA.JK', 'TBLA.JK',
  'HOKI.JK', 'AISA.JK', 'ALTO.JK', 'CAMP.JK', 'CEKA.JK', 'DLTA.JK', 'GOOD.JK', 'KINO.JK', 'MLBI.JK', 'PCAR.JK'
];

type RecSortKey = 'ticker' | 'sector' | 'price' | 'changePct' | 'consensus' | 'sentimentScore' | 'bullishVotes' | 'foreignFlow' | 'marketCap' | 'totalScore';

// Rp -> "12,3 T" / "850 M" - dipakai kolom Market Cap (filter >=Rp500M sudah diterapkan
// di modules/recommendation/service/recommendation.service.ts, kolom ini cuma menampilkan).
function formatMarketCap(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)} T`;
  return `${(value / 1_000_000_000).toFixed(0)} M`;
}

export default function BreakoutRadarPage() {
  return (
    <Suspense fallback={<div className="flex h-screen bg-tv-bg" />}>
      <BreakoutRadarContent />
    </Suspense>
  );
}

function BreakoutRadarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [dailyPicks, setDailyPicks] = useState<DailyPicks | null>(null);
  const [loadingDailyPicks, setLoadingDailyPicks] = useState(true);

  // Tab "Rekomendasi" (bekas /recommendations) - state terpisah, di-lazy-load hanya
  // saat tab ini pertama kali dibuka (scan 200 saham cukup berat untuk dijalankan
  // otomatis kalau user tidak pernah buka tab-nya).
  const [recData, setRecData] = useState<any[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recFetched, setRecFetched] = useState(false);
  const [recLastUpdate, setRecLastUpdate] = useState<Date | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [recSearchTerm, setRecSearchTerm] = useState('');
  const [recSortConfig, setRecSortConfig] = useState<{ key: RecSortKey; direction: 'asc' | 'desc' } | null>(null);

  // Sorting klik-header untuk tab Breakout & tab kategori (Menarik/Undervalue/Berisiko/
  // Golden Cross/Dead Cross/Akumulasi Asing) - sebelumnya cuma tab Rekomendasi yang bisa
  // disortir, permintaan eksplisit supaya tab lain ikut bisa (mis. klik kolom "Perubahan").
  type BreakoutSortKey = 'symbol' | 'price' | 'score' | 'rr';
  const [breakoutSortConfig, setBreakoutSortConfig] = useState<{ key: BreakoutSortKey; direction: 'asc' | 'desc' } | null>(null);
  type CategorySortKey = 'symbol' | 'price' | 'changePct';
  const [categorySortConfig, setCategorySortConfig] = useState<{ key: CategorySortKey; direction: 'asc' | 'desc' } | null>(null);

  // Badge "Ada Corporate Action Hari Ini" - sebelumnya pakai data/calendar.json dummy
  // + tanggal hardcode '2026-07-28' (jadi "hari ini" beku permanen). Sekarang pakai
  // kalender real (/api/calendar, dividen+earnings dari Yahoo Finance) dan tanggal
  // hari ini yang sesungguhnya.
  const [stocksWithEventToday, setStocksWithEventToday] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch('/api/calendar')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.events) return;
        const todayStr = new Date().toISOString().split('T')[0];
        const todayEvents = data.events[todayStr] || [];
        setStocksWithEventToday(new Set(todayEvents.map((e: any) => e.symbol)));
      })
      .catch(() => {});
  }, []);

  const initialTab = useMemo(() => {
    const cat = searchParams.get('cat');
    return CATEGORY_TABS.some((t) => t.key === cat) ? (cat as TabKey) : 'breakout';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/breakout-radar', { cache: 'no-store' });
        const json = await res.json();

        if (res.status === 401) {
          setShowLoginPrompt(true);
          return;
        }
        if (res.status === 402 || json.code === 'SUBSCRIPTION_REQUIRED') {
          setUsedSymbolsToday(getUsedSymbolsToday());
          setShowPaywall(true);
          return;
        }

        if (res.ok) {
          const items = json.data || [];
          setData(items);
          setLastUpdate(new Date(json.lastUpdate));

          // Kirim data breakout ke AI Chat supaya jawaban AI lebih substantif
          window.dispatchEvent(new CustomEvent('update-ai-context', {
            detail: {
              symbol: 'BREAKOUT_RADAR',
              recommendations: items.map((r: any) => ({
                ticker: r.symbol,
                price: r.price,
                change: r.change,
                score: r.score,
                signals: r.signals,
                rr: r.rr
              }))
            }
          }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    setLoadingDailyPicks(true);
    fetch('/api/daily-picks').then(r => r.json()).then((d) => {
      if (d && !d.error) setDailyPicks(d);
    }).catch(console.error).finally(() => setLoadingDailyPicks(false));
  }, []);

  const fetchRecommendations = async () => {
    setRecLoading(true);
    setRecData([]);
    setRecError(null);
    setRecLastUpdate(new Date());

    try {
      const chunkSize = 10;
      for (let i = 0; i < REC_LIQUID_STOCKS.length; i += chunkSize) {
        const chunk = REC_LIQUID_STOCKS.slice(i, i + chunkSize);
        const res = await fetch(`/api/recommendations?symbols=${chunk.join(',')}`, { cache: 'no-store' });

        const json = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setShowLoginPrompt(true);
          return;
        }
        if (res.status === 402 || json.code === 'SUBSCRIPTION_REQUIRED') {
          setUsedSymbolsToday(getUsedSymbolsToday());
          setShowPaywall(true);
          return;
        }
        if (res.status === 429) {
          // Pemindaian ini memecah 220 saham jadi ~22 request - visitor tanpa akun
          // (limit per-IP) bisa kena batas di tengah pemindaian. Berhenti di sini
          // (bukan diam-diam skip macam status gagal lain) supaya user tahu kenapa
          // datanya cuma sebagian, bukan mengira fiturnya rusak.
          setRecError('Terlalu banyak permintaan - coba lagi beberapa saat lagi.');
          break;
        }
        if (!res.ok) continue;

        if (json.recommendations) {
          setRecData(prev => {
            const newItems = json.recommendations.filter((newItem: any) =>
              !prev.some((existing: any) => existing.ticker === newItem.ticker)
            );
            const merged = [...prev, ...newItems];

            window.dispatchEvent(new CustomEvent('update-ai-context', {
              detail: {
                symbol: 'RECOMMENDATIONS',
                recommendations: merged.map((r: any) => ({
                  ticker: r.ticker,
                  price: r.price,
                  change: r.change,
                  consensus: r.consensus,
                  confidence: r.confidence,
                  foreignFlow: r.foreignFlow,
                  sentiment: r.sentimentLabel
                }))
              }
            }));

            return merged;
          });
          setRecLastUpdate(new Date());
        }
      }
    } catch (e) {
      console.error('Failed to fetch recommendations', e);
    } finally {
      setRecLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'recommendations' && !recFetched) {
      setRecFetched(true);
      fetchRecommendations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  };

  const handleRecSort = (key: RecSortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (recSortConfig && recSortConfig.key === key && recSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setRecSortConfig({ key, direction });
  };

  const getRecSortIcon = (key: RecSortKey) => {
    if (recSortConfig?.key === key) {
      return recSortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />;
    }
    return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />;
  };

  const recProcessedData = React.useMemo(() => {
    let result = [...recData];

    if (recSearchTerm) {
      const term = recSearchTerm.toLowerCase();
      result = result.filter(item =>
        (item?.ticker?.toLowerCase() || '').includes(term) ||
        (item?.sector?.toLowerCase() || '').includes(term) ||
        (item?.consensus?.toLowerCase() || '').includes(term) ||
        (item?.sentimentLabel?.toLowerCase() || '').includes(term) ||
        (item?.foreignFlow?.toLowerCase() || '').includes(term)
      );
    }

    if (recSortConfig !== null) {
      result.sort((a, b) => {
        let aValue = a?.[recSortConfig.key];
        let bValue = b?.[recSortConfig.key];

        if (recSortConfig.key === 'consensus') {
          const scoreMap: any = { 'STRONG BUY': 5, 'BUY': 4, 'HOLD': 3, 'SELL': 2, 'STRONG SELL': 1, 'NEUTRAL': 3 };
          aValue = (scoreMap[a?.consensus] || 0) * 100 + (a?.confidence || 0);
          bValue = (scoreMap[b?.consensus] || 0) * 100 + (b?.confidence || 0);
        } else if (recSortConfig.key === 'foreignFlow') {
          const flowMap: any = { 'STRONG NET BUY': 4, 'NET BUY': 3, 'NEUTRAL': 2, 'NET SELL': 1, 'STRONG NET SELL': 0 };
          aValue = flowMap[a?.foreignFlow] ?? 2;
          bValue = flowMap[b?.foreignFlow] ?? 2;
        }

        if (aValue === undefined || aValue === null) aValue = '';
        if (bValue === undefined || bValue === null) bValue = '';

        if (aValue < bValue) return recSortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return recSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      result.sort((a, b) => (b?.sentimentScore || 0) - (a?.sentimentScore || 0));
    }

    return result.slice(0, 50);
  }, [recData, recSearchTerm, recSortConfig]);

  const handleBreakoutSort = (key: BreakoutSortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (breakoutSortConfig && breakoutSortConfig.key === key && breakoutSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setBreakoutSortConfig({ key, direction });
  };

  const getBreakoutSortIcon = (key: BreakoutSortKey) => {
    if (breakoutSortConfig?.key === key) {
      return breakoutSortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />;
    }
    return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />;
  };

  const breakoutSortValue = (item: any, key: BreakoutSortKey): number | string => {
    switch (key) {
      case 'symbol': return item?.symbol || '';
      case 'score': return item?.score || 0;
      case 'rr': return parseFloat(String(item?.rr).split(':')[1]) || 0;
      case 'price': return item?.price || 0;
    }
  };

  const breakoutProcessedData = React.useMemo(() => {
    if (!breakoutSortConfig) return data;
    const { key, direction } = breakoutSortConfig;
    const result = [...data];
    result.sort((a, b) => {
      const aValue = breakoutSortValue(a, key);
      const bValue = breakoutSortValue(b, key);
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [data, breakoutSortConfig]);

  const handleCategorySort = (key: CategorySortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (categorySortConfig && categorySortConfig.key === key && categorySortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setCategorySortConfig({ key, direction });
  };

  const getCategorySortIcon = (key: CategorySortKey) => {
    if (categorySortConfig?.key === key) {
      return categorySortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />;
    }
    return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />;
  };

  // Reset sort saat ganti tab kategori - kolom "Metrik" berarti beda-beda per kategori
  // (Skor/RSI/hari akumulasi), sort lama gampang jadi tidak relevan begitu ganti tab.
  useEffect(() => {
    setCategorySortConfig(null);
  }, [activeTab]);

  const categoryProcessedData = React.useMemo(() => {
    const rows = (activeTab !== 'breakout' && activeTab !== 'recommendations') ? dailyPicks?.[activeTab]?.detail : null;
    if (!categorySortConfig || !rows) return rows;
    const { key, direction } = categorySortConfig;
    const result = [...rows];
    result.sort((a: any, b: any) => {
      const aValue = key === 'symbol' ? (a?.symbol || '') : (a?.[key] ?? 0);
      const bValue = key === 'symbol' ? (b?.symbol || '') : (b?.[key] ?? 0);
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [dailyPicks, activeTab, categorySortConfig]);

  const activeCategory = (activeTab !== 'breakout' && activeTab !== 'recommendations') ? dailyPicks?.[activeTab] : null;
  const activeLabel = CATEGORY_TABS.find((t) => t.key === activeTab)?.label || '';

  return (
    <div className="flex h-screen bg-tv-bg">
      {/* Sidebar removed, handled by layout */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto custom-scrollbar">
        {/* Header */}
        <header className="bg-tv-surface border-b border-tv-border px-6 py-4 sticky top-0 z-20 shadow-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
                className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="p-2 rounded-md bg-tv-blue text-white">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight flex items-center gap-2">
                  AI Pick Live
                  <Badge variant="danger" dot>Live</Badge>
                </h1>
                <p className="text-xs text-tv-muted flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" /> Update: {lastUpdate ? formatTime(lastUpdate) : 'Loading...'} - No Polling
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 max-w-[1600px] mx-auto w-full">
          {/* Tab per kategori */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
            {CATEGORY_TABS.map((tab) => {
              const count = tab.key === 'breakout' ? data.length : tab.key === 'recommendations' ? recData.length : dailyPicks?.[tab.key]?.count;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    router.replace(tab.key === 'breakout' ? '/breakout-radar' : `/breakout-radar?cat=${tab.key}`);
                  }}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-bold transition-colors ${
                    activeTab === tab.key
                      ? 'bg-tv-blue text-white'
                      : 'bg-tv-card border border-tv-border text-tv-muted hover:border-tv-blue/40 hover:text-tv-text'
                  }`}
                >
                  {tab.label}
                  {count != null && <span className={activeTab === tab.key ? 'opacity-70' : 'text-tv-muted'}>({count})</span>}
                </button>
              );
            })}
          </div>

          {activeTab === 'breakout' ? (
            <div className="bg-tv-card border border-tv-border rounded-lg shadow-2 overflow-hidden">
              <div className="p-5 border-b border-tv-border flex items-center justify-between bg-tv-bg/40">
                <div>
                  <h2 className="font-heading text-lg font-bold text-tv-text flex items-center gap-2">
                    <Activity className="w-5 h-5 text-tv-green" />
                    Top LQ45 Breakout Watchlist
                  </h2>
                  <p className="text-xs text-tv-muted mt-1">Scanning 15 bluechip stocks based on momentum algorithms</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-tv-bg text-tv-muted text-xs uppercase font-semibold tracking-wide border-b border-tv-border">
                      <th className="py-3 px-4 cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleBreakoutSort('symbol')}>
                        <div className="flex items-center gap-1.5">Symbol {getBreakoutSortIcon('symbol')}</div>
                      </th>
                      <th className="py-3 px-4 cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleBreakoutSort('price')}>
                        <div className="flex items-center gap-1.5">Price {getBreakoutSortIcon('price')}</div>
                      </th>
                      <th className="py-3 px-4">Signal</th>
                      <th className="py-3 px-4 cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleBreakoutSort('score')}>
                        <div className="flex items-center gap-1.5">Score (0-8) {getBreakoutSortIcon('score')}</div>
                      </th>
                      <th className="py-3 px-4 cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleBreakoutSort('rr')}>
                        <div className="flex items-center gap-1.5">RR Ratio {getBreakoutSortIcon('rr')}</div>
                      </th>
                      <th className="py-3 px-4 text-center">Sentimen Momentum</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tv-border">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-20 text-center text-tv-muted">
                          <Activity className="w-8 h-8 text-tv-green/50 animate-spin mx-auto mb-3" />
                          Scanning Market...
                        </td>
                      </tr>
                    ) : breakoutProcessedData.length > 0 ? (
                      breakoutProcessedData.map((item, idx) => {
                        const isHighConf = item.score >= 5;
                        const isUp = item.change && !item.change.startsWith('-');
                        const sentiment = sentimentFromChangePct(parseFloat(item.change) || 0);
                        return (
                          <tr key={item.symbol} className="hover:bg-tv-hover/50 transition-colors group">
                            <td className="py-4 px-4 font-bold text-tv-text font-number flex items-center gap-3">
                              <span className="text-tv-muted text-xs w-4">{idx + 1}</span>
                              {item.symbol}
                            </td>
                            <td className="py-4 px-4 font-number">
                              <div className="text-tv-text font-bold">Rp {item.price.toLocaleString()}</div>
                              <div className={`text-[10px] ${isUp ? 'text-tv-green' : 'text-tv-red'} flex items-center`}>
                                {isUp && <ArrowUpRight className="w-3 h-3 mr-0.5" />}
                                {item.change}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                                {item.signals?.map((sig: string) => (
                                  <span key={sig} className="text-[9px] font-bold bg-tv-green/10 text-tv-green border border-tv-green/20 px-2 py-0.5 rounded">
                                    {sig}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3 w-40">
                                <span className={`font-bold font-number text-sm ${isHighConf ? 'text-tv-green' : 'text-tv-warning'}`}>
                                  {item.score}
                                </span>
                                <div className="flex-1 bg-tv-bg rounded-full h-2.5 border border-tv-border overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-1000 ${isHighConf ? 'bg-gradient-to-r from-tv-green to-tv-green/70' : 'bg-gradient-to-r from-tv-warning to-tv-warning/70'}`}
                                    style={{ width: `${(item.score / 8) * 100}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <span className="bg-tv-hover text-tv-muted text-xs px-2 py-1 rounded border border-tv-borderLight font-number">
                                {item.rr}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <SentimentGauge score={sentiment.score} label={sentiment.label} />
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex items-center justify-end gap-2 ml-auto">
                                <button
                                  onClick={() => router.push(`/dashboard?symbol=${item.symbol}`)}
                                  className="bg-tv-blue hover:bg-tv-blueHover text-white text-xs font-bold px-3 py-1.5 rounded flex items-center justify-center gap-1 transition-all"
                                >
                                  Analisa <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-tv-muted">
                          Tidak ada sinyal breakout saat ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'recommendations' ? (
            <div className="space-y-4">
              {recError && (
                <div className="bg-tv-card border border-tv-red/30 rounded-lg p-4 text-sm text-tv-red">
                  {recError}
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <button
                    onClick={fetchRecommendations}
                    disabled={recLoading}
                    className="bg-tv-card border border-tv-border hover:border-tv-blue/40 px-3 py-1.5 rounded-full text-tv-text flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${recLoading ? 'animate-spin' : ''}`} />
                    {recLoading ? 'Sedang Memindai...' : 'Refresh Data'}
                  </button>
                  <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted">
                    Update: {recLastUpdate ? formatTime(recLastUpdate) : 'Menunggu...'}
                    {recLoading && ` (Scanned: ${recData.length}/${REC_LIQUID_STOCKS.length})`}
                  </div>
                </div>

                <Input
                  size="sm"
                  value={recSearchTerm}
                  onChange={(e) => setRecSearchTerm(e.target.value)}
                  placeholder="Cari simbol, sinyal..."
                  leftIcon={<Search className="w-4 h-4" />}
                  className="w-full sm:w-64"
                />
              </div>

              <div className="bg-tv-card border border-tv-border rounded-lg shadow-2 overflow-hidden">
                <div className="overflow-x-auto min-h-[400px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-tv-bg border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide select-none">
                        <th className="p-4 cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('ticker')}>
                          <div className="flex items-center gap-1.5">Simbol {getRecSortIcon('ticker')}</div>
                        </th>
                        <th className="p-4 cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('sector')}>
                          <div className="flex items-center gap-1.5">Sektor {getRecSortIcon('sector')}</div>
                        </th>
                        <th className="p-4 text-right cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('price')}>
                          <div className="flex items-center justify-end gap-1.5">{getRecSortIcon('price')} Harga (Rp)</div>
                        </th>
                        <th className="p-4 text-right cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('changePct')}>
                          <div className="flex items-center justify-end gap-1.5">{getRecSortIcon('changePct')} Perubahan (%)</div>
                        </th>
                        <th className="p-4 text-right cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('marketCap')}>
                          <div className="flex items-center justify-end gap-1.5">{getRecSortIcon('marketCap')} Market Cap</div>
                        </th>
                        <th className="p-4 text-center cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('consensus')}>
                          <div className="flex items-center justify-center gap-1.5">{getRecSortIcon('consensus')} Konsensus 10 AI</div>
                        </th>
                        <th className="p-4 text-center cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('totalScore')} title="Technical + Fundamental + Flow (0-100), sama seperti Detail Saham">
                          <div className="flex items-center justify-center gap-1.5">{getRecSortIcon('totalScore')} Skor AI (F+T+A)</div>
                        </th>
                        <th className="p-4 text-center cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('sentimentScore')}>
                          <div className="flex items-center justify-center gap-1.5">{getRecSortIcon('sentimentScore')} Sentimen Momentum</div>
                        </th>
                        <th className="p-4 text-center cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('foreignFlow')}>
                          <div className="flex items-center justify-center gap-1.5">{getRecSortIcon('foreignFlow')} Estimasi Asing</div>
                        </th>
                        <th className="p-4 text-right cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleRecSort('bullishVotes')}>
                          <div className="flex items-center justify-end gap-1.5">{getRecSortIcon('bullishVotes')} Vote (Bull:Bear)</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {recData.length === 0 && recLoading ? (
                        <tr>
                          <td colSpan={10} className="p-10 text-center text-tv-muted">
                            <div className="flex flex-col items-center gap-3">
                              <RefreshCw className="w-6 h-6 animate-spin text-tv-green" />
                              <span>Mulai memindai {REC_LIQUID_STOCKS.length} saham aktif. Mohon tunggu...</span>
                            </div>
                          </td>
                        </tr>
                      ) : recProcessedData.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-10 text-center text-tv-muted">
                            <div className="flex flex-col items-center gap-3">
                              <Search className="w-6 h-6 text-tv-muted opacity-50" />
                              <span>{recLoading ? 'Menyaring rekomendasi terbaik...' : `Tidak ada data saham yang cocok dengan pencarian "${recSearchTerm}"`}</span>
                            </div>
                          </td>
                        </tr>
                      ) : recProcessedData.map((item, idx) => (
                        <tr key={item.ticker} className="border-b border-tv-border/50 hover:bg-tv-hover/50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-tv-text text-base font-number">{item.ticker}</span>
                              {idx < 3 && item.consensus?.includes('BUY') && recSortConfig === null && !recSearchTerm && (
                                <span title="Top Pick">
                                  <ShieldCheck className="w-4 h-4 text-tv-green" />
                                </span>
                              )}
                              {stocksWithEventToday.has(item.ticker) && (
                                <span title="Ada Corporate Action Hari Ini">
                                  <Calendar className="w-4 h-4 text-tv-warning" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-xs text-tv-muted max-w-[150px] truncate" title={item.sector}>
                            {item.sector || '-'}
                          </td>
                          <td className="p-4 text-right font-number text-tv-text font-semibold">
                            {item.price?.toLocaleString('id-ID')}
                          </td>
                          <td className="p-4 text-right font-number flex justify-end items-center gap-1">
                            <span className={`font-bold flex items-center ${item.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                              {item.changePct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                              {item.changePct}%
                            </span>
                          </td>
                          <td className="p-4 text-right font-number text-tv-muted text-xs">
                            {formatMarketCap(item.marketCap)}
                          </td>
                          <td className="p-4 text-center">
                            <div className={`inline-flex items-center justify-center px-3 py-1 rounded font-bold text-xs ${item.consensus?.includes('BUY') ? 'bg-tv-green/20 text-tv-green border border-tv-green' :
                                item.consensus?.includes('SELL') ? 'bg-tv-red/20 text-tv-red border border-tv-red' :
                                  'bg-tv-warning/20 text-tv-warning border border-tv-warning'
                              }`}>
                              {item.consensus} ({item.confidence}%)
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div
                              className={`inline-flex flex-col items-center justify-center px-3 py-1 rounded font-bold text-xs ${item.totalScore > 75 ? 'bg-tv-green/20 text-tv-green border border-tv-green' :
                                  item.totalScore >= 60 ? 'bg-tv-green/10 text-tv-green border border-tv-green/40' :
                                    item.totalScore >= 45 ? 'bg-tv-warning/20 text-tv-warning border border-tv-warning' :
                                      'bg-tv-red/20 text-tv-red border border-tv-red'
                                }`}
                              title={`Fundamental: ${item.fundamentalScore}/30 (Valuasi: ${item.valuationScore}/10) - Technical + Flow melengkapi sisanya`}
                            >
                              {item.totalScore ?? '-'}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <SentimentGauge score={item.sentimentScore} label={item.sentimentLabel} />
                          </td>
                          <td className="p-4 text-center">
                            <div className={`inline-flex items-center justify-center px-3 py-1 rounded font-bold text-[11px] ${item.foreignFlow?.includes('BUY') ? 'bg-tv-green/10 text-tv-green border border-tv-green/50' :
                                item.foreignFlow?.includes('SELL') ? 'bg-tv-red/10 text-tv-red border border-tv-red/50' :
                                  'bg-tv-warning/10 text-tv-warning border border-tv-warning/50'
                              }`}>
                              {item.foreignFlow || 'NEUTRAL'}
                            </div>
                          </td>
                          <td className="p-4 text-right font-number text-tv-muted">
                            <div><span className="text-tv-green">{item.bullishVotes}</span> : <span className="text-tv-red">{item.bearishVotes}</span></div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-tv-card border border-tv-border rounded-lg shadow-2 overflow-hidden">
              <div className="p-5 border-b border-tv-border bg-tv-bg/40">
                <h2 className="font-heading text-lg font-bold text-tv-text">{activeLabel}</h2>
                <p className="text-xs text-tv-muted mt-1">
                  {activeCategory ? `${activeCategory.count} saham memenuhi kriteria ${activeLabel.toLowerCase()}` : 'Memuat...'}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-tv-bg text-tv-muted text-xs uppercase font-semibold tracking-wide border-b border-tv-border">
                      <th className="py-3 px-4 cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleCategorySort('symbol')}>
                        <div className="flex items-center gap-1.5">Symbol {getCategorySortIcon('symbol')}</div>
                      </th>
                      <th className="py-3 px-4 cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleCategorySort('price')}>
                        <div className="flex items-center gap-1.5">Price {getCategorySortIcon('price')}</div>
                      </th>
                      <th className="py-3 px-4 cursor-pointer group hover:bg-tv-hover transition-colors" onClick={() => handleCategorySort('changePct')}>
                        <div className="flex items-center gap-1.5">Perubahan {getCategorySortIcon('changePct')}</div>
                      </th>
                      <th className="py-3 px-4">Metrik</th>
                      <th className="py-3 px-4 text-center">Sentimen Momentum</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tv-border">
                    {loadingDailyPicks ? (
                      <tr>
                        <td colSpan={6} className="py-20 text-center text-tv-muted">
                          <Activity className="w-8 h-8 text-tv-green/50 animate-spin mx-auto mb-3" />
                          Memuat...
                        </td>
                      </tr>
                    ) : categoryProcessedData && categoryProcessedData.length > 0 ? (
                      categoryProcessedData.map((item, idx) => {
                        const isUp = item.changePct >= 0;
                        const sentiment = sentimentFromChangePct(item.changePct);
                        return (
                          <tr key={item.symbol} className="hover:bg-tv-hover/50 transition-colors group">
                            <td className="py-4 px-4 font-bold text-tv-text font-number flex items-center gap-3">
                              <span className="text-tv-muted text-xs w-4">{idx + 1}</span>
                              {item.symbol}
                            </td>
                            <td className="py-4 px-4 font-number text-tv-text font-bold">Rp {item.price?.toLocaleString('id-ID')}</td>
                            <td className="py-4 px-4">
                              <span className={`flex items-center gap-1 font-number text-xs font-bold ${isUp ? 'text-tv-green' : 'text-tv-red'}`}>
                                {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {isUp ? '+' : ''}{item.changePct}%
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-[10px] font-bold bg-tv-green/10 text-tv-green border border-tv-green/20 px-2 py-0.5 rounded">
                                {item.metric}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <SentimentGauge score={sentiment.score} label={sentiment.label} />
                            </td>
                            <td className="py-4 px-4 text-right">
                              <button
                                onClick={() => router.push(`/dashboard?symbol=${item.symbol}`)}
                                className="bg-tv-blue hover:bg-tv-blueHover text-white text-xs font-bold px-3 py-1.5 rounded inline-flex items-center justify-center gap-1 transition-all"
                              >
                                Analisa <ChevronRight className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-tv-muted">
                          Tidak ada saham di kategori {activeLabel} saat ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html:`
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
          'AI Pick LIVE, Council AI & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
        secondaryLabel="Tunggu Besok"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="AI Pick butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}
