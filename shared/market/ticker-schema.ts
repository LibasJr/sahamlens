import { z } from 'zod';
import { normalizeIdxTickerParam } from './ticker-validation';

/**
 * Skema Zod untuk parameter rute `[ticker]`.
 *
 * SENGAJA MEMBUNGKUS normalizeIdxTickerParam, bukan menuliskan ulang aturannya sebagai
 * regex Zod. Fungsi itu memuat perilaku yang mahal ditemukan dan mudah hilang kalau
 * ditulis ulang: dekode URI berlapis (`%255EJKSE` yang muncul setelah redirect), alias
 * indeks pasar (IHSG/JKSE/^JKSE.JK), dan penambahan sufiks `.JK`. Dua sumber kebenaran
 * untuk "apa itu kode saham yang sah" akan menyimpang, dan yang menyimpang diam-diam
 * adalah yang jarang dijalankan.
 *
 * Yang DIBERIKAN Zod di sini bukan aturannya, melainkan pintunya: lewat parseOrThrow,
 * ticker tidak valid menjadi ValidationError -> 400 dengan `code: 'VALIDATION_ERROR'`
 * dari katalog, sama seperti seluruh kegagalan validasi lain. Sebelumnya sepuluh route
 * masing-masing menulis `NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 })`
 * sendiri - status yang sama, tapi tanpa `code`, jadi klien tidak bisa menanganinya lewat
 * switch(error.code) bersama kegagalan validasi lainnya.
 */
export const idxTickerParamSchema = z
  .string()
  .transform((raw, ctx) => {
    const normalized = normalizeIdxTickerParam(raw);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Ticker tidak valid' });
      return z.NEVER;
    }
    return normalized;
  });

/** Varian yang menerima indeks pasar (IHSG/^JKSE) selain saham biasa. */
export const idxTickerOrIndexParamSchema = z
  .string()
  .transform((raw, ctx) => {
    const normalized = normalizeIdxTickerParam(raw, { allowMarketIndex: true });
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Ticker tidak valid' });
      return z.NEVER;
    }
    return normalized;
  });
