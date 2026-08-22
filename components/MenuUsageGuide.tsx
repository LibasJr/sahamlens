'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HelpCircle, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

/**
 * Panduan pemakaian per menu untuk pengguna awam (keputusan produk 2026-08-23).
 *
 * Kenapa per menu, bukan satu halaman bantuan terpusat: orang bingung SAAT sedang
 * menatap layarnya, bukan saat sempat mencari dokumentasi. Panduan yang harus dicari
 * tidak menolong siapa pun.
 *
 * Tiga bagian, dan urutannya disengaja:
 *   1. APA yang menu ini jawab - dalam satu kalimat, bukan daftar fitur
 *   2. LANGKAHNYA - supaya tahu harus mulai dari mana
 *   3. APA YANG DIDAPAT setelah daftar - jujur soal yang digembok, bukan disembunyikan
 *
 * Bagian ketiga hanya muncul untuk pengunjung yang belum masuk. Menampilkannya ke
 * pengguna yang sudah punya akun cuma jadi iklan untuk sesuatu yang sudah mereka miliki.
 *
 * Ditutup per browser lewat localStorage - sengaja BUKAN per akun, karena kebingungan
 * terjadi di perangkat, dan pengunjung yang belum daftar tidak punya akun untuk disimpani.
 */

export interface MenuUsageGuideProps {
  /** Kunci penyimpanan; dipakai apa adanya di localStorage jadi harus stabil. */
  menuKey: string;
  /** Satu kalimat: pertanyaan apa yang menu ini jawab. */
  whatItAnswers: string;
  /** Langkah konkret, 2-4 buah. Kalimat perintah, bukan deskripsi. */
  steps: string[];
  /** Yang terbuka tanpa akun. Kosongkan kalau seluruh menu butuh akun. */
  freeAccess?: string;
  /** Yang terbuka setelah daftar. Kosongkan kalau menu ini tidak digembok. */
  afterSignup?: string;
  /** Tujuan setelah login, mis. "/risk". */
  loginNext?: string;
}

export default function MenuUsageGuide({
  menuKey,
  whatItAnswers,
  steps,
  freeAccess,
  afterSignup,
  loginNext,
}: MenuUsageGuideProps) {
  const storageKey = `sahamlens.menu-guide.dismissed.${menuKey}`;
  // Mulai tertutup lalu dibuka di effect: menampilkannya dulu baru menyembunyikan
  // menyebabkan kedipan bagi yang sudah pernah menutupnya.
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { loading: authLoading, resolved: authResolved, user: authUser } = useAuthUser();
  // Bagian "setelah daftar" hanya relevan bagi yang belum punya akun. Menampilkannya ke
  // pengguna yang sudah masuk cuma jadi iklan untuk sesuatu yang sudah mereka miliki.
  const isGuest = !authResolved || authLoading || !authUser;

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(storageKey) === '1';
    } catch {
      // Mode privat / site data diblokir. Perlakukan sebagai belum ditutup - panduan
      // muncul, dan itu jauh lebih baik daripada halaman gagal render.
    }
    setOpen(!dismissed);
    setHydrated(true);
  }, [storageKey]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // Tidak bisa diingat; tetap tutup untuk kunjungan ini.
    }
    setOpen(false);
  };

  if (!hydrated) return null;

  if (!open) {
    return (
      <Button
        variant="bare"
        size="none"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-tv-border px-3 py-1.5 text-xs font-bold text-tv-muted transition hover:border-tv-blue hover:text-tv-blue"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Cara pakai menu ini
      </Button>
    );
  }

  return (
    <Card padding="none" radius="lg" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-tv-blue" />
          <p className="text-sm font-bold leading-relaxed text-tv-text">{whatItAnswers}</p>
        </div>
        <Button
          variant="bare"
          size="none"
          onClick={dismiss}
          aria-label="Tutup panduan cara pakai menu ini"
          className="shrink-0 p-1 text-tv-muted transition hover:text-tv-text"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ol className="mt-3 space-y-1.5 pl-7">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2 text-xs leading-relaxed text-tv-muted">
            <span className="font-bold text-tv-text">{index + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {isGuest && (freeAccess || afterSignup) && (
        <div className="mt-3 ml-7 space-y-1.5 border-t border-tv-border pt-3">
          {freeAccess && (
            <p className="text-xs leading-relaxed text-tv-muted">
              <span className="font-bold text-tv-text">Tanpa akun:</span> {freeAccess}
            </p>
          )}
          {afterSignup && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs leading-relaxed text-tv-muted">
              <Lock className="h-3 w-3 shrink-0 text-tv-yellow" />
              <span><span className="font-bold text-tv-text">Setelah daftar gratis:</span> {afterSignup}</span>
              {loginNext && (
                <Link
                  href={`/login?next=${loginNext}`}
                  className="font-bold text-tv-blue underline underline-offset-2 hover:text-tv-blueHover"
                >
                  Daftar sekarang
                </Link>
              )}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
