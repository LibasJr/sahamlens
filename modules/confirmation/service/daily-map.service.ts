import { queryReadWithRetry } from '@/shared/database/postgres.client';

/**
 * Peta Alur Harian - kapan data SahamLens benar-benar diperbarui.
 *
 * Halaman ini tidak mengarang jadwal. Dua lapisnya:
 *
 *   1. Jadwal kerja yang dinyatakan terbuka (JOB_META) - apa yang diperbarui tiap tugas.
 *   2. Bukti nyata dari job_run_log: kapan tugas itu terakhir jalan, berapa kali jalan
 *      dalam 7 hari, status terakhirnya, dan jam berapa biasanya jalan (dihitung dari
 *      riwayat, bukan ditulis tangan).
 *
 * Tugas yang belum pernah tercatat TIDAK diberi status "sukses" - statusnya
 * BELUM_TERCATAT dan jamnya kosong. Pesan galat internal tidak diterbitkan di halaman
 * publik; kalau tugas terakhir gagal, halaman hanya menyatakan bahwa ada kegagalan.
 */

export interface DailyMapJobMeta {
  jobName: string;
  label: string;
  whatItRefreshes: string;
  page: string | null;
}

export const DAILY_MAP_JOB_META: DailyMapJobMeta[] = [
  {
    jobName: 'calendar-scan',
    label: 'Agenda korporasi',
    whatItRefreshes: 'Kalender aksi korporasi dan agenda emiten untuk hari berjalan.',
    page: '/calendar',
  },
  {
    jobName: 'market-pulse',
    label: 'Denyut pasar',
    whatItRefreshes: 'Ringkasan irama pasar: frekuensi, nilai, dan arah transaksi sesi berjalan.',
    page: '/market-pulse',
  },
  {
    jobName: 'market-summary',
    label: 'Rangkuman pasar',
    whatItRefreshes: 'Rekap pergerakan indeks dan sektor sesi berjalan.',
    page: '/market',
  },
  {
    jobName: 'screener-scan',
    label: 'Pemindaian screener',
    whatItRefreshes: 'Hasil saringan emiten sesuai filter yang dipakai pengguna.',
    page: '/screener',
  },
  {
    jobName: 'breakout-scan',
    label: 'Pemindaian breakout',
    whatItRefreshes: 'Kandidat breakout dari arsip harga yang sudah ada.',
    page: '/breakout-radar',
  },
  {
    jobName: 'recommendation-scan',
    label: 'Pemindaian rekomendasi',
    whatItRefreshes: 'Kategori rekomendasi per emiten untuk sesi berjalan.',
    page: '/cross-check',
  },
  {
    jobName: 'watchlist-alert',
    label: 'Peringatan daftar pantau',
    whatItRefreshes: 'Evaluasi syarat peringatan pada daftar pantau pengguna.',
    page: '/watchlist',
  },
  {
    jobName: 'dividend-scan',
    label: 'Pemindaian dividen',
    whatItRefreshes: 'Jadwal dan riwayat dividen yang sudah tercatat.',
    page: '/dividend',
  },
  {
    jobName: 'news',
    label: 'Berita',
    whatItRefreshes: 'Kabar pasar dan emiten dari sumber yang dilabeli jelas.',
    page: '/news',
  },
  {
    jobName: 'ai-pick-scan',
    label: 'Pilihan LensAI',
    whatItRefreshes: 'Daftar kandidat pilihan harian dari model yang dibekukan versinya.',
    page: '/recommendations',
  },
  {
    jobName: 'macro',
    label: 'Data makro',
    whatItRefreshes: 'Indikator makro dan asumsinya beserta bukti masukan.',
    page: '/macro',
  },
  {
    jobName: 'daily-market-brief-post',
    label: 'Rangkuman harian tayang',
    whatItRefreshes: 'Rangkuman penutupan sesi yang dikirim ke kanal pengguna.',
    page: null,
  },
  {
    jobName: 'lens-bucket-backtest',
    label: 'Uji ember skor',
    whatItRefreshes: 'Statistik hasil per rentang skor untuk menguji daya pisah skor.',
    page: '/transparency',
  },
  {
    jobName: 'intraday-collect',
    label: 'Kumpulan intraday',
    whatItRefreshes: 'Bar intraday 5 menit untuk emiten yang tercakup kumpulan ini.',
    page: null,
  },
  {
    jobName: 'idx-flow-sync',
    label: 'Aliran broker dan asing (IDX)',
    whatItRefreshes: 'Rekap broker seluruh pasar dan aliran asing dari sumber resmi IDX.',
    page: '/ownership-flow',
  },
  {
    jobName: 'market-data-reconcile',
    label: 'Rekonsiliasi data pasar',
    whatItRefreshes: 'Pencocokan harga penutupan terhadap sumber pembanding.',
    page: '/transparency',
  },
  {
    jobName: 'ownership-flow-ksei-sync',
    label: 'Kepemilikan KSEI',
    whatItRefreshes: 'Komposisi kepemilikan lokal dan asing dari laporan KSEI (berkala).',
    page: '/ownership-flow',
  },
  {
    jobName: 'idx-financial-sync',
    label: 'Laporan keuangan (IDX)',
    whatItRefreshes: 'Angka laporan keuangan emiten dari sumber resmi IDX.',
    page: '/fundamental',
  },
  {
    jobName: 'bank-fundamental-collect',
    label: 'Fundamental perbankan',
    whatItRefreshes: 'Angka khusus sektor perbankan yang tidak seragam dengan sektor lain.',
    page: '/fundamental',
  },
  {
    jobName: 'fundamental-snapshot',
    label: 'Potret fundamental',
    whatItRefreshes: 'Potret berkala rasio fundamental untuk mendeteksi perubahan.',
    page: '/fundamental',
  },
  {
    jobName: 'backtest-precompute',
    label: 'Praperhitungan backtest',
    whatItRefreshes: 'Hasil uji mundur yang dihitung lebih dulu agar halaman cepat dibuka.',
    page: '/backtest',
  },
  {
    jobName: 'tpcl-validation-worker',
    label: 'Pekerja validasi',
    whatItRefreshes: 'Antrean tugas validasi yang berjalan terus-menerus, bukan sekali sehari.',
    page: '/transparency',
  },
  {
    jobName: 'broker-summary-scan',
    label: 'Rekap broker (karantina)',
    whatItRefreshes: 'Rekap broker yang masih dikarantina karena sebagian barisnya belum lolos pemeriksaan.',
    page: null,
  },
  {
    jobName: 'privacy-cleanup',
    label: 'Pembersihan data pribadi',
    whatItRefreshes: 'Penghapusan jejak data pribadi yang sudah melewati masa simpan.',
    page: null,
  },
];

export type DailyMapJobStatus = 'SUCCESS' | 'FAILED' | 'BELUM_TERCATAT';

export interface DailyMapJobRow {
  jobName: string;
  label: string;
  whatItRefreshes: string;
  page: string | null;
  runsLast7Days: number;
  lastRunAt: string | null;
  lastStatus: DailyMapJobStatus;
  /** Jam WIB saat tugas biasanya berjalan, dihitung dari riwayat nyata. null = belum ada riwayat. */
  usualWindow: string | null;
  /** Jam WIB run terakhir. null = belum ada riwayat. */
  lastRunHour: number | null;
  recorded: boolean;
}

export interface DailyMapData {
  generatedAt: string;
  windowDays: number;
  jobs: DailyMapJobRow[];
  /** Tugas yang tercatat berjalan tetapi belum punya keterangan di daftar kerja. */
  undocumentedJobs: { jobName: string; runsLast7Days: number; lastRunAt: string | null; lastStatus: DailyMapJobStatus }[];
}

export interface DailyMapLogRow {
  jobName: string;
  status: string | null;
  /** Stempel waktu run terakhir (UTC, apa adanya dari log). */
  lastRunAt: string | null;
  runsLast7Days: number;
  hourWib: number | null;
  hourWibMin: number | null;
  hourWibMax: number | null;
}

export type DailyMapQuery = (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const defaultQuery: DailyMapQuery = (text, params) => queryReadWithRetry(text, params);

/** Jam WIB (Asia/Jakarta) dari sebuah stempel waktu, tanpa mengubah nilainya. */
export function wibHour(timestamp: string | null): number | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(parsed);
  const numeric = Number(hour);
  return Number.isFinite(numeric) ? numeric : null;
}

export function formatWibWindow(min: number | null, max: number | null): string | null {
  if (min === null || max === null) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (min === max) return `${pad(min)}:00 WIB`;
  return `${pad(min)}:00-${pad(max)}:59 WIB`;
}

function statusOf(value: unknown): DailyMapJobStatus {
  const raw = typeof value === 'string' ? value.toUpperCase() : '';
  if (raw === 'SUCCESS') return 'SUCCESS';
  if (raw === 'FAILED') return 'FAILED';
  return 'BELUM_TERCATAT';
}

export function buildDailyMap(
  logRows: DailyMapLogRow[],
  meta: DailyMapJobMeta[] = DAILY_MAP_JOB_META,
  generatedAt: string = new Date().toISOString(),
  windowDays = 7
): DailyMapData {
  const logByName = new Map(logRows.map((row) => [row.jobName, row]));

  const jobs: DailyMapJobRow[] = meta.map((entry) => {
    const logged = logByName.get(entry.jobName) ?? null;
    const recorded = logged !== null && logged.lastRunAt !== null;
    return {
      jobName: entry.jobName,
      label: entry.label,
      whatItRefreshes: entry.whatItRefreshes,
      page: entry.page,
      runsLast7Days: logged?.runsLast7Days ?? 0,
      lastRunAt: logged?.lastRunAt ?? null,
      lastStatus: recorded ? statusOf(logged?.status) : 'BELUM_TERCATAT',
      usualWindow: formatWibWindow(logged?.hourWibMin ?? null, logged?.hourWibMax ?? null),
      lastRunHour: recorded ? logged?.hourWib ?? null : null,
      recorded,
    };
  });

  const documented = new Set(meta.map((entry) => entry.jobName));
  const undocumentedJobs = logRows
    .filter((row) => !documented.has(row.jobName) && row.lastRunAt !== null)
    .map((row) => ({
      jobName: row.jobName,
      runsLast7Days: row.runsLast7Days,
      lastRunAt: row.lastRunAt,
      lastStatus: statusOf(row.status),
    }))
    .sort((left, right) => (right.lastRunAt ?? '').localeCompare(left.lastRunAt ?? ''));

  return { generatedAt, windowDays, jobs, undocumentedJobs };
}

export async function getDailyMapData(query: DailyMapQuery = defaultQuery): Promise<DailyMapData> {
  const result = await query(
    `with last_run as (
       select distinct on (job_name)
              job_name,
              status,
              started_at,
              finished_at
         from job_run_log
        order by job_name, coalesce(finished_at, started_at) desc
     ),
     window_count as (
       select job_name,
              count(*) filter (
                where coalesce(finished_at, started_at) >= now() - interval '7 days'
              )::int as runs_last_7_days,
              min(coalesce(finished_at, started_at)) filter (
                where coalesce(finished_at, started_at) >= now() - interval '7 days'
              ) as window_first,
              max(coalesce(finished_at, started_at)) filter (
                where coalesce(finished_at, started_at) >= now() - interval '7 days'
              ) as window_last
         from job_run_log
        group by job_name
     )
     select last_run.job_name,
            last_run.status,
            coalesce(last_run.finished_at, last_run.started_at)::text as last_run_at,
            coalesce(window_count.runs_last_7_days, 0) as runs_last_7_days,
            to_char(coalesce(last_run.finished_at, last_run.started_at) at time zone 'Asia/Jakarta', 'HH24')::int as hour_wib,
            to_char(window_count.window_first at time zone 'Asia/Jakarta', 'HH24')::int as hour_wib_min,
            to_char(window_count.window_last at time zone 'Asia/Jakarta', 'HH24')::int as hour_wib_max
       from last_run
       left join window_count on window_count.job_name = last_run.job_name`
  );

  const logRows: DailyMapLogRow[] = result.rows.map((row) => ({
    jobName: String(row.job_name),
    status: row.status === null || row.status === undefined ? null : String(row.status),
    startedAt: null,
    finishedAt: null,
    lastRunAt: row.last_run_at === null || row.last_run_at === undefined ? null : String(row.last_run_at),
    runsLast7Days: Number(row.runs_last_7_days ?? 0),
    hourWib: row.hour_wib === null || row.hour_wib === undefined ? null : Number(row.hour_wib),
    hourWibMin: row.hour_wib_min === null || row.hour_wib_min === undefined ? null : Number(row.hour_wib_min),
    hourWibMax: row.hour_wib_max === null || row.hour_wib_max === undefined ? null : Number(row.hour_wib_max),
  }));

  return buildDailyMap(logRows);
}