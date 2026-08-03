# Brand Architecture — Fase 2 (Core Brand: LensAI, LensScore, LensRadar, LensFlow) — Design Spec

**Tanggal:** 2026-08-03
**Konteks:** `SahamLens_Brand_Architecture.txt` mendefinisikan brand architecture baru — master brand tetap SahamLens, produk-produk turunannya dinamai "Lens*" (LensAI, LensScore, LensRadar, LensFlow, LensScanner, LensMarket, LensTechnical, LensWatch, LensAlert). Master prompt implementasi menetapkan urutan eksekusi: Audit → LensAI → LensScore → LensRadar → LensFlow → Test → Fix regression → Evaluasi → baru perluas ke LensScanner/LensMarket/LensTechnical/LensWatch/LensAlert. Spec ini mencakup **Tahap 1 (audit/mapping)** dan **Tahap 2 (implementasi 4 core brand)** saja — bukan seluruh 10 tahap sekaligus.

Audit penuh dijalankan sebelum spec ini ditulis (baca seluruh `app/`, `modules/`, `components/`, `lib/`, config SEO/manifest). Temuan kunci yang membentuk keputusan di bawah:

- Ada **3 fitur "AI" berbeda nama tapi tumpang-tindih secara konsep**: "Council AI" (multi-agent orkestrasi di `/technical/[symbol]` dan `/multi-agent`), "AI Pick" (breakout+rekomendasi+akumulasi gabungan di `/breakout-radar`), dan card "AI Insight" di `/home`.
- Header score di `app/dashboard/page.tsx:670` tertulis **"SAHM LENS SCORE"** — kemungkinan typo lama, bukan istilah baku.
- Fix terminologi Foreign Flow → Arus Dana (commit `366a6b3`, 2026-08-03 pagi) **belum lengkap** — satu label di `app/api/stock/[ticker]/route.ts:328` masih `'Foreign Flow (Estimasi Asing)'`, dan `app/api/explain/route.ts:41` melakukan string-match ke label lama tersebut.
- String "Council AI" muncul luas: navigasi, moduleTitle beberapa halaman, narasi fallback yang dikirim ke user, komentar kode internal, dokumen historis (audit/spec/plan lama), dan aplikasi Android native terpisah (`sahamlens-android/`).

## Keputusan produk (hasil brainstorming + koreksi user)

1. **LensAI menyerap seluruh nama fitur "AI" yang ada** — bukan hanya jadi label penjelas/narrative layer. "Council AI", "Multi-Agent AI Consensus", dan card "AI Insight" semuanya jadi **LensAI** dengan subtitle berbeda per konteks (mis. "LensAI — AI-powered Market Insight" di nav/home, "LensAI — Multi-Agent Consensus" di `/multi-agent`). Ini koreksi eksplisit dari user: awalnya diusulkan LensAI hanya jadi label penjelasan, user memilih semua fitur AI diganti LensAI + subtitle beda.
2. **"AI Pick" adalah pengecualian — jadi LensRadar, bukan LensAI.** Isinya breakout+rekomendasi+akumulasi (opportunity discovery), cocok definisi LensRadar di brand doc, bukan LensAI. Nav label "AI Pick" → "LensRadar", subtitle "Breakout & Opportunity Scanner".
3. **"Council AI" diganti LensAI di SEMUA text user-facing di Next.js app**, tidak dibatasi ke nav+Header saja — termasuk moduleTitle di halaman Screener dan DCF (yang scope brand-nya sendiri, LensScanner, ditunda), serta narasi fallback yang dikirim ke user (`miniCouncil.ts`, `local-council.service.ts`). Ini juga koreksi eksplisit dari user setelah draf awal spec hanya mencakup Sidebar/Header/technical-page.
4. **"SAHM LENS SCORE" diperbaiki jadi "LensScore"**, subtitle "Unified Stock Score" — sekaligus membetulkan typo lama.
5. **Label Foreign Flow yang tersisa dibereskan sekalian jadi LensFlow**, bukan dibiarkan sebagai technical debt terpisah — karena kalau tidak, akan ada 2 istilah beda ("Arus Dana" dan "Foreign Flow") untuk konsep yang sama di app yang sama, bertentangan dengan tujuan konsistensi brand.
6. **Komentar kode internal, dokumen historis (`AUDIT-DATA-INTEGRITY-2026-08-03.md`, `docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md`), dan `sahamlens-android/` (native Android, repo/build terpisah) TIDAK disentuh di fase ini.** Komentar kode bukan brand surface (tidak dilihat user). Dokumen historis adalah catatan bertanggal, mengubahnya memalsukan record masa lalu. Android app punya siklus build/deploy sendiri — brand sync ke sana jadi fase terpisah supaya perubahan Next.js tetap surgical dan mudah di-test/rollback sendiri.

## Scope Tahap 2 — Perubahan File

Semua perubahan adalah **teks label/subtitle/moduleTitle saja**. Tidak ada perubahan formula skor, logic scoring/flow/screening, route, atau nama file/komponen/service internal (`ai-pick.service.ts`, `council.service.ts`, `foreign-flow-proxy.ts`, `BandarFlowPro.tsx` nama file tetap).

| # | File:Line | Current | New |
|---|---|---|---|
| 1 | `components/Sidebar.tsx:70` | nav "Council AI" | nav "LensAI", subtitle "AI-powered Market Insight" |
| 2 | `components/Sidebar.tsx:81` | nav "AI Pick" | nav "LensRadar", subtitle "Breakout & Opportunity Scanner" |
| 3 | `components/Header.tsx:21-22` | default `moduleTitle` "Council AI Technical + Bandarmology" / `moduleBank` "COUNCIL AI" | "LensAI Technical + Bandarmology" / "LENSAI" |
| 4 | `app/technical/[symbol]/page.tsx:201-202` | h1 "Council AI: {symbol}", subtitle "Stock Analysis Council AI" | h1 "LensAI: {symbol}", subtitle "Stock Analysis LensAI" |
| 5 | `app/breakout-radar/page.tsx:99` | h1 "AI Pick Live" | h1 "LensRadar Live" |
| 6 | `app/breakout-radar/page.tsx:121` | h2 "Kandidat Terkuat Hari Ini" | tetap (bukan brand string) |
| 7 | `app/dashboard/page.tsx:670` | "SAHM LENS SCORE" | "LensScore" (+ subtitle kecil "Unified Stock Score" kalau ada slot) |
| 8 | `app/multi-agent/page.tsx:110` | `moduleTitle` "Multi-Agent AI Consensus" | "LensAI — Multi-Agent Consensus" |
| 9 | `app/home/page.tsx:234` | h2 "AI Insight" | h2 "LensAI" (subtitle kecil "AI-powered Market Insight" kalau ada slot) |
| 10 | `app/screener/page.tsx:40` | `moduleTitle` "Council AI Multi-Factor Screener" | "LensAI Multi-Factor Screener" |
| 11 | `app/dcf/page.tsx:75` | `moduleTitle` "Council AI DCF Intrinsic Valuation" | "LensAI DCF Intrinsic Valuation" |
| 12 | `lib/miniCouncil.ts:245` | `` `Council AI menilai saham ini ${verdictText}.` `` | `` `LensAI menilai saham ini ${verdictText}.` `` |
| 13 | `modules/ai/service/local-council.service.ts:123` | `'Fallback lokal berjalan karena Council AI tidak tersedia atau kena limit.'` | ganti "Council AI" → "LensAI" |
| 14 | `app/api/stock/[ticker]/route.ts:328` | `label: 'Foreign Flow (Estimasi Asing)'` | `label: 'LensFlow (Estimasi Arus Dana Asing)'` |
| 15 | `app/api/explain/route.ts:41` | `filter === 'Foreign Flow (Estimasi Asing)' \|\| filter === 'Foreign Flow'` | tambah match baru: `filter === 'LensFlow (Estimasi Arus Dana Asing)' \|\| filter === 'Foreign Flow (Estimasi Asing)' \|\| filter === 'Foreign Flow'` (pertahankan match lama supaya tidak ada window di mana label baru terkirim tapi belum dikenali — deploy Next.js tidak atomic di semua request in-flight) |
| 16 | `components/BandarFlowPro.tsx:91` | h3 "Bandar & Arus Dana" | h3 "LensFlow — Bandar & Arus Dana" |

**Di luar scope (ditunda ke fase berikut, sesuai urutan eksekusi brand doc):** LensScanner (rebrand penuh halaman Screener), LensMarket (Dashboard root, market-pulse, market/[category]), LensTechnical (AlgoFilters "10 Pure Math Filters"), LensWatch (Watchlist), LensAlert (notification/alert), `public/manifest.json` description "Smart AI" + SEO/OpenGraph strings (Tahap 8), visual/color redesign (Tahap 6, hanya kalau perlu), `mobile/`, `sahamlens-android/`, `android-webview/` (client terpisah).

## Konsistensi & Risiko

- **Risiko utama:** `Header.tsx` default `moduleTitle` dipakai banyak halaman via prop — perlu grep ulang semua pemakaian `<Header` tanpa `moduleTitle` eksplisit sebelum ubah default, supaya tidak ada halaman lain yang diam-diam ikut berubah tanpa diaudit (atau sebaliknya, halaman yang seharusnya ikut berubah malah override manual dan terlewat).
- **Risiko #14/#15:** label `Foreign Flow (Estimasi Asing)` adalah *value* yang dibaca balik oleh `app/api/explain/route.ts` untuk mencocokkan filter — kalau salah satu diganti tanpa yang lain, fitur "AI Explain Modal" untuk filter itu berhenti berfungsi (silent break, bukan error). Wajib diubah dalam commit yang sama, dan match lama dipertahankan sebagai fallback.
- **Tidak ada perubahan logic/formula/route** — hanya string. Risiko regresi fungsional rendah, risiko utama adalah *missed consumer* (string dipakai di tempat lain yang belum ke-grep).

## Addendum (ditulis saat menyusun implementation plan)

Grep menyeluruh saat menulis plan menemukan realita berbeda dari audit awal:

- **Sudah dikerjakan lebih dulu** (di luar sesi ini, sebelum spec ini ditulis): `components/Sidebar.tsx:70` (nav "LensAI"), `components/Header.tsx:21` (`moduleTitle` default), `app/technical/[symbol]/page.tsx:205-206`, `app/screener/page.tsx:40`, `app/dcf/page.tsx:75` — semua sudah "LensAI", tidak perlu diubah lagi. Baris #1, #3 (sebagian), #4, #10, #11 di tabel mapping di atas SUDAH selesai untuk bagian judul; yang tersisa di file-file itu hanya `moduleBank="COUNCIL AI"` (belum ikut berubah).
- **"AI Pick" jauh lebih tersebar** dari yang tercatat di audit awal (audit awal hanya menangkap Sidebar nav + h1 breakout-radar). Grep penuh menemukan string identik `'AI Pick LIVE, LensAI & Compare Tool'` terpakai berulang (literal, bukan konstanta bersama) di 12 file berbeda — semua adalah body copy modal upgrade Pro (`UserProfileModal`, `watchlist`, `dashboard` x2, `recommendations`, `backtest`, `compare`, `fundamental` x2, `market-pulse`, plus 3 string variasi di `breakout-radar/page.tsx`). Kalau hanya nav+h1 yang diganti, semua modal upgrade Pro di seluruh app akan tetap menyebut "AI Pick LIVE" sementara nav sudah bilang "LensRadar" — brand pecah di titik yang paling sering dilihat user (paywall). Semua occurrence ini masuk scope Task LensRadar di plan.
- Tambahan literal "Council AI"/"COUNCIL AI" yang belum tercatat: `components/Header.tsx:22`, `app/screener/page.tsx:41`, `app/dcf/page.tsx:76` (semua `moduleBank`), dan `app/fundamental/page.tsx:315` ("HASIL ANALISA COUNCIL AI").
- Tambahan "AI Insight": `components/Sidebar.tsx:59` (subtitle "AI Insight & Ringkasan Akun" untuk nav "Beranda").
- Tambahan "Multi-Agent AI Consensus": `app/multi-agent/page.tsx:263` (body modal, bukan cuma `moduleTitle` line 110).
- Tambahan "AI Pick" di teks bantuan: `app/screener/page.tsx:200`.
- Dicek: tidak ada test di `__tests__/**` yang mereferensikan string-string ini — aman dari breakage otomatis, tapi tetap perlu smoke test manual (lihat Testing).

Daftar final lengkap (menggantikan tabel Scope di atas untuk eksekusi) ada di plan: `docs/superpowers/plans/2026-08-03-brand-architecture-phase2.md`.

## Testing

- Grep ulang `"Council AI"` dan `"Foreign Flow"` setelah perubahan — pastikan hanya sisa di file yang sengaja di-skip (komentar, docs historis, `sahamlens-android/`).
- `npm run lint` / `tsc --noEmit` (typecheck) — perubahan literal string tidak mengubah tipe, tapi memverifikasi tidak ada typo yang break build.
- `npm run build` (production build) — pastikan tidak ada broken import/route.
- Manual check tiap halaman yang diubah: `/`, `/home`, `/technical/[symbol]` (contoh: BBCA.JK), `/breakout-radar`, `/dashboard` (contoh ticker), `/multi-agent`, `/screener`, `/dcf` — pastikan label baru tampil, tidak ada layout overflow dari teks lebih panjang ("LensAI Multi-Factor Screener" vs "Council AI Multi-Factor Screener" — panjang karakter mirip, risiko overflow rendah).
- Test khusus AI Explain Modal untuk filter Foreign Flow/LensFlow di `/dashboard` — pastikan modal tetap muncul dengan penjelasan yang benar setelah rename label.
