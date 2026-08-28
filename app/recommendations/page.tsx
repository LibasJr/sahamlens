'use client';

import React, { useState, useEffect } from 'react';
import { Target, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight, Search, ArrowUpDown, ChevronUp, ChevronDown, Calendar, Bot } from 'lucide-react';
import { FREE_LIMITS } from '@/shared/constants/limits';
import { MONTHLY_PRICE, formatRupiah } from '@/shared/config/pricing';
import { shouldShowLoginPromptFor401 } from '@/lib/auth-gate';
import PaywallModal from '@/components/PaywallModal';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Card, Button, PageContainer } from '@/components/ui';
import { getKategoriPresentationLabel, getKategoriTone } from '@/shared/presentation/signal-labels';
import { AI_PICK_UNIVERSE } from '@/modules/market/constants/ai-pick-universe';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { percentageWidthClass } from '@/shared/presentation/percentage-width';

const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

const LIQUID_STOCKS = AI_PICK_UNIVERSE;

type SortKey = 'ticker' | 'sector' | 'price' | 'changePct' | 'consensus' | 'sentimentScore' | 'bullishVotes' | 'foreignFlow';

// Audit BUILD 001 (item terminologi Money Flow): IDX tidak menyediakan feed broker
// asing gratis - nilai `foreignFlow` (dari analyzeAccumulationSignal, proxy Chaikin
// Money Flow + volume) SEBELUMNYA ditampilkan apa adanya sebagai "STRONG NET BUY"/
// "NET SELL" dst, istilah yang lazim dipakai untuk data broker asing SUNGGUHAN dan
// bisa menyesatkan pengguna mengira ini data resmi. Field/tipe internal TIDAK diubah
// (dipakai calculateScore() di banyak modul) - cuma label TAMPILAN diganti jujur,
// konsisten dengan wording "Akumulasi/Distribusi" yang sudah dipakai Bandarmology.
const FOREIGN_FLOW_LABEL: Record<string, string> = {
  'STRONG NET BUY': 'AKUMULASI KUAT',
  'NET BUY': 'AKUMULASI',
  'NEUTRAL': 'NETRAL',
  'NET SELL': 'DISTRIBUSI',
  'STRONG NET SELL': 'DISTRIBUSI KUAT',
  'UNAVAILABLE': 'DATA N/A',
};

type SortConfig = { key: SortKey; direction: 'asc' | 'desc' } | null;

const TH_ALIGN = { left: '', right: 'text-right justify-end', center: 'text-center justify-center' } as const;

/**
 * Header kolom yang bisa diurutkan.
 *
 * SEBELUMNYA `<th onClick={...}>` polos. `<th>` bukan elemen fokusabel dan tidak punya
 * peran interaktif, jadi kedelapan kontrol pengurutan di tabel ini mustahil dipakai
 * tanpa mouse - dan pembaca layar tidak pernah diberi tahu kolom mana yang sedang
 * menjadi dasar urutan. Aksinya sekarang dibawa <Button variant="bare" size="none"> sungguhan, dan `aria-sort`
 * dipasang di `<th>` (bukan di tombolnya) sesuai WAI-ARIA.
 *
 * Didefinisikan di module scope, BUKAN di dalam Recommendations: komponen yang lahir
 * ulang tiap render akan melepas-pasang DOM-nya, dan tabel ini memang re-render terus
 * selama pemindaian berjalan - fokus keyboard di tombol header akan hilang tiap batch.
 */
function SortableTh({
  label, sortKey, align = 'left', sortConfig, onSort, children,
}: {
  label: string;
  sortKey: SortKey;
  align?: keyof typeof TH_ALIGN;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
  children?: React.ReactNode;
}) {
  const active = sortConfig?.key === sortKey;
  const icon = active
    ? (sortConfig!.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)
    : <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />;

  return (
    <th
      className={`p-4 font-semibold ${align === 'left' ? '' : TH_ALIGN[align].split(' ')[0]}`}
      aria-sort={active ? (sortConfig!.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {children}
      <Button variant="bare" size="none"
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Urutkan menurut ${label}`}
        className={`group inline-flex min-h-6 w-full items-center gap-1.5 rounded transition-colors hover:text-tv-text ${TH_ALIGN[align]} ${active ? 'text-tv-text' : ''}`}
      >
        {align === 'left' ? <>{label} {icon}</> : <>{icon} {label}</>}
      </Button>
    </th>
  );
}

export default function ResearchIdeasPage() {
  const { loading: authLoading, resolved: authResolved, user: authUser } = useAuthUser();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [cacheMeta, setCacheMeta] = useState<{ cachedAgeSec: number; cacheTtlSec: number } | null>(null);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [failedChunks, setFailedChunks] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const fetchRef = React.useRef(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' } | null>(null);
  
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Badge "Ada Corporate Action Hari Ini" - sebelumnya pakai data/calendar.json dummy
  // + tanggal hardcode '2026-07-28'. Sekarang pakai kalender real (/api/calendar,
  // dividen+earnings dari Yahoo Finance) dan tanggal hari ini yang sesungguhnya.
  const [stocksWithEventToday, setStocksWithEventToday] = useState<Set<string>>(new Set());
  useEffect(() => {
    apiRequest<any>('/api/calendar')
      .then((resData) => {
        if (!resData?.events) return;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const todayEvents = resData.events[todayStr] || [];
        setStocksWithEventToday(new Set(todayEvents.map((e: any) => e.symbol)));
      })
      .catch(() => {});
  }, []);

  const fetchRecommendations = async (signal?: AbortSignal) => {
    setLoading(true);
    setData([]);
    setLastUpdate(null);
    setScanError(null);
    setFailedChunks(0);

    try {
      const chunkSize = 10;
      for (let i = 0; i < LIQUID_STOCKS.length; i += chunkSize) {
        const chunk = LIQUID_STOCKS.slice(i, i + chunkSize);
        let json: any;
        try {
          json = await apiRequest<any>(`/api/recommendations?symbols=${chunk.join(',')}`, { cache: 'no-store', signal });
        } catch (error) {
          if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') {
            if (await shouldShowLoginPromptFor401()) setShowLoginPrompt(true);
            return;
          }
          if (isApiClientError(error) && error.code === 'SUBSCRIPTION_REQUIRED') {
            setShowPaywall(true);
            return;
          }
          setFailedChunks((count) => count + 1);
          setScanError(isApiClientError(error) ? error.message : `Sebagian pemindaian gagal pada batch ${Math.floor(i / chunkSize) + 1}.`);
          continue;
        }
        if (json?.modelValidation?.validated === false && typeof json.modelValidation.message === 'string') {
          setModelNotice(json.modelValidation.message);
        }
        // Umur cache hasil scan (temuan M-13) - backend mengirimnya lewat `_meta`, dulu
        // tidak pernah dibaca sehingga hasil cron 14 menit lalu tampil seperti baru.
        if (json?._meta) setCacheMeta(json._meta);

        if (json.recommendations) {
          setData(prev => {
            const newItems = json.recommendations.filter((newItem: any) =>
              !prev.some((existing: any) => existing.ticker === newItem.ticker)
            );
            const merged = [...prev, ...newItems];
            
            // Kirim data ide riset ke AI Chat supaya jawaban AI lebih substantif
            window.dispatchEvent(new CustomEvent('update-ai-context', { 
              detail: {
                symbol: 'RECOMMENDATIONS',
                modelValidation: json.modelValidation,
                recommendations: merged.map((r: any) => ({
                  ticker: r.ticker,
                  price: r.price,
                  change: r.change,
                  consensus: r.consensus,
                  confidence: r.confidence,
                  foreignFlow: r.foreignFlow,
                  sentiment: r.sentimentLabel,
                  modelSignal: r.scoringKategori,
                  decision: r.decision,
                  eligibilityStatus: r.eligibilityStatus,
                  eligibilityReasons: r.eligibilityReasons
                }))
              }
            }));
            
            return merged;
          });
          const snapshotTime = new Date(json.dataTimestamp);
          setLastUpdate(Number.isNaN(snapshotTime.getTime()) ? null : snapshotTime);
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Failed to fetch recommendations', e);
      setScanError('Pemindaian gagal menghubungi server. Hasil tidak dianggap lengkap.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    setIsClient(true);
    if (fetchRef.current) return;
    fetchRef.current = true;
    const controller = new AbortController();
    fetchRecommendations(controller.signal);
    return () => controller.abort();
  }, []);

  const formatTime = (date: Date) => new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date) + ' WIB';

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const processedData = React.useMemo(() => {
    let result = [...data];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        (item?.ticker?.toLowerCase() || '').includes(term) ||
        (item?.sector?.toLowerCase() || '').includes(term) ||
        (item?.consensus?.toLowerCase() || '').includes(term) ||
        (item?.sentimentLabel?.toLowerCase() || '').includes(term) ||
        (item?.foreignFlow?.toLowerCase() || '').includes(term)
      );
    } else {
      // SCREENER FILTER removed: Show all stocks so users can use the table sort features
      // result = result.filter(item => { ... })
    }

    if (sortConfig !== null) {
      result.sort((a, b) => {
        let aValue = a?.[sortConfig.key];
        let bValue = b?.[sortConfig.key];

        if (sortConfig.key === 'consensus') {
          const scoreMap: any = { 'STRONG BUY': 5, 'BUY': 4, 'HOLD': 3, 'SELL': 2, 'STRONG SELL': 1, 'NEUTRAL': 3 };
          aValue = (scoreMap[a?.consensus] || 0) * 100 + (a?.confidence || 0);
          bValue = (scoreMap[b?.consensus] || 0) * 100 + (b?.confidence || 0);
        } else if (sortConfig.key === 'foreignFlow') {
          const flowMap: any = { 'STRONG NET BUY': 4, 'NET BUY': 3, 'NEUTRAL': 2, 'NET SELL': 1, 'STRONG NET SELL': 0, 'UNAVAILABLE': -1 };
          aValue = flowMap[a?.foreignFlow] ?? -1;
          bValue = flowMap[b?.foreignFlow] ?? -1;
        }

        if (aValue === undefined || aValue === null) aValue = '';
        if (bValue === undefined || bValue === null) bValue = '';

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      result.sort((a, b) => (b?.sentimentScore || 0) - (a?.sentimentScore || 0));
    }

    return result.slice(0, 50);
  }, [data, searchTerm, sortConfig]);

  // GEMBOK TAMU (2026-08-23). Pengunjung dapat SATU ide riset teratas beserta seluruh
  // alasannya - cukup untuk menilai apakah analisisnya layak dipercaya - lalu sisanya
  // dikunci dengan jumlahnya disebutkan. Menyebut angka konkret ("49 saham lainnya")
  // memancing lebih kuat daripada ajakan masuk tanpa konteks.
  const lockForGuest = !authResolved || authLoading || !authUser;
  const visibleData = lockForGuest ? processedData.slice(0, 1) : processedData;
  const lockedCount = processedData.length - visibleData.length;

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <header className="bg-tv-card border-b border-tv-border px-6 py-3 sticky top-0 z-20 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-tv-hover border border-tv-borderLight text-tv-green">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="lens-page-title">Scanner Teknikal Top 50 (LensScanner)</h2>
              <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded bg-tv-green/20 text-tv-green border border-tv-green/30">
                LENSSCANNER
              </span>
            </div>
            <p className="text-xs text-tv-muted font-sans">
              Memindai {LIQUID_STOCKS.length} saham aktif dari data pasar; sinyal adalah bahan riset, bukan arahan beli/jual.
            </p>
          </div>
        </div>
      </header>

      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        {modelNotice && (
          <div className="rounded-lg border border-tv-warning/40 bg-tv-warning/10 px-4 py-3 text-xs text-tv-warning">
            {modelNotice}
          </div>
        )}
        {scanError && (
          <div className="rounded-lg border border-tv-red/40 bg-tv-red/10 px-4 py-3 text-xs text-tv-red">
            {scanError}{failedChunks > 0 ? ` ${failedChunks} batch tidak berhasil dimuat; daftar di bawah bukan cakupan penuh universe.` : ''}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs font-sans">
            <Button variant="bare" size="none"
              onClick={() => fetchRecommendations()}
              disabled={loading}
              className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Sedang Memindai...' : 'Refresh Data'}
            </Button>
            <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted">
              Data sesi: {isClient && lastUpdate ? formatTime(lastUpdate) : 'menunggu timestamp sumber'}
              {cacheMeta && (
                <span className="ml-2 text-tv-muted">
                  · Skor {cacheMeta.cachedAgeSec < 60 ? 'baru dihitung' : `dihitung ${Math.round(cacheMeta.cachedAgeSec / 60)} menit lalu`}
                </span>
              )}
              {loading && ` (Scanned: ${data.length}/${LIQUID_STOCKS.length})`}
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-tv-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <SymbolAutocomplete
              containerClassName=""
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              onFocus={(e: any) => e.target.select()}
              placeholder="Cari simbol, sinyal..."
              className="w-full bg-tv-card border border-tv-border rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-tv-muted focus:outline-none focus:border-tv-green font-sans transition-colors shadow-sm"
            />
          </div>
        </div>

        <Card padding="none" radius="xl" elevation="sm" overflow="hidden" highlight={false} className="border-tv-border">
          <div className="lens-table-sticky-col [--lens-sticky-head-bg:rgb(var(--lens-hover))] overflow-x-auto min-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-tv-hover border-b border-tv-border text-xs font-mono text-tv-muted uppercase tracking-wider select-none">
                  <SortableTh label="Simbol" sortKey="ticker" sortConfig={sortConfig} onSort={handleSort} />
                  <SortableTh label="Sektor" sortKey="sector" sortConfig={sortConfig} onSort={handleSort} />
                  <SortableTh label="Harga (Rp)" sortKey="price" align="right" sortConfig={sortConfig} onSort={handleSort} />
                  <SortableTh label="Perubahan (%)" sortKey="changePct" align="right" sortConfig={sortConfig} onSort={handleSort} />
                  <SortableTh label="Konsensus Indikator" sortKey="consensus" align="center" sortConfig={sortConfig} onSort={handleSort} />
                  <SortableTh label="Bias Teknikal" sortKey="sentimentScore" align="center" sortConfig={sortConfig} onSort={handleSort}>
                    {/* Label diperbaiki (audit 2026-08-05, temuan H-9): kolom ini tidak
                        pernah mengukur sentimen - isinya persentase analyzer teknikal yang
                        bervote bullish. */}
                  </SortableTh>
                  <SortableTh label="Sinyal Arus Dana" sortKey="foreignFlow" align="center" sortConfig={sortConfig} onSort={handleSort} />
                  <SortableTh label="Vote (Bull:Bear)" sortKey="bullishVotes" align="right" sortConfig={sortConfig} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="text-sm">
                {data.length === 0 && loading ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-tv-muted">
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="w-6 h-6 animate-spin text-tv-green" />
                        <span>Mulai memindai {LIQUID_STOCKS.length} saham aktif. Mohon tunggu...</span>
                      </div>
                    </td>
                  </tr>
                ) : processedData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-tv-muted">
                      <div className="flex flex-col items-center gap-3">
                        <Search className="w-6 h-6 text-tv-muted opacity-50" />
                        <span>{loading ? 'Menyaring ide riset terbaik...' : scanError ? 'Pemindaian gagal sebelum menghasilkan daftar lengkap.' : searchTerm ? `Tidak ada data saham yang cocok dengan pencarian "${searchTerm}"` : 'Belum ada hasil pemindaian yang dapat ditampilkan.'}</span>
                      </div>
                    </td>
                  </tr>
                ) : visibleData.map((item, idx) => (
                  <tr key={item.ticker} className="border-b border-tv-border/50 hover:bg-tv-hover/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base">{item.ticker}</span>
                        {stocksWithEventToday.has(item.ticker) && (
                          <span title="Ada Corporate Action Hari Ini">
                            <Calendar className="w-4 h-4 text-amber-400" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-xs font-mono text-tv-muted max-w-[150px] truncate" title={item.sector}>
                      {item.sector || '-'}
                    </td>
                    <td className="p-4 text-right font-mono text-white font-semibold">
                      {item.price?.toLocaleString('id-ID')}
                    </td>
                    <td className="p-4 text-right font-mono flex justify-end items-center gap-1">
                      <span className={`font-bold flex items-center ${item.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                        {item.changePct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        {item.changePct}%
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {/* BUG FIX (2026-08-06, sweep "font beda"): font-mono khusus data
                          tabular/kode (aturan app/globals.css), bukan kata status BUY/SELL.
                          BUG FIX (audit label ide riset 2026-08-15): `item.consensus`
                          adalah nilai classifier internal ('STRONG BUY' dst, lihat
                          consensus.service.ts) - dulu dirender apa adanya, terbaca sebagai
                          ajakan transaksi ("STRONG BUY" hijau tebal) padahal model BELUM
                          lolos validasi backtest out-of-sample. Dipetakan ke label sinyal
                          via getKategoriPresentationLabel(); `item.confidence` sendiri
                          sudah dilabeli "vote" (bukan "confidence") di teks - itu memang
                          persentase vote analyzer yang sepakat, bukan probabilitas hasil. */}
                      <div className={`inline-flex items-center justify-center px-3 py-1 rounded font-bold font-sans text-xs ${getKategoriTone(item.consensus) === 'positive' ? 'bg-tv-green/20 text-tv-green border border-tv-green' :
                          getKategoriTone(item.consensus) === 'negative' ? 'bg-tv-red/20 text-tv-red border border-tv-red' :
                            'bg-tv-yellow/20 text-tv-yellow border border-tv-yellow'
                        }`}>
                        {getKategoriPresentationLabel(item.consensus)} (vote {item.confidence}%)
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className={`text-xs font-bold ${
                          item.sentimentScore == null ? 'text-tv-muted'
                            : item.sentimentScore >= 55 ? 'text-tv-green'
                            : item.sentimentScore <= 45 ? 'text-tv-red' : 'text-tv-yellow'
                          }`}>
                          {item.sentimentLabel}
                        </span>
                        {item.sentimentScore != null && (
                          <>
                            <div className="w-24 h-1.5 bg-tv-bg rounded-full overflow-hidden flex">
                              <div className={`h-full bg-gradient-to-r from-tv-red via-tv-yellow to-tv-green ${percentageWidthClass(item.sentimentScore)}`} />
                            </div>
                            <span className="text-[10px] text-tv-muted font-mono">{item.sentimentScore}% bullish</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className={`inline-flex items-center justify-center px-3 py-1 rounded font-bold font-sans text-[11px] ${item.foreignFlow?.includes('BUY') ? 'bg-tv-green/10 text-tv-green border border-tv-green/50' :
                          item.foreignFlow?.includes('SELL') ? 'bg-tv-red/10 text-tv-red border border-tv-red/50' :
                            item.foreignFlow === 'UNAVAILABLE' ? 'bg-tv-card text-tv-muted border border-tv-border' :
                            'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/50'
                        }`}>
                        {FOREIGN_FLOW_LABEL[item.foreignFlow] || item.foreignFlow || 'DATA N/A'}
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono text-tv-muted">
                      <div><span className="text-tv-green">{item.bullishVotes}</span> : <span className="text-tv-red">{item.bearishVotes}</span></div>
                    </td>
                  </tr>
                ))}
                {lockedCount > 0 && (
                  <tr className="border-b border-tv-border/50">
                    <td colSpan={8} className="p-0">
                      <Link
                        href="/login?next=/recommendations"
                        className="flex items-center justify-center gap-2 px-4 py-6 text-sm font-bold text-tv-blue transition hover:bg-tv-hover"
                      >
                        <Lock className="h-4 w-4" />
                        Masuk untuk melihat {lockedCount} ide riset lainnya
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContainer>
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini. Upgrade Pro ${formatRupiah(MONTHLY_PRICE)}/bulan untuk unlimited 10 filters + LensRadar scan berkala.`}
        benefits={[
          'Unlimited LensTechnical (10 filter)',
          'LensRadar scan berkala, LensConsensus & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
        secondaryLabel="Tunggu Besok"
      />
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="Ide riset saham butuh akun gratis. Daftar untuk memakai fitur selama masa pengujian."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}
