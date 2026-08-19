'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import { Button, Card, TickerAvatar } from '@/components/ui';

// Mini Sparkline SVG
export function Sparkline({ data, color, width = 120, height = 32 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return <div className="w-[120px] h-8 bg-tv-hover rounded animate-pulse" />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sector Heatmap Tile
// BUG FIX (audit logika & algoritma 2026-08-05, temuan M-3): ukuran tile dulu dihitung
// dari `marketCap` yang SELALU 0 (field itu tidak ada di Yahoo chart API), jadi rumus
// akar kuadratnya tidak pernah berpengaruh apa pun - semua tile berukuran sama sambil
// tampak seolah diskalakan menurut kapitalisasi. Ukuran seragam sekarang, dan besaran
// pergerakan disampaikan lewat intensitas warna yang memang dihitung dari data nyata.
// BUG FIX (2026-08-05, permintaan user): tile bisa diklik buat buka modal detail - TAPI
// datanya (`stocks`) SAMA PERSIS dengan yang sudah kelihatan di tile (3-4 saham wakil
// hardcoded per sektor, lihat IDX_SECTORS di market-pulse.service.ts). Diverifikasi:
// /api/screener publik cuma balikin top-10 hasil ranking (bukan universe penuh), dan
// /api/emiten (700+ saham) tidak punya field sektor sama sekali - TIDAK ADA sumber data
// "semua emiten per sektor" di aplikasi ini sekarang. Modal ini jujur menyatakan cuma
// nampilin saham wakil yang sudah dihitung, bukan daftar lengkap - bukan fitur baru yang
// mengklaim cakupan yang tidak ada datanya.
export function HeatmapTile({ sector, changePct, stocks, sampleSize, onSelect }: any) {
  const isUp = (changePct ?? 0) >= 0;
  const intensity = Math.min(Math.abs(changePct ?? 0) * 40, 100);

  // rgb disesuaikan ke palet "Lens" (green #22C55E, red #EF4444) - sebelumnya
  // hijaunya masih #10B981 dari palet lama, jadi tile ini satu-satunya hijau yang
  // berbeda hue dari seluruh sisa aplikasi.
  const bg = isUp
    ? `rgba(34, 197, 94, ${0.1 + intensity / 200})`
    : `rgba(239, 68, 68, ${0.1 + intensity / 200})`;
  const border = isUp
    ? `rgba(34, 197, 94, ${0.2 + intensity / 250})`
    : `rgba(239, 68, 68, ${0.2 + intensity / 250})`;

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      onClick={() => onSelect({ sector, changePct, stocks, sampleSize })}
      title={`${sector}: ${changePct == null ? 'data tidak tersedia' : `${isUp ? '+' : ''}${changePct.toFixed(2)}%`} - klik untuk rincian`}
      className="text-left rounded-lg p-3 flex flex-col justify-between cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue/60"
      style={{
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        minHeight: '90px'
      }}
    >
      <div>
        <div className="text-xs font-bold text-tv-text truncate">{sector}</div>
        {/* Dinyatakan apa adanya: ini rata-rata beberapa saham wakil, bukan indeks sektor
            resmi IDX (temuan M-3). */}
        {sampleSize ? <div className="text-[10px] text-tv-muted">rata-rata {sampleSize} saham wakil</div> : null}
        {/* Angka % */}
        <div className="text-lg font-extrabold font-number text-tv-text flex items-center gap-1">
          {isUp ? (
            <TrendingUp className="w-3.5 h-3.5 text-tv-green shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-tv-red shrink-0" />
          )}
          {changePct == null ? 'N/A' : `${isUp ? '+' : ''}${changePct.toFixed(2)}%`}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-1 opacity-80 group-hover:opacity-100 transition-opacity">
        {stocks?.slice(0, 4).map((s: any) => (
          <span
            key={s.symbol}
            /* Pola tint 15% + teks berwarna, bukan `bg-tv-green/80 text-white`.
               Penjaga kontras di globals.css sengaja mencocokkan KATA UTUH
               (`[class~='bg-tv-green']`) supaya tint /10 tidak ikut terkena - efek
               sampingnya, tint /80 yang hampir padat juga tidak tercakup, dan chip ini
               terukur gagal AA di KEDUA tema. Pola tint sudah tercakup penuh oleh
               matriks kontras yang ada dan seragam dengan <Badge>. */
            className={`lens-chip font-number font-semibold px-1.5 py-0.5 rounded ${
              s.changePct >= 0 ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'
            }`}
          >
            {s.symbol} {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(1)}%
          </span>
        ))}
        {stocks?.length > 4 && (
          <span className="text-[10px] text-tv-muted font-medium">+{stocks.length - 4} lainnya</span>
        )}
      </div>
    </motion.button>
  );
}

// Modal detail sektor - klik tile Heatmap. Isi SAMA PERSIS dengan data yang sudah
// dihitung server-side (tidak ada fetch tambahan) - cuma tampilan lebih penuh + link ke
// halaman teknikal tiap saham. Disclaimer eksplisit: representatif, bukan daftar lengkap
// (lihat komentar HeatmapTile soal keterbatasan data sektor di aplikasi ini).
export function SectorDetailModal({ sector, onClose }: { sector: any; onClose: () => void }) {
  const isUp = (sector.changePct ?? 0) >= 0;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <Card
        padding="none" radius="xl" elevation="none" overflow="hidden" highlight={false} className="w-full max-w-sm border-tv-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-tv-border">
          <div>
            <h4 className="font-heading text-sm font-bold text-tv-text">{sector.sector}</h4>
            <span className={`text-xs font-number font-semibold ${isUp ? 'text-tv-green' : 'text-tv-red'}`}>
              rata-rata {isUp ? '+' : ''}{sector.changePct?.toFixed(2) ?? 'N/A'}%
            </span>
          </div>
          <Button variant="bare" size="none" aria-label={`Tutup rincian sektor ${sector.sector}`} onClick={onClose} className="text-tv-muted hover:text-tv-text transition-colors">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="px-4 pt-3 text-[10px] text-tv-muted leading-relaxed">
          {sector.sampleSize} saham wakil (kurasi manual, bukan seluruh emiten sektor ini - lihat catatan &quot;bukan indeks sektor resmi IDX&quot; di atas Heatmap).
        </p>
        <div className="p-4 pt-2 space-y-1.5 max-h-[50vh] overflow-y-auto">
          {sector.stocks.map((s: any) => (
            <motion.div key={s.symbol} whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.99 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
              <Link
                href={`/technical/${s.symbol}.JK`}
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg bg-tv-hover hover:bg-tv-border px-3 py-2 transition-colors"
              >
                <TickerAvatar symbol={s.symbol} size="sm" />
                <span className="text-sm font-bold text-tv-text flex-1">{s.symbol}</span>
                <span className={`text-xs font-number font-semibold ${s.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                  {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export type BreadthDirection = 'ADVANCING' | 'UNCHANGED' | 'DECLINING';

const BREADTH_DETAIL: Record<BreadthDirection, { title: string; description: string; tone: string }> = {
  ADVANCING: {
    title: 'Emiten naik',
    description: 'Perubahan lebih dari +0,10% terhadap penutupan sesi sebelumnya.',
    tone: 'text-tv-green',
  },
  UNCHANGED: {
    title: 'Emiten stagnan',
    description: 'Perubahan berada di antara -0,10% hingga +0,10%.',
    tone: 'text-tv-muted',
  },
  DECLINING: {
    title: 'Emiten turun',
    description: 'Perubahan kurang dari -0,10% terhadap penutupan sesi sebelumnya.',
    tone: 'text-tv-red',
  },
};

// Daftar ini memakai payload breadth yang sama dengan kartu 65/14/21. Tidak ada
// pemindaian kedua atau data contoh di browser; karena itu jumlah modal harus selalu
// sama dengan angka headline dari snapshot yang dilihat pengguna.
export function BreadthDetailModal({ direction, stocks, onClose }: { direction: BreadthDirection; stocks: any[]; onClose: () => void }) {
  const detail = BREADTH_DETAIL[direction];
  const sortedStocks = [...stocks].sort((a, b) => {
    if (direction === 'DECLINING') return a.changePct - b.changePct;
    if (direction === 'UNCHANGED') return Math.abs(a.changePct) - Math.abs(b.changePct);
    return b.changePct - a.changePct;
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <Card padding="none" radius="xl" elevation="none" overflow="hidden" highlight={false} className="w-full max-w-sm border-tv-border shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-tv-border px-4 py-3">
          <div>
            <h4 className="font-heading text-sm font-bold text-tv-text">{stocks.length} {detail.title}</h4>
            <p className="mt-0.5 text-[10px] text-tv-muted">Snapshot quote yang sama dengan Market Breadth</p>
          </div>
          <Button variant="bare" size="none" type="button" onClick={onClose} aria-label="Tutup daftar emiten" className="text-tv-muted transition-colors hover:text-tv-text">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="px-4 pt-3 text-[10px] leading-relaxed text-tv-muted">{detail.description}</p>
        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto p-4 pt-2">
          {sortedStocks.map((stock) => (
            <motion.div key={stock.symbol} whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.99 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
              <Link href={`/technical/${stock.symbol}.JK`} onClick={onClose} className="flex items-center gap-3 rounded-lg bg-tv-hover px-3 py-2 transition-colors hover:bg-tv-border">
                <TickerAvatar symbol={stock.symbol} size="sm" />
                <span className="flex-1 text-sm font-bold text-tv-text">{stock.symbol}</span>
                <span className="text-right">
                  <span className={'block text-xs font-number font-semibold ' + detail.tone}>
                    {stock.changePct > 0 ? '+' : ''}{stock.changePct.toFixed(2)}%
                  </span>
                  <span className="block lens-meta font-number text-tv-muted">Rp {stock.price.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * Menerjemahkan 11 angka sektor jadi satu kalimat kondisi. Yang penting bagi user
 * bukan angka per sektor (itu sudah ada di tile), tapi apakah pasar bergerak
 * serempak atau sedang terjadi rotasi antar sektor.
 */
export function SectorNarrative({ sectors }: { sectors: { sector: string; changePct: number | null }[] }) {
  const valid = sectors.filter((s) => typeof s.changePct === 'number') as { sector: string; changePct: number }[];
  if (valid.length < 2) return null;

  const sorted = [...valid].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const up = valid.filter((s) => s.changePct > 0).length;
  const spread = best.changePct - worst.changePct;

  // Ambang 3 poin persen memisahkan "pasar bergerak serempak" dari "rotasi": di
  // bawah itu, selisih antar sektor masih dalam rentang derau harian biasa.
  const ROTATION_SPREAD_PCT = 3;
  const mood =
    spread >= ROTATION_SPREAD_PCT
      ? `Rotasi sektor sedang terjadi - selisih ${spread.toFixed(1)} poin persen antara ${best.sector} dan ${worst.sector}. Uang berpindah antar sektor, bukan keluar dari pasar.`
      : up >= valid.length - 1
        ? 'Hampir semua sektor menguat serempak - kenaikan hari ini berbasis luas, bukan cerita satu sektor.'
        : up <= 1
          ? 'Hampir semua sektor melemah serempak - tekanan hari ini menyeluruh, bukan masalah satu sektor.'
          : `Gerak antar sektor relatif rapat (selisih ${spread.toFixed(1)} poin persen). Belum ada rotasi yang jelas.`;

  return (
    <div className="mt-3 pt-3 border-t border-tv-border">
      <p className="text-[11px] leading-relaxed text-tv-muted">
        <span className="font-number font-semibold text-tv-green">{up}</span> dari{' '}
        <span className="font-number font-semibold text-tv-text">{valid.length}</span> sektor menguat. {mood}
      </p>
    </div>
  );
}

// Breadth Bar
export function BreadthBar({ advancing, declining, unchanged, total }: any) {
  // Pembagi dijaga: total 0 (respons kosong / sesi belum jalan) sebelumnya
  // menghasilkan NaN yang masuk ke `width: NaN%` - segmen batangnya hilang tanpa
  // pesan apa pun, terbaca sebagai batang kosong yang tampak sah.
  const denom = total > 0 ? total : 1;
  const advPct = (advancing / denom) * 100;
  const decPct = (declining / denom) * 100;
  const uncPct = (unchanged / denom) * 100;

  return (
    <div className="space-y-2">
      <div
        className="flex h-5 rounded-full overflow-hidden bg-tv-hover"
        role="img"
        aria-label={`${advancing} saham naik, ${unchanged} stagnan, ${declining} turun, dari ${total} saham terpantau`}
      >
        <div className="bg-tv-green transition-[width] duration-700 ease-settle flex items-center justify-center" style={{ width: `${advPct}%` }}>
          {advPct > 10 && <span className="text-[10px] font-number font-bold text-white">{advancing}</span>}
        </div>
        <div className="bg-tv-muted transition-[width] duration-700 ease-settle flex items-center justify-center" style={{ width: `${uncPct}%` }}>
          {uncPct > 10 && <span className="text-[10px] font-number font-bold text-white">{unchanged}</span>}
        </div>
        <div className="bg-tv-red transition-[width] duration-700 ease-settle flex items-center justify-center" style={{ width: `${decPct}%` }}>
          {decPct > 10 && <span className="text-[10px] font-number font-bold text-white">{declining}</span>}
        </div>
      </div>
      <div className="flex justify-between text-[10px] font-number">
        <span className="text-tv-green">▲ Naik: {advancing} ({advPct.toFixed(0)}%)</span>
        <span className="text-tv-muted">— Stagnan: {unchanged}</span>
        <span className="text-tv-red">▼ Turun: {declining} ({decPct.toFixed(0)}%)</span>
      </div>
    </div>
  );
}
