import { Card } from '@/components/ui/Card';
import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { loadEmitenList } from '@/shared/market/emiten-list';
import { getRealForeignFlow } from '@/modules/market/service/idx-foreign-flow.service';

export const metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Monitor cakupan artefak arus dana asing resmi BEI.
//
// Halaman ini TIDAK menampilkan angka arus asing per emiten - itu sudah ada di LensFlow
// pada halaman Teknikal. Yang dijawab di sini cuma satu pertanyaan operasional: apakah
// sinkronisasi benar-benar jalan dan datanya masih segar. Tanpa layar ini, emiten yang
// artefaknya gagal ditulis akan diam-diam jatuh ke proxy CMF Yahoo dan tidak ada yang tahu,
// karena UI-nya tetap tampil normal - hanya labelnya yang berubah.
//
// ponytail: mem-parse ~960 berkas JSON tiap kali halaman dibuka. Aman karena admin-only dan
// getRealForeignFlow menyimpan hasil parse di module scope dengan invalidasi mtime, jadi
// pembukaan berikutnya tidak mengulang kerja. Kalau nanti terasa lambat, simpan ringkasannya
// saat sinkronisasi selesai alih-alih menghitung ulang saat dibaca.

interface Baris {
  symbol: string;
  name: string;
  latestDate: string | null;
  updatedAt: string | null;
}

function ringkas(): { baris: Baris[]; adaArtefak: Baris[]; tanpaArtefak: Baris[]; tanggalTerbaru: string | null } {
  const baris: Baris[] = loadEmitenList().map((emiten) => {
    const series = getRealForeignFlow(emiten.symbol, 1);
    return {
      symbol: emiten.symbol,
      name: emiten.name,
      latestDate: series?.history.at(-1)?.date ?? null,
      updatedAt: series?.updatedAt ?? null,
    };
  });

  const adaArtefak = baris.filter((row) => row.latestDate != null);
  const tanpaArtefak = baris.filter((row) => row.latestDate == null);
  // Tanggal bursa terbaru DITURUNKAN dari artefak, bukan dari jam server. Kalau seluruh
  // sinkronisasi tertinggal satu hari, yang benar adalah melaporkannya tertinggal bersama -
  // bukan menandai semuanya merah terhadap tanggal yang belum tentu hari bursa.
  const tanggalTerbaru = adaArtefak.reduce<string | null>(
    (max, row) => (row.latestDate && (max == null || row.latestDate > max) ? row.latestDate : max),
    null,
  );

  return { baris, adaArtefak, tanpaArtefak, tanggalTerbaru };
}

function Kartu({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'green' | 'amber' | 'red' }) {
  const warna = tone === 'green' ? 'text-tv-green' : tone === 'amber' ? 'text-amber-300' : tone === 'red' ? 'text-tv-red' : 'text-tv-text';
  return (
    <Card as="div" className="border-tv-border p-5" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
      <p className="text-xs uppercase tracking-wide text-tv-muted">{label}</p>
      <p className={`mt-2 font-number text-2xl font-bold ${warna}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-tv-muted">{hint}</p> : null}
    </Card>
  );
}

export default async function ForeignFlowCoveragePage() {
  if (!(await isAdminServer())) redirect('/admin-login');

  const { baris, adaArtefak, tanpaArtefak, tanggalTerbaru } = ringkas();
  const terkini = tanggalTerbaru ? adaArtefak.filter((row) => row.latestDate === tanggalTerbaru) : [];
  const tertinggal = tanggalTerbaru
    ? adaArtefak
        .filter((row) => row.latestDate !== tanggalTerbaru)
        .sort((a, b) => String(a.latestDate).localeCompare(String(b.latestDate)))
    : [];
  const sinkronTerakhir = adaArtefak.reduce<string | null>(
    (max, row) => (row.updatedAt && (max == null || row.updatedAt > max) ? row.updatedAt : max),
    null,
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 text-tv-text">
      <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-tv-muted hover:text-tv-text">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Admin
      </Link>

      <div>
        <h1 className="font-heading text-3xl font-bold">Cakupan Dana Asing BEI</h1>
        <p className="mt-2 max-w-3xl text-sm text-tv-muted">
          Emiten mana yang sudah punya angka Net Foreign Buy/Sell resmi dari Bursa, dan sejak kapan.
          Artefaknya ditulis <code className="rounded bg-tv-hover px-1">scripts/sync-idx-foreign-flow.py</code> ke{' '}
          <code className="rounded bg-tv-hover px-1">data/foreign-flow/</code>, dijadwalkan cron{' '}
          <code className="rounded bg-tv-hover px-1">idx-flow-sync</code>. Emiten tanpa artefak TIDAK kosong di UI -
          ia jatuh ke proxy CMF Yahoo yang berlabel &quot;bukan data broker resmi&quot;, jadi ketiadaannya tidak
          terlihat dari layar pengguna.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kartu label="Emiten terdaftar" value={baris.length.toLocaleString('id-ID')} hint="dari daftar emiten aktif" />
        <Kartu
          label="Punya arus asing resmi"
          value={adaArtefak.length.toLocaleString('id-ID')}
          hint={baris.length ? `${((adaArtefak.length / baris.length) * 100).toFixed(1)}% cakupan` : undefined}
          tone={adaArtefak.length === baris.length ? 'green' : 'amber'}
        />
        <Kartu
          label={`Terkini (${tanggalTerbaru ?? '-'})`}
          value={terkini.length.toLocaleString('id-ID')}
          hint={tertinggal.length ? `${tertinggal.length} emiten tertinggal` : 'semua artefak setanggal'}
          tone={tertinggal.length === 0 ? 'green' : 'amber'}
        />
        <Kartu
          label="Tanpa artefak"
          value={tanpaArtefak.length.toLocaleString('id-ID')}
          hint="memakai proxy CMF Yahoo"
          tone={tanpaArtefak.length === 0 ? 'green' : 'red'}
        />
      </div>

      <p className="text-xs text-tv-muted">
        Sinkronisasi terakhir tercatat: <span className="font-number">{sinkronTerakhir ?? 'belum ada'}</span>
      </p>

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-bold">
          Tertinggal dari {tanggalTerbaru ?? '-'} <span className="text-tv-muted">({tertinggal.length})</span>
        </h2>
        {tertinggal.length === 0 ? (
          <p className="text-sm text-tv-muted">Tidak ada. Seluruh artefak berhenti di tanggal bursa yang sama.</p>
        ) : (
          <Card as="div" className="overflow-x-auto border-tv-border" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
            <table className="min-w-full text-sm">
              <thead className="border-b border-tv-border text-left text-xs uppercase tracking-wide text-tv-muted">
                <tr>
                  <th className="p-3">Kode</th>
                  <th className="p-3">Nama</th>
                  <th className="p-3">Data terakhir</th>
                  <th className="p-3">Disinkronkan</th>
                </tr>
              </thead>
              <tbody>
                {tertinggal.slice(0, 100).map((row) => (
                  <tr key={row.symbol} className="border-b border-tv-border/60 last:border-0">
                    <td className="p-3 font-semibold">{row.symbol}</td>
                    <td className="p-3 text-tv-muted">{row.name}</td>
                    <td className="p-3 font-number text-amber-300">{row.latestDate}</td>
                    <td className="p-3 font-number text-xs text-tv-muted">{row.updatedAt ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tertinggal.length > 100 ? (
              <p className="border-t border-tv-border p-3 text-xs text-tv-muted">
                Menampilkan 100 teratas dari {tertinggal.length}.
              </p>
            ) : null}
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-bold">
          Tanpa artefak <span className="text-tv-muted">({tanpaArtefak.length})</span>
        </h2>
        {tanpaArtefak.length === 0 ? (
          <p className="text-sm text-tv-muted">Tidak ada. Seluruh emiten terdaftar punya arus asing resmi.</p>
        ) : (
          <Card as="div" className="border-tv-border p-4" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
            <p className="mb-3 text-xs text-tv-muted">
              Emiten ini memakai proxy CMF Yahoo. Jalankan{' '}
              <code className="rounded bg-tv-hover px-1">
                python3 scripts/sync-idx-foreign-flow.py --universe all --length 90
              </code>{' '}
              untuk menutupnya.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tanpaArtefak.slice(0, 200).map((row) => (
                <span key={row.symbol} className="rounded border border-tv-border bg-tv-hover px-2 py-0.5 font-number text-xs">
                  {row.symbol}
                </span>
              ))}
            </div>
            {tanpaArtefak.length > 200 ? (
              <p className="mt-3 text-xs text-tv-muted">Menampilkan 200 teratas dari {tanpaArtefak.length}.</p>
            ) : null}
          </Card>
        )}
      </section>
    </main>
  );
}
