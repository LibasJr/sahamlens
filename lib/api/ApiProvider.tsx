'use client';

import React from 'react';
import { SWRConfig } from 'swr';
import { apiFetcher, shouldRetry } from './fetcher';

/**
 * Konfigurasi SWR untuk seluruh aplikasi.
 *
 * Setiap nilai di bawah dipilih dari perilaku yang SUDAH ada di kode ini, bukan dari
 * default yang terasa aman - supaya migrasi call site tidak diam-diam mengubah seberapa
 * sering aplikasi menembak API.
 */
export default function ApiProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: apiFetcher,

        // DEDUPLIKASI. Inilah yang menghapus permintaan ganda: beberapa komponen yang
        // meminta endpoint sama dalam jendela ini berbagi satu permintaan. Sebelumnya
        // mis. /api/auth/me diminta AppShell, Header, dan halaman sekaligus.
        dedupingInterval: 5_000,

        // Revalidasi saat tab kembali fokus - pengganti yang benar untuk pola
        // `cache: 'no-store'` yang tersebar di 22 tempat. Niat pola itu adalah "jangan
        // tampilkan harga basi"; caranya keliru, karena ia mematikan cache TANPA
        // menyegarkan apa pun saat pengguna benar-benar kembali melihat.
        revalidateOnFocus: true,
        focusThrottleInterval: 30_000,

        // Revalidasi saat koneksi pulih. Sebelumnya satu kedipan jaringan meninggalkan
        // pesan gagal permanen sampai pengguna me-refresh sendiri.
        revalidateOnReconnect: true,

        // Retry berjenjang, TAPI tidak untuk 4xx - lihat shouldRetry(). Mengulang 402
        // "butuh akun Pro" tiga kali hanya membuang kuota dan tidak mengubah apa pun.
        shouldRetryOnError: (error) => shouldRetry(error, 0),
        errorRetryCount: 3,
        errorRetryInterval: 2_000,

        // `keepPreviousData` SENGAJA tidak dinyalakan global. Untuk data per-emiten ia
        // justru berbahaya: berpindah dari BBCA ke BBRI akan menampilkan angka BBCA
        // sebagai milik BBRI selama beberapa saat. Halaman yang memang menginginkannya
        // (mis. tabel yang difilter ulang) menyalakannya sendiri per-hook.
      }}
    >
      {children}
    </SWRConfig>
  );
}
