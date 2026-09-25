/**
 * Kesiapan DATA HIDUP Scanner ARA.
 *
 * `evaluateAraScannerReadiness()` menilai kesiapan dari DAFTAR STATUS yang dideklarasikan
 * di dalam kode. Berkas ini menambahkan lapisan yang TIDAK bisa dideklarasikan: apakah
 * data pasar yang dibutuhkan scanner benar-benar ada dan segar di database.
 *
 * Tiga pemeriksaan (semua angka berasal dari query nyata, bukan asumsi):
 *   1. basis harian  - baris terakhir lens_radar_history (harga + skor harian)
 *   2. bar intraday  - sinyal intraday terakhir (mesin ARA butuh bar dalam hari)
 *   3. mutu intraday - baris mutu data untuk hari bursa terakhir
 */

export type AraLiveDataStatus = 'READY' | 'STALE' | 'THIN' | 'MISSING' | 'UNAVAILABLE';

export interface AraLiveDataCheck {
  key: 'BASIS_HARIAN' | 'BAR_INTRADAY' | 'MUTU_INTRADAY';
  label: string;
  status: AraLiveDataStatus;
  /** Tanggal data terakhir yang benar-benar ada di database (null = tidak ada). */
  lastDate: string | null;
  /** Jumlah emiten/baris pada tanggal terakhir tersebut. */
  coverage: number;
  /** Ambang minimum yang dipakai penilaian (ikut dilaporkan supaya bisa diaudit). */
  minCoverage: number;
  /** Umur data dalam hari kalender terhadap tanggal penilaian. */
  ageDays: number | null;
  maxAgeDays: number;
  detail: string;
}

export interface AraLiveDataReadiness {
  status: 'READY' | 'PARTIAL' | 'UNAVAILABLE';
  checkedAt: string;
  checks: AraLiveDataCheck[];
  readyCount: number;
  problemCount: number;
  reason: string;
}

export interface LiveCheckInput {
  lastDate: string | null;
  coverage: number;
  minCoverage: number;
  maxAgeDays: number;
  /** Tanggal acuan penilaian (YYYY-MM-DD, zona WIB sudah diputuskan pemanggil). */
  todayIso: string;
  /** Terisi bila query gagal - status menjadi UNAVAILABLE, bukan diam-diam READY. */
  error?: string | null;
}

export function hitungUmurHari(lastDate: string, todayIso: string): number | null {
  const dari = Date.parse(`${lastDate}T00:00:00Z`);
  const ke = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(dari) || !Number.isFinite(ke)) return null;
  return Math.round((ke - dari) / 86_400_000);
}

export function nilaiLiveCheck(input: LiveCheckInput): AraLiveDataStatus {
  if (input.error) return 'UNAVAILABLE';
  if (!input.lastDate) return 'MISSING';
  const umur = hitungUmurHari(input.lastDate, input.todayIso);
  if (umur === null) return 'UNAVAILABLE';
  if (umur < 0) return 'UNAVAILABLE';
  if (umur > input.maxAgeDays) return 'STALE';
  if (input.coverage < input.minCoverage) return 'THIN';
  return 'READY';
}

export function ringkasLiveData(checks: AraLiveDataCheck[], checkedAt: string): AraLiveDataReadiness {
  const readyCount = checks.filter((c) => c.status === 'READY').length;
  const problemCount = checks.length - readyCount;
  const semuaHilang = checks.length > 0 && checks.every((c) => c.status === 'UNAVAILABLE');
  const status = semuaHilang ? 'UNAVAILABLE' : problemCount === 0 ? 'READY' : 'PARTIAL';
  const reason =
    status === 'READY'
      ? 'Data pasar untuk scanner ARA tersedia dan segar untuk seluruh pemeriksaan.'
      : status === 'UNAVAILABLE'
        ? 'Pemeriksaan data hidup tidak dapat dijalankan (query gagal). Kesiapan data TIDAK dapat diklaim.'
        : `Data pasar belum siap pada ${problemCount} dari ${checks.length} pemeriksaan: ${checks
            .filter((c) => c.status !== 'READY')
            .map((c) => `${c.label}=${c.status}`)
            .join(', ')}.`;
  return { status, checkedAt, checks, readyCount, problemCount, reason };
}

// ---------------------------------------------------------------------------
// Bagian yang menyentuh database
// ---------------------------------------------------------------------------

export interface LiveCheckSpec {
  key: AraLiveDataCheck['key'];
  label: string;
  minCoverage: number;
  maxAgeDays: number;
  sql: string;
}

const PEMERIKSAAN: readonly LiveCheckSpec[] = [
  {
    key: 'BASIS_HARIAN',
    label: 'Basis harian (skor + harga)',
    minCoverage: 100,
    maxAgeDays: 4,
    sql: `SELECT to_char(max(date), 'YYYY-MM-DD') AS terakhir,
                 count(DISTINCT ticker) FILTER (WHERE date = (SELECT max(date) FROM public.lens_radar_history)) AS cakupan
            FROM public.lens_radar_history
           WHERE date > current_date - 30`,
  },
  {
    key: 'BAR_INTRADAY',
    label: 'Bar intraday (sinyal per menit)',
    minCoverage: 30,
    maxAgeDays: 4,
    sql: `SELECT to_char(max(trading_date), 'YYYY-MM-DD') AS terakhir,
                 count(DISTINCT ticker) FILTER (WHERE trading_date = (SELECT max(trading_date) FROM public.intraday_signals)) AS cakupan
            FROM public.intraday_signals
           WHERE trading_date > current_date - 30`,
  },
  {
    key: 'MUTU_INTRADAY',
    label: 'Mutu data intraday',
    minCoverage: 30,
    maxAgeDays: 4,
    sql: `SELECT to_char(max(trading_date), 'YYYY-MM-DD') AS terakhir,
                 count(*) FILTER (WHERE trading_date = (SELECT max(trading_date) FROM public.intraday_data_quality)) AS cakupan
            FROM public.intraday_data_quality
           WHERE trading_date > current_date - 30`,
  },
] as const;

/**
 * Jalankan ketiga pemeriksaan terhadap database produksi. Tidak ada angka cadangan:
 * query yang gagal dilaporkan UNAVAILABLE apa adanya, tidak diubah menjadi READY.
 */
export async function getAraLiveDataReadiness(
  sekarang: Date = new Date(),
  query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> = defaultQuery,
): Promise<AraLiveDataReadiness> {
  const todayIso = tanggalWib(sekarang);
  const checks: AraLiveDataCheck[] = [];

  for (const spec of PEMERIKSAAN) {
    try {
      const hasil = await query(spec.sql);
      const baris = hasil.rows[0] ?? {};
      const lastDate = baris.terakhir == null ? null : String(baris.terakhir);
      const coverage = Number(baris.cakupan ?? 0);
      const status = nilaiLiveCheck({
        lastDate,
        coverage,
        minCoverage: spec.minCoverage,
        maxAgeDays: spec.maxAgeDays,
        todayIso,
      });
      checks.push({
        key: spec.key,
        label: spec.label,
        status,
        lastDate,
        coverage,
        minCoverage: spec.minCoverage,
        ageDays: lastDate ? hitungUmurHari(lastDate, todayIso) : null,
        maxAgeDays: spec.maxAgeDays,
        detail: detailPemeriksaan(spec, status, lastDate, coverage),
      });
    } catch (error) {
      checks.push({
        key: spec.key,
        label: spec.label,
        status: 'UNAVAILABLE',
        lastDate: null,
        coverage: 0,
        minCoverage: spec.minCoverage,
        ageDays: null,
        maxAgeDays: spec.maxAgeDays,
        detail: `Pemeriksaan gagal dijalankan: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return ringkasLiveData(checks, sekarang.toISOString());
}

function detailPemeriksaan(
  spec: LiveCheckSpec,
  status: AraLiveDataStatus,
  lastDate: string | null,
  coverage: number,
): string {
  if (status === 'MISSING') return 'Tidak ada baris sama sekali dalam 30 hari terakhir.';
  if (status === 'UNAVAILABLE') return 'Tanggal terakhir tidak dapat dibaca sebagai tanggal yang sah.';
  if (status === 'STALE') return `Data terakhir ${lastDate}, lebih tua dari batas ${spec.maxAgeDays} hari.`;
  if (status === 'THIN') return `Data ${lastDate} hanya mencakup ${coverage} dari minimal ${spec.minCoverage}.`;
  return `Data ${lastDate} mencakup ${coverage} (minimal ${spec.minCoverage}).`;
}

async function defaultQuery(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
  const { pool } = await import('@/shared/database/postgres.client');
  return pool.query(sql);
}

/** Tanggal zona WIB (UTC+7) - jam bursa ditentukan di WIB, bukan UTC. */
export function tanggalWib(sekarang: Date): string {
  const wib = new Date(sekarang.getTime() + 7 * 3_600_000);
  return wib.toISOString().slice(0, 10);
}