import type { ErrorCode } from '@/shared/errors/app-error';

/**
 * SATU FETCHER UNTUK SELURUH APLIKASI.
 *
 * Sebelum ini ada 109 pemanggilan `fetch('/api/...')` yang ditulis tangan di komponen,
 * masing-masing dengan mesin-status loading/error/abort-nya sendiri. Konsekuensinya
 * terbaca di kode, bukan dugaan:
 *
 *   - Hanya 24 dari 94 useEffect memasang AbortController. Berpindah ticker dengan cepat
 *     karena itu bisa membuat respons LAMA mendarat di atas respons BARU - pengguna
 *     melihat angka emiten yang sudah ia tinggalkan.
 *   - Endpoint yang sama diminta ulang oleh beberapa komponen tanpa deduplikasi.
 *   - Kembali ke halaman sebelumnya menampilkan skeleton lagi dari nol.
 *   - Tidak ada retry, jadi satu kedipan jaringan berakhir sebagai pesan gagal permanen
 *     sampai pengguna me-refresh sendiri.
 *
 * SWR menangani keempatnya di satu tempat. Yang perlu ditulis hanyalah fetcher yang
 * memahami amplop respons kita sendiri - dan amplop itu baru seragam setelah seluruh
 * route klien pindah ke runController (lihat shared/http/next-response.adapter.ts).
 * Itu sebabnya pekerjaan ini menunggu B1 selesai, bukan dikerjakan bersamaan.
 */

/** Bentuk error yang dilempar fetcher. Sengaja memuat requestId. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';
  /**
   * Id yang SAMA dengan baris log server (header X-Request-Id + body.meta.requestId dari
   * runController). Disimpan di sini supaya laporan bug pengguna bisa ditelusuri ke baris
   * log persis - itu seluruh alasan adapter menyematkannya, dan sebelumnya frontend
   * membuangnya begitu saja.
   */
  readonly requestId: string | null;
  /** Field tambahan di luar { error, code } - mis. usedToday/limit pada 402 kuota. */
  readonly detail: Record<string, unknown>;

  constructor(args: {
    message: string;
    status: number;
    code: ApiError['code'];
    requestId: string | null;
    detail?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.status = args.status;
    this.code = args.code;
    this.requestId = args.requestId;
    this.detail = args.detail ?? {};
  }

  /** Kegagalan yang tidak ada gunanya diulang - masukan salah, tidak berhak, tidak ada. */
  get isPermanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

const KNOWN_CODES = new Set<string>([
  'UNAUTHENTICATED',
  'EMAIL_NOT_VERIFIED',
  'FORBIDDEN',
  'SUBSCRIPTION_REQUIRED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Fetcher default SWR. Kuncinya string URL, atau [url, init] untuk POST.
 *
 * `credentials: 'include'` selalu dipasang: sesi aplikasi ini berbasis cookie HttpOnly,
 * dan tanpa ini permintaan dari konteks tertentu berangkat tanpa sesi lalu balik 401 yang
 * membingungkan.
 */
export async function apiFetcher<T>(key: string | readonly [string, RequestInit?]): Promise<T> {
  const [url, init] = typeof key === 'string' ? [key, undefined] : key;

  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include', ...init });
  } catch (cause) {
    // Jaringan gagal sebelum server terjangkau: BUKAN 5xx, dan tidak punya requestId.
    // Dibedakan supaya UI bisa bilang "periksa koneksi" alih-alih "server bermasalah".
    throw new ApiError({
      message: 'Tidak dapat menghubungi server. Periksa koneksi Anda.',
      status: 0,
      code: 'NETWORK_ERROR',
      requestId: null,
    });
  }

  const requestId = res.headers.get('X-Request-Id');

  // 204 tidak punya body; mem-parse-nya sebagai JSON akan melempar.
  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Body bukan JSON. Kalau statusnya sukses ini benar-benar tak terduga; kalau gagal,
    // biarkan cabang error di bawah yang menjelaskannya.
    if (res.ok) {
      throw new ApiError({
        message: 'Respons server tidak dapat dibaca.',
        status: res.status,
        code: 'UNKNOWN',
        requestId,
      });
    }
  }

  if (res.ok) return body as T;

  const record = isRecord(body) ? body : {};
  const rawCode = typeof record.code === 'string' ? record.code : '';
  const { error: _error, code: _code, meta: _meta, ...detail } = record;

  throw new ApiError({
    // Pesan dari server DIPAKAI apa adanya kalau ada: runController sudah menjamin
    // hanya AppError ber-`expose` yang pesannya sampai ke klien, dan pesan-pesan itu
    // memang ditulis untuk dibaca pengguna. 500 tak terduga selalu tiba sebagai
    // "Internal Server Error" generik, jadi tidak ada risiko membocorkan detail internal.
    message: typeof record.error === 'string' && record.error ? record.error : 'Terjadi kesalahan.',
    status: res.status,
    code: (KNOWN_CODES.has(rawCode) ? rawCode : 'UNKNOWN') as ApiError['code'],
    requestId,
    detail,
  });
}

/**
 * Aturan retry bersama.
 *
 * Kegagalan 4xx TIDAK diulang - masukan yang salah tidak menjadi benar karena diminta
 * lagi, dan mengulang 402/403 hanya membuang kuota. 429 dikecualikan dari "permanen"
 * karena ia memang menyuruh menunggu, bukan menyuruh berhenti.
 */
export function shouldRetry(error: unknown, retryCount: number): boolean {
  if (error instanceof ApiError && error.isPermanent) return false;
  return retryCount < 3;
}
