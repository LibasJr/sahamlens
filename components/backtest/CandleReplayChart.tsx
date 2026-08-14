'use client';

import { useEffect, useRef } from 'react';
import { ColorType, createChart, type IChartApi } from 'lightweight-charts';

export interface ReplayCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandleReplayChartProps {
  candles: ReplayCandle[];
  height?: number;
  /** Ganti nilai ini (mis. Date.now()) tiap kali ingin memutar ulang animasi dari awal. */
  playToken: number;
  /** Total durasi animasi "membuka" seluruh candle, terlepas dari jumlah candle-nya. */
  durationMs?: number;
}

// BARU (2026-08-14, permintaan pengguna: "pilih emiten di search, pilih periode, klik
// backtest, muncul animasi bergerak berupa chart candle - candle terbuka urut kiri ke
// kanan"). Komponen KECIL & KHUSUS - sengaja BUKAN reuse TradingViewChart.tsx (600+ baris,
// toolbar indikator/timeframe lengkap, dirancang untuk halaman detail teknikal penuh,
// bukan pratinjau replay ringan di panel Backtest). Dipakai lightweight-charts langsung
// (dependency yang sama dipakai TradingViewChart.tsx, v4.2.1, API addCandlestickSeries)
// dengan palet warna disamakan manual supaya konsisten dengan chart utama di app ini.
//
// Mekanisme animasi: bukan CSS, tapi memanggil series.setData() berulang dengan potongan
// candle yang makin panjang (requestAnimationFrame, dijadwalkan berdasar WAKTU BERLALU
// bukan jumlah frame, supaya durasi total tetap ~durationMs berapa pun jumlah candle-nya -
// candle 3 bulan dan 24 bulan sama-sama selesai "terbuka" dalam waktu yang sama).
// chart.timeScale().fitContent() dipanggil tiap frame supaya sumbu waktu ikut melebar
// seiring candle baru muncul, bukan candle sekarang tertimpa timeframe fix di awal.
export default function CandleReplayChart({ candles, height = 380, playToken, durationMs = 2200 }: CandleReplayChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!hostRef.current || candles.length === 0) return;
    hostRef.current.innerHTML = '';

    const gaya = getComputedStyle(document.documentElement);
    const token = (nama: string, cadangan: string): string => {
      const isi = gaya.getPropertyValue(nama).trim();
      if (!isi) return cadangan;
      const angka = isi.split(/[\s,]+/).filter(Boolean);
      return angka.length === 3 ? `rgb(${angka.join(', ')})` : cadangan;
    };
    const latar = token('--lens-card', '#131722');
    const teks = token('--lens-muted', '#d1d4dc');
    const kisi = token('--lens-border', '#1e222d');
    const garis = token('--lens-border-light', '#2a2e39');

    const width = Math.max(1, hostRef.current.clientWidth);
    const chart = createChart(hostRef.current, {
      width,
      height,
      layout: { background: { type: ColorType.Solid, color: latar }, textColor: teks, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: kisi }, horzLines: { color: kisi } },
      rightPriceScale: { borderColor: garis },
      timeScale: { borderColor: garis, timeVisible: false, secondsVisible: false, rightOffset: 4, barSpacing: 6, minBarSpacing: 1 },
      crosshair: { mode: 1 },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
    });

    const points = candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));

    let rafId: number;
    const start = performance.now();
    const total = points.length;

    const tick = (now: number) => {
      const elapsed = now - start;
      const fraction = Math.min(1, elapsed / durationMs);
      const revealCount = Math.max(1, Math.ceil(fraction * total));
      series.setData(points.slice(0, revealCount) as any);
      chart.timeScale().fitContent();
      if (fraction < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    const onResize = () => {
      if (!hostRef.current) return;
      chart.applyOptions({ width: hostRef.current.clientWidth });
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null;
    };
    // playToken sengaja jadi dependency - itu satu-satunya cara memutar ulang animasi dari
    // awal saat pengguna klik "Backtest" lagi dengan candle yang SAMA persis (mis. ganti
    // periode lalu balik lagi ke periode semula).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, playToken, height, durationMs]);

  return <div ref={hostRef} className="w-full overflow-hidden rounded-lg" />;
}
