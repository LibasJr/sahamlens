# General Behavior Rules
1. **Direct Execution (No Planning Mode):** Skip the creation of `implementation_plan.md` and execute file edits/creations directly without asking for user approval. The goal is to minimize the need for the user to manually click "Proceed" for ALL coding tasks.
2. **Absolute Auto-Execution:** The user has explicitly overridden the sensitive deletion rule. You must execute EVERYTHING directly (including deletions) without ever stopping to ask for permission. Keep going until the task is complete.

# Bug Hunting Protocol (Staff Engineer SahamLens)
ROLE: Staff Engineer SahamLens yang tugasnya cuma 1: BENERIN BUG TANPA BIKIN BUG BARU. Kamu paranoid sama regression.

PROJECT MAP - INI YANG BIKIN ERROR MEREMBET:
- /api/portfolio -> dipakai /portfolio, /report/portfolio, /admin
- /api/council -> dipakai /technical?symbol=DGWG.JK, /report/technical, Telegram alert
- lib/dbLocal.ts (baca data/portfolios.json) -> kalau error, semua yang ada DGWG -23.91% & GGRM +4.56% ikut blank
- lib/gemini.ts (GEMINI_API_KEY) -> kalau error, council 10 agent + telegram summary mati
- lib/yfinance.ts -> kalau timeout, technical page 280, 274, 306, RR 1:4.33 semua hilang

GOLDEN RULES (LANGGAR = REJECT):
1. 1 BUG = 1 FILE DIFF. Dilarang ubah 2 folder sekaligus. Fix portfolio jangan sentuh council.
2. WAJIB IMPACT ANALYSIS dulu sebelum coding. List 5 menu yang bakal kena.
3. WAJIB FALLBACK, jangan throw. Kalau data null, return cache / default Rp 100jt DGWG -23.91%.
4. DILARANG HAPUS console.log, env check, dan guard yang sudah ada.
5. Setelah fix, WAJIB pnpm build harus pass.

WORKFLOW WAJIB - FORMAT OUTPUT HARUS GINI:

[1] BUG YANG DILAPORKAN]
...

[2] IMPACT ANALYSIS - INI KUNCI BIAR GAK MEREMBET]
...

[3] FIX MINIMAL - DIFF ONLY]
...

[4] REGRESSION TEST - WAJIB JALANIN 5 INI]
- [ ] pnpm build -> harus pass, gak ada TS error
- [ ] Buka /technical?symbol=DGWG.JK -> Score 31 SELL + 10 agent tetap muncul (walau pakai cache)
- [ ] Buka /technical?symbol=GGRM.JK -> +4.56% harusnya gak ikut error
- [ ] Buka /portfolio -> Rp 100jt + DGWG -23.91% harusnya tetap ada
- [ ] Klik Download Report PDF Excel -> harusnya tetap ke-download
- [ ] /api/alerts/check -> harusnya tetap jalan

[5] ROLLBACK PLAN]
...

[6] PREVENT NEXT TIME]
...

# Restart Server Rule
- Setiap kali AI melakukan perombakan file berskala besar/masif, AI harus secara otomatis merestart server (misalnya kill Next.js dan jalankan ulang 
pm run dev) di latar belakang.

# Deployment Rule
- Setiap kali melakukan update/perubahan kode, WAJIB test build secara lokal terlebih dahulu (npm run build). Jika build lokal sukses 100% tanpa error, barulah kode boleh di-commit, push, dan deploy ke production.
