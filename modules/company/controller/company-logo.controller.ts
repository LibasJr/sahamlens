import { isIP } from 'node:net';
import type { HttpResult } from '@/shared/types/http-result.types';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/bmp',
  'image/avif',
]);

const MAX_LOGO_BYTES = 512 * 1024;

function normalizeCompanyDomain(value: string): string | null {
  const candidate = value.trim().toLowerCase();
  if (!candidate || candidate.length > 253 || candidate.includes('/') || candidate.includes('@')) return null;

  try {
    const parsed = new URL(`https://${candidate}`);
    if (parsed.hostname !== candidate || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    if (!candidate.includes('.') || candidate.includes('..') || isIP(candidate) !== 0) return null;
    if (!candidate.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
    return candidate;
  } catch {
    return null;
  }
}

function safeImageMimeType(rawContentType: string | null): string | null {
  if (!rawContentType) return 'image/png';
  const mime = rawContentType.split(';')[0]?.trim().toLowerCase() || '';
  if (!mime) return 'image/png';
  return ALLOWED_IMAGE_MIME_TYPES.has(mime) ? mime : null;
}

export async function handleCompanyLogo(request: Request): Promise<HttpResult | Response> {
  const rawDomain = new URL(request.url).searchParams.get('domain');
  const domain = rawDomain ? normalizeCompanyDomain(rawDomain) : null;
  if (!domain) return { status: 400, body: { error: 'Domain perusahaan tidak valid', code: 'VALIDATION_ERROR' } };

  try {
    const upstream = await fetch(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!upstream.ok) return { status: 404, body: { error: 'Logo tidak ditemukan', code: 'NOT_FOUND' } };

    const contentType = safeImageMimeType(upstream.headers?.get?.('content-type') ?? null);
    if (!contentType) {
      return { status: 502, body: { error: 'Tipe konten logo tidak diizinkan', code: 'UPSTREAM_ERROR' } };
    }

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_LOGO_BYTES) {
      return { status: 502, body: { error: 'Ukuran logo melebihi batas aman', code: 'UPSTREAM_ERROR' } };
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return { status: 502, body: { error: 'Gagal mengambil logo', code: 'UPSTREAM_ERROR' } };
  }
}
