import { defineConfig } from 'vitest/config';
import path from 'path';

// tsconfig.json mendefinisikan alias "@/*" -> "./*" untuk Next.js (webpack resolve
// alias-nya otomatis, tapi Vitest tidak baca tsconfig paths sama sekali tanpa config
// eksplisit ini) - tanpa file ini, SETIAP file produksi yang mengimpor lewat "@/..."
// gagal di-resolve begitu diimpor (langsung/transitif) oleh test manapun.

// Script di scripts/*.mjs diawali shebang DAN disimpan CRLF (repo Windows). Kombinasi
// itu membuat import-nya gagal "SyntaxError: Invalid or unexpected token" di Vitest -
// shebang ber-LF sendirian aman, CRLF sendirian aman, gabungannya tidak. Akibatnya
// SELURUH scripts/__tests__ mati saat load, bukan cuma satu assert. Script-nya sendiri
// benar (Node menjalankannya tanpa masalah), jadi yang diperbaiki pipeline test: baris
// shebang dibuang saat transform, dan .mjs dipaksa di-inline supaya transform ini jalan.
const stripShebang = {
  name: 'strip-shebang-mjs',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.endsWith('.mjs') || !code.startsWith('#!')) return null;
    const firstNewline = code.indexOf('\n');
    const body = firstNewline === -1 ? '' : code.slice(firstNewline + 1);
    // Baris shebang diganti baris kosong supaya nomor baris di stack trace tetap cocok.
    return { code: `\n${body}`, map: null };
  },
};

export default defineConfig({
  plugins: [stripShebang],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    server: {
      deps: {
        // Tanpa ini .mjs diserahkan ke loader Node apa adanya dan plugin di atas
        // tidak pernah dipanggil.
        inline: [/scripts[\\/].*\.mjs$/],
      },
    },
    env: {
      // shared/auth/jwt.ts throw keras kalau kosong (guard produksi, tidak boleh
      // jalan dengan secret hardcoded) - nilai ini HANYA dipakai proses test,
      // tidak pernah menyentuh .env.local/produksi yang sesungguhnya.
      JWT_SECRET_KEY: 'test-only-secret-key-not-used-in-production',
    },
  },
});
