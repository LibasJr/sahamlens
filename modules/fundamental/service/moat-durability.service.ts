import type { NormalizedEarnings } from './normalized-earnings.service';

/**
 * KETAHANAN MOAT (2026-08-12).
 *
 * MASALAH YANG DIPECAHKAN. `buildMoatProxy()` menilai empat pilar dari rasio TERKINI:
 * ROE/ROA hari ini, margin hari ini, pertumbuhan kuartal terakhir. Semuanya benar
 * dihitung, dan semuanya mengukur hal yang berbeda dari yang dijanjikan namanya.
 *
 * Moat, menurut definisinya, adalah KETAHANAN - apakah imbal hasil tinggi bertahan
 * menghadapi persaingan. Satu titik waktu tidak bisa menjawab itu. PTBA memberi contoh
 * paling terang: ROE 43,8% (2022) lalu 28,5% / 22,7% / 13,0%. Dibuka tahun 2022 ia tampil
 * "KUAT"; dibuka hari ini "LEMAH". Yang berubah bukan keunggulan bisnisnya, melainkan
 * harga batu bara - dan itu justru bukti bahwa ia TIDAK punya moat, sesuatu yang tidak
 * bisa disimpulkan dari salah satu snapshot itu sendiri.
 *
 * Pilar ini menilai deret 4 tahun buku yang sama dengan normalized earnings:
 *
 *   1. BERAPA TAHUN ROE DI ATAS BIAYA EKUITASNYA SENDIRI. Ini inti moat. Bisnis yang
 *      imbal hasilnya di bawah biaya modal sedang MENGHANCURKAN nilai, seberapa pun
 *      besar labanya. Ambangnya biaya ekuitas per emiten (CAPM), bukan angka tetap -
 *      emiten berisiko tinggi harus melewati mistar yang lebih tinggi.
 *   2. STABILITAS MARGIN OPERASI. Moat terlihat dari margin yang bertahan saat
 *      lingkungan memburuk. Diukur sebagai simpangan baku margin antar tahun; makin
 *      kecil makin tahan.
 *   3. ARAH IMBAL HASIL. Membandingkan separuh awal dan separuh akhir jendela -
 *      menurun tajam berarti keunggulannya sedang tergerus.
 *
 * BATAS YANG HARUS DINYATAKAN. Empat tahun BUKAN satu siklus penuh, dan jendelanya
 * bergulir. Ini indikasi ketahanan jangka menengah, bukan vonis. Semua ambang di bawah
 * adalah [HIPOTESIS] - belum diuji terhadap data IDX - dan dilaporkan apa adanya, sama
 * seperti ambang lain di aplikasi ini.
 */

export type DurabilityStatus = 'TAHAN' | 'CAMPURAN' | 'RAPUH' | 'DATA TERBATAS';

/** Di bawah ini ketahanan tidak dinilai sama sekali. Tiga titik tidak bisa membedakan
 * tren dari derau. */
export const MIN_YEARS_FOR_DURABILITY = 4;

/** [HIPOTESIS] Simpangan baku margin operasi di bawah ini disebut stabil. */
export const STABLE_MARGIN_STDDEV_PCT = 5;

/** [HIPOTESIS] Penurunan imbal hasil separuh-akhir vs separuh-awal di atas ini disebut tergerus. */
export const ERODING_ROE_DROP_PCT = 30;

export interface DurabilityCheck {
  key: 'roe_above_coe' | 'margin_stability' | 'roe_trend';
  label: string;
  /** Kalimat yang menyatakan ANGKANYA, bukan cuma lulus/tidak. */
  detail: string;
  verdict: 'SUPPORTIVE' | 'CAUTION' | 'NOT_APPLICABLE';
}

export interface MoatDurability {
  status: DurabilityStatus;
  years: number;
  firstFiscalYear: number | null;
  lastFiscalYear: number | null;
  /** Berapa tahun ROE melewati biaya ekuitas emiten itu sendiri. */
  yearsAboveCostOfEquity: number;
  costOfEquityPct: number;
  /** Simpangan baku margin operasi antar tahun. `null` untuk bank. */
  operatingMarginStdDevPct: number | null;
  meanOperatingMarginPct: number | null;
  /** Rata-rata ROE separuh awal vs separuh akhir jendela. */
  earlyRoePct: number | null;
  lateRoePct: number | null;
  roeChangePct: number | null;
  checks: DurabilityCheck[];
  conclusion: string;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1));
}

const EMPTY: MoatDurability = {
  status: 'DATA TERBATAS',
  years: 0,
  firstFiscalYear: null,
  lastFiscalYear: null,
  yearsAboveCostOfEquity: 0,
  costOfEquityPct: 0,
  operatingMarginStdDevPct: null,
  meanOperatingMarginPct: null,
  earlyRoePct: null,
  lateRoePct: null,
  roeChangePct: null,
  checks: [],
  conclusion: 'Belum ada cukup tahun buku untuk menilai ketahanan. Moat adalah pertanyaan tentang daya tahan lintas waktu - satu potret tidak bisa menjawabnya, dan menebak lebih buruk daripada menyatakan belum tahu.',
};

/**
 * `earnings` = keluaran summarizeAnnualRoe (4-5 tahun buku).
 * `costOfEquityPct` = biaya ekuitas emiten dari impliedMultiples(), bukan angka tetap.
 */
export function buildMoatDurability(
  earnings: NormalizedEarnings | null,
  costOfEquityPct: number | null,
): MoatDurability {
  if (!earnings || earnings.years < MIN_YEARS_FOR_DURABILITY) return { ...EMPTY };
  if (costOfEquityPct == null || !Number.isFinite(costOfEquityPct) || costOfEquityPct <= 0) {
    return { ...EMPTY, conclusion: 'Biaya ekuitas tidak bisa dihitung, jadi tidak ada mistar untuk menilai apakah imbal hasilnya cukup. Ketahanan tidak dinilai - bukan dinilai rendah.' };
  }

  const obs = earnings.observations;
  const roes = obs.map((o) => o.roePct);
  const checks: DurabilityCheck[] = [];

  // 1. Berapa tahun ROE melewati biaya ekuitas emiten ini sendiri.
  const yearsAbove = roes.filter((r) => r > costOfEquityPct).length;
  const semua = yearsAbove === obs.length;
  checks.push({
    key: 'roe_above_coe',
    label: 'Imbal hasil di atas biaya modal',
    detail: `${yearsAbove} dari ${obs.length} tahun buku ROE melampaui biaya ekuitas ${round(costOfEquityPct, 1)}%.`,
    verdict: yearsAbove >= Math.ceil(obs.length * 0.75) ? 'SUPPORTIVE' : 'CAUTION',
  });

  // 2. Stabilitas margin operasi. Bank tidak melaporkan laba operasi dalam pengertian
  //    yang sama - TIDAK BERLAKU, bukan nilai buruk.
  const margins = obs.map((o) => o.operatingMarginPct).filter((m): m is number => m != null);
  let marginStd: number | null = null;
  let marginMean: number | null = null;
  if (margins.length >= MIN_YEARS_FOR_DURABILITY) {
    marginStd = stdDev(margins);
    marginMean = round(mean(margins));
    checks.push({
      key: 'margin_stability',
      label: 'Stabilitas margin operasi',
      detail: `Margin operasi rata-rata ${marginMean}% dengan simpangan ${round(marginStd ?? 0)} poin antar tahun.`,
      verdict: marginStd != null && marginStd <= STABLE_MARGIN_STDDEV_PCT ? 'SUPPORTIVE' : 'CAUTION',
    });
  } else {
    checks.push({
      key: 'margin_stability',
      label: 'Stabilitas margin operasi',
      detail: 'Tidak berlaku - laba operasi tidak dilaporkan dalam pengertian yang sama (lazim untuk bank & lembaga keuangan).',
      verdict: 'NOT_APPLICABLE',
    });
  }

  // 3. Arah imbal hasil: separuh awal vs separuh akhir.
  const mid = Math.floor(obs.length / 2);
  const early = round(mean(roes.slice(0, mid)));
  const late = round(mean(roes.slice(obs.length - mid)));
  const changePct = early !== 0 ? round(((late - early) / Math.abs(early)) * 100) : null;
  const tergerus = changePct != null && changePct <= -ERODING_ROE_DROP_PCT;
  checks.push({
    key: 'roe_trend',
    label: 'Arah imbal hasil',
    detail: changePct == null
      ? `ROE rata-rata ${early}% lalu ${late}%.`
      : `ROE rata-rata bergerak dari ${early}% (paruh awal) ke ${late}% (paruh akhir), ${changePct > 0 ? 'naik' : 'turun'} ${Math.abs(changePct)}%.`,
    verdict: tergerus ? 'CAUTION' : 'SUPPORTIVE',
  });

  const dinilai = checks.filter((c) => c.verdict !== 'NOT_APPLICABLE');
  const mendukung = dinilai.filter((c) => c.verdict === 'SUPPORTIVE').length;
  const status: DurabilityStatus = mendukung === dinilai.length
    ? 'TAHAN'
    : mendukung === 0
      ? 'RAPUH'
      : 'CAMPURAN';

  const conclusion = status === 'TAHAN'
    ? `Imbal hasil bertahan di atas biaya modalnya sendiri sepanjang ${obs.length} tahun buku yang tersedia${semua ? ' tanpa satu tahun pun meleset' : ''}. Itu indikasi keunggulan yang bertahan - bukan bukti, karena jendela 4 tahun lebih pendek dari satu siklus penuh.`
    : status === 'RAPUH'
      ? `Tidak satu pun pemeriksaan ketahanan terpenuhi. Angka bagus pada satu titik waktu di halaman ini kemungkinan besar mencerminkan keadaan pasar saat ini, bukan keunggulan yang bertahan.`
      : `Sebagian bertahan, sebagian tidak. Baca ketiga pemeriksaan di atas satu per satu - status gabungan menyembunyikan mana yang lulus.`;

  return {
    status,
    years: obs.length,
    firstFiscalYear: earnings.firstFiscalYear,
    lastFiscalYear: earnings.lastFiscalYear,
    yearsAboveCostOfEquity: yearsAbove,
    costOfEquityPct: round(costOfEquityPct, 2),
    operatingMarginStdDevPct: marginStd != null ? round(marginStd) : null,
    meanOperatingMarginPct: marginMean,
    earlyRoePct: early,
    lateRoePct: late,
    roeChangePct: changePct,
    checks,
    conclusion,
  };
}
