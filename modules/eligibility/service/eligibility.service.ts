import {
  ADV_HARD_FLOOR_IDR,
  MAX_STALE_CALENDAR_DAYS,
  MAX_ZERO_VOL_DAYS,
  MAX_ZERO_VOL_IN_20,
  MIN_BARS,
  MIN_COVERAGE_FOR_RECOMMENDATION,
} from '../constants/eligibility.constants';
import type {
  EligibilityBar,
  EligibilityInput,
  EligibilityResult,
  EligibilityStatus,
} from '../types/eligibility.types';

// GERBANG KELAYAKAN MINIMAL (Phase 0 / P0-3) - fungsi MURNI, tanpa I/O.
//
// Aturan yang ditegakkan: kalau status bukan ELIGIBLE, BUY/STRONG BUY tidak boleh
// menjadi rekomendasi actionable. Data saham & indikator TETAP boleh ditampilkan -
// pengguna yang sudah memegang saham itu berhak melihat analisisnya. Yang dicabut
// hanya ajakan bertindaknya.
//
// TIDAK melakukan auto-HOLD. "Tidak layak dinilai" bukan sinonim dari "tahan" -
// mengubahnya jadi HOLD berarti tetap memberi rekomendasi, hanya yang lain.

/** Urutan prioritas kalau beberapa gerbang aktif bersamaan (blueprint §5.2, dari yang
 * paling fundamental ke yang paling lunak). `reasonCodes` tetap memuat SEMUA. */
const STATUS_PRIORITY: EligibilityStatus[] = [
  'INSUFFICIENT_HISTORY',
  'POSSIBLY_NOT_TRADED',
  'STALE_DATA',
  'INSUFFICIENT_DATA',
  'LOW_LIQUIDITY',
];

/** Gerbang blocking = seluruh perhitungan berbasis harga tidak bermakna, bukan sekadar
 * kurang meyakinkan. LOW_LIQUIDITY TIDAK blocking: harganya valid, skornya bermakna;
 * yang tidak boleh cuma merekomendasikannya. */
const BLOCKING: ReadonlySet<EligibilityStatus> = new Set<EligibilityStatus>([
  'INSUFFICIENT_HISTORY',
  'POSSIBLY_NOT_TRADED',
  'STALE_DATA',
  'INSUFFICIENT_DATA',
]);

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Selisih hari kalender antara dua tanggal YYYY-MM-DD. `null` kalau salah satu tidak
 * bisa diurai - dan `null` di sini TIDAK diperlakukan sebagai 0 (lihat pemakaiannya). */
function calendarDaysBetween(from: string, to: string): number | null {
  if (!DATE_KEY_RE.test(from) || !DATE_KEY_RE.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Volume 0 = tidak ada transaksi tercatat. Volume null/undefined/NaN = TIDAK TAHU,
 * dan "tidak tahu" tidak boleh dihitung sebagai bukti saham berhenti diperdagangkan. */
function isZeroVolume(bar: EligibilityBar): boolean {
  return typeof bar.volume === 'number' && Number.isFinite(bar.volume) && bar.volume === 0;
}

function countTrailingZeroVolume(bars: EligibilityBar[]): number {
  let n = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (!isZeroVolume(bars[i])) break;
    n++;
  }
  return n;
}

/** ADV20 dalam rupiah. `null` kalau tidak ada satu pun bar dengan close DAN volume yang
 * keduanya angka - bukan 0, karena 0 akan langsung memicu gerbang likuiditas atas dasar
 * data yang sebenarnya tidak pernah kita punya. */
function adv20(bars: EligibilityBar[]): number | null {
  const window = bars.slice(-20);
  const values: number[] = [];
  for (const b of window) {
    if (
      typeof b.close === 'number' && Number.isFinite(b.close) &&
      typeof b.volume === 'number' && Number.isFinite(b.volume)
    ) {
      values.push(b.close * b.volume);
    }
  }
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

const MESSAGES: Record<Exclude<EligibilityStatus, 'ELIGIBLE'>, (d: EligibilityResult['details']) => string> = {
  INSUFFICIENT_HISTORY: (d) =>
    `Riwayat harga baru ${d.bars} bar. Analisis tren butuh minimal ${MIN_BARS} bar - belum bisa dinilai.`,
  POSSIBLY_NOT_TRADED: (d) =>
    `Tidak tercatat transaksi dalam ${Math.max(d.consecutiveZeroVolumeDays, d.zeroVolumeDaysIn20)} hari terakhir (KEMUNGKINAN suspensi - aplikasi ini tidak punya data suspensi resmi IDX). Rekomendasi tidak diberikan.`,
  STALE_DATA: (d) =>
    `Data harga terakhir ${d.lastBarDate} - ${d.calendarDaysSinceLastBar} hari lalu. Analisis tidak dijalankan atas data basi.`,
  INSUFFICIENT_DATA: (d) =>
    `Kelengkapan data ${d.coveragePct}% - di bawah ambang ${MIN_COVERAGE_FOR_RECOMMENDATION}%. Skor dari sepotong kecil data tidak disajikan sebagai rekomendasi.`,
  LOW_LIQUIDITY: (d) =>
    `Nilai transaksi rata-rata 20 hari sekitar Rp ${Math.round((d.adv20Idr ?? 0) / 1_000_000)} juta/hari - di bawah batas Rp ${ADV_HARD_FLOOR_IDR / 1_000_000_000} miliar. Sulit dibeli/dijual dalam ukuran wajar, jadi tidak direkomendasikan.`,
};

/**
 * Evaluasi kelayakan minimal. TIDAK pernah melempar - input rusak (bars kosong, tanggal
 * tidak valid, angka NaN) menghasilkan status non-ELIGIBLE yang jujur, bukan exception
 * yang menjatuhkan seluruh halaman dan bukan pula ELIGIBLE karena "tidak ada yang
 * memicu gerbang".
 */
export function evaluateMinimalEligibility(input: EligibilityInput): EligibilityResult {
  const bars = Array.isArray(input.bars) ? input.bars.filter((b) => b && typeof b.date === 'string') : [];
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const lastBarDate = lastBar ? lastBar.date : null;

  const consecutiveZeroVolumeDays = countTrailingZeroVolume(bars);
  const zeroVolumeDaysIn20 = bars.slice(-20).filter(isZeroVolume).length;
  const adv = adv20(bars);
  const coveragePct =
    typeof input.coveragePct === 'number' && Number.isFinite(input.coveragePct)
      ? input.coveragePct
      : null;
  const calendarDaysSinceLastBar =
    lastBarDate && typeof input.asOf === 'string' ? calendarDaysBetween(lastBarDate, input.asOf) : null;

  const details: EligibilityResult['details'] = {
    bars: bars.length,
    lastBarDate,
    calendarDaysSinceLastBar,
    consecutiveZeroVolumeDays,
    zeroVolumeDaysIn20,
    adv20Idr: adv,
    coveragePct,
  };

  const active: EligibilityStatus[] = [];
  const reasonCodes: string[] = [];

  // G1 - histori terlalu pendek. Ini juga yang menangkap `bars: []`.
  if (bars.length < MIN_BARS) {
    active.push('INSUFFICIENT_HISTORY');
    reasonCodes.push('HISTORY_TOO_SHORT');
  }

  // G3 - kemungkinan tidak diperdagangkan.
  if (consecutiveZeroVolumeDays >= MAX_ZERO_VOL_DAYS || zeroVolumeDaysIn20 >= MAX_ZERO_VOL_IN_20) {
    active.push('POSSIBLY_NOT_TRADED');
    reasonCodes.push('NO_TRADING_ACTIVITY');
  }

  // G2 - data basi. `calendarDaysSinceLastBar` negatif berarti bar terakhir bertanggal
  // SETELAH `asOf` - itu bukan data segar, itu data yang tidak konsisten dengan tanggal
  // evaluasi, dan menerimanya diam-diam adalah pintu masuk look-ahead.
  if (calendarDaysSinceLastBar === null && bars.length > 0) {
    active.push('STALE_DATA');
    reasonCodes.push('DATA_DATE_UNPARSEABLE');
  } else if (calendarDaysSinceLastBar !== null && calendarDaysSinceLastBar > MAX_STALE_CALENDAR_DAYS) {
    active.push('STALE_DATA');
    reasonCodes.push('DATA_STALE');
  } else if (calendarDaysSinceLastBar !== null && calendarDaysSinceLastBar < 0) {
    active.push('STALE_DATA');
    reasonCodes.push('DATA_DATE_IN_FUTURE');
  }

  // DQ minimal - dipakai HANYA kalau pemanggil memasok coverage. Kalau tidak dipasok,
  // gerbang ini dilewati: pemanggil yang tidak menghitung skor (mis. pra-filter sebelum
  // scoring) tidak boleh dipaksa mengarang angka kelengkapan.
  if (coveragePct !== null && coveragePct < MIN_COVERAGE_FOR_RECOMMENDATION) {
    active.push('INSUFFICIENT_DATA');
    reasonCodes.push('COVERAGE_BELOW_MIN');
  }

  // G4 - likuiditas. ADV null (tidak ada bar dengan close+volume yang sah) diperlakukan
  // sebagai TIDAK LAYAK, bukan lolos: fail-closed.
  if (adv === null) {
    if (bars.length > 0) {
      active.push('LOW_LIQUIDITY');
      reasonCodes.push('LIQUIDITY_UNMEASURABLE');
    }
  } else if (adv < ADV_HARD_FLOOR_IDR) {
    active.push('LOW_LIQUIDITY');
    reasonCodes.push('LIQUIDITY_BELOW_FLOOR');
  }

  if (active.length === 0) {
    return {
      status: 'ELIGIBLE',
      reasonCodes: [],
      blocking: false,
      advisory: true,
      message: null,
      details,
    };
  }

  const status = STATUS_PRIORITY.find((s) => active.includes(s)) ?? active[0];
  return {
    status,
    reasonCodes,
    blocking: BLOCKING.has(status),
    advisory: false,
    message: MESSAGES[status as Exclude<EligibilityStatus, 'ELIGIBLE'>](details),
    details,
  };
}
