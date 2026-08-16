import { roundTo } from '../parser/number-normalize';
import type {
  OwnershipDelta,
  OwnershipDeltaSet,
  OwnershipPeriodChange,
} from '../types/ownership-flow.types';

// MESIN DELTA KEPEMILIKAN - fungsi murni, tanpa I/O, supaya bisa diuji penuh.
//
// SATUAN: PERCENTAGE POINT (pp). 40.00% -> 41.00% adalah +1.00 pp, BUKAN +1%.
// Perubahan relatifnya justru +2.5%. UI wajib menulis "pp"; menuliskannya "%"
// membuat pembaca menyimpulkan besaran yang salah. Lihat §36.
//
// KENAPA "nearest prior observation", bukan "N hari bursa ke belakang":
// Ownership Flow bersumber dari publikasi kustodian, bukan dari perdagangan.
// Cadence-nya belum tentu harian, dan hari libur/akhir pekan tidak punya baris.
// Mengasumsikan "setiap hari ada observasi" akan menghasilkan delta null massal
// untuk sumber bulanan. Jadi: cari observasi TERAKHIR yang tanggalnya masih
// <= (tanggal terkini - N hari kalender), lalu laporkan jarak sebenarnya.

/** Satu titik histori. Sengaja seminimal mungkin supaya mudah diuji. */
export interface ObservationPoint {
  observedDate: string;
  foreignPct: number | null;
  localPct?: number | null;
  scriplessPct?: number | null;
  totalSecurities?: number | null;
}

const DAY_MS = 86_400_000;

function toUtcMs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Selisih hari kalender antara dua tanggal YYYY-MM-DD. */
export function diffCalendarDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** Geser tanggal mundur N hari kalender, tetap dalam YYYY-MM-DD. */
export function shiftDays(dateKey: string, days: number): string {
  const date = new Date(toUtcMs(dateKey) + days * DAY_MS);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const EMPTY_DELTA: OwnershipDelta = {
  pp: null, basisObservedDate: null, actualGapDays: null,
  structuralBreak: false, structuralBreakReason: null,
};


function hasTotalSecuritiesBreak(a: ObservationPoint, b: ObservationPoint): boolean {
  const left = a.totalSecurities;
  const right = b.totalSecurities;
  if (left == null || right == null) return false;
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return false;
  return left !== right;
}

/**
 * Delta satu horizon terhadap observasi terkini.
 *
 * Mengembalikan `pp: null` - BUKAN 0 - untuk setiap keadaan di mana pembanding
 * yang sah tidak ada. Nol berarti "kepemilikan tidak berubah", sebuah klaim;
 * null berarti "kita belum tahu", sebuah fakta. Membedakan keduanya adalah inti
 * kejujuran modul ini (§34).
 *
 * @param history Observasi terurut NAIK berdasarkan observedDate.
 * @param horizonDays Jarak hari kalender yang diminta (1, 7, 30, ...).
 */
export function computeDelta(
  history: ObservationPoint[],
  horizonDays: number
): OwnershipDelta {
  if (history.length < 2) return EMPTY_DELTA;

  const current = history[history.length - 1];
  if (current.foreignPct === null) return EMPTY_DELTA;

  const cutoff = shiftDays(current.observedDate, -horizonDays);

  // Observasi TERAKHIR yang masih <= cutoff. Iterasi mundur dari yang terbaru:
  // histori sudah terurut, jadi kecocokan pertama adalah yang paling dekat.
  // Tipe dipersempit ke foreignPct non-null: kandidat tanpa angka sudah dilewati
  // di bawah, dan menyatakannya di tipe membuat TypeScript ikut menjaga invarian
  // itu alih-alih mengandalkan pembaca mengingatnya.
  let basis: (ObservationPoint & { foreignPct: number }) | null = null;
  for (let i = history.length - 2; i >= 0; i--) {
    const candidate = history[i];
    if (candidate.observedDate > cutoff) continue;
    // Baris tanpa foreignPct tidak bisa jadi pembanding; lanjut ke yang lebih tua
    // daripada memaksakan angka yang tidak ada.
    if (candidate.foreignPct === null) continue;
    basis = candidate as ObservationPoint & { foreignPct: number };
    break;
  }

  if (!basis) return EMPTY_DELTA;

  // Pengaman: pembanding tidak boleh baris yang sama tanggalnya dengan observasi
  // terkini. Kalau itu terjadi, "delta" yang dihasilkan adalah 0 palsu yang akan
  // terbaca sebagai STABLE, padahal sebenarnya tidak ada pembanding.
  if (basis.observedDate >= current.observedDate) return EMPTY_DELTA;

  const actualGapDays = diffCalendarDays(basis.observedDate, current.observedDate);
  if (hasTotalSecuritiesBreak(basis, current)) {
    return {
      pp: null,
      basisObservedDate: basis.observedDate,
      actualGapDays,
      structuralBreak: true,
      structuralBreakReason: 'TOTAL_SECURITIES_CHANGED',
    };
  }

  return {
    pp: roundTo(current.foreignPct - basis.foreignPct, 4),
    basisObservedDate: basis.observedDate,
    actualGapDays,
    structuralBreak: false,
    structuralBreakReason: null,
  };
}

/** Horizon standar yang ditampilkan produk. */
export const DELTA_HORIZON_DAYS = { d1: 1, d7: 7, d30: 30 } as const;

export function computeDeltaSet(history: ObservationPoint[]): OwnershipDeltaSet {
  return {
    d1: computeDelta(history, DELTA_HORIZON_DAYS.d1),
    d7: computeDelta(history, DELTA_HORIZON_DAYS.d7),
    d30: computeDelta(history, DELTA_HORIZON_DAYS.d30),
  };
}


const EMPTY_PERIOD_CHANGE: OwnershipPeriodChange = {
  basisObservedDate: null,
  actualGapDays: null,
  foreignPp: null,
  localPp: null,
  scriplessPp: null,
  structuralBreak: false,
  structuralBreakReason: null,
  basisTotalSecurities: null,
  currentTotalSecurities: null,
};

/**
 * Bandingkan snapshot terbaru dengan snapshot sebelumnya (tanggal berbeda).
 * Untuk sumber bulanan inilah definisi "flow" yang paling jujur.
 * Pemanggil WAJIB memberikan histori dari sumber yang sama.
 */
export function computePreviousPeriodChange(
  history: ObservationPoint[]
): OwnershipPeriodChange {
  if (history.length < 2) return EMPTY_PERIOD_CHANGE;

  const current = history[history.length - 1];
  let basis: ObservationPoint | null = null;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].observedDate < current.observedDate) {
      basis = history[i];
      break;
    }
  }
  if (!basis) return EMPTY_PERIOD_CHANGE;

  const diff = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? null : roundTo(a - b, 4);

  const structuralBreak = hasTotalSecuritiesBreak(basis, current);
  return {
    basisObservedDate: basis.observedDate,
    actualGapDays: diffCalendarDays(basis.observedDate, current.observedDate),
    foreignPp: structuralBreak ? null : diff(current.foreignPct, basis.foreignPct),
    localPp: structuralBreak ? null : diff(current.localPct, basis.localPct),
    scriplessPp: structuralBreak ? null : diff(current.scriplessPct, basis.scriplessPct),
    structuralBreak,
    structuralBreakReason: structuralBreak ? 'TOTAL_SECURITIES_CHANGED' : null,
    basisTotalSecurities: basis.totalSecurities ?? null,
    currentTotalSecurities: current.totalSecurities ?? null,
  };
}
