// Sentry dimuat HANYA kalau DSN-nya benar-benar ada.
//
// Sebelumnya file ini `import * as Sentry from '@sentry/nextjs'` di top-level, lalu
// menyerahkan keputusan ke `enabled: !!dsn` saat runtime. Yang terjadi: SDK-nya tetap
// masuk bundle awal dan tetap diunduh setiap pengunjung - `enabled: false` cuma
// mematikan pengirimannya, bukan pemuatannya. Di production DSN memang tidak diisi,
// jadi 145 KB (gzip) dikirim ke tiap pengunjung mobile untuk tidak melakukan apa pun,
// sekitar 40% dari seluruh JS halaman depan.
//
// `process.env.NEXT_PUBLIC_SENTRY_DSN` disubstitusi jadi literal saat build, jadi
// ketika kosong seluruh cabang di bawah menjadi kode mati dan bundler membuangnya
// berikut import dinamisnya. Ketika DSN diisi, Sentry pindah ke chunk async yang
// diunduh setelah hidrasi - tidak lagi menahan render pertama.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

type TransitionStart = (...args: unknown[]) => void;

let captureTransition: TransitionStart | undefined;

if (dsn) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      // Session Replay sengaja tidak diaktifkan - ia merekam input pengguna, dan ini
      // aplikasi finansial. Kalau nanti dibutuhkan, aktifkan eksplisit di sini.
    });
    captureTransition = Sentry.captureRouterTransitionStart as TransitionStart;
  });
}

// Next tetap memanggil hook ini pada setiap navigasi router. Sebelum SDK selesai
// dimuat - atau selamanya, kalau DSN kosong - panggilannya tidak melakukan apa-apa.
export const onRouterTransitionStart: TransitionStart = (...args) => {
  captureTransition?.(...args);
};
