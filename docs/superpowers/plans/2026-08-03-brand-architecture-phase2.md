# Brand Architecture Fase 2 (LensAI/LensScore/LensRadar/LensFlow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti semua string user-facing "Council AI" / "AI Insight" / "Multi-Agent AI Consensus" jadi "LensAI", "AI Pick" jadi "LensRadar", "SAHM LENS SCORE" jadi "LensScore", dan sisa label "Foreign Flow" jadi "LensFlow" — di seluruh Next.js app, tanpa mengubah logic/formula/route.

**Architecture:** Murni text/label replacement di file React (`.tsx`) dan 2 file service (`.ts`) yang isinya narasi/label dikirim ke user. Tidak ada file baru, tidak ada perubahan signature fungsi, tidak ada perubahan skema data.

**Tech Stack:** Next.js App Router (TypeScript/React), tidak ada dependency baru.

## Global Constraints

- Tidak boleh mengubah route/URL existing (spec §Scope).
- Tidak boleh mengubah formula skor/logic scoring/flow/screening (spec §Scope, aturan wajib brand doc #5).
- Tidak boleh menghapus fitur existing atau mengubah nama file/komponen/service internal (`ai-pick.service.ts`, `council.service.ts`, `foreign-flow-proxy.ts`, `BandarFlowPro.tsx` nama file tetap) (spec §Scope).
- Komentar kode internal dan dokumen historis (`AUDIT-DATA-INTEGRITY-2026-08-03.md`, `docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md`) TIDAK disentuh (spec keputusan #6).
- `sahamlens-android/`, `mobile/`, `android-webview/` TIDAK disentuh di plan ini (spec keputusan #6, fase terpisah).
- `app/api/stock/[ticker]/route.ts:328` dan `app/api/explain/route.ts:41` harus diubah DALAM COMMIT YANG SAMA — match lama dipertahankan sebagai fallback (spec §Risiko #14/#15).

---

### Task 1: LensAI — beresin sisa "Council AI"/"COUNCIL AI"/"AI Insight"/"Multi-Agent AI Consensus"

Sebagian rename LensAI sudah selesai duluan (`Sidebar.tsx:70`, `Header.tsx:21` moduleTitle, `technical/[symbol]/page.tsx:205-206`, `screener/page.tsx:40`, `dcf/page.tsx:75` — JANGAN diubah lagi, sudah benar). Task ini beresin sisanya.

**Files:**
- Modify: `components/Sidebar.tsx:59`
- Modify: `components/Header.tsx:22`
- Modify: `app/screener/page.tsx:41`
- Modify: `app/dcf/page.tsx:76`
- Modify: `app/fundamental/page.tsx:315`
- Modify: `app/home/page.tsx:234`
- Modify: `app/multi-agent/page.tsx:110`
- Modify: `app/multi-agent/page.tsx:263`
- Modify: `lib/miniCouncil.ts:245`
- Modify: `modules/ai/service/local-council.service.ts:123`

**Interfaces:** Tidak ada — semua perubahan literal string JSX/JS, tidak ada signature/type yang berubah. Task ini independen dari Task 2/3/4 (file berbeda, tidak ada dependency).

- [ ] **Step 1: `components/Sidebar.tsx:59`** — subtitle nav "Beranda"

```tsx
// SEBELUM
{ id: 'home', name: 'Beranda', subtitle: 'AI Insight & Ringkasan Akun', path: '/home', icon: LayoutDashboard },
// SESUDAH
{ id: 'home', name: 'Beranda', subtitle: 'LensAI & Ringkasan Akun', path: '/home', icon: LayoutDashboard },
```

- [ ] **Step 2: `components/Header.tsx:22`** — default `moduleBank`

```tsx
// SEBELUM
  moduleBank = 'COUNCIL AI',
// SESUDAH
  moduleBank = 'LENSAI',
```

- [ ] **Step 3: `app/screener/page.tsx:41`** — `moduleBank` prop

```tsx
// SEBELUM
        moduleBank="COUNCIL AI"
// SESUDAH
        moduleBank="LENSAI"
```

- [ ] **Step 4: `app/dcf/page.tsx:76`** — `moduleBank` prop

```tsx
// SEBELUM
      moduleBank="COUNCIL AI"
// SESUDAH
      moduleBank="LENSAI"
```

- [ ] **Step 5: `app/fundamental/page.tsx:315`** — label hasil analisa

```tsx
// SEBELUM
              <div className="text-[10px] font-mono text-tv-muted uppercase">HASIL ANALISA COUNCIL AI</div>
// SESUDAH
              <div className="text-[10px] font-mono text-tv-muted uppercase">HASIL ANALISA LENSAI</div>
```

- [ ] **Step 6: `app/home/page.tsx:234`** — h2 card "AI Insight"

```tsx
// SEBELUM
                <h2 className="font-heading text-sm font-semibold text-white">AI Insight</h2>
// SESUDAH
                <h2 className="font-heading text-sm font-semibold text-white">LensAI</h2>
```

- [ ] **Step 7: `app/multi-agent/page.tsx:110`** — `moduleTitle`

```tsx
// SEBELUM
        moduleTitle="Multi-Agent AI Consensus"
// SESUDAH
        moduleTitle="LensAI — Multi-Agent Consensus"
```

- [ ] **Step 8: `app/multi-agent/page.tsx:263`** — body modal gate login

```tsx
// SEBELUM
        body="Multi-Agent AI Consensus butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
// SESUDAH
        body="LensAI — Multi-Agent Consensus butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
```

- [ ] **Step 9: `lib/miniCouncil.ts:245`** — narasi fallback rule-based

```typescript
// SEBELUM
  let summary = `Council AI menilai saham ini ${verdictText}.`;
// SESUDAH
  let summary = `LensAI menilai saham ini ${verdictText}.`;
```

- [ ] **Step 10: `modules/ai/service/local-council.service.ts:123`** — narasi fallback lokal

```typescript
// SEBELUM
    summary_id: 'Fallback lokal berjalan karena Council AI tidak tersedia atau kena limit.'
// SESUDAH
    summary_id: 'Fallback lokal berjalan karena LensAI tidak tersedia atau kena limit.'
```

- [ ] **Step 11: Verifikasi tidak ada sisa "Council AI"/"COUNCIL AI"/"AI Insight"/"Multi-Agent AI Consensus" user-facing**

Run: `grep -rn "Council AI\|COUNCIL AI\|Multi-Agent AI Consensus" --include=*.tsx --include=*.ts app components lib modules`
Expected: hanya muncul di file komentar-only yang SUDAH diketahui (`lib/aiProviders.ts:3`, `lib/miniCouncil.ts:1,5,99`, `modules/news/service/news.service.ts`, `modules/recommendation/service/recommendation.service.ts`, `modules/technical/service/decision-thresholds.ts`, `app/api/compare/route.ts:138`, `shared/auth/anonymous-trial.ts:7`, `app/api/news/route.ts:6`, `modules/ai/service/council.service.ts:107`) — bukan di JSX text/string yang dirender ke user. Kalau ada baris baru di luar daftar ini, cek dulu apakah itu user-facing sebelum lanjut.

Run: `grep -rn "\"AI Insight\"\|>AI Insight<" --include=*.tsx app components`
Expected: no match (selain di dalam komentar `app/home/page.tsx:225` yang memang dibiarkan).

- [ ] **Step 12: Commit**

```bash
git add components/Sidebar.tsx components/Header.tsx app/screener/page.tsx app/dcf/page.tsx app/fundamental/page.tsx app/home/page.tsx app/multi-agent/page.tsx lib/miniCouncil.ts modules/ai/service/local-council.service.ts
git commit -m "feat(brand): rename Council AI/AI Insight/Multi-Agent AI Consensus jadi LensAI"
```

---

### Task 2: LensRadar — rename "AI Pick" ke seluruh consumer (nav, page, semua modal upgrade Pro)

"AI Pick" dipakai berulang identik (`'AI Pick LIVE, LensAI & Compare Tool'`) di banyak file modal upgrade Pro — semua harus diganti bareng, kalau tidak brand pecah di titik paywall yang paling sering dilihat user.

**Files:**
- Modify: `components/Sidebar.tsx:81`
- Modify: `components/UserProfileModal.tsx:249,252`
- Modify: `app/watchlist/page.tsx:560`
- Modify: `app/breakout-radar/page.tsx:99,262,265,274`
- Modify: `app/dashboard/page.tsx:515,518,1044,1047`
- Modify: `app/recommendations/page.tsx:406,409`
- Modify: `app/backtest/page.tsx:461`
- Modify: `app/compare/page.tsx:236,239`
- Modify: `app/fundamental/page.tsx:212,215,474,477`
- Modify: `app/market-pulse/page.tsx:430,433`
- Modify: `app/screener/page.tsx:200`

**Interfaces:** Tidak ada — literal string saja. Independen dari Task 1/3/4.

- [ ] **Step 1: `components/Sidebar.tsx:81`** — nav item

```tsx
// SEBELUM
      { id: 'breakout-radar', name: 'AI Pick', subtitle: 'Breakout, Rekomendasi & Lainnya', path: '/breakout-radar', icon: Radar, live: true },
// SESUDAH
      { id: 'breakout-radar', name: 'LensRadar', subtitle: 'Breakout & Opportunity Scanner', path: '/breakout-radar', icon: Radar, live: true },
```

- [ ] **Step 2: `components/UserProfileModal.tsx:249` dan `:252`**

```tsx
// SEBELUM (line 249)
      body="Buka semua fitur Pro tanpa batas: LensAI, AI Pick LIVE, Compare Tool, Market Pulse, dan lainnya."
// SESUDAH
      body="Buka semua fitur Pro tanpa batas: LensAI, LensRadar LIVE, Compare Tool, Market Pulse, dan lainnya."

// SEBELUM (line 252)
        'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
        'LensRadar LIVE, LensAI & Compare Tool',
```

- [ ] **Step 3: `app/watchlist/page.tsx:560`**

```tsx
// SEBELUM
          'AI Pick LIVE, LensAI & fitur Pro lainnya',
// SESUDAH
          'LensRadar LIVE, LensAI & fitur Pro lainnya',
```

- [ ] **Step 4: `app/breakout-radar/page.tsx:99`** — h1 halaman

```tsx
// SEBELUM
                AI Pick Live
// SESUDAH
                LensRadar Live
```

- [ ] **Step 5: `app/breakout-radar/page.tsx:262`**

```tsx
// SEBELUM
        body="AI Pick Live butuh akun Pro setelah trial 7 hari berakhir."
// SESUDAH
        body="LensRadar Live butuh akun Pro setelah trial 7 hari berakhir."
```

- [ ] **Step 6: `app/breakout-radar/page.tsx:265`**

```tsx
// SEBELUM
          'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
          'LensRadar LIVE, LensAI & Compare Tool',
```

- [ ] **Step 7: `app/breakout-radar/page.tsx:274`**

```tsx
// SEBELUM
        body="AI Pick butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
// SESUDAH
        body="LensRadar butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
```

- [ ] **Step 8: `app/dashboard/page.tsx:515` dan `:518`**

```tsx
// SEBELUM (line 515, potongan akhir)
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
// SESUDAH
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}

// SEBELUM (line 518)
            'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
            'LensRadar LIVE, LensAI & Compare Tool',
```

- [ ] **Step 9: `app/dashboard/page.tsx:1044` dan `:1047`** (instance modal kedua di file yang sama)

```tsx
// SEBELUM (line 1044, potongan akhir)
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
// SESUDAH
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}

// SEBELUM (line 1047)
          'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
          'LensRadar LIVE, LensAI & Compare Tool',
```

- [ ] **Step 10: `app/recommendations/page.tsx:406` dan `:409`**

```tsx
// SEBELUM (line 406, potongan akhir)
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
// SESUDAH
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}

// SEBELUM (line 409)
          'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
          'LensRadar LIVE, LensAI & Compare Tool',
```

- [ ] **Step 11: `app/backtest/page.tsx:461`**

```tsx
// SEBELUM
          'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
          'LensRadar LIVE, LensAI & Compare Tool',
```

- [ ] **Step 12: `app/compare/page.tsx:236` dan `:239`**

```tsx
// SEBELUM (line 236, potongan akhir)
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
// SESUDAH
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}

// SEBELUM (line 239)
          'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
          'LensRadar LIVE, LensAI & Compare Tool',
```

- [ ] **Step 13: `app/fundamental/page.tsx:212`, `:215`, `:474`, `:477`** (dua instance modal di file yang sama)

```tsx
// SEBELUM (line 212, potongan akhir)
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
// SESUDAH
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}

// SEBELUM (line 215)
            'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
            'LensRadar LIVE, LensAI & Compare Tool',

// SEBELUM (line 474, potongan akhir)
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
// SESUDAH
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}

// SEBELUM (line 477)
          'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
          'LensRadar LIVE, LensAI & Compare Tool',
```

- [ ] **Step 14: `app/market-pulse/page.tsx:430` dan `:433`**

```tsx
// SEBELUM (line 430, potongan akhir)
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + AI Pick LIVE.`}
// SESUDAH
...Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}

// SEBELUM (line 433)
          'AI Pick LIVE, LensAI & Compare Tool',
// SESUDAH
          'LensRadar LIVE, LensAI & Compare Tool',
```

- [ ] **Step 15: `app/screener/page.tsx:200`** — teks bantuan/disclaimer

```tsx
// SEBELUM (potongan)
Signal = skor komposit Teknikal+Fundamental+Flow yang sama dengan Detail Saham/AI Pick (bukan angka terpisah).
// SESUDAH
Signal = skor komposit Teknikal+Fundamental+Flow yang sama dengan Detail Saham/LensRadar (bukan angka terpisah).
```

- [ ] **Step 16: Verifikasi tidak ada sisa "AI Pick" user-facing**

Run: `grep -rn "AI Pick" --include=*.tsx --include=*.ts app components lib modules`
Expected: hanya muncul di komentar yang SUDAH diketahui dan sengaja dibiarkan (`components/Dashboard.tsx:232,233,252`, `app/backtest/page.tsx:166,168,170` — semua di dalam blok `{/* ... */}`, bukan JSX text yang dirender).

- [ ] **Step 17: Commit**

```bash
git add components/Sidebar.tsx components/UserProfileModal.tsx app/watchlist/page.tsx app/breakout-radar/page.tsx app/dashboard/page.tsx app/recommendations/page.tsx app/backtest/page.tsx app/compare/page.tsx app/fundamental/page.tsx app/market-pulse/page.tsx app/screener/page.tsx
git commit -m "feat(brand): rename AI Pick jadi LensRadar di semua nav, halaman, dan modal upgrade Pro"
```

---

### Task 3: LensScore — perbaiki "SAHM LENS SCORE"

**Files:**
- Modify: `app/dashboard/page.tsx:670`

**Interfaces:** Tidak ada. Independen dari task lain.

- [ ] **Step 1: `app/dashboard/page.tsx:670`**

```tsx
// SEBELUM
                <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider text-center flex flex-col gap-1 items-center justify-center">
                  SAHM LENS SCORE
                </div>
// SESUDAH
                <div className="text-[10px] font-mono text-tv-muted uppercase tracking-wider text-center flex flex-col gap-1 items-center justify-center">
                  LensScore
                </div>
```

- [ ] **Step 2: Verifikasi**

Run: `grep -rn "SAHM LENS SCORE" --include=*.tsx app components`
Expected: no match.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "fix(brand): perbaiki typo SAHM LENS SCORE jadi LensScore"
```

---

### Task 4: LensFlow — beresin sisa label "Foreign Flow"

`app/api/stock/[ticker]/route.ts:328` dan `app/api/explain/route.ts:41` WAJIB diubah bareng — `route.ts:328` mengirim `label` yang dibaca balik oleh string-match di `explain/route.ts:41` untuk generate penjelasan "AI Explain Modal". Kalau cuma satu yang diubah, modal itu berhenti kasih penjelasan untuk filter itu (silent break, bukan error yang kelihatan).

**Files:**
- Modify: `app/api/stock/[ticker]/route.ts:328`
- Modify: `app/api/explain/route.ts:41`
- Modify: `components/BandarFlowPro.tsx:91`

**Interfaces:**
- Konsumsi: `app/api/explain/route.ts` menerima `body.filter` (string) dari client — nilai ini persis string `label` yang di-set di `app/api/stock/[ticker]/route.ts:328` dan dikembalikan lewat `analyzersResult` array ke frontend, lalu dikirim balik oleh `AlgoFilters` component saat user klik "Explain".

- [ ] **Step 1: `app/api/stock/[ticker]/route.ts:328`**

```typescript
// SEBELUM
    analyzersResult.push({
      label: 'Foreign Flow (Estimasi Asing)',
      value: foreignFlow,
      decision: ffDecision,
      confidence: ffConfidence
    });
// SESUDAH
    analyzersResult.push({
      label: 'LensFlow (Estimasi Arus Dana Asing)',
      value: foreignFlow,
      decision: ffDecision,
      confidence: ffConfidence
    });
```

- [ ] **Step 2: `app/api/explain/route.ts:41`** — tambah match baru, pertahankan yang lama sebagai fallback compat

```typescript
// SEBELUM
    } else if ((filter === 'Foreign Flow (Estimasi Asing)' || filter === 'Foreign Flow') && status) {
// SESUDAH
    } else if ((filter === 'LensFlow (Estimasi Arus Dana Asing)' || filter === 'Foreign Flow (Estimasi Asing)' || filter === 'Foreign Flow') && status) {
```

- [ ] **Step 3: `components/BandarFlowPro.tsx:91`**

```tsx
// SEBELUM
            <h3 className="font-heading font-bold text-white text-lg">Bandar & Arus Dana</h3>
// SESUDAH
            <h3 className="font-heading font-bold text-white text-lg">LensFlow — Bandar & Arus Dana</h3>
```

- [ ] **Step 4: Verifikasi label baru dikenali explain endpoint**

Run: `grep -n "LensFlow" app/api/stock/\[ticker\]/route.ts app/api/explain/route.ts components/BandarFlowPro.tsx`
Expected: 3 match, satu di tiap file, persis seperti di atas.

Run: `grep -n "Foreign Flow (Estimasi Asing)" app/api/explain/route.ts`
Expected: masih ada (fallback compat dipertahankan, bukan dihapus).

- [ ] **Step 5: Commit**

```bash
git add app/api/stock/[ticker]/route.ts app/api/explain/route.ts components/BandarFlowPro.tsx
git commit -m "feat(brand): rename label Foreign Flow jadi LensFlow, jaga compat match lama"
```

---

### Task 5: Verifikasi akhir (build, typecheck, manual smoke test)

**Files:** tidak ada file diubah — task ini murni verifikasi lintas Task 1-4.

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 error baru (error lama pre-existing, kalau ada, boleh diabaikan tapi catat di laporan akhir).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 error baru.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build sukses, tidak ada broken import/route.

- [ ] **Step 4: Grep sapu bersih semua istilah lama di scope**

Run: `grep -rln "Council AI\|COUNCIL AI\|AI Pick\|SAHM LENS SCORE\|Multi-Agent AI Consensus" --include=*.tsx --include=*.ts app components lib modules | grep -v __tests__`
Expected: hasil HANYA file-file komentar-only yang sudah didaftar di Step 11 Task 1 dan Step 16 Task 2 — tidak ada file baru yang muncul.

- [ ] **Step 5: Manual smoke test tiap halaman yang diubah**

Jalankan `npm run dev`, buka browser, cek:
- `/home` — h2 card jadi "LensAI", subtitle nav "Beranda" di sidebar jadi "LensAI & Ringkasan Akun"
- `/technical/BBCA.JK` — sidebar nav "LensAI", h1 halaman "LensAI: BBCA.JK" (harus tetap seperti sebelumnya, tidak berubah)
- `/breakout-radar` — sidebar nav "LensRadar", h1 halaman "LensRadar Live"
- `/dashboard?ticker=BBCA.JK` (atau ticker apapun) — score circle jadi "LensScore", breakdown "Arus Dana" tetap tidak berubah, coba trigger modal upgrade (habiskan kuota analisa) — body modal harus bilang "LensRadar LIVE" bukan "AI Pick LIVE"
- `/multi-agent` — header "LensAI — Multi-Agent Consensus"
- `/screener` — moduleBank pill jadi "LENSAI"
- `/dcf/BBCA.JK` — moduleBank pill jadi "LENSAI"
- `/fundamental/BBCA.JK` — label "HASIL ANALISA LENSAI", coba trigger modal upgrade — body harus sebut "LensRadar LIVE"
- Klik "Explain" pada filter Foreign Flow/LensFlow di `/dashboard` (AlgoFilters) — modal penjelasan harus tetap muncul dengan teks yang benar (verifikasi Task 4 tidak silent-break)
- Cek tidak ada overflow teks di heading/pill manapun (nama baru sama panjang atau lebih pendek dari nama lama, risiko overflow rendah, tapi tetap dicek visual)

Kalau ada regresi, catat di laporan akhir sebagai bug ditemukan saat Tahap 10 (Test) — jangan lanjut ke fase LensScanner/LensMarket/dst sebelum ini bersih (urutan eksekusi brand doc: Test → Fix regression → Evaluasi, baru perluas).

- [ ] **Step 6: Tidak ada commit di step ini** — kalau smoke test menemukan bug, perbaiki lalu buat commit fix terpisah dengan pesan yang jelas menyebut regresi apa yang diperbaiki.
