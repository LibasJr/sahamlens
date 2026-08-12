import React from 'react';
import Link from 'next/link';

/**
 * Footer situs - SATU sumber, dipakai landing dan seluruh halaman ber-shell.
 *
 * KENAPA ADA. Halaman /about (filosofi brand, disepakati 2026-08-06) sudah lama ada
 * tetapi nyaris tidak bisa dicapai: satu-satunya tautan menuju ke sana berada di
 * components/Dashboard.tsx, hanya di landing, dan ditandai `hidden sm:inline` sehingga
 * TIDAK terlihat sama sekali di layar HP. Halaman lain tidak punya footer apa pun -
 * AppShell merender Sidebar, TopMarketBar, MobileNav, tetapi tidak pernah menutup
 * halamannya.
 *
 * Disclaimer sumber data ikut pindah ke sini dan itu disengaja. Sebelumnya ia hanya
 * muncul di landing, padahal justru halaman ANALISIS yang paling perlu menyatakan bahwa
 * datanya pihak ketiga dan bisa terlambat - di situlah orang membaca angka lalu
 * mengambil keputusan.
 *
 * Komponen ini sengaja tanpa 'use client': isinya statis kecuali tahun, jadi tidak perlu
 * ikut terbawa ke bundle client.
 */
export default function SiteFooter({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tv-border bg-tv-card px-5 py-4 text-[11px] text-tv-muted ${className}`}
    >
      {/* Wording ini hasil perbaikan audit BUILD 002: versi lama menulis "real-time dari
          Bursa Efek Indonesia", yang memberi kesan feed langsung IDX. Sumbernya Yahoo
          Finance - pihak ketiga, ada jeda. IDX tidak menyediakan feed gratis. */}
      <span className="font-medium">
        Data bersumber dari Yahoo Finance (pihak ketiga), dapat mengalami keterlambatan hingga ~15 menit
        {' • '}
        Informasi &amp; rekomendasi di aplikasi ini bersifat informatif, bukan nasihat investasi
      </span>

      <div className="flex flex-wrap items-center gap-3">
        {/* Tagline filosofi brand. TIDAK lagi `hidden sm:inline`: justru pengguna HP yang
            paling butuh jalan menuju halaman yang menjelaskan aplikasi ini apa. */}
        <Link
          href="/about"
          className="italic text-tv-muted underline-offset-4 transition-colors hover:text-tv-text hover:underline"
        >
          Memperjelas yang tersembunyi. Keputusan tetap milikmu.
        </Link>
        <span className="rounded-full bg-tv-hover px-2.5 py-1 font-semibold">
          © {new Date().getFullYear()} SahamLens
        </span>
      </div>
    </footer>
  );
}
