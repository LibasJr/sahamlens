import { logger } from '../../../shared/logger/logger';
import { OWNERSHIP_FLOW_USER_AGENT } from '../config/ownership-flow.config';

// FETCHER SOPAN UNTUK SUMBER PUBLIK.
//
// Sumbernya server publik milik lembaga, bukan API berbayar dengan kuota. Karena
// itu: konkurensi kecil dan berbatas, jeda antar request, timeout tegas, dan
// retry TERBATAS yang hanya berlaku untuk error transien.
//
// `Promise.all(900 ticker)` DILARANG di sini - itu 900 koneksi serempak ke satu
// server, dan efeknya tidak berbeda dari serangan walaupun niatnya tidak.
//
// Tidak ada cookie, tidak ada token, tidak ada kredensial. Kalau suatu sumber
// menuntut login untuk diakses, jawabannya adalah TIDAK MEMAKAI sumber itu -
// bukan menyalin sesi pribadi seseorang ke server produksi.

export type FetchErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'CLIENT_ERROR'
  | 'NETWORK'
  | 'TOO_LARGE';

export interface FetchOutcome {
  ok: boolean;
  status: number | null;
  contentType: string | null;
  finalUrl: string | null;
  body: string | null;
  durationMs: number;
  attempts: number;
  errorCode: FetchErrorCode | null;
  error: string | null;
}

/**
 * Error yang PANTAS diulang: gangguan sesaat pada jaringan/server.
 *
 * Yang TIDAK ada di daftar ini, dan itu disengaja: 4xx selain 429 (permintaan
 * kita memang salah - mengulanginya tidak akan mengubah jawaban) dan kegagalan
 * parser (datanya sudah di tangan; mengambil ulang halaman yang sama tidak
 * membuat strukturnya berubah, hanya membebani sumber tanpa guna - §28).
 */
const RETRYABLE: ReadonlySet<FetchErrorCode> = new Set<FetchErrorCode>([
  'TIMEOUT',
  'RATE_LIMITED',
  'SERVER_ERROR',
  'NETWORK',
]);

/**
 * Terjemahkan status HTTP menjadi sandi error kita.
 *
 * SELURUH 5xx transien (429, 500, 502, 503, 504, dst). Ini KOREKSI 2026-08-16
 * dari temuan VPS: sebelumnya hanya {429, 502, 503, 504} yang terdaftar, jadi
 * HTTP 500 jatuh ke cabang `CLIENT_ERROR` - salah dua kali sekaligus. 500 adalah
 * kegagalan SERVER, bukan permintaan kita yang keliru, dan ia sering sesaat;
 * akibatnya ia tidak pernah diulang padahal justru seharusnya diulang.
 *
 * Dipakai pengecekan RENTANG, bukan daftar status satu per satu - daftar hanya
 * menunda masalah yang sama untuk 507/508 dan seterusnya.
 *
 * 429 tetap dipisahkan dari 5xx karena artinya berbeda bagi operator: yang satu
 * "kita terlalu cepat" (turunkan konkurensi), yang satu "server sumber sedang
 * bermasalah" (tunggu saja).
 */
function classifyHttpStatus(status: number): FetchErrorCode {
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500 && status <= 599) return 'SERVER_ERROR';
  return 'CLIENT_ERROR';
}

/** Batas ukuran respons (byte). Halaman informasi emiten jauh di bawah ini;
 * apa pun yang lebih besar patut dicurigai dan tidak perlu kita tampung. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export interface FetchOptions {
  timeoutMs: number;
  /** Jumlah percobaan TOTAL, bukan jumlah pengulangan. 3 = 1 asli + 2 ulang. */
  maxAttempts?: number;
  /** Jeda dasar backoff (ms). */
  backoffBaseMs?: number;
  /** Disuntik pada test supaya tidak ada jaringan & tidak ada tunggu nyata. */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Ambil satu URL dengan timeout dan retry terbatas.
 *
 * TIDAK PERNAH melempar - seluruh kegagalan dikembalikan sebagai FetchOutcome
 * bersandi. Ini disengaja: pemanggilnya memproses ratusan ticker, dan satu
 * kegagalan harus menjadi baris laporan, bukan pengecualian yang menggagalkan
 * seluruh job (§27).
 */
export async function fetchOwnershipPage(
  url: string,
  options: FetchOptions
): Promise<FetchOutcome> {
  const {
    timeoutMs,
    maxAttempts = 3,
    backoffBaseMs = 500,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
  } = options;

  const startedAt = Date.now();
  let last: { code: FetchErrorCode; message: string; status: number | null } = {
    code: 'NETWORK',
    message: 'belum dicoba',
    status: null,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Batalkan juga saat pemanggil membatalkan (mis. cron kehabisan waktu).
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          // User-Agent yang menyebut identitas & kontak - kalau operator sumber
          // keberatan, mereka tahu harus menghubungi siapa. Menyamar sebagai
          // browser justru menghalangi itu.
          'User-Agent': OWNERSHIP_FLOW_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        },
      });

      if (!response.ok) {
        const code = classifyHttpStatus(response.status);
        last = { code, message: `HTTP ${response.status}`, status: response.status };
        if (!RETRYABLE.has(code) || attempt === maxAttempts) {
          return outcome(false, last, startedAt, attempt, response);
        }
        await sleepImpl(backoffDelay(backoffBaseMs, attempt));
        continue;
      }

      const body = await response.text();
      if (body.length > MAX_RESPONSE_BYTES) {
        return outcome(
          false,
          { code: 'TOO_LARGE', message: `Respons ${body.length} byte melebihi batas`, status: response.status },
          startedAt,
          attempt,
          response
        );
      }

      return {
        ok: true,
        status: response.status,
        contentType: response.headers.get('content-type'),
        finalUrl: response.url || url,
        body,
        durationMs: Date.now() - startedAt,
        attempts: attempt,
        errorCode: null,
        error: null,
      };
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      last = {
        code: aborted ? 'TIMEOUT' : 'NETWORK',
        message: aborted ? `Timeout setelah ${timeoutMs} ms` : ((err as Error)?.message ?? String(err)),
        status: null,
      };
      if (attempt === maxAttempts) break;
      await sleepImpl(backoffDelay(backoffBaseMs, attempt));
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  return outcome(false, last, startedAt, maxAttempts, null);
}

/** Backoff eksponensial dengan jitter - mencegah seluruh worker mengulang serempak. */
function backoffDelay(base: number, attempt: number): number {
  const exponential = base * 2 ** (attempt - 1);
  return exponential + Math.floor(Math.random() * base);
}

function outcome(
  ok: boolean,
  last: { code: FetchErrorCode; message: string; status: number | null },
  startedAt: number,
  attempts: number,
  response: Response | null
): FetchOutcome {
  return {
    ok,
    status: last.status ?? response?.status ?? null,
    contentType: response?.headers.get('content-type') ?? null,
    finalUrl: response?.url ?? null,
    body: null,
    durationMs: Date.now() - startedAt,
    attempts,
    errorCode: last.code,
    error: last.message,
  };
}

/**
 * Jalankan `worker` atas seluruh item dengan JUMLAH PARALEL TERBATAS.
 *
 * Pola pool: `limit` worker berbagi satu kursor, masing-masing mengambil item
 * berikutnya begitu selesai. Bedanya dengan memecah jadi batch `Promise.all`:
 * di sini satu ticker lambat tidak menahan seluruh batch - worker lain terus
 * jalan. Hasil dikembalikan URUT sesuai `items`, bukan urut selesai.
 *
 * `worker` diasumsikan tidak melempar (fetchOwnershipPage tidak melempar); kalau
 * tetap terjadi, error ditangkap dan diteruskan ke `onError` agar satu item
 * bermasalah tidak menjatuhkan job - §27.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  options: { minDelayMs?: number; onError?: (item: T, error: unknown) => R } = {}
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const effectiveLimit = Math.max(1, Math.min(limit, items.length || 1));
  let cursor = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (err) {
        if (options.onError) {
          results[index] = options.onError(items[index], err);
        } else {
          throw err;
        }
      }
      // Jeda sopan DI DALAM worker: dengan 3 worker dan jeda 250 ms, laju
      // gabungan ~12 request/detik pada kasus terburuk - jauh dari membanjiri.
      if (options.minDelayMs && cursor < items.length) {
        await defaultSleep(options.minDelayMs);
      }
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, run));
  return results;
}

/** Log terstruktur per ticker. SENGAJA tidak pernah memuat body HTML (§31). */
export function logFetchOutcome(
  job: string,
  ticker: string,
  source: string,
  outcomeValue: FetchOutcome
): void {
  const context = {
    module: 'ownership-flow',
    job,
    ticker,
    source,
    status: outcomeValue.status,
    durationMs: outcomeValue.durationMs,
    attempts: outcomeValue.attempts,
    errorCode: outcomeValue.errorCode,
  };
  if (outcomeValue.ok) logger.debug('Ownership fetch sukses', context);
  else logger.warn('Ownership fetch gagal', { ...context, error: outcomeValue.error });
}
