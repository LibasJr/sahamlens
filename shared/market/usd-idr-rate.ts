import YahooFinanceClass from 'yahoo-finance2';
import { cacheGet, cacheSet } from '../cache/redis-cache';

// Satu-satunya sumber kurs USD/IDR di seluruh aplikasi (audit logika & algoritma
// 2026-08-05, temuan H-6).
//
// SEBELUMNYA empat call-site punya salinan logikanya masing-masing dan SEMUANYA memakai
// `fx?.regularMarketPrice || 15500` - kurs karangan yang aktif diam-diam setiap kali
// panggilan FX gagal:
//   app/api/stock/[ticker]/route.ts, modules/recommendation/service/recommendation.service.ts,
//   modules/market/service/screener.service.ts, app/api/fundamental/[ticker]/route.ts
// Kurs itu dipakai mengoreksi PBV/book value emiten pelapor USD (ADRO, ITMG, INCO, MEDC,
// dst.), jadi angka pengganti langsung menggeser rasio valuasi yang ditampilkan sebagai
// fakta. Hanya modules/fundamental/service/dcf-valuation.service.ts yang sudah benar
// (cache dulu, statis paling akhir) - pola itu dipindah ke sini dan dipakai semua.
//
// Kontrak: `getUsdIdrRate()` mengembalikan `null` kalau kurs BENAR-BENAR tidak bisa
// didapat (fetch gagal DAN belum pernah ada nilai tersimpan). Pemanggil WAJIB
// memperlakukan null sebagai "tidak bisa dihitung" - jangan pernah menggantinya dengan
// konstanta di sisi pemanggil.

const USDIDR_CACHE_KEY = 'sahamlens:cache:computed:fx:usdidr';
/** 7 hari - kurs tidak bergerak drastis harian, cukup panjang untuk bertahan dari outage
 * Yahoo multi-hari. Ditimpa tiap kali fetch live berhasil. */
const USDIDR_CACHE_TTL_SEC = 7 * 24 * 60 * 60;

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

export async function getUsdIdrRate(): Promise<number | null> {
  try {
    const fx = await yahooFinance.quote('USDIDR=X');
    const live = fx?.regularMarketPrice;
    if (typeof live === 'number' && live > 0) {
      await cacheSet(USDIDR_CACHE_KEY, live, USDIDR_CACHE_TTL_SEC);
      return live;
    }
  } catch {
    // Lanjut ke kurs tersimpan di bawah - bukan ke konstanta.
  }
  const cached = await cacheGet<number>(USDIDR_CACHE_KEY);
  return typeof cached === 'number' && cached > 0 ? cached : null;
}

/**
 * Hitung ulang PBV untuk emiten yang HARGA sahamnya IDR tapi LAPORAN keuangannya USD.
 * `priceToBook` mentah dari Yahoo untuk emiten ini membandingkan harga IDR dengan book
 * value USD - diverifikasi live 2026-08-05: ADRO 14.823x, ITMG 14.433x (seharusnya di
 * bawah 2x). Mengembalikan `null` (BUKAN nilai mentah yang salah satuan, bukan pula
 * angka dari kurs karangan) kalau kurs tidak tersedia.
 */
export async function correctPbvForUsdReporter(params: {
  priceCurrency: string | undefined;
  financialCurrency: string | undefined;
  bookValue: number | null | undefined;
  price: number | null | undefined;
  rawPbv: number | null;
}): Promise<number | null> {
  const { priceCurrency = 'IDR', financialCurrency = 'IDR', bookValue, price, rawPbv } = params;
  const mismatch = priceCurrency === 'IDR' && financialCurrency === 'USD';
  if (!mismatch) return rawPbv;
  if (!bookValue || !price || price <= 0) return null;

  const rate = await getUsdIdrRate();
  if (rate == null) return null; // lebih baik N/A daripada PBV dari kurs tebakan
  const bookValueIdr = bookValue * rate;
  if (bookValueIdr <= 0) return null;
  return price / bookValueIdr;
}
