import { parseNumericToken, parsePercentageToken } from './number-normalize';
import type {
  OwnershipObservation,
  RejectedRow,
} from '../types/ownership-flow.types';

// VALIDATOR BARIS OWNERSHIP - satu-satunya pintu masuk menuju database.
//
// Prinsipnya: baris yang mencurigakan DITOLAK, tidak pernah "diperbaiki". Meng-
// clamp 145% menjadi 100% akan menyimpan angka yang tidak pernah diterbitkan
// sumber mana pun, dan sesudah tersimpan tidak ada cara membedakannya dari data
// asli. Baris yang ditolak tetap dilaporkan (RejectedRow) supaya kegagalan
// terlihat di panel admin, bukan hilang diam-diam.

/**
 * Toleransi penjumlahan `local + foreign` terhadap `scripless`.
 *
 * BUKAN terhadap 100 - lihat penjelasan panjang di parseOwnershipRow(). Sumber
 * menerbitkan persentase yang sudah dibulatkan (2 desimal), jadi galat
 * pembulatan maksimum yang WAJAR adalah 0.005 x 3 = 0.015 pp. Ambang 0.05 pp
 * memberi margin untuk sumber yang membulatkan lebih kasar, tanpa cukup longgar
 * untuk meloloskan baris yang benar-benar tidak konsisten.
 */
export const PERCENT_SUM_TOLERANCE_PP = 0.05;

/**
 * Nol yang dianggap "nol" setelah pembulatan sumber. Sumber menulis 2 desimal,
 * jadi apa pun di bawah setengah satuan terkecil itu tidak dapat dibedakan dari
 * nol yang dicetak.
 */
const ZERO_EPSILON = 0.005;

/**
 * Deteksi tripel placeholder 0/0/0.
 *
 * Nilai `null` (kolom tidak ada) ikut dihitung sebagai "tidak positif": halaman
 * yang hanya memuat `Foreign 0,00%` tanpa kolom lain sama tidak bermaknanya
 * dengan yang memuat ketiganya bernilai nol. Yang membedakannya dari baris
 * MISSING murni: di sini ada ANGKA yang tercetak, dan angkanya nol.
 */
function isPlaceholderTriplet(
  localPct: number | null,
  foreignPct: number | null,
  scriplessPct: number | null
): boolean {
  const values = [localPct, foreignPct, scriplessPct];
  const anyPrinted = values.some((v) => v !== null);
  const nonePositive = values.every((v) => v === null || Math.abs(v) < ZERO_EPSILON);
  return anyPrinted && nonePositive;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Bentuk mentah apa adanya dari sumber - semua string, belum dipercaya. */
export interface RawOwnershipRow {
  ticker?: unknown;
  observedDate?: unknown;
  localPct?: unknown;
  foreignPct?: unknown;
  scriplessPct?: unknown;
  totalSecurities?: unknown;
  localShares?: unknown;
  foreignShares?: unknown;
}

export interface ParseContext {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
}

export type ParseOutcome =
  | { ok: true; observation: OwnershipObservation }
  | { ok: false; rejected: RejectedRow };

/**
 * Normalisasi ticker ke bentuk internal SahamLens (selalu bersufiks `.JK`).
 *
 * KSEI memakai kode pendek tanpa sufiks ("BBRI"), sementara seluruh SahamLens -
 * cache, universe, tabel histori lain - memakai "BBRI.JK". Menyimpan dua
 * konvensi dalam satu tabel adalah cara paling cepat membuat join diam-diam
 * kehilangan baris, jadi normalisasi dilakukan di gerbang masuk, sekali.
 */
export function normalizeOwnershipTicker(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!value) return null;
  const bare = value.endsWith('.JK') ? value.slice(0, -3) : value;
  // Kode saham IDX: 1-10 karakter alfanumerik. Pola ini sengaja sama dengan
  // shared/market/ticker-validation.ts supaya tidak ada dua definisi "ticker sah".
  if (!/^[A-Z0-9]{1,10}$/.test(bare)) return null;
  return `${bare}.JK`;
}

/**
 * Normalisasi tanggal observasi dari sumber ke YYYY-MM-DD.
 *
 * Menerima bentuk yang benar-benar TIDAK AMBIGU saja. "01/02/2026" DITOLAK -
 * ia bisa berarti 1 Februari (id-ID) atau 2 Januari (en-US), dan menebak salah
 * satunya akan menggeser seluruh histori point-in-time satu bulan tanpa gejala.
 */
export function normalizeObservedDate(raw: unknown): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return toDateKeyUtc(raw);
  }
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  // Sudah ISO / YYYY-MM-DD.
  if (DATE_KEY_RE.test(text)) return isRealDate(text) ? text : null;
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/);
  if (isoMatch) return isRealDate(isoMatch[1]) ? isoMatch[1] : null;

  // "15 Aug 2026" / "15 Agustus 2026" / "15-Aug-2026" - bulan berupa NAMA, jadi
  // tidak ada ambiguitas hari-vs-bulan.
  const named = text.match(/^(\d{1,2})[\s\-/]+([A-Za-z]+)[\s\-/]+(\d{4})$/);
  if (named) {
    const month = MONTH_INDEX[named[2].toLowerCase().slice(0, 3)];
    if (!month) return null;
    const day = named[1].padStart(2, '0');
    const candidate = `${named[3]}-${month}-${day}`;
    return isRealDate(candidate) ? candidate : null;
  }

  return null;
}

const MONTH_INDEX: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', mei: '05',
  jun: '06', jul: '07', aug: '08', agu: '08', ags: '08', sep: '09',
  oct: '10', okt: '10', nov: '11', dec: '12', des: '12',
};

/** Tolak 2026-02-31 dan kawan-kawannya - Date() diam-diam menggesernya ke Maret. */
function isRealDate(key: string): boolean {
  if (!DATE_KEY_RE.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function toDateKeyUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Validasi satu baris mentah menjadi observasi yang boleh dipersist.
 *
 * Urutan pemeriksaan sengaja dari identitas -> tanggal -> nilai: baris tanpa
 * ticker atau tanggal yang sah tidak punya kunci point-in-time sama sekali,
 * jadi tidak ada gunanya memeriksa angkanya.
 */
export function parseOwnershipRow(
  raw: RawOwnershipRow,
  context: ParseContext
): ParseOutcome {
  const ticker = normalizeOwnershipTicker(raw.ticker);
  if (!ticker) {
    return reject(null, 'MISSING', `Ticker tidak dikenali: ${JSON.stringify(raw.ticker ?? null)}`);
  }

  const observedDate = normalizeObservedDate(raw.observedDate);
  if (!observedDate) {
    return reject(
      ticker,
      'MISSING',
      `Tanggal observasi tidak dapat dibaca tanpa ambiguitas: ${JSON.stringify(raw.observedDate ?? null)}`
    );
  }

  // Tanggal observasi di MASA DEPAN berarti sumber salah baca (atau kolom
  // tertukar). Menyimpannya akan meracuni as-of lookup: baris itu akan terus
  // menang sebagai "observasi terbaru" selama berhari-hari.
  const todayUtc = toDateKeyUtc(new Date(context.fetchedAt));
  if (observedDate > todayUtc) {
    return reject(
      ticker,
      'INCONSISTENT',
      `observedDate ${observedDate} melampaui tanggal pengambilan ${todayUtc}`
    );
  }

  const localPct = parsePercentageToken(raw.localPct);
  const foreignPct = parsePercentageToken(raw.foreignPct);
  const scriplessPct = parsePercentageToken(raw.scriplessPct);

  // Nilai ADA di sumber tapi di luar 0..100 -> parsePercentageToken mengembalikan
  // null. Bedakan "sumber memang tidak punya kolom ini" (token kosong) dari
  // "sumber punya angka tapi angkanya mustahil" - yang kedua adalah tanda sumber
  // rusak dan barisnya wajib ditolak, bukan disimpan dengan null.
  for (const [field, token] of [
    ['localPct', raw.localPct],
    ['foreignPct', raw.foreignPct],
    ['scriplessPct', raw.scriplessPct],
  ] as const) {
    if (isPresentButUnparsablePercentage(token)) {
      return reject(ticker, 'INCONSISTENT', `${field} di luar rentang 0-100 atau tidak terbaca: ${JSON.stringify(token)}`);
    }
  }

  if (localPct === null && foreignPct === null) {
    return reject(ticker, 'MISSING', 'Sumber tidak menyediakan local maupun foreign percentage');
  }

  // PLACEHOLDER 0/0/0 - ditemukan pada fixture TLKM nyata dari VPS (2026-08-16):
  // halaman emitennya ASLI, tetapi ketiga nilai kepemilikan terisi 0,00% dan
  // tanggalnya tidak terbaca. Itu halaman yang belum/tidak memuat data, bukan
  // emiten yang benar-benar 0% dimiliki siapa pun.
  //
  // Baris seperti ini DITOLAK, bukan disimpan. Alasannya asimetri risiko:
  // menyimpan 0,00% berarti menampilkan klaim kuantitatif ("kepemilikan asing
  // nihil") yang tidak pernah diukur sumbernya, dan setelah tersimpan ia tidak
  // bisa dibedakan lagi dari pengukuran asli. Emiten yang benar-benar 0%
  // scripless pun tidak punya komposisi kepemilikan untuk dilaporkan, jadi
  // menolaknya tidak menghilangkan informasi apa pun yang bermakna.
  if (isPlaceholderTriplet(localPct, foreignPct, scriplessPct)) {
    return reject(
      ticker,
      'PLACEHOLDER_DATA',
      `Seluruh persentase bernilai nol (local=${localPct}, foreign=${foreignPct}, scripless=${scriplessPct}) - halaman placeholder, bukan pengukuran`
    );
  }

  // PEMERIKSAAN SILANG YANG BENAR (dikoreksi 2026-08-16 dari temuan VPS).
  //
  // SEBELUMNYA SALAH: kode ini menuntut local + foreign ~ 100, dan itu akan
  // MENOLAK baris yang sebenarnya sah.
  //
  // Struktur resmi KSEI: hanya efek berbentuk SCRIPLESS (tercatat di depositori)
  // yang punya atribusi pemilik lokal/asing. Efek yang masih berbentuk warkat
  // tidak teratribusi sama sekali. Jadi identitas yang berlaku adalah
  //
  //     local_pct + foreign_pct ~ scripless_pct
  //
  // dan ia hanya sama dengan 100 pada kasus khusus scripless_pct = 100%.
  //
  // Kalau scripless tidak tersedia, TIDAK ADA pemeriksaan silang yang bisa
  // dilakukan - dan itu bukan alasan menolak baris. Yang dilarang adalah
  // kembali diam-diam ke pembanding 100.
  if (localPct !== null && foreignPct !== null && scriplessPct !== null) {
    const sum = localPct + foreignPct;
    if (Math.abs(sum - scriplessPct) > PERCENT_SUM_TOLERANCE_PP) {
      return reject(
        ticker,
        'INCONSISTENT',
        `local (${localPct}) + foreign (${foreignPct}) = ${sum.toFixed(4)}, menyimpang lebih dari ${PERCENT_SUM_TOLERANCE_PP} pp dari scripless (${scriplessPct})`
      );
    }
  }

  const totalSecurities = parseNonNegativeCount(raw.totalSecurities);
  const localShares = parseNonNegativeCount(raw.localShares);
  const foreignShares = parseNonNegativeCount(raw.foreignShares);

  return {
    ok: true,
    observation: {
      ticker,
      observedDate,
      localPct,
      foreignPct,
      scriplessPct,
      totalSecurities,
      localShares,
      foreignShares,
      source: context.source,
      sourceUrl: context.sourceUrl,
      fetchedAt: context.fetchedAt,
      quality: 'VALID',
    },
  };
}

/** Token yang jelas berisi sesuatu, tapi bukan persentase yang sah. */
function isPresentButUnparsablePercentage(token: unknown): boolean {
  if (token === null || token === undefined) return false;
  if (typeof token === 'number') return !Number.isFinite(token) || token < 0 || token > 100;
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (!trimmed) return false;
  // Token kosong bermakna ("-", "N/A") memang berarti tidak ada nilai, bukan rusak.
  if (parseNumericToken(trimmed) === null) return false;
  return parsePercentageToken(trimmed) === null;
}

/** Jumlah efek/lembar tidak boleh negatif dan harus berhingga. */
function parseNonNegativeCount(raw: unknown): number | null {
  const value = parseNumericToken(raw);
  if (value === null) return null;
  if (value < 0) return null;
  return value;
}

function reject(
  ticker: string | null,
  quality: RejectedRow['quality'],
  reason: string
): ParseOutcome {
  return { ok: false, rejected: { ticker, reason, quality } };
}
