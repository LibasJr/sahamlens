SahamLens LensAI Knowledge Upgrade V5
Tanggal: 2026-08-17

V5 adalah patch konsolidasi upgrade LensAI V4 + perbaikan CI.
Jangan pasang V4 setelah V5.

Perbaikan CI:
- product-help-new-features.test.ts sekarang memenuhi kontrak ClassifyArgs:
  date: resolveChatDate(prompt, [])
  hasHistory: false
  history: []
- Tidak menggunakan unsafe cast atau bypass TypeScript.

QA yang dijalankan sebelum ZIP dibuat:
1. TypeScript --strict untuk chat-normalize, chat-date, chat-intent, menu-focus-knowledge: PASS.
2. TypeScript --strict untuk product-help-new-features.test.ts dengan deklarasi Vitest minimal: PASS.
3. Smoke routing fitur baru: 12/12 PASS ke SAHAMLENS_PRODUCT_HELP.
4. Smoke focused knowledge: 3/3 PASS.

Cara pakai:
- Copy folder app/ dan modules/ dari patch ini ke ROOT project SahamLens.
- Replace/overwrite file yang sama.
- Push sekali, lalu biarkan GitHub CI menjalankan typecheck, lint, test, build.

Catatan:
Full npm CI tidak dijalankan di container ini karena dependency install environment tidak tersedia lengkap.
