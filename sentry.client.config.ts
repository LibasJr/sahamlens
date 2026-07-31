import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Sesi replay dimatikan default (bisa menangkap input pengguna) - aktifkan
  // eksplisit nanti kalau memang dibutuhkan, jangan default-on untuk app finansial.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
