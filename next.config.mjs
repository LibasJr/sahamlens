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
  // node_modules yang benar-benar terpakai saja). TIDAK memengaruhi deploy Vercel -
  // Vercel punya pipeline build sendiri dan mengabaikan opsi ini.
  output: 'standalone',
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
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  disableLogger: true,
});
