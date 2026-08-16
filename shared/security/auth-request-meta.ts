import crypto from 'crypto';
import { getTrustedClientIp, maskClientIp } from '../http/client-ip';

export interface AuthRequestMeta {
  /** Hash HMAC untuk menghubungkan event dari jaringan sama tanpa menyimpan IP mentah. */
  ipHash: string | null;
  /** Prefix jaringan yang tidak cukup presisi untuk mengidentifikasi satu perangkat. */
  ipPrefix: string | null;
  userAgent: string | null;
}

export function getAuthRequestMeta(request: Request): AuthRequestMeta {
  const resolvedIp = getTrustedClientIp(request.headers);
  const ip = resolvedIp === 'unknown' ? null : resolvedIp;
  // Production must not reuse the session-signing secret for analytics/audit HMACs.
  // If the dedicated secret is missing we prefer losing the linkable hash (null) over
  // widening the purpose/blast radius of JWT_SECRET_KEY. Tests/dev retain a fallback.
  const secret = process.env.AUTH_AUDIT_HASH_SECRET
    || (process.env.NODE_ENV === 'production' ? undefined : process.env.JWT_SECRET_KEY);
  const ipHash = ip && secret
    ? crypto.createHmac('sha256', secret).update(ip).digest('hex')
    : null;
  const userAgent = request.headers.get('user-agent')?.trim().slice(0, 300) || null;

  return { ipHash, ipPrefix: ip ? maskClientIp(ip) : null, userAgent };
}
