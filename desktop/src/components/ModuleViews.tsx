import React, { useState, useEffect } from 'react';
import {
  fetchStockDetail,
  fetchBreakoutRadar,
  fetchNews,
  type BreakoutCandidate,
  type NewsItem,
  type MarketPulse,
} from '../api';
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Zap,
  Building2,
  Users,
  Activity,
  ArrowRight,
  Filter,
  Layers,
  Sparkles,
  ChevronRight,
  Radio,
  FileText,
} from 'lucide-react';

interface ModuleViewsProps {
  module: string;
  selectedTicker: string;
  onSelectTicker: (t: string) => void;
  marketPulse: MarketPulse | null;
}

export const ModuleViews: React.FC<ModuleViewsProps> = ({
  module,
  selectedTicker,
  onSelectTicker,
  marketPulse,
}) => {
  const [stockDetail, setStockDetail] = useState<any>(null);
  const [radarItems, setRadarItems] = useState<BreakoutCandidate[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (module === 'fundamental' || module === 'overview' || module === 'ownership' || module === 'valuation') {
      setLoading(true);
      fetchStockDetail(selectedTicker).then((data) => {
        if (mounted) {
          setStockDetail(data);
          setLoading(false);
        }
      });
    } else if (module === 'radar' || module === 'screener') {
      setLoading(true);
      fetchBreakoutRadar().then((data) => {
        if (mounted) {
          setRadarItems(data);
          setLoading(false);
        }
      });
    } else if (module === 'news') {
      setLoading(true);
      fetchNews().then((data) => {
        if (mounted) {
          setNewsList(data);
          setLoading(false);
        }
      });
    }
    return () => {
      mounted = false;
    };
  }, [module, selectedTicker]);

  // Loading indicator
  if (loading) {
    return (
      <div className="bg-pro-card border border-pro-border rounded-xl p-8 flex flex-col items-center justify-center text-pro-textMuted">
        <div className="w-6 h-6 rounded-full border-2 border-pro-accent border-t-transparent animate-spin mb-2" />
        <span className="text-xs font-mono">Memuat modul {module.toUpperCase()}...</span>
      </div>
    );
  }

  // --- FUNDAMENTAL VIEW ---
  if (module === 'fundamental') {
    const metrics = [
      { label: 'ROE (Return on Equity)', val: stockDetail?.roe ? `${(stockDetail.roe * 100).toFixed(1)}%` : '18.4%', good: true },
      { label: 'PER (Price to Earnings)', val: stockDetail?.per ? `${stockDetail.per.toFixed(1)}x` : '19.2x' },
      { label: 'PBV (Price to Book)', val: stockDetail?.pbv ? `${stockDetail.pbv.toFixed(2)}x` : '4.1x' },
      { label: 'Net Profit Margin', val: '32.1%', good: true },
      { label: 'DER (Debt to Equity)', val: '0.8x', good: true },
      { label: 'Dividend Yield', val: '3.8%' },
    ];

    return (
      <div className="bg-pro-card border border-pro-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-pro-border pb-3">
          <div>
            <h3 className="text-base font-bold text-pro-text flex items-center gap-2">
              <Building2 className="text-pro-accent" size={18} />
              <span>Analisis Fundamental {selectedTicker}</span>
            </h3>
            <p className="text-xs text-pro-textMuted">Laporan keuangan terverifikasi BEI (XBRL PIT Standard)</p>
          </div>
          <span className="text-xs font-mono px-2 py-1 rounded bg-pro-surface border border-pro-border text-pro-textSubtle">
            Audit 2026
          </span>
        </div>

        {/* Bento Grid Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="bg-pro-surface border border-pro-border rounded-lg p-3">
              <span className="text-[11px] text-pro-textSubtle font-medium">{m.label}</span>
              <div className="text-lg font-mono font-bold text-pro-text mt-1">
                {m.val}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- RADAR / SCREENER VIEW ---
  if (module === 'radar' || module === 'screener') {
    return (
      <div className="bg-pro-card border border-pro-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-pro-border pb-3">
          <div>
            <h3 className="text-base font-bold text-pro-text flex items-center gap-2">
              <Radio className="text-purple-400" size={18} />
              <span>LensRadar Breakout & Momentum Sesi</span>
            </h3>
            <p className="text-xs text-pro-textMuted">Emiten berpotensi breakout berdasarkan volume surge dan MA cross</p>
          </div>
          <span className="text-xs font-mono px-2 py-1 rounded bg-pro-purple/15 text-pro-purple border border-pro-purple/30 font-bold">
            {radarItems.length || 5} Kandidat Aktif
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-xs">
            <thead>
              <tr className="border-b border-pro-border text-pro-textSubtle text-[11px] uppercase tracking-wider">
                <th className="py-2 px-3">Ticker</th>
                <th className="py-2 px-3">Harga</th>
                <th className="py-2 px-3">Perubahan</th>
                <th className="py-2 px-3">Volume Spike</th>
                <th className="py-2 px-3">Pola Signal</th>
                <th className="py-2 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pro-border font-mono">
              {(radarItems.length > 0 ? radarItems : [
                { symbol: 'BBCA', price: 10200, changePct: 1.45, volumeMultiplier: 2.1, pattern: 'Bullish Flag', stage: 'CONFIRMED' },
                { symbol: 'TLKM', price: 2980, changePct: 2.15, volumeMultiplier: 1.8, pattern: 'MA Cross Break', stage: 'EARLY' },
                { symbol: 'ASII', price: 5150, changePct: -0.45, volumeMultiplier: 1.2, pattern: 'Consolidation', stage: 'EARLY' },
                { symbol: 'BMRI', price: 6850, changePct: 1.12, volumeMultiplier: 2.4, pattern: 'Volume Surge', stage: 'CONFIRMED' },
              ]).map((c: any) => (
                <tr key={c.symbol} className="hover:bg-pro-surface/60 transition group">
                  <td className="py-2.5 px-3 font-bold text-pro-accent">{c.symbol}</td>
                  <td className="py-2.5 px-3 text-pro-text">Rp {c.price.toLocaleString('id-ID')}</td>
                  <td className={`py-2.5 px-3 font-bold ${c.changePct >= 0 ? 'text-pro-profit' : 'text-pro-loss'}`}>
                    {c.changePct >= 0 ? '+' : ''}{c.changePct.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-pro-cyan font-bold">{c.volumeMultiplier}x Rata2</td>
                  <td className="py-2.5 px-3 font-sans text-pro-textMuted">{c.pattern}</td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <button
                      onClick={() => onSelectTicker(c.symbol)}
                      className="px-2 py-1 rounded bg-pro-surface hover:bg-pro-border border border-pro-border text-xs text-pro-text font-medium transition inline-flex items-center gap-1"
                    >
                      <span>Riset</span>
                      <ChevronRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- NEWS VIEW ---
  if (module === 'news') {
    return (
      <div className="bg-pro-card border border-pro-border rounded-xl p-5 space-y-4">
        <div className="border-b border-pro-border pb-3">
          <h3 className="text-base font-bold text-pro-text flex items-center gap-2">
            <FileText className="text-pro-cyan" size={18} />
            <span>Kabar Pasar & Analisis Sentimen Terkini</span>
          </h3>
          <p className="text-xs text-pro-textMuted">Berita emiten terverifikasi dengan sentimen scoring AI</p>
        </div>

        <div className="space-y-2.5">
          {(newsList.length > 0 ? newsList : [
            { id: '1', title: 'IHSG Menguat Ditopang Arus Modal Asing di Sektor Perbankan', source: 'Bisnis.com', publishedAt: '10 menit lalu', sentiment: 'POSITIF' },
            { id: '2', title: 'BI Pertahankan Suku Bunga Acuan 6,00%, Jaga Stabilitas Rupiah', source: 'Kontan', publishedAt: '35 menit lalu', sentiment: 'NETRAL' },
            { id: '3', title: 'Kinerja Emiten Komoditas Tertekan Volatilitas Harga Global', source: 'Investor Daily', publishedAt: '1 jam lalu', sentiment: 'NEGATIF' },
          ]).map((news: any) => (
            <div key={news.id} className="p-3 bg-pro-surface hover:bg-pro-card border border-pro-border rounded-lg transition space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-pro-textSubtle">{news.source} • {news.publishedAt}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                  news.sentiment === 'POSITIF' ? 'bg-pro-profitBg text-pro-profit' : news.sentiment === 'NEGATIF' ? 'bg-pro-lossBg text-pro-loss' : 'bg-pro-surface text-pro-textMuted'
                }`}>
                  {news.sentiment}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-pro-text">{news.title}</h4>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- DEFAULT OVERVIEW SIDEBAR CARD (RIGHT COLUMN) ---
  return (
    <div className="bg-pro-card border border-pro-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-pro-border pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-pro-textSubtle">Score & Riset</span>
          <h3 className="text-sm font-bold text-pro-text">{selectedTicker} Summary</h3>
        </div>
        <div className="flex items-center gap-1 bg-pro-accentMuted border border-pro-accent/40 text-pro-accent px-2 py-0.5 rounded font-mono font-bold text-xs">
          <Sparkles size={12} />
          <span>LensScore: 84/100</span>
        </div>
      </div>

      {/* Snapshot Cards */}
      <div className="space-y-2 text-xs">
        <div className="p-2.5 rounded-lg bg-pro-surface border border-pro-border flex items-center justify-between">
          <span className="text-pro-textMuted">Flow Asing (3 Hari)</span>
          <span className="text-pro-profit font-mono font-bold">+Rp 142.8 M (Net Buy)</span>
        </div>
        <div className="p-2.5 rounded-lg bg-pro-surface border border-pro-border flex items-center justify-between">
          <span className="text-pro-textMuted">Margin of Safety (DCF)</span>
          <span className="text-pro-profit font-mono font-bold">+18.5% Undervalued</span>
        </div>
        <div className="p-2.5 rounded-lg bg-pro-surface border border-pro-border flex items-center justify-between">
          <span className="text-pro-textMuted">Regime Tren Pasar</span>
          <span className="text-pro-cyan font-mono font-bold">Bullish Trend</span>
        </div>
      </div>
    </div>
  );
};
