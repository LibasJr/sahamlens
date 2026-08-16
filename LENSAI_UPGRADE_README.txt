SahamLens LensAI Knowledge Upgrade V4 - 2026-08-17

COPY seluruh isi folder/ZIP ini ke ROOT project SahamLens lalu Replace/Overwrite.
Patch ini dibuat di atas SahamLens Audit Fixes V3.

Fokus perubahan:
1. LensAI memahami fitur baru/user+admin SahamLens.
2. LensAI bisa menjelaskan fungsi, cara kerja, cara pakai, output, dan batasan.
3. Routing product-help ditambah untuk fitur baru agar pertanyaan tidak jatuh ke UNKNOWN/data intent yang salah.
4. Focus knowledge spesifik per lab/fitur mencegah jawaban melebar atau tertukar.
5. Guardrail intelligence: production vs research, PIT vs current, broker summary vs ownership flow, T+20 vs intraday, DATA_ONLY vs LensScore input.
6. Regression test baru untuk pertanyaan fitur baru.

Fitur yang ditambahkan ke knowledge/routing:
- LensRadar Calibration Lab
- TP/CL Validation Lab
- Intraday Validation Lab / LensIntraday
- Fundamental Backfill & Fundamental PIT
- Financial Integrity & Adoption Gate
- Macro PIT & Valuation Inputs
- Bank Fundamentals Evidence
- Ownership Flow
- Ownership Flow Validation Lab
- Broker Summary / Broker Distribution
- Kesehatan Operasional / Jobs
- Feedback LensAI
- Breakout Radar / Opportunity Scanner

Validasi lokal yang sudah dilakukan:
- TypeScript transpile syntax: PASS untuk semua 5 file TS yang berubah/baru.
- Routing smoke test: 12/12 pertanyaan fitur baru -> SAHAMLENS_PRODUCT_HELP.
- Focus smoke test Intraday: PASS, membedakan Intraday dari T+20.

Sesudah copy, jalankan CI normal:
npm ci
npm run typecheck
npm run lint
npm test
npm run build
