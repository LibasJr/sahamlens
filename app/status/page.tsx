'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { apiRequest, ApiClientError } from '@/shared/http/api-client';

type Source = { sourceId: string; status: string; lastSuccessAt: string | null; dataObservedAt: string | null; consecutiveFailures: number };
type Health = { status: string; checks: { database: string; redis: string }; degraded?: string[]; sources?: { summary: Record<string, number>; items: Source[] }; timestamp: string };

/** `/api/health` membalas 503 justru ketika ada yang perlu dilihat, dan `apiRequest`
 * melempar untuk status non-2xx. Tanpa ini halaman status menampilkan "belum dapat
 * diambil" tepat pada keadaan yang menjadi alasan halaman ini ada - badan responsnya
 * tetap payload health yang lengkap, jadi dipakai apa adanya. */
function healthFromError(err: unknown): Health | null {
  if (!(err instanceof ApiClientError) || err.status !== 503) return null;
  const body = err.body;
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Partial<Health>;
  return candidate.checks && typeof candidate.checks === 'object' ? candidate as Health : null;
}

function fmt(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : value;
}

export default function PublicStatusPage() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const json = await apiRequest<Health>('/api/health', { cache: 'no-store' });
        if (active) { setData(json); setError(null); }
      } catch (err) {
        const degradedPayload = healthFromError(err);
        if (!active) return;
        if (degradedPayload) { setData(degradedPayload); setError(null); }
        else setError('Status belum dapat diambil.');
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const sources = data?.sources?.items ?? [];
  const degraded = data?.degraded ?? [];
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 text-tv-text">
      <div className="mb-7 flex items-center justify-between gap-4">
        <div><p className="text-xs uppercase tracking-[0.2em] text-tv-muted">Operasional publik</p><h1 className="text-2xl font-bold">Status SahamLens</h1></div>
        <Link href="/" className="text-sm text-tv-blue hover:underline">Kembali ke SahamLens</Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4"><div className="text-xs text-tv-muted">Aplikasi / DB</div><div className="mt-1 text-lg font-semibold">{data?.checks?.database === 'ok' ? 'Operasional' : 'Terganggu'}</div></Card>
        <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4"><div className="text-xs text-tv-muted">Redis</div><div className="mt-1 text-lg font-semibold">{data?.checks?.redis ?? 'memuat…'}</div></Card>
        <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-4"><div className="text-xs text-tv-muted">Pembaruan status</div><div className="mt-1 text-sm font-semibold">{fmt(data?.timestamp)}</div></Card>
      </div>
      {error && <div className="mt-4 rounded-xl border border-yellow-700/40 bg-yellow-950/20 p-4 text-sm text-yellow-200">{error}</div>}
      {/* Sengaja hanya menyebut KOMPONEN yang terganggu, bukan konsekuensinya. Redis mati
          berarti kuota harian & rate limit fail-open, dan halaman ini publik - mengumumkan
          "rate limit sedang tidak berlaku" adalah undangan. Konsekuensinya dicatat di
          journal lewat deploy/uptime-monitor/, tempat yang membacanya cuma operator. */}
      {degraded.length > 0 && <div className="mt-4 rounded-xl border border-yellow-700/40 bg-yellow-950/20 p-4 text-sm text-yellow-200">
        Layanan sedang terganggu: {degraded.join(', ')}. Sebagian data mungkin lebih lambat atau tidak diperbarui.
      </div>}
      <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mt-7 border-tv-border p-5">
        <h2 className="text-lg font-semibold">Kesehatan sumber data</h2>
        <p className="mt-1 text-sm text-tv-muted">Status ini tidak mengubah data menjadi “benar”; ia menunjukkan apakah pipeline sumber terakhir berhasil atau sedang bermasalah.</p>
        <div className="mt-4 divide-y divide-tv-border">
          {sources.length === 0 && <div className="py-5 text-sm text-tv-muted">Belum ada telemetry sumber yang dapat ditampilkan.</div>}
          {sources.map((s) => <div key={s.sourceId} className="grid gap-2 py-3 text-sm md:grid-cols-[1.2fr_.6fr_1fr_1fr]">
            <div className="font-medium">{s.sourceId}</div><div>{s.status}</div><div><span className="text-tv-muted">Sukses: </span>{fmt(s.lastSuccessAt)}</div><div><span className="text-tv-muted">Data: </span>{fmt(s.dataObservedAt)}</div>
          </div>)}
        </div>
      </Card>
      <p className="mt-6 text-xs leading-5 text-tv-muted">Status provider dipisahkan dari HTTP health utama: gangguan sumber tidak memicu restart otomatis yang tidak akan memperbaiki provider eksternal. Untuk prinsip dan batas penggunaan data, lihat <Link className="text-tv-blue" href="/about">Tentang</Link>.</p>
    </main>
  );
}
