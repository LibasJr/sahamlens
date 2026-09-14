import type { FundamentalInput } from '../../technical';

/**
 * Membandingkan fundamental XBRL resmi BEI dengan snapshot Yahoo yang dipakai LensScore
 * hari ini, TANPA mengubah skor satu pun.
 *
 * ===================================================================================
 * KENAPA LAPISAN INI ADA SEBELUM PERPINDAHAN SUMBER
 * ===================================================================================
 * Menukar Yahoo dengan XBRL secara langsung berarti menukar satu kelas bug dengan kelas
 * bug lain tanpa alat untuk melihatnya. Yahoo sudah terbukti mengeluarkan angka mustahil:
 * diukur pada arsip produksi `fundamental_history` tanggal 2026-09-12, PER tertinggi
 * bernilai 2000 dan enam emiten berada di atas 500. Itu keluarga yang sama dengan PER
 * 0.0005x yang pernah lolos ke pengguna.
 *
 * Yang membuat bug seperti itu bertahan lama bukan besarnya, melainkan tidak adanya
 * pembanding. Satu sumber tanpa pembanding tidak pernah ketahuan rusak - ia hanya terlihat
 * seperti data.
 *
 * Maka urutannya: ukur dulu, pindah kemudian. Berkas ini hanya menghasilkan putusan per
 * field yang bisa dicatat dan dibaca manusia. Ia TIDAK menulis ke scoring, tidak memilih
 * pemenang, dan tidak menambal nilai yang hilang.
 *
 * ===================================================================================
 * BEDA SATUAN ADALAH SUMBER SALAH BACA YANG PALING MUNGKIN
 * ===================================================================================
 * `roe` dan `revenueGrowth` disimpan sebagai PERSEN (18.2 berarti 18,2%), sedangkan `der`
 * dan `currentRatio` adalah RASIO polos (0.4). Jalur Yahoo mengalikan `returnOnEquity`
 * dengan 100 dan membagi `debtToEquity` dengan 100 tepat karena itu.
 *
 * Membandingkan dua angka dengan toleransi tunggal akan menyatakan "setuju" untuk
 * pasangan yang sebenarnya berbeda seratus kali lipat, atau sebaliknya. Karena itu
 * toleransi ditentukan per field, dan perbedaan dinyatakan RELATIF terhadap besarannya,
 * bukan selisih mutlak.
 *
 * ===================================================================================
 * NILAI MUSTAHIL DITANDAI TERPISAH DARI PERBEDAAN
 * ===================================================================================
 * "XBRL 12x lawan Yahoo 2000x" bukan sekadar perbedaan - salah satunya mustahil. Kalau
 * keduanya dilaporkan dengan label yang sama, sinyal terpentingnya tenggelam di antara
 * ratusan selisih wajar. `implausible` menandai sisi mana yang di luar nalar, memakai
 * batas yang sengaja longgar supaya yang tersaring hanya yang benar-benar rusak, bukan
 * emiten mahal.
 */

export type FundamentalField = 'per' | 'pbv' | 'roe' | 'der' | 'currentRatio' | 'revenueGrowth';

export type CrossCheckVerdict =
  | 'AGREE'
  | 'DIVERGE'
  | 'XBRL_ONLY'
  | 'YAHOO_ONLY'
  | 'BOTH_MISSING'
  /** Kedua sumber punya angka, tapi mengukur hal yang berbeda. Lihat DEFINITION_DIFFERS. */
  | 'NOT_COMPARABLE';

export interface FieldCrossCheck {
  field: FundamentalField;
  verdict: CrossCheckVerdict;
  xbrl: number | null;
  yahoo: number | null;
  /** Selisih relatif terhadap nilai yang lebih besar (0..1). Null kalau tidak sebanding. */
  relativeGap: number | null;
  /** Sisi yang nilainya di luar nalar. Dicatat terpisah supaya tidak tenggelam di DIVERGE. */
  implausible: 'XBRL' | 'YAHOO' | 'BOTH' | null;
}

export interface FundamentalCrossCheck {
  ticker: string;
  fields: FieldCrossCheck[];
  /** Ringkasan untuk log - dihitung sekali di sini supaya pemanggil tidak menghitung
   * ulang dengan aturan yang sedikit berbeda. */
  summary: Record<CrossCheckVerdict, number>;
  implausibleCount: number;
}

/** Toleransi relatif per field. Longgar dengan sengaja: tujuannya menemukan yang RUSAK,
 * bukan memaksa dua metodologi akuntansi menghasilkan angka identik. Yahoo memakai
 * trailing twelve months sedangkan XBRL memakai tahun buku auditan, jadi selisih kecil
 * adalah keadaan normal, bukan temuan. */
const TOLERANCE: Record<FundamentalField, number> = {
  per: 0.15,
  pbv: 0.15,
  roe: 0.2,
  der: 0.2,
  currentRatio: 0.2,
  revenueGrowth: 0.3,
};

/** Batas nalar per field. Di luar ini angkanya tidak bisa dipakai apa pun sumbernya. */
const PLAUSIBLE: Record<FundamentalField, { min: number; max: number }> = {
  // PER 0.0005x dan PER 2000x sama-sama pernah nyata di produksi.
  per: { min: 0.1, max: 500 },
  pbv: { min: 0.001, max: 100 },
  // ROE dalam persen. -1000%..1000% sudah ekstrem tapi bukan mustahil pada ekuitas tipis.
  roe: { min: -1000, max: 1000 },
  der: { min: 0, max: 100 },
  currentRatio: { min: 0, max: 100 },
  revenueGrowth: { min: -100, max: 10_000 },
};

/**
 * Field yang definisinya BERBEDA antar sumber, dengan ARAH selisih yang bisa diprediksi.
 *
 * `der`: XBRL menghitung **seluruh liabilitas** dibagi ekuitas (itu yang ada di neraca
 * resmi). Yahoo `financialData.debtToEquity` hanya menghitung **utang berbunga**.
 * Utang berbunga adalah bagian dari total liabilitas, jadi secara definisi
 * `xbrl >= yahoo` SELALU. Untuk emiten konsumer yang hampir tidak punya pinjaman bank
 * tapi punya utang usaha besar, selisihnya mendekati 100% dan keduanya tetap sah.
 *
 * Terukur pada 60 emiten produksi: CMRY 0,29 vs 0,00006 (gap 100%), UNVR 4,44 vs 0,18
 * (gap 96%), HMSP 0,92 vs 0,013 (gap 99%). Bukan satu pun yang salah.
 *
 * ===================================================================================
 * KENAPA ARAH, BUKAN PENGECUALIAN BUTA
 * ===================================================================================
 * Versi pertama perubahan ini menandai SETIAP selisih `der` sebagai NOT_COMPARABLE.
 * Itu sekaligus membunuh deteksi salah-satuan: `der` 0,4 lawan 40 adalah kekeliruan
 * rasio-vs-persen (Yahoo membagi 100 di satu tempat dan lupa di tempat lain), dan
 * dengan pengecualian buta ia lolos diam-diam.
 *
 * Kelas bug itu persis yang membuat PBV terisi kurs USD/IDR selama berbulan-bulan.
 * Membutakan pembanding terhadapnya berarti mengulang insiden yang sama.
 *
 * Karena arahnya diketahui, `yahoo > xbrl` di luar toleransi adalah keadaan yang
 * MUSTAHIL menurut definisi - itu tetap DIVERGE dan tetap berbunyi.
 */
const DEFINITION_DIFFERS: ReadonlySet<FundamentalField> = new Set<FundamentalField>(['der']);

const FIELDS: FundamentalField[] = ['per', 'pbv', 'roe', 'der', 'currentRatio', 'revenueGrowth'];

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function outOfRange(field: FundamentalField, v: number): boolean {
  const { min, max } = PLAUSIBLE[field];
  return v < min || v > max;
}

/** Selisih relatif terhadap besaran terbesar. Dipilih alih-alih selisih mutlak supaya
 * satu ambang berlaku untuk PER belasan maupun revenueGrowth ratusan persen. */
export function relativeGap(a: number, b: number): number | null {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return a === b ? 0 : null;
  return Math.abs(a - b) / scale;
}

export function compareFundamentalField(
  field: FundamentalField,
  xbrl: number | null | undefined,
  yahoo: number | null | undefined,
): FieldCrossCheck {
  const x = finite(xbrl) ? xbrl : null;
  const y = finite(yahoo) ? yahoo : null;

  const implausibleX = x !== null && outOfRange(field, x);
  const implausibleY = y !== null && outOfRange(field, y);
  const implausible = implausibleX && implausibleY
    ? 'BOTH'
    : implausibleX
      ? 'XBRL'
      : implausibleY
        ? 'YAHOO'
        : null;

  if (x === null && y === null) {
    return { field, verdict: 'BOTH_MISSING', xbrl: null, yahoo: null, relativeGap: null, implausible: null };
  }
  if (y === null) {
    return { field, verdict: 'XBRL_ONLY', xbrl: x, yahoo: null, relativeGap: null, implausible };
  }
  if (x === null) {
    return { field, verdict: 'YAHOO_ONLY', xbrl: null, yahoo: y, relativeGap: null, implausible };
  }

  const gap = relativeGap(x, y);
  const withinTolerance = gap !== null && gap <= TOLERANCE[field];

  // Field berdefinisi beda diperiksa SETELAH toleransi, dan HANYA pada arah yang
  // memang dijelaskan oleh perbedaan definisi itu.
  //
  // - sepakat dalam toleransi  -> AGREE, apa adanya
  // - xbrl > yahoo di luar toleransi -> selisih yang dijelaskan definisi (total
  //   liabilitas mencakup utang berbunga) -> NOT_COMPARABLE
  // - yahoo > xbrl di luar toleransi -> MUSTAHIL menurut definisi. Ini gejala
  //   salah satuan atau sumber rusak, dan wajib tetap berbunyi.
  if (DEFINITION_DIFFERS.has(field) && !withinTolerance && x > y) {
    return { field, verdict: 'NOT_COMPARABLE', xbrl: x, yahoo: y, relativeGap: gap, implausible };
  }

  const verdict: CrossCheckVerdict = withinTolerance ? 'AGREE' : 'DIVERGE';
  return { field, verdict, xbrl: x, yahoo: y, relativeGap: gap, implausible };
}

export function crossCheckFundamentals(
  ticker: string,
  xbrl: Partial<FundamentalInput> | null,
  yahoo: Partial<FundamentalInput> | null,
): FundamentalCrossCheck {
  const fields = FIELDS.map((f) => compareFundamentalField(f, xbrl?.[f] ?? null, yahoo?.[f] ?? null));

  const summary: Record<CrossCheckVerdict, number> = {
    AGREE: 0,
    DIVERGE: 0,
    XBRL_ONLY: 0,
    YAHOO_ONLY: 0,
    BOTH_MISSING: 0,
    NOT_COMPARABLE: 0,
  };
  let implausibleCount = 0;
  for (const f of fields) {
    summary[f.verdict] += 1;
    if (f.implausible !== null) implausibleCount += 1;
  }

  return { ticker, fields, summary, implausibleCount };
}
