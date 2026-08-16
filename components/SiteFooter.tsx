import React from 'react';
import Link from 'next/link';

/**
 * Footer situs - SATU sumber, dipakai landing dan seluruh halaman ber-shell.
 *
 * Disclaimer sumber data ikut dipusatkan di sini. Sebelumnya ia hanya
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
        <Link href="/privacy" className="hover:text-tv-text">Privasi</Link>
        <Link href="/terms" className="hover:text-tv-text">Ketentuan</Link>
        <Link href="/disclaimer" className="hover:text-tv-text">Disclaimer</Link>
        <span className="rounded-full bg-tv-hover px-2.5 py-1 font-semibold">© {new Date().getFullYear()} SahamLens</span>
      </div>
    </footer>
  );
}
