'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// BARU (2026-08-14). Awalnya komponen ini sengaja BUKAN reuse TradingViewChart.tsx -
// tapi permintaan pengguna berubah: "candle buat seperti trading view saja, seperti yang
// di teknikal dan halaman utama" + "kursor kalau ditaruh di layout candle bisa buat
// ngeblok per bagian" (scroll/zoom/crosshair standar chart, bukan kotak minimal tanpa
// interaksi yang dibangun sebelumnya). Jadi SEKARANG memang reuse TradingViewChart.tsx
// (dynamic import, sama seperti StockChartPanel.tsx - lightweight-charts butuh DOM,
// tidak aman di-SSR), dengan variant="full" supaya toolbar/kontrol identik dengan
// LensTechnical & Beranda. Komponen INI cuma menambahkan lapisan replay di atasnya:
// mengontrol BERAPA BANYAK candle yang diteruskan ke TradingViewChart lewat waktu,
// TradingViewChart sendiri yang menggambar & menangani semua interaksi (scroll/zoom/
// crosshair) persis seperti di halaman lain.
const TradingViewChart = dynamic(() => import('@/components/TradingViewChart'), { ssr: false });

export interface ReplayCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  // Wajib (bukan opsional) - TradingViewChart.tsx (ChartCandle di lib/chart-indicators.ts)
  // mensyaratkan volume karena dipakai indikator VOLUME/CMF di toolbar-nya, meskipun
  // replay ini tidak menampilkan panel volume secara default.
  volume: number;
}

interface CandleReplayChartProps {
  candles: ReplayCandle[];
  symbol: string;
  height?: number;
  /** Ganti nilai ini (mis. Date.now()) tiap kali ingin memutar ulang animasi dari NOL. */
  playToken: number;
  /** Dikontrol dari luar oleh tombol Start/Stop di halaman Backtest. */
  playing: boolean;
  /** Dipanggil sekali saat animasi selesai sendiri (reveal mencapai candle terakhir). */
  onComplete?: () => void;
  /**
   * Total durasi animasi "membuka" seluruh candle. Kalau tidak diisi, dihitung otomatis
   * dari jumlah candle (lihat MS_PER_CANDLE di bawah) - JANGAN diisi angka tetap kecuali
   * memang sengaja mau menimpa perilaku adaptif itu.
   */
  durationMs?: number;
}

// Durasi SEBANDING dengan jumlah candle (bukan tetap ~2 detik untuk berapa pun jumlah
// candle-nya seperti versi pertama) - laporan pengguna: "terlalu cepat jalannya, jadi
// kesulitan membacanya" untuk periode panjang (12/24 bulan = ratusan candle).
const MS_PER_CANDLE = 22;
const MIN_DURATION_MS = 3500;
const MAX_DURATION_MS = 18000;

function resolveDurationMs(count: number, override?: number): number {
  if (typeof override === 'number' && override > 0) return override;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, count * MS_PER_CANDLE));
}

/**
 * Mengembalikan jumlah candle yang harus "sudah terbuka" saat ini. Naik seiring waktu
 * SELAMA `playing`, berhenti bertambah begitu `playing` dimatikan (Stop) - dibekukan PADA
 * CANDLE YANG SEDANG TAMPIL, bukan reset. `elapsedRef` mengakumulasi waktu lintas jeda
 * Stop, supaya Start lagi melanjutkan dari titik berhenti, bukan mengulang dari awal
 * (kecuali animasi memang sudah selesai sendiri - direset ke 0 lewat `selesaiRef`).
 */
function useReplayReveal(total: number, playing: boolean, playToken: number, durationMs: number | undefined, onComplete?: () => void): number {
  const [visible, setVisible] = useState(0);
  const elapsedRef = useRef(0);
  const selesaiRef = useRef(false);

  // Reset total saat data/periode berganti (candles baru atau playToken baru).
  useEffect(() => {
    setVisible(0);
    elapsedRef.current = 0;
    selesaiRef.current = false;
  }, [total, playToken]);

  useEffect(() => {
    if (!playing || total === 0) return;
    if (selesaiRef.current) {
      elapsedRef.current = 0;
      selesaiRef.current = false;
    }
    const effectiveDuration = resolveDurationMs(total, durationMs);
    const frameStart = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      const elapsed = elapsedRef.current + (now - frameStart);
      const fraction = Math.min(1, elapsed / effectiveDuration);
      setVisible(Math.max(1, Math.ceil(fraction * total)));
      if (fraction < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        selesaiRef.current = true;
        onComplete?.();
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      if (!selesaiRef.current) {
        elapsedRef.current += performance.now() - frameStart;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total, playToken]);

  return Math.min(total, Math.max(1, visible || 1));
}

export default function CandleReplayChart({ candles, symbol, height = 420, playToken, playing, onComplete, durationMs }: CandleReplayChartProps) {
  const visibleCount = useReplayReveal(candles.length, playing, playToken, durationMs, onComplete);
  const shown = candles.slice(0, visibleCount);
  if (shown.length === 0) return null;

  return (
    <TradingViewChart
      symbol={symbol}
      candles={shown}
      technical={{}}
      height={height}
      variant="full"
    />
  );
}
