import { isIP } from 'node:net';
import type { HttpResult } from '@/shared/types/http-result.types';

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

    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return { status: 502, body: { error: 'Gagal mengambil logo', code: 'UPSTREAM_ERROR' } };
  }
}
