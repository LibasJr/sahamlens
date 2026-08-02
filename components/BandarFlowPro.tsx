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
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFlowData = async () => {
      setLoading(true);
      try {
        const cleanSymbol = symbol.replace('.JK', '');
        const res = await fetch(`/api/flow/${cleanSymbol}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('Failed to fetch flow data', err);
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchFlowData();
    }
  }, [symbol]);

  if (loading) {
    return (
      <div className="w-full h-48 flex items-center justify-center bg-tv-bg border border-tv-border rounded-xl">
        <Activity className="w-6 h-6 text-tv-green animate-spin" />
        <span className="ml-3 text-sm font-mono text-tv-muted">Analisa Bandar Flow...</span>
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;

  let insightColor = 'bg-gray-800/40 border-gray-600 text-gray-300';
  let insightBadge = 'bg-gray-500 text-white';
  let insightTitle = 'NETRAL';
  let insightMessage = 'Belum ada tren arus dana yang konsisten dalam 3 hari terakhir.';

  if (summary.status === 'AKUMULASI') {
    insightColor = 'bg-tv-green/10 border-tv-green/50 text-tv-green';
    insightBadge = 'bg-tv-green text-white';
    insightTitle = 'TEKANAN BELI KONSISTEN';
    insightMessage = summary.streak >= 3
      ? `Akumulasi ${summary.streak} hari berturut-turut - volume di hari naik lebih besar dari hari turun.`
      : 'Tekanan beli mendominasi 3 hari terakhir.';
  } else if (summary.status === 'DISTRIBUSI') {
    insightColor = 'bg-tv-red/10 border-tv-red/50 text-tv-red';
    insightBadge = 'bg-tv-red text-white';
    insightTitle = 'TEKANAN JUAL KONSISTEN';
    insightMessage = 'Volume di hari turun lebih besar dari hari naik 3 hari terakhir - waspada.';
  }

  return (
    <div className="bg-tv-bg border border-tv-border rounded-xl p-5 shadow-1 flex flex-col gap-6">

      {/* Header & Status */}
      <div className="flex items-center justify-between border-b border-tv-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <Building className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-white text-lg">Bandar & Foreign Flow</h3>
            <p className="text-xs text-tv-muted font-mono">Estimasi arus dana dari volume transaksi - bukan data broker resmi</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {summary.status === 'AKUMULASI' && (
            <div className="px-4 py-1.5 rounded-full bg-tv-green/20 border border-tv-green text-tv-green font-bold text-sm font-mono animate-pulse">
              AKUMULASI
            </div>
          )}
          {summary.status === 'DISTRIBUSI' && (
            <div className="px-4 py-1.5 rounded-full bg-tv-red/20 border border-tv-red text-tv-red font-bold text-sm font-mono">
              DISTRIBUSI
            </div>
          )}
          {summary.status === 'NETRAL' && (
            <div className="px-4 py-1.5 rounded-full bg-gray-500/20 border border-gray-500 text-gray-400 font-bold text-sm font-mono">
              NETRAL
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Chart & Insight */}
        <div className="flex flex-col gap-4">
          <div className={`w-full p-4 rounded-lg border ${insightColor} flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold font-mono">
                <AlertCircle className="w-4 h-4" />
                {insightTitle}
              </div>
              {summary.streak >= 3 && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${insightBadge}`}>
                  <Flame className="w-3 h-3" /> {summary.streak} HARI
                </span>
              )}
            </div>
            <div className="text-xs font-mono opacity-90 leading-relaxed">
              {insightMessage}
            </div>
          </div>

          <div className="bg-tv-card rounded-lg p-4 border border-tv-border flex-1">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-white font-mono">Estimasi Net Buy 20 Hari</h4>
              <span className={`text-xs font-bold font-mono ${summary.net5D > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                5D Net: {summary.net5D > 0 ? '+' : ''}{summary.net5D} M
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
                    <div className="absolute -top-8 bg-black/80 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                      {d.date}: {d.netValueBillion > 0 ? '+' : ''}{d.netValueBillion}M
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Ringkasan 20 Hari - pengganti panel broker (dihapus, tidak ada sumber data
            broker gratis) - dua angka nyata dari histori harga/volume yang sama. */}
        <div className="bg-tv-card rounded-lg p-4 border border-tv-border">
          <h4 className="text-sm font-bold text-white font-mono mb-4">Ringkasan 20 Hari</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-mono text-tv-green border-b border-tv-border pb-1 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Hari Naik
              </div>
              <div className="text-2xl font-bold font-mono text-white">{summary.upDays20D}<span className="text-sm text-tv-muted"> /20</span></div>
              <div className="text-[11px] font-mono text-tv-muted">Rata² nilai: <span className="text-tv-green">{summary.avgUpValueBillion}M</span></div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-mono text-tv-red border-b border-tv-border pb-1 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" /> Hari Turun
              </div>
              <div className="text-2xl font-bold font-mono text-white">{summary.downDays20D}<span className="text-sm text-tv-muted"> /20</span></div>
              <div className="text-[11px] font-mono text-tv-muted">Rata² nilai: <span className="text-tv-red">{summary.avgDownValueBillion}M</span></div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-tv-border text-[11px] font-mono text-tv-muted leading-relaxed">
            Dihitung dari volume transaksi x arah harga harian (Yahoo Finance) - proxy tekanan beli/jual pasar, BUKAN data broker/asing resmi (IDX tidak menyediakan feed broker gratis).
          </div>
        </div>
      </div>
    </div>
  );
}
