/**
 * Resolve the caller IP only from headers that are trusted for the active reverse-proxy mode.
 *
 * Production SahamLens currently sits behind Cloudflare Tunnel. In that mode we trust
 * `CF-Connecting-IP` and deliberately ignore a client-supplied `X-Forwarded-For` so rate
 * limits cannot be bypassed by forging that header. For a private reverse proxy that is
 * explicitly configured to overwrite X-Forwarded-For, set TRUSTED_PROXY_MODE=forwarded.
 */
export type TrustedProxyMode = 'cloudflare' | 'forwarded' | 'direct';

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  if (!first || first.length > 80) return null;
  // Strip an IPv6 zone id but otherwise keep the canonical text supplied by the proxy.
  const ip = first.split('%')[0]!;
  const ipv4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    if (ipv4.slice(1).some((part) => Number(part) > 255)) return null;
    return ip;
  }
  // Conservative IPv6 validation. This is intentionally syntax-only; Node/Next does not
  // expose the remote socket here, so proxy trust is controlled by TRUSTED_PROXY_MODE.
  if (ip.includes(':') && /^[0-9a-fA-F:.]+$/.test(ip)) return ip.toLowerCase();
  return null;
}

export function getTrustedProxyMode(): TrustedProxyMode {
  const raw = process.env.TRUSTED_PROXY_MODE?.trim().toLowerCase();
  if (raw === 'forwarded' || raw === 'direct' || raw === 'cloudflare') return raw;
  return process.env.NODE_ENV === 'production' ? 'cloudflare' : 'forwarded';
}

export function getTrustedClientIp(headers: Headers): string {
  const mode = getTrustedProxyMode();
  if (mode === 'cloudflare') {
    return normalizeIp(headers.get('cf-connecting-ip')) || 'unknown';
  }
  if (mode === 'forwarded') {
    return normalizeIp(headers.get('x-forwarded-for'))
      || normalizeIp(headers.get('x-real-ip'))
      || 'unknown';
  }
  // In direct mode we intentionally do not trust proxy headers at all. Next's Request
  // API does not expose a peer address, so callers share the conservative `unknown` bucket.
  return 'unknown';
}

export function maskClientIp(ip: string): string | null {
  const ipv4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (ipv4 && ipv4.slice(1).every((part) => Number(part) <= 255)) {
    return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;
  }
  if (ip.includes(':')) {
    const prefix = ip.split(':').filter(Boolean).slice(0, 4).join(':');
    return prefix ? `${prefix}::/64` : null;
  }
  return null;
}
