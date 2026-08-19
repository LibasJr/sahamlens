'use client';

import React, { useState, useEffect } from 'react';
import {
  Building,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Flame,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

interface BandarFlowProProps {
  symbol: string;
}

const OFFICIAL_SOURCE = 'IDX_OFFICIAL_API';

// Bandar & Foreign Flow.
//
// 2026-08-18: sumber utama komponen ini sekarang Net Foreign Buy/Sell RESMI Bursa Efek
// Indonesia (endpoint publik ListedCompany/GetTradingInfoSS, disinkronkan oleh
// scripts/sync-idx-foreign-flow.py). Emiten yang artefak resminya belum tersinkron tetap
// dilayani proxy Chaikin Money Flow dari harga+volume Yahoo, dan tampilannya SENGAJA
// berbeda: hanya mode resmi yang boleh menyebut angka lembar/lot asing, karena hanya di
// mode itu angkanya benar-benar berasal dari catatan transaksi investor asing di Bursa.
// Mode proxy tetap memakai badge "Estimasi Arus Dana" dan bahasa "estimasi tekanan
// beli/jual" - jangan pernah menyeragamkan dua label ini.
//
// Riwayat: sebelum 2026-08-01 komponen ini menampilkan nama broker dan volume beli/jual
// hasil seedRandom (acak tapi stabil per ticker). Sudah dihapus total.
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
  const isOfficial = data.source === OFFICIAL_SOURCE;
  const flow: any[] = data.foreignFlow20D;

  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const formatBillion = (value: unknown): string => {
    const v = num(value);
    if (v === null) return 'N/A';
    return `${v > 0 ? '+' : ''}${v.toFixed(2)} M`;
  };

  const formatInt = (value: unknown): string => {
    const v = num(value);
    if (v === null) return 'N/A';
    return v.toLocaleString(isEn ? 'en-US' : 'id-ID', { maximumFractionDigits: 0 });
  };

  const formatFlowValue = (value: unknown): string => {
    const v = num(value);
    return v === null ? 'N/A' : `${v}M`;
  };

  const accumulationStreak = num(summary.accumulationStreak) ?? num(summary.streak) ?? 0;
  const distributionStreak = num(summary.distributionStreak) ?? 0;
  const isStrong = accumulationStreak >= 3 || distributionStreak >= 3;
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
    insightMessage = isOfficial
      ? isEn
        ? `Foreign investors recorded a net buy of ${formatBillion(summary.netTodayBillion)} (IDX official record).`
        : `Investor asing tercatat net beli ${formatBillion(summary.netTodayBillion)} menurut catatan resmi BEI.`
      : accumulationStreak >= 3
        ? t('bandarFlow.accumulationStreakMessage', { count: accumulationStreak })
        : t('bandarFlow.accumulationMessage');
  } else if (summary.status === 'DISTRIBUSI') {
    insightColor = 'bg-tv-red/10 border-tv-red/50 text-tv-red';
    insightBadge = 'bg-tv-red text-white';
    insightTitle = t('bandarFlow.consistentSelling');
    insightMessage = isOfficial
      ? isEn
        ? `Foreign investors recorded a net sell of ${formatBillion(summary.netTodayBillion)} (IDX official record).`
        : `Investor asing tercatat net jual ${formatBillion(summary.netTodayBillion)} menurut catatan resmi BEI.`
      : t('bandarFlow.distributionMessage');
  }

  // --- Grafik 20 hari: batang arus dana + garis harga penutupan ------------------
  const maxAbsFlow = Math.max(
    ...flow.map((d) => Math.abs(num(d.netValueBillion) ?? num(d.netForeignValueBillion) ?? 0)),
    0
  );
  const closes = flow.map((d) => num(d.close)).filter((c): c is number => c !== null);
  const minClose = closes.length ? Math.min(...closes) : null;
  const maxClose = closes.length ? Math.max(...closes) : null;
  const closeRange = minClose !== null && maxClose !== null ? maxClose - minClose : 0;

  // Titik garis harga dipetakan ke viewBox 100x100 (preserveAspectRatio="none"), jadi
  // lebarnya ikut lebar kolom batang berapa pun ukuran layarnya. Harga datar (range 0)
  // digambar di tengah, bukan dibagi nol.
  const pricePoints = flow
    .map((d, index) => {
      const close = num(d.close);
      if (close === null || minClose === null) return null;
      const x = flow.length > 1 ? (index / (flow.length - 1)) * 100 : 50;
      const y = closeRange > 0 ? 100 - ((close - minClose) / closeRange) * 90 - 5 : 50;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter((point): point is string => point !== null)
    .join(' ');

  const borderAccent = summary.status === 'AKUMULASI' ? 'border-l-tv-green' : summary.status === 'DISTRIBUSI' ? 'border-l-tv-red' : 'border-l-tv-border';

  const buyVolume = num(summary.foreignBuyVolume);
  const sellVolume = num(summary.foreignSellVolume);
  const compositionTotal = (buyVolume ?? 0) + (sellVolume ?? 0);
  const buyPct = compositionTotal > 0 ? ((buyVolume ?? 0) / compositionTotal) * 100 : null;

  return (
    <div className={`bg-tv-bg border border-tv-border rounded-xl p-5 shadow-1 flex flex-col gap-6 border-l-4 ${borderAccent}`}>

      {/* Header & Status */}
      <div className="flex items-center justify-between border-b border-tv-border pb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <Building className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-white text-lg">{t('bandarFlow.title')}</h3>
            <p className="text-xs text-tv-muted font-sans">
              {isOfficial
                ? isEn
                  ? 'Official IDX foreign transaction record'
                  : 'Catatan transaksi investor asing resmi BEI'
                : t('bandarFlow.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {!isOfficial && (
            <div className="px-3 py-1.5 rounded-full border border-tv-border bg-tv-hover text-tv-muted font-bold text-[11px] font-sans">
              {isEn ? 'Estimated Flow (Price & Volume Proxy)' : 'Estimasi Arus Dana (Proxy Harga & Volume)'}
            </div>
          )}

          <div
            className={`px-4 py-1.5 rounded-full border font-bold text-sm font-sans ${
              summary.status === 'AKUMULASI'
                ? isStrong
                  ? 'bg-tv-green/30 border-tv-green text-tv-green animate-pulse'
                  : 'bg-tv-green/10 border-tv-green/60 text-tv-green'
                : summary.status === 'DISTRIBUSI'
                  ? isStrong
                    ? 'bg-tv-red/30 border-tv-red text-tv-red'
                    : 'bg-tv-red/10 border-tv-red/60 text-tv-red'
                  : 'bg-tv-border/40 border-tv-border text-tv-muted'
            }`}
          >
            {flowTier}
          </div>
        </div>
      </div>

      {/* Kartu ringkasan resmi BEI - hanya untuk data resmi, karena hanya di sana
          ada angka lembar/lot asing yang sungguh dicatat Bursa. */}
      {isOfficial && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-tv-card rounded-lg p-4 border border-tv-border">
            <div className="text-[10px] font-sans text-tv-muted uppercase tracking-wide">
              {isEn ? 'Net Foreign Today' : 'Net Asing Hari Ini'}
            </div>
            <div className={`text-2xl font-bold font-mono ${(num(summary.netTodayBillion) ?? 0) > 0 ? 'text-tv-green' : (num(summary.netTodayBillion) ?? 0) < 0 ? 'text-tv-red' : 'text-tv-text'}`}>
              {formatBillion(summary.netTodayBillion)}
            </div>
            <div className="text-[11px] font-sans text-tv-muted mt-1">
              {formatInt(summary.netTodayLot)} {isEn ? 'lot' : 'lot'}
            </div>
          </div>

          <div className="bg-tv-card rounded-lg p-4 border border-tv-border">
            <div className="text-[10px] font-sans text-tv-muted uppercase tracking-wide">
              {isEn ? 'Net Foreign 5 Days' : 'Net Asing 5 Hari'}
            </div>
            <div className={`text-2xl font-bold font-mono ${(num(summary.net5DBillion) ?? 0) > 0 ? 'text-tv-green' : (num(summary.net5DBillion) ?? 0) < 0 ? 'text-tv-red' : 'text-tv-text'}`}>
              {formatBillion(summary.net5DBillion)}
            </div>
            <div className="text-[11px] font-sans text-tv-muted mt-1">
              {isEn ? 'Accumulated 5 trading days' : 'Akumulasi 5 hari bursa'}
            </div>
          </div>

          <div className="bg-tv-card rounded-lg p-4 border border-tv-border">
            <div className="text-[10px] font-sans text-tv-muted uppercase tracking-wide">
              {isEn ? 'Foreign Participation' : 'Partisipasi Asing'}
            </div>
            <div className="text-2xl font-bold font-mono text-tv-text">
              {num(summary.foreignParticipationPct) === null ? 'N/A' : `${summary.foreignParticipationPct}%`}
            </div>
            <div className="text-[11px] font-sans text-tv-muted mt-1">
              {isEn ? 'Foreign share of daily turnover' : 'Porsi asing atas transaksi harian'}
            </div>
          </div>

          <div className="bg-tv-card rounded-lg p-4 border border-tv-border">
            <div className="text-[10px] font-sans text-tv-muted uppercase tracking-wide">
              {isEn ? 'Streak' : 'Beruntun'}
            </div>
            {accumulationStreak > 0 ? (
              <div className="text-lg font-bold font-sans text-tv-green flex items-center gap-1.5">
                <Flame className="w-4 h-4" />
                {isEn ? `Accumulation ${accumulationStreak} days` : `Akumulasi ${accumulationStreak} Hari`}
              </div>
            ) : distributionStreak > 0 ? (
              <div className="text-lg font-bold font-sans text-tv-red flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4" />
                {isEn ? `Distribution ${distributionStreak} days` : `Distribusi ${distributionStreak} Hari`}
              </div>
            ) : (
              <div className="text-lg font-bold font-sans text-tv-muted">
                {isEn ? 'No streak' : 'Tidak beruntun'}
              </div>
            )}
            <div className="text-[11px] font-sans text-tv-muted mt-1">
              {summary.latestDate ? (isEn ? `As of ${summary.latestDate}` : `Data per ${summary.latestDate}`) : ''}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Chart & Insight */}
        <div className="flex flex-col gap-4">
          <div className={`w-full p-4 rounded-lg border ${insightColor} flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold font-sans">
                <AlertCircle className="w-4 h-4" />
                {insightTitle}
              </div>
              {accumulationStreak >= 3 && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${insightBadge}`}>
                  <Flame className="w-3 h-3" /> {t('bandarFlow.daysStreak', { count: accumulationStreak })}
                </span>
              )}
            </div>
            <div className="text-xs font-sans opacity-90 leading-relaxed">
              {insightMessage}
            </div>
          </div>

          <div className="bg-tv-card rounded-lg p-4 border border-tv-border flex-1">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-white font-heading">
                {isOfficial
                  ? isEn ? 'Foreign Net Flow 20 Days' : 'Arus Dana Asing 20 Hari'
                  : t('bandarFlow.netBuy20DTitle')}
              </h4>
              <span className={`text-xs font-bold font-mono ${(num(summary.net5DBillion) ?? num(summary.net5D) ?? 0) > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {t('bandarFlow.net5DLabel')} {formatBillion(summary.net5DBillion ?? summary.net5D)}
              </span>
            </div>

            <div className="relative h-32 w-full">
              <div className="flex items-end h-full gap-1 w-full justify-between">
                {flow.map((d: any, i: number) => {
                  const value = num(d.netValueBillion) ?? num(d.netForeignValueBillion) ?? 0;
                  const heightPct = (Math.abs(value) / (maxAbsFlow || 1)) * 100;
                  const isPos = value >= 0;
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
                      <div className="absolute -top-10 bg-tv-card text-tv-text border border-tv-border shadow-md text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none">
                        <div>{d.date}: {value > 0 ? '+' : ''}{value.toFixed(2)}M</div>
                        {isOfficial && num(d.close) !== null && (
                          <div className="text-tv-muted">
                            {isEn ? 'Close' : 'Tutup'} {formatInt(d.close)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Garis harga penutupan di atas batang arus dana - dua sumbu berbeda
                  (Rupiah vs harga), jadi garis ini hanya menunjukkan BENTUK pergerakan
                  harga terhadap arus dana, bukan skala nilai yang sama. */}
              {pricePoints && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline
                    points={pricePoints}
                    fill="none"
                    stroke="currentColor"
                    className="text-tv-blue"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            <div className="mt-3 flex items-center gap-4 text-[10px] font-sans text-tv-muted flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-tv-green inline-block" /> {isEn ? 'Inflow' : 'Dana Masuk'}</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-tv-red inline-block" /> {isEn ? 'Outflow' : 'Dana Keluar'}</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-tv-blue inline-block" /> {isEn ? 'Close price' : 'Harga penutupan'}</span>
            </div>
          </div>
        </div>

        {isOfficial ? (
          /* Komposisi transaksi asing hari terakhir - langsung dari ForeignBuy/ForeignSell BEI. */
          <div className="bg-tv-card rounded-lg p-4 border border-tv-border">
            <h4 className="text-sm font-bold text-tv-text font-heading mb-4">
              {isEn ? 'Foreign Buy vs Sell (Latest Session)' : 'Komposisi Beli vs Jual Asing (Sesi Terakhir)'}
            </h4>

            {buyPct === null ? (
              <p className="text-xs text-tv-muted font-sans">
                {isEn ? 'Volume composition unavailable for this session.' : 'Komposisi volume tidak tersedia untuk sesi ini.'}
              </p>
            ) : (
              <>
                <div className="flex h-4 w-full rounded-full overflow-hidden border border-tv-border">
                  <div className="bg-tv-green h-full" style={{ width: `${buyPct}%` }} />
                  <div className="bg-tv-red h-full" style={{ width: `${100 - buyPct}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[11px] font-mono">
                  <span className="text-tv-green">{buyPct.toFixed(1)}%</span>
                  <span className="text-tv-red">{(100 - buyPct).toFixed(1)}%</span>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-1">
                <div className="text-xs font-sans text-tv-green border-b border-tv-border pb-1 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> {isEn ? 'Foreign Buy' : 'Beli Asing'}
                </div>
                <div className="text-lg font-bold font-mono text-tv-text">{formatInt(buyVolume)}</div>
                <div className="text-[11px] font-sans text-tv-muted">{isEn ? 'shares' : 'lembar'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-sans text-tv-red border-b border-tv-border pb-1 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5" /> {isEn ? 'Foreign Sell' : 'Jual Asing'}
                </div>
                <div className="text-lg font-bold font-mono text-tv-text">{formatInt(sellVolume)}</div>
                <div className="text-[11px] font-sans text-tv-muted">{isEn ? 'shares' : 'lembar'}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-tv-bg rounded-lg p-3 border border-tv-border">
                <div className="text-[10px] font-sans text-tv-muted uppercase">{isEn ? 'Net Volume' : 'Net Lembar'}</div>
                <div className={`text-base font-bold font-mono ${(buyVolume ?? 0) - (sellVolume ?? 0) > 0 ? 'text-tv-green' : (buyVolume ?? 0) - (sellVolume ?? 0) < 0 ? 'text-tv-red' : 'text-tv-text'}`}>
                  {buyVolume === null || sellVolume === null ? 'N/A' : formatInt(buyVolume - sellVolume)}
                </div>
              </div>
              <div className="bg-tv-bg rounded-lg p-3 border border-tv-border">
                <div className="text-[10px] font-sans text-tv-muted uppercase">{isEn ? 'Close' : 'Harga Tutup'}</div>
                <div className="text-base font-bold font-mono text-tv-text">{formatInt(summary.latestClose)}</div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-tv-border text-[11px] font-sans text-tv-muted leading-relaxed">
              {isEn
                ? 'Source: IDX official API (ListedCompany/GetTradingInfoSS). Foreign buy/sell are share volumes recorded by the exchange, not estimates.'
                : 'Sumber: API resmi BEI (ListedCompany/GetTradingInfoSS). Beli/jual asing adalah volume lembar yang dicatat Bursa, bukan estimasi.'}
              {data.updatedAt ? (isEn ? ` Synced ${data.updatedAt.slice(0, 10)}.` : ` Disinkronkan ${data.updatedAt.slice(0, 10)}.`) : ''}
            </div>
          </div>
        ) : (
          /* Mode fallback: ringkasan 20 hari berbasis CMF dari histori harga dan volume. */
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
              {isEn
                ? 'Estimate derived from Chaikin Money Flow (CMF) & volume distribution - not the exchange foreign transaction record.'
                : 'Estimasi dihitung dari Chaikin Money Flow (CMF) & distribusi volume transaksi - bukan catatan transaksi asing resmi Bursa.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
