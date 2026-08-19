import { cacheGet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { readAiPickScores } from '@/shared/cache/ai-pick-cache';
import { rankAiPicks, type BreakoutInfo } from '@/modules/recommendation/service/ai-pick.service';
import { getLensScoreValidationStatus } from '@/modules/validation';
import { LENS_SCORE_WEIGHTS, LENS_SCORE_TOTAL_WEIGHT } from '@/shared/constants/lens-score-weights';
import { MIN_COVERAGE_PCT } from '@/modules/technical/service/scoring.service';
import { SCORING_KATEGORI_THRESHOLDS } from '@/modules/technical/service/decision-thresholds';
import {
  MIN_BARS,
  MAX_STALE_CALENDAR_DAYS,
  MAX_ZERO_VOL_DAYS,
  MAX_ZERO_VOL_IN_20,
  ADV_HARD_FLOOR_IDR,
} from '@/modules/eligibility/constants/eligibility.constants';
import { SCORE_VERSION, VALUATION_VERSION, SIGNAL_VERSION } from '@/modules/lens-radar/constants/model-version';
import { TRANSPARENCY_CACHE_KEY } from '@/modules/lens-radar/service/transparency.service';
import { rankScreener, type RiskProfile } from '@/modules/market/service/screener.service';
import { finite, safe, signed, unavailableLine } from './format';

/**
 * Blok LensRadar / LensScore / screener / bukti backtest.
 *
 * Prinsip yang membedakan file ini dari sekadar "prompt panjang": angka metodologi
 * TIDAK ditulis sebagai prosa. Bobot, ambang kategori, dan gerbang kelayakan diimpor
 * dari konstanta yang BENAR-BENAR dipakai menghitung skor produksi. Kalau suatu saat
 * bobotnya diubah, penjelasan LensAI ikut berubah pada deploy yang sama - tidak ada
 * dokumen kedua yang bisa tertinggal dan mulai membohongi pengguna.
 */

const PICK_LIMIT = 8;

function ageLine(computedAt: string | undefined): string {
  if (!computedAt) return '- Umur data: tidak tersedia';
  const at = new Date(computedAt);
  if (!Number.isFinite(at.getTime())) return '- Umur data: tidak tersedia';
  const minutes = Math.round((Date.now() - at.getTime()) / 60000);
  const stamp = at.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  if (minutes > 60) {
    return `- Umur data: dipindai ${stamp} WIB (${minutes} menit lalu) - ini hasil SESI TERAKHIR, bukan real-time. Sebutkan waktunya kalau menyampaikan daftar ini.`;
  }
  return `- Umur data: dipindai ${stamp} WIB (${minutes} menit lalu)`;
}

/**
 * Peringkat LensRadar dari cache cron `ai-pick-scan`.
 *
 * Memakai mode 'scanner', BUKAN 'advisory' - sama seperti /api/ai-pick. Bedanya bukan
 * teknis: advisory berarti "layak ditindak", dan selama LensScore belum tervalidasi
 * out-of-sample, daftar ini hanya boleh dibaca sebagai pantauan.
 */
export async function lensRadarPicksBlock(): Promise<string> {
  const scoreData = await readAiPickScores();
  if (!scoreData || !Array.isArray(scoreData.scores) || scoreData.scores.length === 0) {
    return unavailableLine(
      'Peringkat LensRadar',
      'cache pemindaian LensRadar sedang kosong - cron ai-pick-scan belum mengisi sesi ini',
    );
  }

  const cachedBreakout = await cacheGet<any>('sahamlens:cache:computed:breakout-radar');
  const breakout: BreakoutInfo = {
    breakoutSymbols: (cachedBreakout?.data || []).map((item: any) => item.symbol),
    goldenCrossSymbols: (cachedBreakout?.crossSignals?.golden || []).map((item: any) => item.symbol),
    deadCrossSymbols: (cachedBreakout?.crossSignals?.dead || []).map((item: any) => item.symbol),
  };

  const validation = getLensScoreValidationStatus();
  const items = rankAiPicks(scoreData.scores, breakout, scoreData.bearishSymbols ?? [], { mode: 'scanner' });

  if (items.length === 0) {
    return [
      '- Peringkat LensRadar: pemindaian berjalan, tetapi TIDAK ADA saham yang lolos gerbang kelayakan sesi ini.',
      '- Ini hasil yang sah, bukan kegagalan - jangan mengisi daftar dengan emiten pilihan sendiri.',
      ageLine(scoreData.computedAt),
    ].join('\n');
  }

  const lines: string[] = [
    `- Sumber: LensRadar (LensScore ${SCORE_VERSION}), universe yang dipantau SahamLens`,
    ageLine(scoreData.computedAt),
    `- Status validasi model: ${validation.validated ? 'TERVALIDASI' : `BELUM TERVALIDASI (${validation.reasonCode})`}`,
    validation.validated
      ? '- Daftar boleh disampaikan sebagai peringkat model.'
      : '- WAJIB: sampaikan sebagai PANTAUAN/scanner, bukan rekomendasi beli. Jangan mengubah kategori BUY/STRONG BUY menjadi ajakan transaksi.',
    `- Peringkat teratas (${Math.min(items.length, PICK_LIMIT)} dari ${items.length} yang lolos gerbang):`,
  ];

  for (const item of items.slice(0, PICK_LIMIT)) {
    const parts = [
      `  - ${item.symbol}: LensScore ${item.finalScore}`,
      item.kategori ? `kategori ${item.kategori}` : null,
      item.coverage == null ? 'kelengkapan data tidak tercatat' : `kelengkapan data ${item.coverage}%`,
      finite(item.changePct) ? `${signed(item.changePct)}% hari ini` : null,
      item.signals?.length ? `sinyal: ${item.signals.join(', ')}` : null,
    ].filter(Boolean);
    lines.push(parts.join(' | '));
    if (item.topReasons?.length) {
      lines.push(`    alasan skor: ${item.topReasons.slice(0, 3).join('; ')}`);
    }
  }

  lines.push(
    '- BATAS: peringkat dihitung dari universe yang dipantau, bukan seluruh emiten IDX.',
    '  Emiten di luar daftar TIDAK berarti jelek - bisa saja tidak dipindai atau tidak lolos gerbang likuiditas.',
  );

  return lines.join('\n');
}

/**
 * Cara LensScore dihitung - dirender dari konstanta produksi.
 *
 * Ini jawaban untuk "skornya dapat dari mana", "kenapa BBCA cuma 62", "gimana cara
 * nentuin scoring". Sebelumnya pertanyaan seperti itu dijawab dari prosa knowledge base
 * yang bisa saja tertinggal dari kodenya.
 */
export function scoringMethodologyBlock(): string {
  const validation = getLensScoreValidationStatus();
  return [
    '- Nama: LensScore - skor komposit 0-100 per emiten.',
    `- Versi model aktif: skor ${SCORE_VERSION}, valuasi ${VALUATION_VERSION}, sinyal ${SIGNAL_VERSION}.`,
    '- Tiga kelompok penilaian dan bobot maksimalnya:',
    `  - Teknikal: maksimal ${LENS_SCORE_WEIGHTS.technical} poin - tren moving average, RSI, MACD, dan volume.`,
    `  - Fundamental: maksimal ${LENS_SCORE_WEIGHTS.fundamental} poin - valuasi, profitabilitas, dan kesehatan neraca.`,
    `  - Flow (arus dana): maksimal ${LENS_SCORE_WEIGHTS.flow} poin - tekanan arus dana dan persistensinya.`,
    `  - Total bobot dideklarasikan: ${LENS_SCORE_TOTAL_WEIGHT} poin.`,
    '- Penskalaan atas data yang ADA (penting, sering disalahpahami):',
    '  skor akhir = (poin yang diperoleh / bobot yang BENAR-BENAR punya data) x 100.',
    '  Jadi emiten yang datanya cuma separuh tidak otomatis kena plafon 50 - ia dinilai atas',
    '  apa yang bisa dinilai, dan kelengkapannya dilaporkan terpisah sebagai coverage.',
    `- Gerbang kelengkapan: kalau coverage < ${MIN_COVERAGE_PCT}%, kategori dipaksa "DATA TIDAK CUKUP"`,
    '  dan skornya TIDAK boleh diterjemahkan menjadi BUY/SELL.',
    '- Ambang kategori (dari skor total):',
    `  - STRONG BUY: skor > ${SCORING_KATEGORI_THRESHOLDS.STRONG_BUY}`,
    `  - BUY: skor >= ${SCORING_KATEGORI_THRESHOLDS.BUY}`,
    `  - HOLD: skor >= ${SCORING_KATEGORI_THRESHOLDS.HOLD}`,
    `  - SELL: di bawah ${SCORING_KATEGORI_THRESHOLDS.HOLD}`,
    '- Gerbang kelayakan SEBELUM sebuah emiten boleh masuk peringkat LensRadar:',
    `  - minimal ${MIN_BARS} bar harga (syarat teknis MA200 - tanpa itu komponen trennya tidak ada, bukan sekadar kurang lengkap)`,
    `  - data harga tidak lebih basi dari ${MAX_STALE_CALENDAR_DAYS} hari kalender`,
    `  - volume nol tidak lebih dari ${MAX_ZERO_VOL_DAYS} hari berturut-turut, dan tidak lebih dari ${MAX_ZERO_VOL_IN_20} kali dalam 20 bar terakhir`,
    `  - likuiditas ADV20 (rata-rata harga x volume 20 hari) minimal Rp ${(ADV_HARD_FLOOR_IDR / 1_000_000_000).toFixed(0)} miliar per hari`,
    '- Yang TIDAK menaikkan skor: sinyal seperti "breakout" atau "golden cross" adalah LABEL',
    '  konteks dan tie-break saat skor seri, bukan tambahan poin.',
    `- Status validasi model saat ini: ${validation.validated ? 'TERVALIDASI' : `BELUM TERVALIDASI (${validation.reasonCode})`}.`,
    validation.validated ? '' : `  ${validation.message}`,
    '- Kalau ditanya angka skor sebuah emiten tertentu, angkanya HANYA boleh dari blok data',
    '  emiten/LensRadar di atas. Metodologi ini menjelaskan CARA menghitung, bukan hasilnya.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Hasil screener per profil risiko, dari cache universe yang sama dengan /api/screener. */
export async function screenerBlock(profile: RiskProfile = 'Moderat'): Promise<string> {
  const universe = await cacheGet<any[]>(COMPUTED_CACHE_KEY.SCREENER_UNIVERSE);
  if (!Array.isArray(universe) || universe.length === 0) {
    return unavailableLine('Hasil screener', 'cache universe screener sedang kosong');
  }

  let ranked: any[];
  try {
    ranked = rankScreener(universe as any, profile) as any[];
  } catch (error) {
    console.warn('[LensAI:lens-blocks] rankScreener gagal', error instanceof Error ? error.message : String(error));
    return unavailableLine('Hasil screener', 'peringkat screener gagal dihitung');
  }

  if (!Array.isArray(ranked) || ranked.length === 0) {
    return `- Screener profil ${profile}: tidak ada saham yang lolos kriteria saat ini. Jangan mengisi daftar sendiri.`;
  }

  return [
    `- Profil risiko yang dipakai: ${profile} (profil tersedia: Konservatif, Moderat, Agresif)`,
    `- Kandidat teratas (${Math.min(ranked.length, PICK_LIMIT)} dari ${ranked.length}):`,
    ...ranked.slice(0, PICK_LIMIT).map((row: any) => {
      const parts = [
        `  - ${row.ticker ?? row.symbol}`,
        finite(row.score) ? `skor ${safe(row.score)}` : null,
        row.sector ? `sektor ${row.sector}` : null,
        finite(row.per) ? `PER ${safe(row.per)}x` : null,
        finite(row.roe) ? `ROE ${safe(row.roe)}%` : null,
      ].filter(Boolean);
      return parts.join(' | ');
    }),
    '- BATAS: screener menyaring dari universe kurasi SahamLens, bukan seluruh emiten IDX,',
    '  dan hasilnya adalah penyaringan kuantitatif - bukan rekomendasi beli.',
  ].join('\n');
}

/**
 * Bukti kinerja historis per bucket LensScore (halaman /transparency).
 *
 * Cache-only: computeTransparencyData() membaca ribuan baris histori + OHLC Yahoo.
 */
export async function backtestEvidenceBlock(): Promise<string> {
  const data = await cacheGet<any>(TRANSPARENCY_CACHE_KEY);
  if (!data) {
    return unavailableLine(
      'Bukti backtest per bucket LensScore',
      'cache transparency sedang kosong - jalankan/tunggu cron lens-bucket-backtest',
    );
  }

  const lines: string[] = [
    `- Versi skor yang diuji: ${data.scoreVersion ?? 'tidak tersedia'} (diminta: ${data.requestedScoreVersion ?? 'tidak tersedia'})`,
    `- Jumlah sampel: ${data.totalSamples ?? 0}, panjang validasi: ${data.validationDays ?? 0} hari`,
    data.startDate ? `- Data sejak: ${data.startDate}` : '',
    `- Status uji signifikansi (bucket 80-100 vs <60): ${
      data.pValue80VsLt60 == null ? 'belum tersedia' : `p-value ${Number(data.pValue80VsLt60).toFixed(4)}`
    }${data.significant ? ' - signifikan' : ' - BELUM signifikan'}`,
  ];

  if (Array.isArray(data.buckets) && data.buckets.length) {
    lines.push('- Kinerja per bucket (T+20, sudah dikurangi biaya 0,5% round-trip):');
    for (const bucket of data.buckets) {
      lines.push(
        `  - ${bucket.bucket}: rata-rata ${bucket.avgT20 == null ? 'tidak tersedia' : `${signed(bucket.avgT20)}%`}` +
          ` | win rate ${bucket.winRateT20 == null ? 'tidak tersedia' : `${safe(bucket.winRateT20)}%`}` +
          ` | max DD P95 ${bucket.maxDdP95T20 == null ? 'tidak tersedia' : `${safe(bucket.maxDdP95T20)}%`}` +
          ` | sampel ${bucket.totalSamples ?? 0}`,
      );
    }
  }

  if (Array.isArray(data.limitations) && data.limitations.length) {
    lines.push('- Batas yang MELEKAT pada angka di atas (wajib ikut disampaikan kalau mengutip angkanya):');
    lines.push(...data.limitations.slice(0, 4).map((l: string) => `  - ${l}`));
  }

  lines.push('- Ini backtest retrospektif, BUKAN bukti kinerja ke depan. Jangan menyebutnya "terbukti untung".');

  return lines.filter(Boolean).join('\n');
}
