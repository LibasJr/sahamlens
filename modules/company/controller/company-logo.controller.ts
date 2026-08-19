import type { HttpResult } from '@/shared/types/http-result.types';

export async function handleCompanyLogo(request: Request): Promise<HttpResult | Response> {
  const domain = new URL(request.url).searchParams.get('domain');
  if (!domain) return { status: 400, body: { error: 'Parameter domain wajib diisi', code: 'VALIDATION_ERROR' } };

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
