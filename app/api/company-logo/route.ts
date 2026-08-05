import { NextResponse } from 'next/server';

// Proxy logo perusahaan (favicon domain resmi) untuk kartu export fundamental
// (components/export/FundamentalExportCard.tsx). Kenapa lewat backend, bukan langsung
// <img src="https://www.google.com/s2/favicons?...">  dari browser:
//
// html-to-image men-drawImage elemen ke <canvas> lalu toDataURL() - gambar cross-origin
// TANPA header `Access-Control-Allow-Origin` bikin canvas "tainted" dan toDataURL()
// throw SecurityError, merusak SELURUH proses export (bukan cuma logonya). Dikonfirmasi
// empiris (2026-08-05): logo.clearbit.com sudah dimatikan (DNS tidak resolve, servisnya
// shutdown pasca akuisisi HubSpot), dan Google favicon service (www.google.com/s2/
// favicons -> gstatic) TIDAK mengirim Access-Control-Allow-Origin sama sekali. Route ini
// fetch favicon di server (bebas CORS, server-to-server), lalu kirim ulang sebagai
// gambar SAME-ORIGIN ke browser - <img> yang minta ke /api/company-logo tidak pernah
// kena masalah cross-origin apa pun.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = url.searchParams.get('domain');

  if (!domain) {
    return NextResponse.json({ error: 'Parameter domain wajib diisi' }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Logo tidak ditemukan' }, { status: 404 });
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    const bytes = await upstream.arrayBuffer();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Favicon jarang berubah - cache 1 hari di edge/browser, bukan setiap request
        // balik ke Google.
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Gagal mengambil logo' }, { status: 502 });
  }
}
