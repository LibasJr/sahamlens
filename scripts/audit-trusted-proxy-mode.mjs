#!/usr/bin/env node
/**
 * Menolak build/verifikasi produksi kalau TRUSTED_PROXY_MODE bukan `cloudflare`.
 *
 * KENAPA ADA. Produksi SahamLens berjalan di belakang Cloudflare Tunnel
 * (lihat `shared/http/client-ip.ts` dan `docs/production/CLOUDFLARE_SSH_DEPLOY.md`).
 * Rate limiter publik (`checkPublicComputeBudget`, dll) mengunci identitas per-IP
 * dari header yang dipercaya sesuai `TRUSTED_PROXY_MODE`. Kalau mode itu ketinggalan
 * di `direct` sementara traffic sungguhan lewat Cloudflare, setiap pengunjung
 * berbagi IP asal Tunnel yang sama di mata aplikasi — rate limit publik kolaps
 * jadi satu identitas untuk SEMUA pengguna, bukan per-pengguna.
 *
 * Ini bukan skenario teoretis: TRUSTED_PROXY_MODE adalah env manual yang mudah
 * hilang saat provisioning ulang VPS atau menyalin `.env.production` dari
 * environment lain. Sebelumnya hanya `audit-production-integrity.mjs` yang
 * menyentuhnya, dan itu cuma WARN (lihat baris 18 di sana) serta butuh koneksi
 * DB sehingga tidak ikut girang `verify:prod`. Audit ini FAIL keras dan berdiri
 * sendiri (tanpa DB) supaya masuk rantai `verify:prod` yang jadi gate CI/deploy.
 */

const nodeEnv = process.env.NODE_ENV;
const mode = process.env.TRUSTED_PROXY_MODE?.trim().toLowerCase();

// Development/local tetap bebas: TRUSTED_PROXY_MODE boleh kosong (default 'forwarded'
// di getTrustedProxyMode() saat NODE_ENV !== 'production'), supaya `npm run dev` di
// laptop tanpa Cloudflare Tunnel tidak ikut digerbang.
if (nodeEnv !== 'production') {
  console.log(
    `[audit-trusted-proxy-mode] NODE_ENV=${nodeEnv ?? '(kosong)'}; bukan production, dilewati.`,
  );
  process.exit(0);
}

const VALID_MODES = new Set(['cloudflare', 'forwarded', 'direct']);

if (!mode) {
  console.error(
    '\n[audit-trusted-proxy-mode] TRUSTED_PROXY_MODE tidak diset di production.\n\n' +
      'Deployment SahamLens ada di belakang Cloudflare Tunnel. Tanpa TRUSTED_PROXY_MODE=cloudflare\n' +
      'secara eksplisit, getTrustedProxyMode() di shared/http/client-ip.ts akan tetap default ke\n' +
      "'cloudflare' untuk NODE_ENV=production — tapi bergantung pada default diam-diam itu\n" +
      'membuat kesalahan topologi proxy tidak akan pernah kelihatan. Set eksplisit:\n\n' +
      '    TRUSTED_PROXY_MODE=cloudflare\n\n' +
      'di .env.production (atau env CI yang menjalankan verify:prod).\n',
  );
  process.exit(1);
}

if (!VALID_MODES.has(mode)) {
  console.error(
    `\n[audit-trusted-proxy-mode] TRUSTED_PROXY_MODE=${mode} tidak dikenal.\n` +
      `Nilai valid: ${[...VALID_MODES].join(', ')}.\n`,
  );
  process.exit(1);
}

if (mode !== 'cloudflare') {
  console.error(
    `\n[audit-trusted-proxy-mode] TRUSTED_PROXY_MODE=${mode} di production.\n\n` +
      'Topologi deployment SahamLens saat ini adalah Cloudflare Tunnel (lihat\n' +
      'docs/production/CLOUDFLARE_SSH_DEPLOY.md). Mode selain `cloudflare` membuat\n' +
      'shared/http/client-ip.ts mempercayai header X-Forwarded-For yang bisa dipalsukan\n' +
      'klien manapun (mode `forwarded`), atau mengabaikan semua header proxy dan\n' +
      "mengumpulkan seluruh pengunjung ke satu identitas 'unknown' (mode `direct`) —\n" +
      'keduanya meruntuhkan rate limit publik per-IP.\n\n' +
      'Kalau topologi produksi sungguh berubah (reverse proxy privat yang menimpa\n' +
      'X-Forwarded-For sendiri), ini keputusan arsitektur yang perlu didokumentasikan,\n' +
      'bukan sekadar env yang berubah diam-diam. Perbarui audit ini bersamaan.\n',
  );
  process.exit(1);
}

console.log('[audit-trusted-proxy-mode] TRUSTED_PROXY_MODE=cloudflare di production. PASS.');
process.exit(0);
