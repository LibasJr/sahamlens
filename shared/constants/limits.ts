// Batas tier gratis - SUMBER TUNGGAL. File ini sengaja tidak mengimpor apa pun (sama
// seperti access.ts & cookie-names.ts) supaya bisa dipakai dari server route, service
// domain, MAUPUN komponen client tanpa menyeret dependency ke sisi yang salah.
//
// Sebelumnya angka yang sama hidup di DUA tempat: lib/limits.ts (dipakai UI + route
// /api/stock/[ticker]) dan modules/watchlist/constants/watchlist.constants.ts (dipakai
// penegakan server watchlist/alert). Keduanya kebetulan masih sinkron, tapi tidak ada
// yang menjaganya - menaikkan batas gratis di satu tempat untuk promo akan membuat teks
// UI dan penegakan server saling berbohong. Sekarang cuma ada satu angka.
//
// Penegakan SESUNGGUHNYA tetap di server (modules/watchlist/service/*.service.ts dengan
// advisory lock, dan shared/usage/daily-analisa-quota.ts) - konstanta ini cuma angkanya.
export const FREE_LIMITS = {
  WATCHLIST: 3,
  ALERTS: 2,
  analisaPerHari: 5,
} as const;
