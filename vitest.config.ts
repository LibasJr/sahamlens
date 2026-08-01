import { defineConfig } from 'vitest/config';
import path from 'path';

// tsconfig.json mendefinisikan alias "@/*" -> "./*" untuk Next.js (webpack resolve
// alias-nya otomatis, tapi Vitest tidak baca tsconfig paths sama sekali tanpa config
// eksplisit ini) - tanpa file ini, SETIAP file produksi yang mengimpor lewat "@/..."
// gagal di-resolve begitu diimpor (langsung/transitif) oleh test manapun.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    env: {
      // shared/auth/jwt.ts throw keras kalau kosong (guard produksi, tidak boleh
      // jalan dengan secret hardcoded) - nilai ini HANYA dipakai proses test,
      // tidak pernah menyentuh .env.local/produksi yang sesungguhnya.
      JWT_SECRET_KEY: 'test-only-secret-key-not-used-in-production',
    },
  },
});
