import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { z } from 'zod';

// `data` sengaja z.unknown(): isinya bergantung filter mana yang dijelaskan (EMA/RSI/
// arus dana), dan setiap cabang di bawah sudah menjaga field yang dibacanya sendiri
// dengan `?.` + pemeriksaan tipe. Menguncinya jadi satu bentuk kaku di sini berarti
// menambah sumber kebenaran kedua yang harus diperbarui tiap filter baru muncul.
const explainBodySchema = z.object({
  filter: z.string().min(1).max(120).optional(),
  data: z.unknown().optional(),
});

// AUDIT DATA INTEGRITY 2026-08-03 (temuan C-04): endpoint ini sebelumnya mengembalikan
// statistik backtest yang TIDAK PERNAH dihitung ("3x terjadi di 6 bulan terakhir, 2x
// lanjut turun", "Hist Accuracy 45%", "Tingkat akurasi sistem 62-72%") dan mengklaim
// "data broker menunjukkan Top Buyer memborong lebih banyak volume" - klaim ini
// bertentangan langsung dengan fakta yang didokumentasikan di seluruh codebase lain
// (modules/market/service/foreign-flow-proxy.ts, app/api/flow/[ticker]/route.ts):
// IDX tidak menyediakan feed broker summary gratis, jadi aplikasi ini TIDAK PUNYA data
// broker sama sekali. Endpoint ini juga tanpa pemanggil (grep app/components/modules/
// mobile = 0 hasil) - tetap diperbaiki (bukan dihapus) untuk jaga-jaga ada integrasi
// eksternal yang belum terdeteksi.
//
// Sekarang HANYA menjelaskan makna umum indikator dari `data` yang benar-benar dikirim
// pemanggil (angka riil dari analyzer), TANPA statistik historis/akurasi yang tidak
// pernah dihitung dan TANPA klaim data broker yang tidak ada.
export async function POST(request: Request) {
  return runController(async () => {
    const { filter, data } = parseOrThrow(explainBodySchema, await request.json()) as {
      filter?: string;
      data?: any;
    };

    const status = data?.status === 'BULLISH' || data?.status === 'BEARISH' ? data.status : null;

    let explanation: string;

    if (filter === 'EMA 20/50 Cross' && status) {
      explanation = status === 'BEARISH'
        ? `EMA20 (${data?.ema20 ?? 'N/A'}) berada di bawah EMA50 (${data?.ema50 ?? 'N/A'}), harga saat ini ${data?.price ?? 'N/A'}. Ini konfirmasi downtrend jangka pendek - butuh EMA20 memotong ke atas EMA50 untuk sinyal reversal.`
        : `EMA20 (${data?.ema20 ?? 'N/A'}) berada di atas EMA50 (${data?.ema50 ?? 'N/A'}), harga saat ini ${data?.price ?? 'N/A'}. Ini menandakan uptrend jangka pendek sedang berjalan.`;
    } else if (filter === 'RSI 14' && typeof data?.value === 'number') {
      if (data.value < 35) {
        explanation = `RSI ${data.value} berada di zona oversold (< 35) - secara historis area ini diasosiasikan dengan potensi rebound, tapi butuh konfirmasi volume sebelum dianggap sinyal beli.`;
      } else if (data.value > 65) {
        explanation = `RSI ${data.value} berada di zona overbought (> 65) - momentum kuat, tapi rawan koreksi/profit taking jangka pendek.`;
      } else {
        explanation = `RSI ${data.value} berada di area netral. Momentum belum menunjukkan kondisi ekstrem ke arah manapun.`;
      }
    } else if (
      // Label lama masih diterima supaya respons yang sudah tersimpan di cache klien
      // tetap dapat penjelasan yang benar setelah label di /api/stock diganti.
      (filter === 'LensFlow (Arus Dana Asing)' ||
        filter === 'Bandarmology (Net Asing)' ||
        filter === 'LensFlow (Arus Dana Asing BEI)' ||
        filter === 'Bandarmology (Net Asing BEI)') &&
      status
    ) {
      // Lembar saham yang benar-benar dibeli dan dijual investor asing, bukan tekanan
      // yang ditebak dari harga.
      explanation = status === 'BULLISH'
        ? 'Investor asing membukukan pembelian bersih pada periode ini. Angkanya transaksi asing sungguhan, bukan estimasi dari harga dan volume.'
        : 'Investor asing membukukan penjualan bersih pada periode ini. Angkanya transaksi asing sungguhan, bukan estimasi dari harga dan volume.';
    } else if ((filter === 'LensFlow (Estimasi Arus Dana Asing)' || filter === 'Foreign Flow (Estimasi Asing)' || filter === 'Foreign Flow') && status) {
      // Proxy dari harga+volume Yahoo Finance (BUKAN data broker resmi - IDX tidak
      // menyediakan feed itu gratis), konsisten dengan label di seluruh aplikasi lain.
      explanation = status === 'BULLISH'
        ? 'Estimasi arus dana (proxy dari posisi close dalam range High-Low harian x volume, bukan data broker resmi) menunjukkan tekanan beli lebih dominan dalam periode ini.'
        : 'Estimasi arus dana (proxy dari posisi close dalam range High-Low harian x volume, bukan data broker resmi) menunjukkan tekanan jual lebih dominan dalam periode ini.';
    } else if (status) {
      explanation = `Sinyal ${status} dari filter ${filter ?? 'ini'} berdasarkan data yang dikirim - ${status === 'BULLISH' ? 'kondisi cenderung mendukung' : 'kondisi cenderung berisiko'}.`;
    } else {
      explanation = 'Data belum tersedia untuk filter ini.';
    }

    // TIDAK ADA field "historical"/akurasi - SahamLens tidak punya modul backtest
    // per-filter yang menghasilkan statistik semacam itu. Kalau pemanggil butuh
    // performa historis strategi, arahkan ke /api/backtest (data riil, bisa
    // direproduksi), bukan angka tebakan di sini.
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
    return { status: 200, body: { explanation } };
  });
}
