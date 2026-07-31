import { z } from 'zod';

// Validasi env var Node-only (butuh DATABASE_URL, dsb) - dipanggil dari titik masuk
// yang memang jalan di Node runtime (mis. shared/database/postgres.client.ts),
// BUKAN dari middleware.ts/shared/auth/jwt.ts yang harus tetap Edge-safe dan tidak
// boleh bergantung pada env var yang tidak mereka pakai sama sekali.
//
// Ini scoped ke variabel yang dipakai lapisan database Postgres saat ini. Variabel
// lain (GEMINI_API_KEY, SMTP_*, TELEGRAM_*) masih dicek ad-hoc di modul yang
// memakainya masing-masing - menyatukan SEMUA env var ke sini adalah pekerjaan
// Fase 2 (menggantikan lib/sahamLensGuard.ts sepenuhnya), di luar cakupan migrasi ini.
const nodeEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diset'),
});

let cached: z.infer<typeof nodeEnvSchema> | null = null;

export function getNodeEnv() {
  if (!cached) {
    cached = nodeEnvSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
    });
  }
  return cached;
}
