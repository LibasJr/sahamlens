import fs from 'node:fs';
import path from 'node:path';
import { readIdxFinancialReport } from './idx-xbrl.service';
import { buildIdxFundamentalInput } from './idx-fundamental-input.service';
import { crossCheckFundamentals, type FundamentalCrossCheck } from './fundamental-cross-check.service';
import type { FundamentalInput } from '../../technical';
import { logger } from '../../../shared/logger/logger';

/**
 * Menjalankan cross-check XBRL resmi BEI lawan snapshot Yahoo pada jalur nyata.
 *
 * ===================================================================================
 * KENAPA LAPISAN INI ADA
 * ===================================================================================
 * `crossCheckFundamentals` ditambahkan sebagai lapisan pembanding, tetapi TIDAK ADA
 * satu pun pemanggilnya di luar test - kode mati yang terlihat seperti perlindungan.
 * Itu justru lebih berbahaya daripada tidak punya sama sekali: seseorang membaca
 * repo ini akan menyimpulkan fundamental sudah divalidasi silang, padahal tidak.
 *
 * CLAUDE.md §2 menuliskannya untuk gerbang pemindai: "gerbang yang menunjuk path lama
 * tidak gagal - ia lulus tanpa memeriksa apa pun, dan itu jauh lebih buruk."
 * Hal yang sama berlaku untuk pembanding yang tidak pernah dipanggil.
 *
 * ===================================================================================
 * MENGAMATI, BUKAN MENGUBAH SKOR
 * ===================================================================================
 * Lapisan ini TIDAK mengubah angka apa pun yang dipakai LensScore. Ia hanya mencatat
 * perbedaan. Alasannya: mengganti sumber data dan mengubah skor dalam satu langkah
 * membuat mustahil membedakan "skor berubah karena data lebih benar" dari "skor
 * berubah karena parser XBRL punya bug". Divergensi harus bisa dibaca dulu selama
 * beberapa hari sebelum ada yang memindahkan sumber kebenaran.
 *
 * Terukur saat penulisan: Yahoo menutup 200 emiten, XBRL 882. Tapi cakupan lebih luas
 * bukan alasan untuk percaya buta - justru karena itu perbedaannya perlu dicatat.
 *
 * ===================================================================================
 * KETERBATASAN YANG DIKETAHUI: PER DAN PBV BELUM BENAR-BENAR DIBANDINGKAN
 * ===================================================================================
 * `FundamentalSnapshot` adalah `Record<string, FundamentalInput>` dan TIDAK memuat
 * harga. Padahal PER dan PBV sisi XBRL dihitung dari harga (laba per saham dan nilai
 * buku per saham hanya jadi rasio setelah dibagi harga).
 *
 * Akibatnya `buildIdxFundamentalInput` menerima `price: null`, PER/PBV sisi XBRL
 * menjadi null, dan kedua field itu selalu jatuh sebagai YAHOO_ONLY - bukan AGREE
 * atau DIVERGE. Terukur pada 60 emiten produksi: YAHOO_ONLY=177 dari 360 field.
 *
 * Ini ditulis eksplisit supaya tidak ada yang membaca ringkasan `AGREE` lalu
 * menyimpulkan PER/PBV sudah tervalidasi silang. BELUM. Menyalurkan harga ke sini
 * adalah pekerjaan terpisah yang mengubah bentuk snapshot, dan tidak dicampur ke
 * perubahan ini supaya dampaknya bisa dibaca sendiri.
 */

/** Periode diurut dari yang paling dipercaya: auditan setahun penuh lebih dulu. */
const PERIOD_PRIORITY = ['AUDIT', 'TW3', 'TW2', 'TW1'] as const;

export interface LatestXbrlReportRef {
  ticker: string;
  year: number;
  period: string;
}

export interface CrossCheckRunOptions {
  dataDir?: string;
  /** Tanggal acuan untuk memilih tahun laporan. Default hari ini. */
  now?: Date;
}

/**
 * Mencari artefak XBRL terbaru milik satu emiten dengan MEMBACA daftar berkas,
 * bukan menebak nama berkas.
 *
 * Menebak `<KODE>-<tahun>-AUDIT.json` akan gagal diam-diam setiap kali konvensi
 * penamaan bergeser, dan kegagalannya terbaca sebagai "emiten tidak punya laporan".
 */
export function findLatestXbrlReport(
  ticker: string,
  options: CrossCheckRunOptions = {},
): LatestXbrlReportRef | null {
  const code = String(ticker || '').trim().toUpperCase().replace(/\.JK$/, '');
  if (!/^[A-Z]{4}$/.test(code)) return null;

  const dir = options.dataDir ?? path.join(process.cwd(), 'data', 'idx-financial');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }

  const prefix = `${code}-`;
  const candidates: LatestXbrlReportRef[] = [];
  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
    const middle = name.slice(prefix.length, -'.json'.length);
    const [yearRaw, periodRaw] = middle.split('-');
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || !periodRaw) continue;
    candidates.push({ ticker: code, year, period: periodRaw.toUpperCase() });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    const ai = PERIOD_PRIORITY.indexOf(a.period as (typeof PERIOD_PRIORITY)[number]);
    const bi = PERIOD_PRIORITY.indexOf(b.period as (typeof PERIOD_PRIORITY)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return candidates[0];
}

export interface CrossCheckSummary {
  /** Emiten yang punya artefak XBRL DAN baris Yahoo. */
  compared: number;
  /** Emiten yang dilewati karena tidak punya artefak XBRL. */
  missingXbrl: number;
  agree: number;
  diverge: number;
  xbrlOnly: number;
  yahooOnly: number;
  /** Field yang definisinya berbeda antar sumber (mis. DER). Bukan indikasi kesalahan. */
  notComparable: number;
  /** Nilai yang di luar nalar menurut gerbang penulisan, dari sisi mana pun. */
  implausible: number;
  /** Divergensi paling tajam, untuk dibaca manusia. Dibatasi supaya log tetap terbaca. */
  worst: Array<{ ticker: string; field: string; xbrl: number | null; yahoo: number | null; relativeGap: number | null }>;
}

const WORST_SAMPLE_SIZE = 15;

/**
 * Menjalankan cross-check untuk sekumpulan emiten dan merangkum hasilnya.
 *
 * Kegagalan pada satu emiten TIDAK menggagalkan keseluruhan: emiten itu dihitung
 * sebagai `missingXbrl` dan proses lanjut. Pembanding yang bisa menjatuhkan job
 * snapshot akan membuat perlindungan ini dicopot pada insiden pertama.
 */
export function runFundamentalCrossCheck(
  yahooByTicker: Record<string, Partial<FundamentalInput> & { price?: number | null }>,
  options: CrossCheckRunOptions = {},
): CrossCheckSummary {
  const summary: CrossCheckSummary = {
    compared: 0,
    missingXbrl: 0,
    agree: 0,
    diverge: 0,
    xbrlOnly: 0,
    yahooOnly: 0,
    notComparable: 0,
    implausible: 0,
    worst: [],
  };

  const divergences: CrossCheckSummary['worst'] = [];

  for (const [ticker, yahoo] of Object.entries(yahooByTicker)) {
    let check: FundamentalCrossCheck | null = null;
    try {
      const ref = findLatestXbrlReport(ticker, options);
      if (!ref) {
        summary.missingXbrl += 1;
        continue;
      }
      const report = readIdxFinancialReport(ref.ticker, ref.year, ref.period, { dataDir: options.dataDir });
      if (!report) {
        summary.missingXbrl += 1;
        continue;
      }
      const built = buildIdxFundamentalInput(report, { price: yahoo.price ?? null });
      check = crossCheckFundamentals(ticker, built.input, yahoo);
    } catch (err) {
      // Artefak rusak tidak boleh menjatuhkan job snapshot.
      summary.missingXbrl += 1;
      logger.warn('Cross-check fundamental dilewati untuk satu emiten', {
        ticker,
        err: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    summary.compared += 1;
    summary.agree += check.summary.AGREE;
    summary.diverge += check.summary.DIVERGE;
    summary.xbrlOnly += check.summary.XBRL_ONLY;
    summary.yahooOnly += check.summary.YAHOO_ONLY;
    summary.notComparable += check.summary.NOT_COMPARABLE;
    summary.implausible += check.implausibleCount;

    for (const field of check.fields) {
      if (field.verdict !== 'DIVERGE') continue;
      divergences.push({
        ticker,
        field: field.field,
        xbrl: field.xbrl,
        yahoo: field.yahoo,
        relativeGap: field.relativeGap,
      });
    }
  }

  divergences.sort((a, b) => (b.relativeGap ?? 0) - (a.relativeGap ?? 0));
  summary.worst = divergences.slice(0, WORST_SAMPLE_SIZE);
  return summary;
}
