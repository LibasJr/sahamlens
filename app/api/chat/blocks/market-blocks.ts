import { cacheGet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { finite, safe, safeSigned, signed, unavailableLine } from './format';

/**
 * Blok data PASAR untuk LensAI.
 *
 * Semua blok di sini membaca CACHE SAJA (`cacheGet`), tidak pernah `getOrCompute`.
 * Alasannya bukan gaya: `getMarketSummary()` memindai 250 saham dan `getMarketPulse()`
 * memindai puluhan saham sektor + breadth. Menjalankan itu dari dalam request chat
 * berarti satu pertanyaan pengguna menanggung scan penuh - persis pola yang sudah
 * ditolak di /api/ai-pick ("Endpoint sengaja TIDAK memindai sendiri saat cache kosong").
 * Cron sudah menyegarkan kedua cache ini tiap 5 menit selama jam bursa; kalau isinya
 * kosong, jawabannya adalah "belum tersedia", bukan menghitung ulang.
 */

const TOP_N = 5;

type MoverRow = { symbol: string; changePct?: number; price?: number };

function moverLines(rows: unknown, format: (row: any) => string): string[] {
  if (!Array.isArray(rows) || rows.length === 0) return ['  - (kosong)'];
  return rows.slice(0, TOP_N).map((row) => `  - ${format(row)}`);
}

function pctRow(row: MoverRow): string {
  return `${row.symbol}: ${finite(row.changePct) ? `${signed(row.changePct!)}%` : 'perubahan tidak tersedia'}${
    finite(row.price) ? ` (harga ${safe(row.price)})` : ''
  }`;
}

/** Ringkasan peringkat pasar: gainer/loser, likuiditas, oversold, akumulasi. */
export async function marketMoversBlock(): Promise<string> {
  const summary = await cacheGet<any>(COMPUTED_CACHE_KEY.MARKET_SUMMARY);
  if (!summary) {
    return unavailableLine(
      'Peringkat pasar (top gainer/loser/volume/oversold)',
      'cache market-summary sedang kosong - cron pemindai belum mengisi sesi ini',
    );
  }

  const regime = summary.marketRegime;
  const lines: string[] = [
    '- Sumber: pemindaian 250 saham universe SahamLens (hasil cron, bukan hitung ulang saat chat)',
    regime
      ? `- Arah IHSG: ${safeSigned(regime.changePct, '%')} hari ini, ${safeSigned(regime.weeklyChangePct, '%')} sepekan, tren teknikal ${regime.trend ?? 'tidak tersedia'}`
      : unavailableLine('Arah IHSG di ringkasan pasar'),
    '- Top gainer hari ini:',
    ...moverLines(summary.topGainers, pctRow),
    '- Top loser hari ini:',
    ...moverLines(summary.topLosers, pctRow),
    '- Transaksi terbesar (nilai):',
    ...moverLines(summary.topValue, (row) =>
      `${row.symbol}: nilai ${finite(row.value) ? Number(row.value).toLocaleString('id-ID') : 'tidak tersedia'}${row.partial ? ' (SESI BERJALAN, belum volume penuh)' : ''}`,
    ),
    '- RSI paling rendah (kandidat oversold, DIRANKING - bukan filter keras RSI<30):',
    ...moverLines(summary.topRsiOversold, (row) =>
      `${row.symbol}: RSI ${safe(row.rsi14 ?? row.rsi)}${finite(row.changePct) ? `, ${signed(row.changePct)}%` : ''}`,
    ),
    '- Kekuatan relatif terhadap IHSG (5 hari):',
    ...moverLines(summary.topRelativeStrength, (row) =>
      `${row.symbol}: ${safeSigned(row.relativeStrength5D, ' poin persen vs IHSG')}`,
    ),
    '- Indikasi akumulasi (proksi arus dana dari OHLCV, BUKAN data broker asli):',
    ...moverLines(summary.topForeignAccumulation, (row) => `${row.symbol}: ${row.status ?? 'status tidak tersedia'}`),
    '- BATAS: daftar ini peringkat dari universe yang dipantau SahamLens, bukan seluruh emiten IDX.',
    '  Jangan menyebutnya "seluruh saham IDX", dan jangan menambah emiten yang tidak ada di daftar.',
  ];

  return lines.join('\n');
}

/** Rotasi sektor + breadth + regime kuantitatif. */
export async function sectorAndBreadthBlock(): Promise<string> {
  const pulse = await cacheGet<any>(COMPUTED_CACHE_KEY.MARKET_PULSE);
  if (!pulse) {
    return unavailableLine(
      'Kondisi sektor & breadth pasar',
      'cache market-pulse sedang kosong - cron pemindai belum mengisi sesi ini',
    );
  }

  const breadth = pulse.breadth;
  const regime = pulse.marketRegime;
  const sectors = Array.isArray(pulse.sectorHeatmap) ? pulse.sectorHeatmap : [];

  const lines: string[] = [];

  if (regime) {
    lines.push(
      `- Regime pasar: ${regime.regime?.label ?? 'tidak tersedia'} (postur ${regime.regime?.posture ?? 'tidak tersedia'})`,
      `- Skor regime: ${regime.score == null ? 'tidak tersedia' : safe(regime.score)} dari 100, keyakinan ${safe(regime.confidence)}, cakupan data ${safe(regime.coverage)}`,
      `- Fear/Greed: ${regime.fearGreed?.label ?? 'tidak tersedia'}`,
      regime.summary ? `- Ringkasan regime: ${regime.summary}` : '',
    );
    if (Array.isArray(regime.limitations) && regime.limitations.length) {
      lines.push('- Batas yang dinyatakan model regime:', ...regime.limitations.slice(0, 3).map((l: string) => `  - ${l}`));
    }
  } else {
    lines.push(unavailableLine('Regime pasar kuantitatif'));
  }

  if (breadth) {
    lines.push(
      `- Breadth: ${breadth.advancing ?? '?'} naik / ${breadth.declining ?? '?'} turun / ${breadth.unchanged ?? '?'} flat dari ${breadth.total ?? '?'} saham yang terbaca`,
      `- Rasio advance/decline: ${safe(breadth.advanceDeclineRatio)}`,
    );
  } else {
    lines.push(unavailableLine('Breadth pasar'));
  }

  if (sectors.length) {
    lines.push('- Sektor (urut dari pergerakan terbesar):');
    for (const sector of sectors.slice(0, 11)) {
      lines.push(
        `  - ${sector.sector}: ${sector.changePct == null ? 'tidak tersedia' : `${signed(sector.changePct)}%`} (rata-rata ${sector.sampleSize ?? 0} saham wakil)`,
      );
    }
    // Wajib ikut: `isProxy: true` ada di data justru supaya klaimnya tidak berlebihan.
    lines.push(
      '- BATAS SEKTOR: angka sektor adalah rata-rata SEDERHANA dari 3-4 saham wakil, BUKAN indeks',
      '  sektor resmi IDX dan bukan rata-rata tertimbang kapitalisasi. Sebut sebagai indikasi arah',
      '  sektor, jangan sebagai kinerja sektor resmi.',
    );
  } else {
    lines.push(unavailableLine('Peta sektor'));
  }

  return lines.filter(Boolean).join('\n');
}

/** Indikator makro (BI rate, inflasi, kurs, dst) dari dashboard makro publik. */
export async function macroBlock(): Promise<string> {
  const macro = await cacheGet<any>(COMPUTED_CACHE_KEY.MACRO_DASHBOARD);
  if (!macro) {
    return unavailableLine('Data makro (BI rate, inflasi, kurs)', 'cache dashboard makro sedang kosong');
  }

  const lines: string[] = [];
  const market = Array.isArray(macro.market) ? macro.market : [];
  const official = Array.isArray(macro.official) ? macro.official : [];

  if (market.length) {
    lines.push('- Indikator pasar/global:');
    for (const item of market.slice(0, 8)) {
      lines.push(`  - ${item.label}: ${item.value == null ? 'tidak tersedia' : `${item.value}${item.unit ?? ''}`}`);
    }
  }
  if (official.length) {
    lines.push('- Indikator resmi (sumber lembaga):');
    for (const item of official.slice(0, 8)) {
      lines.push(
        `  - ${item.label}: ${item.value == null ? 'tidak tersedia' : `${item.value}${item.unit ?? ''}`}${item.asOf ? ` (per ${item.asOf})` : ''}${item.source ? ` - sumber ${item.source}` : ''}`,
      );
    }
  }
  if (!lines.length) return unavailableLine('Indikator makro');

  if (macro.coverage) {
    lines.push(`- Cakupan data makro: ${macro.coverage.available}/${macro.coverage.expected} indikator terbaca`);
  }
  if (Array.isArray(macro.missing) && macro.missing.length) {
    lines.push(`- Indikator yang TIDAK terbaca: ${macro.missing.join(', ')} - jangan mengisinya dari ingatan.`);
  }
  lines.push('- BATAS: angka makro adalah salinan dari sumber publik pada waktu pengambilan, bukan rilis real-time.');

  return lines.join('\n');
}
