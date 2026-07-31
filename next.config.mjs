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
};

// silent:true - jangan berisik di log build kalau SENTRY_AUTH_TOKEN (untuk upload
// source map) belum diset; DSN saja sudah cukup untuk error tracking jalan.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  disableLogger: true,
});
