import { withSentryConfig } from '@sentry/nextjs';

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
