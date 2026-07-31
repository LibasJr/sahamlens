// Error domain terpusat. Controller melempar salah satu class ini; adapter di
// app/api/**/route.ts menangkapnya lewat toErrorResponse() dan mengubahnya jadi
// NextResponse yang konsisten - pesan generik ke klien, detail lengkap ke logger
// (lihat shared/logger/logger.ts), sesuai temuan H6 di audit: err.message mentah
// TIDAK BOLEH lagi bocor ke response klien.

// Katalog kode error machine-readable (API Guideline poin 5) - string SNAKE_CASE
// konstan, dipakai klien untuk switch(error.code) alih-alih menebak dari
// error.message yang bisa berubah kapan saja tanpa breaking change yang disengaja.
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'EMAIL_NOT_VERIFIED'
  | 'FORBIDDEN'
  | 'SUBSCRIPTION_REQUIRED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly expose: boolean;

  constructor(message: string, status: number, code: ErrorCode, expose = true) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.expose = expose;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Belum login') {
    super(message, 401, 'UNAUTHENTICATED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

// Sebelumnya endpoint pro-gated mengembalikan 429 ("rate limit") untuk kondisi
// "akun bukan pro" - itu keliru secara semantik (temuan H9 audit awal, poin 2 di
// prioritas adopsi API Guideline). 402 Payment Required jauh lebih akurat: klien
// tahu ini soal langganan, bukan soal terlalu sering request.
export class SubscriptionRequiredError extends AppError {
  constructor(message = 'Fitur ini butuh akun Pro') {
    super(message, 402, 'SUBSCRIPTION_REQUIRED');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Data tidak ditemukan') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Input tidak valid') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Konflik data') {
    super(message, 409, 'CONFLICT');
  }
}

// CATATAN (code review M2): belum dipakai oleh middleware.ts - itu Edge Runtime,
// menulis NextResponse.json 429-nya sendiri langsung karena tidak lewat
// runController/AppError sama sekali (beda filosofi dari controller Node biasa).
// Class ini disiapkan untuk rate-limit PER-USER di level controller (bukan
// per-IP di Edge) begitu kebutuhan itu muncul - lihat Cache Layer Strategy
// bagian rate-limit per-user untuk endpoint mahal (council, stock/[ticker]).
export class RateLimitedError extends AppError {
  readonly retryAfterSec?: number;
  constructor(message = 'Terlalu banyak permintaan', retryAfterSec?: number) {
    super(message, 429, 'RATE_LIMITED');
    this.retryAfterSec = retryAfterSec;
  }
}

export interface ErrorResponseShape {
  status: number;
  body: { error: string; code: ErrorCode };
  headers?: Record<string, string>;
}

/**
 * Ubah error apa pun (AppError maupun tak terduga) jadi bentuk response yang aman
 * dikirim ke klien. Error tak terduga TIDAK PERNAH membocorkan message aslinya -
 * itu tugas logger (dipanggil terpisah oleh adapter sebelum memanggil ini).
 *
 * `error` tetap string (bukan diubah jadi objek) - backward compatible dengan
 * frontend lama yang sudah baca `data.error` sebagai string. `code` ditambahkan
 * sebagai field baru di sampingnya (expand, bukan breaking change).
 */
export function toErrorResponse(err: unknown): ErrorResponseShape {
  if (err instanceof AppError) {
    const headers = err instanceof RateLimitedError && err.retryAfterSec
      ? { 'Retry-After': String(err.retryAfterSec) }
      : undefined;
    return {
      status: err.status,
      body: { error: err.expose ? err.message : 'Internal Server Error', code: err.expose ? err.code : 'INTERNAL_ERROR' },
      headers,
    };
  }
  return { status: 500, body: { error: 'Internal Server Error', code: 'INTERNAL_ERROR' } };
}
