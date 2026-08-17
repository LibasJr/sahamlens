'use client';

import React, { useState, useEffect } from 'react';
import {
  Building,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  Flame,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import BrokerSummaryPanel from '@/components/broker/BrokerSummaryPanel';

interface BandarFlowProProps {
  symbol: string;
}

// Bandar & Foreign Flow - REWRITE TOTAL (2026-08-01): dulu memanggil /api/flow/[ticker]
// yang mengembalikan data acak (seedRandom), termasuk nama broker & volume beli/jual
// palsu. Sekarang seluruh komponen ini murni menampilkan proxy dari harga+volume nyata
// (lihat modules/market/service/foreign-flow-proxy.ts) - panel "Top Broker" DIHAPUS
// (bukan diganti versi jujur, karena tidak ada sumber data broker gratis), diganti
// ringkasan 20 hari yang bisa dihitung dari data yang benar-benar ada.
export default function BandarFlowPro({ symbol }: BandarFlowProProps) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFlowData = async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const cleanSymbol = symbol.replace('.JK', '');
        const res = await fetch(`/api/flow/${cleanSymbol}`);
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(
            json?.error ||
              (res.status === 402
                ? language === 'en'
                  ? 'LensFlow requires an active account.'
                  : 'LensFlow memerlukan akses akun.'
                : language === 'en'
                  ? 'Money flow data temporarily unavailable.'
                  : 'Data arus dana sementara tidak tersedia.')
          );
        } else if (!json?.summary || !Array.isArray(json.foreignFlow20D)) {
          setError(
            language === 'en'
              ? 'Incomplete money flow response. Please refresh the page.'
              : 'Respons data arus dana tidak lengkap. Coba segarkan halaman.'
          );
        } else {
          setData(json);
        }
      } catch (err) {
        console.error('Failed to fetch flow data', err);
        setError(
          language === 'en'
            ? 'Failed to fetch money flow data. Please try again.'
            : 'Gagal mengambil data arus dana. Silakan coba lagi.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchFlowData();
  }, [symbol, language]);

  if (loading) {
    return (
      <div className="bg-tv-bg border border-tv-border rounded-xl p-5 shadow-1 flex flex-col gap-4 animate-pulse">
        <div className="flex justify-between items-center pb-4 border-b border-tv-border">
          <div className="h-6 w-48 bg-tv-hover rounded" />
          <div className="h-6 w-24 bg-tv-hover rounded" />
        </div>
        <div className="h-28 bg-tv-hover rounded-lg" />
        <div className="h-40 bg-tv-hover rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-tv-bg border border-tv-border rounded-xl p-5 shadow-1 flex flex-col items-center justify-center text-center gap-3 min-h-[220px]">
        <AlertCircle className="w-8 h-8 text-tv-muted" />
        <p className="text-sm text-tv-muted max-w-sm">{error}</p>
        <button
          onClick={() => {
            const clean = symbol.replace('.JK', '');
            setLoading(true);
            setError(null);
            fetch(`/api/flow/${clean}`)
              .then((r) => r.json())
              .then((d) => {
                if (d?.summary && Array.isArray(d.foreignFlow20D)) setData(d);
                else setError(language === 'en' ? 'Data unavailable.' : 'Data tidak tersedia.');
              })
              .catch(() => setError(language === 'en' ? 'Network error.' : 'Gagal menghubungi server.'))
              .finally(() => setLoading(false));
          }}
          className="text-xs text-tv-blue hover:underline font-semibold"
        >
          {language === 'en' ? 'Try Again' : 'Coba lagi'}
        </button>
      </div>
    );
  }

  if (!data || !data.summary) {
    return null;
  }

  const { summary } = data;
  const isEn = language === 'en';
  const formatFlowValue = (value: unknown): string =>
    typeof value === 'number' && Number.isFinite(value) ? `${value}M` : 'N/A';

  const isStrong = summary.streak >= 3;
  const flowTier =
    summary.status === 'AKUMULASI' ? (isStrong ? 'STRONG ACCUMULATION' : 'ACCUMULATION') :
    summary.status === 'DISTRIBUSI' ? (isStrong ? 'STRONG DISTRIBUTION' : 'DISTRIBUTION') :
    'NEUTRAL';

  let insightColor = 'bg-tv-hover border-tv-border text-tv-muted';
  let insightBadge = 'bg-gray-500 text-white';
  let insightTitle = t('bandarFlow.neutralTitle');
  let insightMessage = t('bandarFlow.neutralMessage');

  if (summary.status === 'AKUMULASI') {
    insightColor = 'bg-tv-green/10 border-tv-green/50 text-tv-green';
    insightBadge = 'bg-tv-green text-white';
    insightTitle = t('bandarFlow.consistentBuying');
    insightMessage = isStrong
      ? t('bandarFlow.accumulationStreakMessage', { count: summary.streak })
      : t('bandarFlow.accumulationMessage');
  } else if (summary.status === 'DISTRIBUSI') {
    insightColor = 'bg-tv-red/10 border-tv-red/50 text-tv-red';
    insightBadge = 'bg-tv-red text-white';
    insightTitle = t('bandarFlow.consistentSelling');
    insightMessage = t('bandarFlow.distributionMessage');
  }

  const borderAccent = summary.status === 'AKUMULASI' ? 'border-l-tv-green' : summary.status === 'DISTRIBUSI' ? 'border-l-tv-red' : 'border-l-tv-border';
  return (
    <div className={`bg-tv-bg border border-tv-border rounded-xl p-5 shadow-1 flex flex-col gap-6 border-l-4 ${borderAccent}`}>

      {/* Header & Status */}
      <div className="flex items-center justify-between border-b border-tv-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <Building className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-white text-lg">{t('bandarFlow.title')}</h3>
            <p className="text-xs text-tv-muted font-sans">{t('bandarFlow.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {summary.status === 'AKUMULASI' && (
            <div className={`px-4 py-1.5 rounded-full border font-bold text-sm font-sans ${isStrong ? 'bg-tv-green/30 border-tv-green text-tv-green animate-pulse' : 'bg-tv-green/10 border-tv-green/60 text-tv-green'}`}>
              {flowTier}
            </div>
          )}
          {summary.status === 'DISTRIBUSI' && (
            <div className={`px-4 py-1.5 rounded-full border font-bold text-sm font-sans ${isStrong ? 'bg-tv-red/30 border-tv-red text-tv-red' : 'bg-tv-red/10 border-tv-red/60 text-tv-red'}`}>
              {flowTier}
            </div>
          )}
          {summary.status === 'NETRAL' && (
            <div className="px-4 py-1.5 rounded-full bg-tv-border/40 border border-tv-border text-tv-muted font-bold text-sm font-sans">
              {flowTier}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Chart & Insight */}
        <div className="flex flex-col gap-4">
          <div className={`w-full p-4 rounded-lg border ${insightColor} flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold font-sans">
                <AlertCircle className="w-4 h-4" />
                {insightTitle}
              </div>
              {summary.streak >= 3 && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${insightBadge}`}>
                  <Flame className="w-3 h-3" /> {t('bandarFlow.daysStreak', { count: summary.streak })}
                </span>
              )}
            </div>
            <div className="text-xs font-sans opacity-90 leading-relaxed">
              {insightMessage}
            </div>
          </div>

          <div className="bg-tv-card rounded-lg p-4 border border-tv-border flex-1">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-white font-heading">{t('bandarFlow.netBuy20DTitle')}</h4>
              <span className={`text-xs font-bold font-mono ${summary.net5D > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {t('bandarFlow.net5DLabel')} {summary.net5D > 0 ? '+' : ''}{summary.net5D} M
              </span>
            </div>

            <div className="flex items-end h-32 gap-1 w-full justify-between mt-4">
              {data.foreignFlow20D.map((d: any, i: number) => {
                const maxAbs = Math.max(...data.foreignFlow20D.map((x: any) => Math.abs(x.netValueBillion)));
                const heightPct = (Math.abs(d.netValueBillion) / (maxAbs || 1)) * 100;
                const isPos = d.netValueBillion >= 0;
                return (
                  // h-full wajib di sini: tanpa ini, tinggi anak dalam persen (di bawah)
                  // tidak bisa dihitung browser (parent tanpa tinggi eksplisit karena
                  // items-end tidak men-stretch flex item) - akibatnya semua bar tidak
                  // muncul sama sekali walau heightPct terhitung benar.
                  <div key={i} className="flex-1 h-full flex flex-col justify-end items-center group relative">
                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 ${isPos ? 'bg-tv-green' : 'bg-tv-red'}`}
                      style={{ height: `${Math.max(5, heightPct)}%`, opacity: isPos ? 0.8 : 0.7 }}
                    />
                    <div className="absolute -top-8 bg-tv-card text-tv-text border border-tv-border shadow-md text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                      {d.date}: {d.netValueBillion > 0 ? '+' : ''}{d.netValueBillion}M
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Ringkasan 20 Hari berbasis CMF dari histori harga dan volume. */}
        <div className="bg-tv-card rounded-lg p-4 border border-tv-border">
          <h4 className="text-sm font-bold text-tv-text font-heading mb-4">
            {isEn ? '20-Day Summary' : 'Ringkasan 20 Hari'}
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-sans text-tv-green border-b border-tv-border pb-1 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> {isEn ? 'Up Days' : 'Hari Naik'}
              </div>
              <div className="text-2xl font-bold font-mono text-tv-text">{summary.upDays20D}<span className="text-sm text-tv-muted"> /20</span></div>
              <div className="text-[11px] font-sans text-tv-muted">
                {isEn ? 'Avg value: ' : 'Rata² nilai: '}<span className="font-mono text-tv-green">{formatFlowValue(summary.avgUpValueBillion)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-sans text-tv-red border-b border-tv-border pb-1 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" /> {isEn ? 'Down Days' : 'Hari Turun'}
              </div>
              <div className="text-2xl font-bold font-mono text-tv-text">{summary.downDays20D}<span className="text-sm text-tv-muted"> /20</span></div>
              <div className="text-[11px] font-sans text-tv-muted">
                {isEn ? 'Avg value: ' : 'Rata² nilai: '}<span className="font-mono text-tv-red">{formatFlowValue(summary.avgDownValueBillion)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="bg-tv-bg rounded-lg p-3 border border-tv-border">
              <div className="text-[10px] font-sans text-tv-muted uppercase">{isEn ? '20-Day CMF' : 'CMF 20 Hari'}</div>
              <div className={`text-xl font-bold font-mono ${summary.cmf20 > 0 ? 'text-tv-green' : summary.cmf20 < 0 ? 'text-tv-red' : 'text-tv-text'}`}>
                {summary.cmf20 > 0 ? '+' : ''}{summary.cmf20}%
              </div>
            </div>
            <div className="bg-tv-bg rounded-lg p-3 border border-tv-border">
              <div className="text-[10px] font-sans text-tv-muted uppercase">{isEn ? "Today's Net Pressure" : 'Tekanan Beli/Jual Hari Ini'}</div>
              <div className={`text-xl font-bold font-mono ${summary.netPressurePct > 0 ? 'text-tv-green' : summary.netPressurePct < 0 ? 'text-tv-red' : 'text-tv-text'}`}>
                {summary.netPressurePct > 0 ? '+' : ''}{summary.netPressurePct}%
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-tv-border text-[11px] font-sans text-tv-muted leading-relaxed">
            {isEn ? 'Data derived from Chaikin Money Flow (CMF) & volume distribution.' : 'Data dihitung dari Chaikin Money Flow (CMF) & distribusi volume transaksi.'}
          </div>
        </div>

        {/* IDX EOD Broker Summary Panel */}
        <div className="mt-6">
          <BrokerSummaryPanel symbol={symbol} />
        </div>
      </div>
    </div>
  );
}
