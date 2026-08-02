'use client';

import React, { useState, useEffect } from 'react';
import { Target, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight, ShieldCheck, Search, ArrowUpDown, ChevronUp, ChevronDown, Calendar, Bot } from 'lucide-react';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';

const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');

const LIQUID_STOCKS = [
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

type SortKey = 'ticker' | 'sector' | 'price' | 'changePct' | 'consensus' | 'sentimentScore' | 'bullishVotes' | 'foreignFlow';

export default function Recommendations() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isClient, setIsClient] = useState(false);
  const fetchRef = React.useRef(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' } | null>(null);
  
  const [showPaywall, setShowPaywall] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Badge "Ada Corporate Action Hari Ini" - sebelumnya pakai data/calendar.json dummy
  // + tanggal hardcode '2026-07-28'. Sekarang pakai kalender real (/api/calendar,
  // dividen+earnings dari Yahoo Finance) dan tanggal hari ini yang sesungguhnya.
  const [stocksWithEventToday, setStocksWithEventToday] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch('/api/calendar')
      .then((res) => (res.ok ? res.json() : null))
      .then((resData) => {
        if (!resData?.events) return;
        const todayStr = new Date().toISOString().split('T')[0];
        const todayEvents = resData.events[todayStr] || [];
        setStocksWithEventToday(new Set(todayEvents.map((e: any) => e.symbol)));
      })
      .catch(() => {});
  }, []);

  const fetchRecommendations = async () => {
    setLoading(true);
    setData([]);
    setLastUpdate(new Date());

    try {
      const chunkSize = 10;
      for (let i = 0; i < LIQUID_STOCKS.length; i += chunkSize) {
        const chunk = LIQUID_STOCKS.slice(i, i + chunkSize);
        const res = await fetch(`/api/recommendations?symbols=${chunk.join(',')}`, { cache: 'no-store' });
        
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
        if (!res.ok) continue;

        if (json.recommendations) {
          setData(prev => {
            const newItems = json.recommendations.filter((newItem: any) =>
              !prev.some((existing: any) => existing.ticker === newItem.ticker)
            );
            const merged = [...prev, ...newItems];
            
            // Kirim data rekomendasi ke AI Chat supaya jawaban AI lebih substantif
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
          setLastUpdate(new Date());
        }
      }
    } catch (e) {
      console.error('Failed to fetch recommendations', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsClient(true);
    if (fetchRef.current) return;
    fetchRef.current = true;
    fetchRecommendations();
  }, []);

  const formatTime = (date: Date) => date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortKey) => {
    if (sortConfig?.key === key) {
      return sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />;
    }
    return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />;
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
          const flowMap: any = { 'STRONG NET BUY': 4, 'NET BUY': 3, 'NEUTRAL': 2, 'NET SELL': 1, 'STRONG NET SELL': 0 };
          aValue = flowMap[a?.foreignFlow] ?? 2;
          bValue = flowMap[b?.foreignFlow] ?? 2;
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

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <header className="bg-tv-card border-b border-tv-border px-6 py-3 sticky top-0 z-20 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-tv-hover border border-tv-borderLight text-tv-green">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg text-white tracking-tight">Rekomendasi Top 50 (Screener AI)</h2>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-tv-green/20 text-tv-green border border-tv-green/30">
                SYSTEM AI
              </span>
            </div>
            <p className="text-xs text-tv-muted font-mono">
              Memindai {LIQUID_STOCKS.length} Saham Paling Aktif secara Real-time
            </p>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <button
              onClick={fetchRecommendations}
              disabled={loading}
              className="bg-tv-hover border border-tv-borderLight hover:bg-tv-borderLight px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Sedang Memindai...' : 'Refresh Data'}
            </button>
            <div className="bg-tv-card border border-tv-border px-3 py-1.5 rounded-full text-tv-muted">
              Update: {isClient && lastUpdate ? formatTime(lastUpdate) : 'Menunggu...'}
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
              className="w-full bg-tv-card border border-tv-border rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-tv-muted focus:outline-none focus:border-tv-green font-mono transition-colors shadow-sm"
            />
          </div>
        </div>

        <div className="bg-tv-card border border-tv-border rounded-xl shadow-1 overflow-hidden">
          <div className="overflow-x-auto min-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-tv-hover border-b border-tv-border text-xs font-mono text-tv-muted uppercase tracking-wider select-none">
                  <th
                    className="p-4 font-semibold cursor-pointer group hover:bg-tv-border transition-colors"
                    onClick={() => handleSort('ticker')}
                  >
                    <div className="flex items-center gap-1.5">Simbol {getSortIcon('ticker')}</div>
                  </th>
                  <th
                    className="p-4 font-semibold cursor-pointer group hover:bg-tv-border transition-colors"
                    onClick={() => handleSort('sector')}
                  >
                    <div className="flex items-center gap-1.5">Sektor {getSortIcon('sector')}</div>
                  </th>
                  <th
                    className="p-4 font-semibold text-right cursor-pointer group hover:bg-tv-border transition-colors"
                    onClick={() => handleSort('price')}
                  >
                    <div className="flex items-center justify-end gap-1.5">{getSortIcon('price')} Harga (Rp)</div>
                  </th>
                  <th
                    className="p-4 font-semibold text-right cursor-pointer group hover:bg-tv-border transition-colors"
                    onClick={() => handleSort('changePct')}
                  >
                    <div className="flex items-center justify-end gap-1.5">{getSortIcon('changePct')} Perubahan (%)</div>
                  </th>
                  <th
                    className="p-4 font-semibold text-center cursor-pointer group hover:bg-tv-border transition-colors"
                    onClick={() => handleSort('consensus')}
                  >
                    <div className="flex items-center justify-center gap-1.5">{getSortIcon('consensus')} Konsensus 10 AI</div>
                  </th>
                  <th
                    className="p-4 font-semibold text-center cursor-pointer group hover:bg-tv-border transition-colors"
                    onClick={() => handleSort('sentimentScore')}
                  >
                    <div className="flex items-center justify-center gap-1.5">{getSortIcon('sentimentScore')} Sentimen Momentum</div>
                  </th>
                  <th
                    className="p-4 font-semibold text-center cursor-pointer group hover:bg-tv-border transition-colors"
                    onClick={() => handleSort('foreignFlow')}
                  >
                    <div className="flex items-center justify-center gap-1.5">{getSortIcon('foreignFlow')} Estimasi Asing</div>
                  </th>
                  <th
                    className="p-4 font-semibold text-right cursor-pointer group hover:bg-tv-border transition-colors"
                    onClick={() => handleSort('bullishVotes')}
                  >
                    <div className="flex items-center justify-end gap-1.5">{getSortIcon('bullishVotes')} Vote (Bull:Bear)</div>
                  </th>
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
                        <span>{loading ? 'Menyaring rekomendasi terbaik...' : `Tidak ada data saham yang cocok dengan kriteria atau pencarian "${searchTerm}"`}</span>
                      </div>
                    </td>
                  </tr>
                ) : processedData.map((item, idx) => (
                  <tr key={item.ticker} className="border-b border-tv-border/50 hover:bg-tv-hover/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base">{item.ticker}</span>
                        {idx < 3 && item.consensus?.includes('BUY') && sortConfig === null && !searchTerm && (
                          <span title="Top Pick">
                            <ShieldCheck className="w-4 h-4 text-tv-green" />
                          </span>
                        )}
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
                      <div className={`inline-flex items-center justify-center px-3 py-1 rounded font-bold font-mono text-xs ${item.consensus?.includes('BUY') ? 'bg-tv-green/20 text-tv-green border border-tv-green' :
                          item.consensus?.includes('SELL') ? 'bg-tv-red/20 text-tv-red border border-tv-red' :
                            'bg-tv-yellow/20 text-tv-yellow border border-tv-yellow'
                        }`}>
                        {item.consensus} ({item.confidence}%)
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className={`text-xs font-bold ${item.sentimentScore >= 55 ? 'text-tv-green' : item.sentimentScore <= 45 ? 'text-tv-red' : 'text-tv-yellow'
                          }`}>
                          {item.sentimentLabel}
                        </span>
                        <div className="w-24 h-1.5 bg-tv-bg rounded-full overflow-hidden flex">
                          <div className="h-full bg-gradient-to-r from-tv-red via-tv-yellow to-tv-green" style={{ width: `${item.sentimentScore}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className={`inline-flex items-center justify-center px-3 py-1 rounded font-bold font-mono text-[11px] ${item.foreignFlow?.includes('BUY') ? 'bg-tv-green/10 text-tv-green border border-tv-green/50' :
                          item.foreignFlow?.includes('SELL') ? 'bg-tv-red/10 text-tv-red border border-tv-red/50' :
                            'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/50'
                        }`}>
                        {item.foreignFlow || 'NEUTRAL'}
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono text-tv-muted">
                      <div><span className="text-tv-green">{item.bullishVotes}</span> : <span className="text-tv-red">{item.bearishVotes}</span></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
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
        body="Rekomendasi saham butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}
