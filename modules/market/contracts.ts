import { z } from 'zod';

/**
 * Kontrak untuk /api/daily-picks (widget publik "Hari Ini AI Menemukan").
 *
 * `MarketSummary` (dari getMarketSummary()) sudah kuat tipenya di sisi TypeScript karena
 * dihitung langsung di proses yang sama. Tapi payload breakout/cross-signal DIBACA dari
 * Redis (ditulis oleh job cron terpisah, app/api/cron/breakout-scan/route.ts) — itu batas
 * proses, jadi harus diperlakukan sebagai data tidak-terpercaya sampai divalidasi, bukan
 * di-cast `any` seperti sebelumnya. Kalau job cron berubah bentuk (field rename, dsb) tanpa
 * skema ini disentuh, parse akan gagal eksplisit alih-alih meneruskan `undefined` diam-diam
 * ke response publik.
 */

const finiteNumber = z.number().finite();

export const BreakoutCacheEntrySchema = z.object({
  symbol: z.string(),
  price: finiteNumber,
  change: z.string(),
  reason: z.string().optional(),
  signals: z.array(z.string()).optional(),
  score: finiteNumber,
  rr: z.string(),
  tp1: finiteNumber.optional(),
  tp2: finiteNumber.optional(),
  cl1: finiteNumber.optional(),
  cl2: finiteNumber.optional(),
});
export type BreakoutCacheEntry = z.infer<typeof BreakoutCacheEntrySchema>;

export const CrossCacheEntrySchema = z.object({
  symbol: z.string(),
  price: finiteNumber,
  change: z.string(),
  atr: finiteNumber.nullable().optional(),
  rr: z.string().nullable().optional(),
  tp1: finiteNumber.nullable().optional(),
  tp2: finiteNumber.nullable().optional(),
  cl1: finiteNumber.nullable().optional(),
  cl2: finiteNumber.nullable().optional(),
});
export type CrossCacheEntry = z.infer<typeof CrossCacheEntrySchema>;

export const BreakoutCachePayloadSchema = z.object({
  data: z.array(BreakoutCacheEntrySchema).optional(),
  crossSignals: z
    .object({
      golden: z.array(CrossCacheEntrySchema).default([]),
      dead: z.array(CrossCacheEntrySchema).default([]),
    })
    .optional(),
  lastUpdate: z.string().optional(),
});
export type BreakoutCachePayload = z.infer<typeof BreakoutCachePayloadSchema>;

/**
 * Parse payload cache breakout secara toleran: kalau bentuknya sudah tidak sesuai skema
 * (mis. job cron berubah tanpa skema ini ikut diperbarui), daily-picks route TIDAK BOLEH
 * meneruskan data korup ke publik — lebih baik jatuh ke daftar kosong (kategori itu ditandai
 * `stale: true` oleh pemanggil, konsisten dengan perilaku "cache belum pernah terisi") daripada
 * menampilkan angka yang mungkin sudah salah field.
 */
export function parseBreakoutCache(raw: unknown): BreakoutCachePayload | null {
  if (raw == null) return null;
  // Bentuk lama (sebelum payload dibungkus { data, crossSignals, lastUpdate }): array polos.
  if (Array.isArray(raw)) {
    const parsed = z.array(BreakoutCacheEntrySchema).safeParse(raw);
    return parsed.success ? { data: parsed.data } : null;
  }
  const parsed = BreakoutCachePayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
