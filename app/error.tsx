'use client';

import { Button } from '@/components/ui/Button';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Card } from '@/components/ui/Card';

// Bukan <main>: AppShell sudah menyediakannya (lihat catatan di app/loading.tsx).
//
// Dua kelas palet mentah diganti token, keduanya bug tema terang yang nyata:
//   - `text-white` pada judul, di atas bg-tv-card yang di tema terang bernilai putih
//     murni - pesan gangguan tidak terbaca sama sekali justru saat ada gangguan.
//   - `bg-tv-accent` pada tombol. Hanya `.bg-tv-blue` yang di-override ke
//     --lens-blue-solid (lihat app/globals.css); `bg-tv-accent` tetap memakai biru
//     terang yang dirancang sebagai warna TEKS, sehingga putih di atasnya terukur
//     ~3,2:1 - gagal AA. `bg-tv-blue` memberi 6,7:1.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <Card padding="none" radius="2xl" elevation="none" highlight={false} overflow="visible" role="alert" className="w-full max-w-lg border-tv-border p-6 text-center">
        <h1 className="text-xl font-bold text-tv-text">Terjadi gangguan pada halaman</h1>
        <p className="mt-2 text-sm text-tv-muted">Data Anda tidak diubah. Coba muat ulang bagian ini.</p>
        <Button variant="bare" size="none"
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-tv-blue px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-tv-blue/60"
        >
          Coba lagi
        </Button>
      </Card>
    </div>
  );
}
