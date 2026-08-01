import crypto from 'crypto';

const HEADER = 'x-internal-secret';

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Dipakai untuk panggilan server-to-server (mis. modules/notification/service/
// alert-evaluation.service.ts memanggil /api/stock/[ticker], /api/breakout-radar,
// /api/market-pulse lewat HTTP internal) supaya panggilan itu tidak ikut kena gate
// session/Pro yang sebetulnya ditujukan untuk request dari browser user. Tanpa ini,
// route yang di-gate checkProAccess() selalu 401/402 untuk pemanggil internal -
// lihat bug: sistem alert tidak pernah triggered karena data selalu kosong.
// Fail-closed: kalau INTERNAL_API_SECRET belum di-set di env, selalu false (tidak
// pernah membuka bypass tanpa sengaja).
export function isInternalServiceRequest(req: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const provided = req.headers.get(HEADER);
  if (!provided) return false;
  return timingSafeStringEqual(provided, secret);
}

export function internalServiceHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_API_SECRET;
  return secret ? { [HEADER]: secret } : {};
}
