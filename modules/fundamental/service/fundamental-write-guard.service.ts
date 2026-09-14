import { logger } from '../../../shared/logger/logger';

/**
 * Gerbang nilai mustahil saat PENULISAN fundamental.
 *
 * ===================================================================================
 * KENAPA GERBANG DI PENULIS, BUKAN DI PEMBACA
 * ===================================================================================
 * PBV=kurs (temuan #413) hidup di produksi berbulan-bulan karena tidak ada satu pun
 * titik yang bertanya "apakah angka ini masuk akal?" sebelum menyimpannya. Terukur di
 * `fundamental_history`: 1.163 baris di 38 emiten menyimpan kurs USD/IDR di kolom PBV,
 * dan tidak ada yang merah.
 *
 * Memperbaiki satu pemanggil (#413) menutup satu jalur. Gerbang di lapisan penulisan
 * menutup jalur yang BELUM ditulis - termasuk jalur ketiga yang akan dibuat orang lain
 * enam bulan lagi tanpa membaca CLAUDE.md.
 *
 * ===================================================================================
 * MENOLAK, BUKAN MEMPERBAIKI
 * ===================================================================================
 * Gerbang ini TIDAK menebak nilai pengganti. Ia menihilkan field yang di luar nalar dan
 * mencatatnya. Alasannya: sumber angka mustahil hampir selalu salah satuan atau salah
 * mata uang, dan "memperbaiki" tanpa tahu sebabnya menghasilkan angka yang terlihat
 * wajar tapi tetap salah - jauh lebih sulit ditemukan daripada 16500 yang jelas ngawur.
 *
 * N/A jujur mengalahkan angka yang dikarang.
 */

export type GuardedFundamentalField =
  | 'per'
  | 'pbv'
  | 'roe'
  | 'der'
  | 'currentRatio'
  | 'revenueGrowth';

/** Batas nalar per field. Sengaja LONGGAR: tujuannya menyaring yang rusak, bukan
 * menghakimi emiten yang kebetulan mahal. EURO.JK pernah tercatat PBV 69x sebagai
 * pelapor IDR - itu mahal, bukan rusak, dan harus lolos. */
export const PLAUSIBLE_RANGE: Record<GuardedFundamentalField, { min: number; max: number }> = {
  // PBV 100x sudah ekstrem; PBV 16.500x adalah kurs.
  pbv: { min: 0, max: 1_000 },
  // PER 0.0005x dan PER 2000x sama-sama pernah nyata di produksi.
  per: { min: 0.01, max: 5_000 },
  // Persen. Ekuitas tipis bisa menghasilkan ROE ekstrem yang tetap sah.
  roe: { min: -10_000, max: 10_000 },
  der: { min: 0, max: 1_000 },
  currentRatio: { min: 0, max: 1_000 },
  revenueGrowth: { min: -100, max: 100_000 },
};

export interface GuardRejection {
  field: GuardedFundamentalField;
  value: number;
  reason: string;
}

export interface GuardResult<T> {
  value: T;
  rejections: GuardRejection[];
}

function isFinitePositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Menihilkan field yang di luar batas nalar. Mengembalikan salinan - tidak memutasi
 * input, supaya pemanggil bisa membandingkan sebelum/sesudah untuk log.
 */
export function guardImplausibleFundamentals<
  T extends Partial<Record<GuardedFundamentalField, number | null | undefined>>,
>(input: T, context?: { ticker?: string }): GuardResult<T> {
  const out = { ...input };
  const rejections: GuardRejection[] = [];

  for (const field of Object.keys(PLAUSIBLE_RANGE) as GuardedFundamentalField[]) {
    const raw = input[field];
    if (!isFinitePositiveNumber(raw)) continue;

    const { min, max } = PLAUSIBLE_RANGE[field];
    if (raw >= min && raw <= max) continue;

    rejections.push({
      field,
      value: raw,
      reason: `${field}=${raw} di luar rentang nalar ${min}..${max}`,
    });
    (out as Record<string, unknown>)[field] = null;
  }

  if (rejections.length > 0) {
    // Diam-diam menihilkan sama buruknya dengan diam-diam menyimpan yang salah:
    // keduanya tidak meninggalkan jejak. Dicatat supaya sumber masalahnya bisa dilacak.
    logger.warn('Gerbang fundamental menolak nilai mustahil', {
      ticker: context?.ticker ?? null,
      rejections: rejections.map((r) => r.reason),
    });
  }

  return { value: out, rejections };
}
