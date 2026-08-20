import { withSentryConfig } from '@sentry/nextjs';

const isProd = process.env.NODE_ENV === 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // static.cloudflareinsights.com: beacon Cloudflare Web Analytics DISUNTIKKAN OTOMATIS
  // oleh Cloudflare ke setiap respons HTML, jadi ia tidak pernah terlihat di kode ini.
  // Tanpa izin di sini, CSP kita memblokir analytics kita sendiri dan angkanya nol tanpa
  // penjelasan - terlihat di konsol produksi sebagai "Loading the script
  // 'https://static.cloudflareinsights.com/beacon.min.js/...' violates ... script-src".
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com${isProd ? '' : " 'unsafe-eval'"}`,
  // Beacon-nya mengirim hasil pengukuran ke cloudflareinsights.com. Mengizinkan skripnya
  // saja tidak cukup: tanpa baris ini skrip berhasil dimuat lalu gagal di langkah kirim,
  // dan gejalanya sama persis - data tidak pernah sampai.
  "connect-src 'self' https://*.ingest.sentry.io https://cloudflareinsights.com wss:",
  "worker-src 'self' blob:",
  isProd ? 'upgrade-insecure-requests' : '',
].filter(Boolean).join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tandai dependency Node-only berat sebagai eksternal, bukan di-bundle ulang ke
  // setiap function - mengurangi ukuran & waktu init cold start (Performance Roadmap
  // Fase 1). Pindah dari experimental.serverComponentsExternalPackages (Next 14) ke
  // top-level serverExternalPackages saat upgrade ke Next 16.
  serverExternalPackages: ['pg', 'bcryptjs', 'nodemailer', 'yahoo-finance2'],
  // Next 16 auto-generate AGENTS.md/CLAUDE.md di root tiap `next dev` jalan - file
  // boilerplate yang tidak diminta, dimatikan supaya tidak numpuk di working tree.
  agentRules: false,
  // BUILD 010 (Production Ready) - dipakai Dockerfile (jalur deploy alternatif di
  // luar Vercel, mis. self-host) untuk image runtime minimal (.next/standalone +
  // node_modules yang benar-benar terpakai saja). Sebelumnya diklaim "tidak
  // memengaruhi deploy Vercel" - klaim itu salah untuk Next.js 16 + Turbopack:
  // standalone output melewatkan `.next/next-server.js.nft.json` yang dibutuhkan
  // pipeline build Vercel sendiri, bikin 4 deploy Production berturut-turut gagal.
  // `VERCEL` di-set otomatis oleh platform Vercel saat build - dipakai di sini
  // supaya Dockerfile (yang tidak set var ini) tetap dapat output standalone.
  output: process.env.VERCEL ? undefined : 'standalone',
  // Redesign UI/UX Fase 1 - app/citadel/page.tsx sebelumnya cuma re-export 2 baris
  // dari app/page.tsx (duplikat, bukan halaman terpisah). Redirect permanen (bukan
  // dihapus) supaya link lama/bookmark ke /citadel tidak 404.
  async redirects() {
    return [
      { source: '/citadel', destination: '/', permanent: true },
    ];
  },
  /**
   * Cache aset statis di /public.
   *
   * TEMUAN PageSpeed production 2026-08-13: `/sahamlens-scope.png` (264 KiB) disajikan
   * dengan TTL 4 jam, jadi pengunjung yang kembali keesokan harinya mengunduhnya lagi.
   * Next TIDAK memasang Cache-Control apa pun untuk berkas /public - nilainya datang
   * dari default Cloudflare, dan Cloudflare menghormati header origin kalau ada.
   *
   * KENAPA 30 HARI, BUKAN 1 TAHUN `immutable` seperti yang diminta Lighthouse: berkas
   * di /public TIDAK punya hash isi di namanya. `immutable` setahun berarti logo atau
   * ikon yang diperbarui akan tetap tampil versi lama sampai setahun ke depan di
   * peramban yang sudah menyimpannya, tanpa cara membatalkannya selain mengganti nama
   * berkas. `stale-while-revalidate` memberi hampir seluruh manfaat kecepatannya -
   * kunjungan berulang langsung memakai salinan lokal - sambil tetap menyegarkan diri
   * di latar belakang.
   *
   * Aset ber-hash (/_next/static/*) TIDAK diatur di sini; Next sudah memberinya
   * `immutable` setahun, dan itu memang aman karena namanya berubah tiap isinya berubah.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/:file(.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico|woff2))',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

// silent:true - jangan berisik di log build kalau SENTRY_AUTH_TOKEN (untuk upload
// source map) belum diset; DSN saja sudah cukup untuk error tracking jalan.
//
// disableLogger dihapus (bukan diganti webpack.treeshake.removeDebugLogging) - opsi
// lama MAUPUN penggantinya sama-sama "Not supported with Turbopack" per warning
// Sentry sendiri, dan proyek ini build dengan Turbopack (lihat next build/dev log) -
// kedua opsi itu inert di sini, mempertahankan yang lama cuma menyisakan warning.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
