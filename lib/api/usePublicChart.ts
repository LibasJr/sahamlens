'use client';

import useSWR from 'swr';
import { ApiError } from './fetcher';

/**
 * Bentuknya disalin dari kontrak server yang sebenarnya (app/api/public-chart/[ticker]),
 * bukan ditebak dari field yang kebetulan dipakai satu komponen. `adjClose` yang nullable
 * itu penting dan sengaja dipertahankan di tipe: konsumen berbasis return WAJIB
 * fail-closed kalau provider tidak menyediakannya, bukan jatuh balik ke `close`.
 */
export interface PublicChartCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number | null;
  price: number;
  volume: number;
  sessionStatus?: 'COMPLETE' | 'PARTIAL';
  openEstimated?: boolean;
  openSource?: 'PROVIDER' | 'PREVIOUS_CLOSE_PROXY';
}

/**
 * Deret harga publik untuk satu emiten.
 *
 * DIBUAT SEBAGAI HOOK BERSAMA, bukan dua useSWR terpisah, karena dua pemakainya -
 * components/StockChartPanel.tsx dan components/technical/TechnicalAnalysisSuite.tsx -
 * dirender BERSAMAAN di halaman teknikal dan meminta URL yang PERSIS SAMA saat
 * timeframe-nya 1Y (nilai default StockChartPanel). Dulu itu dua permintaan identik
 * pada satu kali muat halaman; dengan kunci SWR yang sama keduanya berbagi satu.
 *
 * Penjagaan bentuknya juga sebelumnya disalin di kedua komponen: "history harus array
 * dan tidak boleh kosong". Aturan itu penting - endpoint bisa menjawab 200 dengan
 * history kosong untuk emiten yang tidak punya deret harga, dan merendernya sebagai
 * grafik kosong lebih membingungkan daripada mengatakan datanya belum tersedia. Satu
 * salinan di sini berarti aturan itu tidak bisa menyimpang antar pemakai.
 */
export function usePublicChart(code: string, timeframe: string, isEn: boolean) {
  const { data, error, isLoading } = useSWR<{ history?: PublicChartCandle[] }>(
    code ? `/api/public-chart/${encodeURIComponent(code)}?tf=${timeframe}` : null,
  );

  const history = data?.history;
  const hasSeries = Array.isArray(history) && history.length > 0;

  const message = (() => {
    if (error) {
      // Pesan dari server dipakai kalau ada - runController menjamin hanya pesan yang
      // memang ditujukan ke pengguna yang lolos ke klien.
      const serverMessage = error instanceof ApiError ? error.message : null;
      if (serverMessage) return serverMessage;
      return isEn ? 'Failed to load chart' : 'Grafik gagal dimuat';
    }
    // Respons sukses TAPI kosong: bukan kegagalan teknis, jadi pesannya berbeda.
    if (data && !hasSeries) {
      return isEn ? 'Chart data unavailable' : 'Data grafik belum tersedia';
    }
    return null;
  })();

  return {
    candles: hasSeries ? (history as PublicChartCandle[]) : [],
    error: message,
    isLoading,
  };
}
