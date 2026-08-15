import crypto from 'crypto';

export interface AuthRequestMeta {
  /** Hash HMAC untuk menghubungkan event dari jaringan sama tanpa menyimpan IP mentah. */
  ipHash: string | null;
  /** Prefix jaringan yang tidak cukup presisi untuk mengidentifikasi satu perangkat. */
  ipPrefix: string | null;
  userAgent: string | null;
}

function readClientIp(request: Request): string | null {
  // Cloudflare berada di depan production; fallback berikut juga bekerja saat aplikasi
  // dipanggil langsung melalui reverse proxy VPS atau saat pengembangan lokal.
  const cloudflareIp = request.headers.get('cf-connecting-ip');
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip');
  return cloudflareIp || forwardedIp || realIp || null;
}

function maskIp(ip: string): string | null {
  const ipv4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (ipv4 && ipv4.slice(1).every((part) => Number(part) <= 255)) {
    return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;
  }

  // Untuk IPv6 hanya simpan 64 bit awal; ini menunjukkan jaringan secara kasar,
  // bukan alamat perangkat lengkap. Bentuk terkompresi tidak perlu dipulihkan.
  if (ip.includes(':')) {
    const prefix = ip.split('%')[0].split(':').filter(Boolean).slice(0, 4).join(':');
    return prefix ? `${prefix}::/64` : null;
  }
  return null;
}

export function getAuthRequestMeta(request: Request): AuthRequestMeta {
  const ip = readClientIp(request);
  const secret = process.env.AUTH_AUDIT_HASH_SECRET || process.env.JWT_SECRET_KEY;
  const ipHash = ip && secret
    ? crypto.createHmac('sha256', secret).update(ip).digest('hex')
    : null;
  const userAgent = request.headers.get('user-agent')?.trim().slice(0, 300) || null;

  return { ipHash, ipPrefix: ip ? maskIp(ip) : null, userAgent };
}
