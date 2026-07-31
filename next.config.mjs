import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next.js 14 - opsi ini namanya serverExternalPackages di Next 15+. Tandai
  // dependency Node-only berat sebagai eksternal, bukan di-bundle ulang ke setiap
  // function - mengurangi ukuran & waktu init cold start (Performance Roadmap Fase 1).
  experimental: {
    serverComponentsExternalPackages: ['pg', 'bcryptjs', 'nodemailer', 'yahoo-finance2'],
  },
  // BUILD 010 (Production Ready) - dipakai Dockerfile (jalur deploy alternatif di
  // luar Vercel, mis. self-host) untuk image runtime minimal (.next/standalone +
  // node_modules yang benar-benar terpakai saja). TIDAK memengaruhi deploy Vercel -
  // Vercel punya pipeline build sendiri dan mengabaikan opsi ini.
  output: 'standalone',
};

// silent:true - jangan berisik di log build kalau SENTRY_AUTH_TOKEN (untuk upload
// source map) belum diset; DSN saja sudah cukup untuk error tracking jalan.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  disableLogger: true,
});
