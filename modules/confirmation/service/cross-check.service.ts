import { queryReadWithRetry } from '@/shared/database/postgres.client';

/**
 * Konfirmasi Ganda - tabel silang sinyal yang sudah ada di SahamLens.
 *
 * PRINSIP (Zero Dummy Policy). Modul ini TIDAK menghitung sinyal baru dan TIDAK
 * mengarang angka. Setiap kolom adalah pembacaan langsung satu sumber nyata, dengan
 * nilai mentahnya ikut ditampilkan supaya bisa diperiksa sendiri:
 *
 *   1. lensScore         - lens_radar_history.lens_score (arsip skor sesi)
 *   2. recommendation    - recommendation_audit_trail.category (pemindaian rekomendasi)
 *   3. foreignOwnership  - ownership_flow_history.foreign_pct (laporan KSEI, bulanan)
 *   4. liquidity         - lens_radar_history.avg_value_20d (nilai transaksi 20 hari)
 *
 * Kalau sumbernya tidak punya baris untuk emiten itu, kolomnya UNAVAILABLE dan TIDAK
 * dihitung sebagai konfirmasi. Tidak ada nilai pengganti, tidak ada 0, tidak ada
 * interpolasi. Kolom UMA/suspensi tidak ada di sini dengan sengaja: sumbernya hanya
 * tersedia di gerbang admin ARA (real-time), jadi menampilkannya di halaman publik
 * akan berarti mengarang status.
 */

export type CrossCheckSignalKey = 'lensScore' | 'recommendation' | 'foreignOwnership' | 'liquidity';

export type CrossCheckSignalStatus = 'CONFIRMED' | 'NOT_CONFIRMED' | 'UNAVAILABLE';

export interface CrossCheckSignal {
  key: CrossCheckSignalKey;
  /** Nilai mentah apa adanya dari sumbernya. null berarti sumbernya tidak punya nilai. */
  value: number | string | null;
  unit: string | null;
  status: CrossCheckSignalStatus;
  /** Asal angka, ditulis apa adanya untuk audit. */
  source: string;
  /** Alasan singkat mengapa statusnya begitu. */
  reason: string;
}

export interface CrossCheckRow {
  ticker: string;
  /** Jumlah sinyal berstatus CONFIRMED. */
  confirmations: number;
  /** Jumlah sinyal yang sumbernya tersedia (CONFIRMED + NOT_CONFIRMED). */
  signalsAvailable: number;
  signals: CrossCheckSignal[];
}

export interface CrossCheckData {
  date: string | null;
  scoreVersion: string | null;
  thresholds: typeof CROSS_CHECK_THRESHOLDS;
  rows: CrossCheckRow[];
  /** Catatan cakupan apa adanya, mis. jendela waktu sebuah sumber. */
  coverageNotes: string[];
  coveredTickers: number;
}

export const CROSS_CHECK_THRESHOLDS = {
  lensScore: 60,
  advValue20d: 1_000_000_000,
} as const;

export const CROSS_CHECK_AFFIRMATIVE_CATEGORIES = ['STRONG BUY', 'BUY'] as const;

export const CROSS_CHECK_SIGNAL_SOURCES: Record<CrossCheckSignalKey, string> = {
  lensScore: 'lens_radar_history.lens_score',
  recommendation: 'recommendation_audit_trail.category',
  foreignOwnership: 'ownership_flow_history.foreign_pct (KSEI)',
  liquidity: 'lens_radar_history.avg_value_20d',
};

export const CROSS_CHECK_SIGNAL_LABELS: Record<CrossCheckSignalKey, string> = {
  lensScore: 'Skor LensRadar',
  recommendation: 'Rekomendasi',
  foreignOwnership: 'Kepemilikan asing',
  liquidity: 'Likuiditas 20 hari',
};

export interface CrossCheckLensRow {
  ticker: string;
  lensScore: number | null;
  avgValue20d: number | null;
}

export interface CrossCheckRecommendationRow {
  ticker: string;
  category: string | null;
  totalScore: number | null;
}

export interface CrossCheckOwnershipRow {
  ticker: string;
  latestPct: number | null;
  latestDate: string | null;
  previousPct: number | null;
  previousDate: string | null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Emiten pada sesi terakhir, digabung dengan semua sumber lain yang punya barisnya. */
export function buildCrossCheckRows(input: {
  lensRows: CrossCheckLensRow[];
  recommendations: CrossCheckRecommendationRow[];
  ownership: CrossCheckOwnershipRow[];
}): CrossCheckRow[] {
  const recommendationByTicker = new Map(input.recommendations.map((row) => [row.ticker.toUpperCase(), row]));
  const ownershipByTicker = new Map(input.ownership.map((row) => [row.ticker.toUpperCase(), row]));

  const tickers = new Set<string>();
  for (const row of input.lensRows) tickers.add(row.ticker.toUpperCase());
  for (const row of input.recommendations) tickers.add(row.ticker.toUpperCase());

  const rows: CrossCheckRow[] = [];

  for (const ticker of tickers) {
    const lens = input.lensRows.find((row) => row.ticker.toUpperCase() === ticker) ?? null;
    const recommendation = recommendationByTicker.get(ticker) ?? null;
    const ownership = ownershipByTicker.get(ticker) ?? null;

    const signals: CrossCheckSignal[] = [];

    signals.push(
      lens === null || lens.lensScore === null
        ? {
            key: 'lensScore',
            value: null,
            unit: 'skor',
            status: 'UNAVAILABLE',
            source: CROSS_CHECK_SIGNAL_SOURCES.lensScore,
            reason: 'Arsip skor tidak memuat emiten ini pada sesi terpilih.',
          }
        : {
            key: 'lensScore',
            value: lens.lensScore,
            unit: 'skor',
            status: lens.lensScore >= CROSS_CHECK_THRESHOLDS.lensScore ? 'CONFIRMED' : 'NOT_CONFIRMED',
            source: CROSS_CHECK_SIGNAL_SOURCES.lensScore,
            reason:
              lens.lensScore >= CROSS_CHECK_THRESHOLDS.lensScore
                ? `Skor ${lens.lensScore} mencapai ambang ${CROSS_CHECK_THRESHOLDS.lensScore}.`
                : `Skor ${lens.lensScore} di bawah ambang ${CROSS_CHECK_THRESHOLDS.lensScore}.`,
          }
    );

    const category = recommendation?.category?.trim() ?? null;
    signals.push(
      category === null || category.toUpperCase() === 'DATA TIDAK CUKUP'
        ? {
            key: 'recommendation',
            value: category,
            unit: null,
            status: 'UNAVAILABLE',
            source: CROSS_CHECK_SIGNAL_SOURCES.recommendation,
            reason:
              category === null
                ? 'Pemindaian rekomendasi belum punya baris untuk emiten ini.'
                : 'Pemindaian rekomendasi menandai data tidak cukup, jadi tidak dihitung.',
          }
        : {
            key: 'recommendation',
            value: category,
            unit: null,
            status: (CROSS_CHECK_AFFIRMATIVE_CATEGORIES as readonly string[]).includes(category.toUpperCase())
              ? 'CONFIRMED'
              : 'NOT_CONFIRMED',
            source: CROSS_CHECK_SIGNAL_SOURCES.recommendation,
            reason: `Kategori pemindaian: ${category}.`,
          }
    );

    signals.push(
      !ownership || ownership.latestPct === null || ownership.previousPct === null
        ? {
            key: 'foreignOwnership',
            value: ownership?.latestPct ?? null,
            unit: '% asing',
            status: 'UNAVAILABLE',
            source: CROSS_CHECK_SIGNAL_SOURCES.foreignOwnership,
            reason: 'Laporan KSEI belum memuat dua periode untuk emiten ini, sehingga arah perubahannya tidak dapat diukur.',
          }
        : {
            key: 'foreignOwnership',
            value: ownership.latestPct,
            unit: '% asing',
            status: ownership.latestPct > ownership.previousPct ? 'CONFIRMED' : 'NOT_CONFIRMED',
            source: CROSS_CHECK_SIGNAL_SOURCES.foreignOwnership,
            reason: `Porsi asing ${ownership.previousPct}% (${ownership.previousDate ?? 'periode sebelumnya'}) ke ${ownership.latestPct}% (${ownership.latestDate ?? 'periode terakhir'}).`,
          }
    );

    signals.push(
      lens === null || lens.avgValue20d === null
        ? {
            key: 'liquidity',
            value: null,
            unit: 'rupiah/hari',
            status: 'UNAVAILABLE',
            source: CROSS_CHECK_SIGNAL_SOURCES.liquidity,
            reason: 'Nilai transaksi 20 hari belum tercatat untuk emiten ini.',
          }
        : {
            key: 'liquidity',
            value: lens.avgValue20d,
            unit: 'rupiah/hari',
            status: lens.avgValue20d >= CROSS_CHECK_THRESHOLDS.advValue20d ? 'CONFIRMED' : 'NOT_CONFIRMED',
            source: CROSS_CHECK_SIGNAL_SOURCES.liquidity,
            reason:
              lens.avgValue20d >= CROSS_CHECK_THRESHOLDS.advValue20d
                ? `Rata-rata nilai transaksi 20 hari mencapai ambang likuiditas.`
                : `Rata-rata nilai transaksi 20 hari di bawah ambang likuiditas.`,
          }
    );

    rows.push({
      ticker,
      confirmations: signals.filter((signal) => signal.status === 'CONFIRMED').length,
      signalsAvailable: signals.filter((signal) => signal.status !== 'UNAVAILABLE').length,
      signals,
    });
  }

  return rows.sort((left, right) => {
    if (right.confirmations !== left.confirmations) return right.confirmations - left.confirmations;
    const leftScore = (left.signals.find((signal) => signal.key === 'lensScore')?.value as number | null) ?? -1;
    const rightScore = (right.signals.find((signal) => signal.key === 'lensScore')?.value as number | null) ?? -1;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return left.ticker.localeCompare(right.ticker);
  });
}

export type CrossCheckQuery = (
  text: string,
  params?: unknown[]
) => Promise<{ rows: Record<string, unknown>[] }>;

const defaultQuery: CrossCheckQuery = (text, params) => queryReadWithRetry(text, params);

export async function getCrossCheckData(
  requestedDate?: string | null,
  query: CrossCheckQuery = defaultQuery
): Promise<CrossCheckData> {
  const dateResult = await query(
    `select max(date)::text as session_date,
            count(distinct ticker)::int as ticker_count
       from lens_radar_history`
  );
  const sessionDate = requestedDate ?? (dateResult.rows[0]?.session_date as string | null) ?? null;

  if (!sessionDate) {
    return {
      date: null,
      scoreVersion: null,
      thresholds: CROSS_CHECK_THRESHOLDS,
      rows: [],
      coverageNotes: ['Arsip skor masih kosong, jadi belum ada sesi yang bisa dibandingkan.'],
      coveredTickers: 0,
    };
  }

  const lensResult = await query(
    `select ticker,
            lens_score,
            avg_value_20d,
            score_version
       from lens_radar_history
      where date = $1::date
      order by lens_score desc nulls last`,
    [sessionDate]
  );

  const scoreVersions = new Map<string, number>();
  for (const row of lensResult.rows) {
    const version = typeof row.score_version === 'string' ? row.score_version : null;
    if (version) scoreVersions.set(version, (scoreVersions.get(version) ?? 0) + 1);
  }
  const scoreVersion = [...scoreVersions.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

  const recommendationResult = await query(
    `select distinct on (ticker) ticker, category, total_score, calculated_at
       from recommendation_audit_trail
      where calculated_at < ($1::date + interval '1 day')
      order by ticker, calculated_at desc`,
    [sessionDate]
  );

  const ownershipResult = await query(
    `with ranked as (
       select ticker,
              observed_date,
              foreign_pct,
              row_number() over (partition by ticker order by observed_date desc) as position
         from ownership_flow_history
        where observed_date <= $1::date
     )
     select ticker,
            max(case when position = 1 then foreign_pct end) as latest_pct,
            max(case when position = 1 then observed_date end)::text as latest_date,
            max(case when position = 2 then foreign_pct end) as previous_pct,
            max(case when position = 2 then observed_date end)::text as previous_date
       from ranked
      where position <= 2
      group by ticker`,
    [sessionDate]
  );

  const lensRows: CrossCheckLensRow[] = lensResult.rows.map((row) => ({
    ticker: String(row.ticker),
    lensScore: toNumber(row.lens_score),
    avgValue20d: toNumber(row.avg_value_20d),
  }));

  const recommendations: CrossCheckRecommendationRow[] = recommendationResult.rows.map((row) => ({
    ticker: String(row.ticker),
    category: row.category === null || row.category === undefined ? null : String(row.category),
    totalScore: toNumber(row.total_score),
  }));

  const ownership: CrossCheckOwnershipRow[] = ownershipResult.rows.map((row) => ({
    ticker: String(row.ticker),
    latestPct: toNumber(row.latest_pct),
    latestDate: row.latest_date === null || row.latest_date === undefined ? null : String(row.latest_date),
    previousPct: toNumber(row.previous_pct),
    previousDate: row.previous_date === null || row.previous_date === undefined ? null : String(row.previous_date),
  }));

  const rows = buildCrossCheckRows({ lensRows, recommendations, ownership });

  const latestOwnershipDate = ownership.reduce<string | null>(
    (latest, row) => (row.latestDate && (!latest || row.latestDate > latest) ? row.latestDate : latest),
    null
  );
  const recommendationWindow = await query(
    `select min(calculated_at)::text as first_scan, max(calculated_at)::text as last_scan
       from recommendation_audit_trail`
  );

  const coverageNotes: string[] = [];
  coverageNotes.push(
    scoreVersion
      ? `Arsip skor sesi ${sessionDate} memuat ${lensRows.length} emiten pada versi ${scoreVersion}.`
      : `Arsip skor sesi ${sessionDate} memuat ${lensRows.length} emiten.`
  );
  const firstScan = recommendationWindow.rows[0]?.first_scan;
  const lastScan = recommendationWindow.rows[0]?.last_scan;
  if (firstScan && lastScan) {
    coverageNotes.push(
      `Pemindaian rekomendasi hanya mencakup ${String(firstScan).slice(0, 10)} sampai ${String(lastScan).slice(0, 10)}; emiten di luar jendela itu berstatus tidak tersedia, bukan ditolak.`
    );
  } else {
    coverageNotes.push('Pemindaian rekomendasi belum punya riwayat, jadi kolomnya tidak tersedia untuk semua emiten.');
  }
  if (latestOwnershipDate) {
    coverageNotes.push(
      `Laporan kepemilikan (KSEI) terakhir tercatat ${latestOwnershipDate} dan bersifat berkala, bukan harian.`
    );
  } else {
    coverageNotes.push('Belum ada laporan kepemilikan yang bisa dipakai untuk mengukur arah perubahan.');
  }
  coverageNotes.push(
    'Status UMA/suspensi tidak ditampilkan di sini karena sumber real-time-nya hanya tersedia di gerbang admin ARA.'
  );

  return {
    date: sessionDate,
    scoreVersion,
    thresholds: CROSS_CHECK_THRESHOLDS,
    rows,
    coverageNotes,
    coveredTickers: lensRows.length,
  };
}