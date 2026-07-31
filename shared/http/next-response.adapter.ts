import { NextResponse, type NextRequest } from 'next/server';
import { toErrorResponse } from '../errors/app-error';
import { logger } from '../logger/logger';
import type { HttpResult } from '../types/http-result.types';

function applyCookies(res: NextResponse, result: HttpResult): NextResponse {
  for (const cookie of result.cookiesToSet || []) {
    res.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  for (const name of result.cookiesToClear || []) {
    res.cookies.delete(name);
  }
  return res;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// requestId - selalu di header X-Request-Id (bisa dibaca tanpa parse body, termasuk
// untuk response yang body-nya array/null). Kalau body-nya objek biasa, ditambahkan
// juga sebagai body.meta.requestId secara ADITIF (field baru, tidak menimpa/menghapus
// field lama) supaya endpoint lama yang belum baca `meta` tetap kompatibel.
function withRequestId<T>(body: T, requestId: string): T {
  if (isPlainObject(body)) {
    const existingMeta = isPlainObject((body as any).meta) ? (body as any).meta : {};
    return { ...body, meta: { ...existingMeta, requestId } } as T;
  }
  return body;
}

// Pakai header Host, BUKAN req.nextUrl.origin - saat dev server bind ke 0.0.0.0
// (next dev -H 0.0.0.0, lihat package.json), req.nextUrl.origin bisa ikut resolve
// ke 0.0.0.0 yang tidak valid buat redirect ke browser.
function resolveOrigin(req: NextRequest): string {
  const host = req.headers.get('host') || req.nextUrl.host;
  const protocol = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  return `${protocol}://${host}`;
}

function toNextResponse(result: HttpResult, requestId: string, req?: NextRequest): NextResponse {
  if (result.redirectTo) {
    const origin = req ? resolveOrigin(req) : undefined;
    const url: string | URL = origin ? new URL(result.redirectTo, origin) : result.redirectTo;
    const res = NextResponse.redirect(url, result.status);
    res.headers.set('X-Request-Id', requestId);
    return applyCookies(res, result);
  }
  const res = NextResponse.json(withRequestId(result.body, requestId), { status: result.status });
  res.headers.set('X-Request-Id', requestId);
  return applyCookies(res, result);
}

/**
 * Bungkus satu controller call (yang bisa melempar AppError) jadi NextResponse yang
 * konsisten. Error tak terduga di-log lengkap di server (shared/logger) tapi TIDAK
 * PERNAH membocorkan message aslinya ke klien (temuan H6 di audit) - klien hanya
 * dapat "Internal Server Error" generik. Setiap response (sukses maupun gagal) dapat
 * X-Request-Id yang sama dengan yang dicatat di log server - itu yang membuat satu
 * laporan bug user bisa ditelusuri ke baris log persis (API Guideline poin 4).
 */
export async function runController(handler: () => Promise<HttpResult>, req?: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  try {
    const result = await handler();
    return toNextResponse(result, requestId, req);
  } catch (err) {
    // Next.js melempar error internal bertanda `digest: 'DYNAMIC_SERVER_USAGE'` saat
    // build mencoba pre-render statis sebuah route yang ternyata pakai cookies()/headers().
    // Itu sinyal kontrol-alur Next.js sendiri, BUKAN error aplikasi - harus dilempar ulang
    // apa adanya, jangan ditangkap jadi respons 500.
    if (typeof (err as any)?.digest === 'string' && (err as any).digest.startsWith('DYNAMIC_SERVER_USAGE')) {
      throw err;
    }
    const mapped = toErrorResponse(err);
    if (mapped.status >= 500) {
      logger.error('Unhandled controller error', { err, url: req?.nextUrl?.pathname, requestId });
    }
    const res = NextResponse.json(withRequestId(mapped.body, requestId), { status: mapped.status, headers: mapped.headers });
    res.headers.set('X-Request-Id', requestId);
    return res;
  }
}
