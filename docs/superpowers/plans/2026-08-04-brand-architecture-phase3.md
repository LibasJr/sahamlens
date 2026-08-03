# Brand Architecture Fase 3 (LensScanner/LensMarket/LensTechnical/LensWatch/LensAlert) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti "Stock Screener"/"Screener AI" jadi LensScanner, "Ringkasan Pasar" (khusus `/market-pulse`) jadi LensMarket, "Technical Analyzer"/"Technical AI Analytics"/"Pure Algorithmic Trading"/"Algo Filters" jadi LensTechnical (sekalian hapus wording "AI"/"Smart AI" yang kontradiktif), dan pisahkan "Watchlist & Alerts" jadi LensWatch (daftar saham) + LensAlert (notifikasi) — sekalian perbaiki klaim palsu "notifikasi Telegram real-time" yang tidak didukung implementasi.

**Architecture:** Text/label replacement di file React (`.tsx`) dan 1 file service (`.ts`, pesan alert). Tidak ada file baru, tidak ada perubahan signature fungsi, tidak ada perubahan route/logic.

**Tech Stack:** Next.js App Router (TypeScript/React), tidak ada dependency baru.

## Global Constraints

- Tidak boleh mengubah route/URL existing.
- Tidak boleh mengubah formula/logic (`screener.service.ts`, `alert-evaluation.service.ts`, dsb) — murni teks.
- Tidak boleh mengubah nama file/komponen/service internal (`AlgoFilters.tsx` nama file tetap, `screener.service.ts` tetap, dsb).
- `app/fundamental/page.tsx:202,255` (`moduleBank="SMART AI"`) TIDAK disentuh — identitas halaman Fundamental Analyzer, bukan salah satu dari 5 brand term fase ini.
- `public/manifest.json` TIDAK disentuh — Tahap 8 (SEO/PWA), ditunda.
- Perubahan klaim Telegram (`pricing.ts:71`, `Sidebar.tsx:88`) WAJIB konsisten dalam commit yang sama — jangan sampai satu tempat masih menjanjikan Telegram sementara yang lain sudah jujur.

---

### Task 1: LensScanner

**Files:**
- Modify: `components/Sidebar.tsx:72`
- Modify: `app/screener/page.tsx:40,41`
- Modify: `app/moat/page.tsx:44`
- Modify: `app/recommendations/page.tsx:220,222`
- Modify: `shared/config/pricing.ts:64`

**Interfaces:** Tidak ada — literal string saja. Independen dari Task 2/3/4.

- [ ] **Step 1: `components/Sidebar.tsx:72`**

```tsx
// SEBELUM
      { id: 'screener', name: 'Stock Screener', subtitle: 'Filter Saham Multi-Faktor', path: '/screener', icon: Filter },
// SESUDAH
      { id: 'screener', name: 'LensScanner', subtitle: 'Filter Saham Multi-Faktor', path: '/screener', icon: Filter },
```

- [ ] **Step 2: `app/screener/page.tsx:40-41`**

```tsx
// SEBELUM
        moduleTitle="LensAI Multi-Factor Screener"
        moduleBank="LENSAI"
// SESUDAH
        moduleTitle="LensScanner Multi-Factor"
        moduleBank="LENSSCANNER"
```

- [ ] **Step 3: `app/moat/page.tsx:44`**

```tsx
// SEBELUM
          <a href="/screener" className="text-tv-blue hover:underline">Stock Screener</a>.
// SESUDAH
          <a href="/screener" className="text-tv-blue hover:underline">LensScanner</a>.
```

- [ ] **Step 4: `app/recommendations/page.tsx:220,222`**

```tsx
// SEBELUM (line 220)
              <h2 className="font-heading font-bold text-lg text-white tracking-tight">Rekomendasi Top 50 (Screener AI)</h2>
// SESUDAH
              <h2 className="font-heading font-bold text-lg text-white tracking-tight">Rekomendasi Top 50 (LensScanner)</h2>
```

```tsx
// SEBELUM (line 222, badge di sebelah h2 di atas)
                SYSTEM AI
// SESUDAH
                LENSSCANNER
```

- [ ] **Step 5: `shared/config/pricing.ts:64`**

```typescript
// SEBELUM
  'Stock Screener - filter multi-faktor',
// SESUDAH
  'LensScanner - filter multi-faktor',
```

- [ ] **Step 6: Verifikasi**

Run: `grep -rn "Stock Screener\|Screener AI" --include=*.tsx --include=*.ts app components shared`
Expected: no match.

- [ ] **Step 7: Commit**

```bash
git add components/Sidebar.tsx app/screener/page.tsx app/moat/page.tsx app/recommendations/page.tsx shared/config/pricing.ts
git commit -m "feat(brand): rename Stock Screener/Screener AI jadi LensScanner"
```

---

### Task 2: LensMarket (khusus `/market-pulse`)

**Files:**
- Modify: `components/Sidebar.tsx:60`
- Modify: `app/market-pulse/page.tsx:203,441,442`

**Interfaces:** Tidak ada. Independen dari task lain. Root `/` (`components/Dashboard.tsx`) dan `app/market/[category]/page.tsx` TIDAK disentuh (di luar scope, lihat Global Constraints & spec).

- [ ] **Step 1: `components/Sidebar.tsx:60`**

```tsx
// SEBELUM
      { id: 'market-pulse', name: 'Ringkasan Pasar', subtitle: 'Index, Sector & Breadth', path: '/market-pulse', icon: Activity, live: true },
// SESUDAH
      { id: 'market-pulse', name: 'LensMarket', subtitle: 'Index, Sector & Breadth', path: '/market-pulse', icon: Activity, live: true },
```

- [ ] **Step 2: `app/market-pulse/page.tsx:203`**

```tsx
// SEBELUM
              <h2 className="font-heading font-bold text-lg text-tv-text tracking-tight truncate">Ringkasan Pasar</h2>
// SESUDAH
              <h2 className="font-heading font-bold text-lg text-tv-text tracking-tight truncate">LensMarket</h2>
```

- [ ] **Step 3: `app/market-pulse/page.tsx:441-442`**

```tsx
// SEBELUM
        title="Daftar Dulu untuk Lihat Ringkasan Pasar"
        body="Ringkasan Pasar butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
// SESUDAH
        title="Daftar Dulu untuk Lihat LensMarket"
        body="LensMarket butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
```

- [ ] **Step 4: Verifikasi**

Run: `grep -n "Ringkasan Pasar" app/market-pulse/page.tsx`
Expected: no match (subtitle "IDX Algorithmic Suite — diperbarui tiap 5 menit" di line 204 TIDAK diubah, tetap ada di file tapi tidak mengandung frasa ini).

Run: `grep -n "LensMarket" components/Sidebar.tsx app/market-pulse/page.tsx`
Expected: 4 match (1 di Sidebar, 3 di market-pulse).

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx app/market-pulse/page.tsx
git commit -m "feat(brand): rename Ringkasan Pasar (/market-pulse) jadi LensMarket"
```

---

### Task 3: LensTechnical + hapus wording AI kontradiktif

**Files:**
- Modify: `components/Sidebar.tsx:68`
- Modify: `app/dashboard/page.tsx:501,502,515,540,541,517,1046`
- Modify: `components/AlgoFilters.tsx:37,107`
- Modify: `app/backtest/page.tsx:205,460`
- Modify: `app/fundamental/page.tsx:411,214,476`
- Modify: `app/breakout-radar/page.tsx:264`
- Modify: `components/UserProfileModal.tsx:251`
- Modify: `app/compare/page.tsx:238`
- Modify: `app/recommendations/page.tsx:408`
- Modify: `app/market-pulse/page.tsx:432`

**Interfaces:** Tidak ada. Independen dari task lain. `app/fundamental/page.tsx:202,255` (`moduleBank="SMART AI"`, identitas halaman Fundamental Analyzer) TIDAK disentuh — hanya `app/fundamental/page.tsx:411` (h3 "Algo Filters", section terpisah) dan `:214,476` (benefit list "Unlimited Technical Analyzer") yang diubah.

- [ ] **Step 1: `components/Sidebar.tsx:68`**

```tsx
// SEBELUM
      { id: 'dashboard', name: 'Technical Analyzer', subtitle: '10 Pure Math Filters', path: '/dashboard', icon: LineChart },
// SESUDAH
      { id: 'dashboard', name: 'LensTechnical', subtitle: '10 Pure Math Filters', path: '/dashboard', icon: LineChart },
```

- [ ] **Step 2: `app/dashboard/page.tsx:501-502`** (branch error/no-data)

```tsx
// SEBELUM
          moduleTitle="Technical AI Analytics"
          moduleBank="SMART AI"
// SESUDAH
          moduleTitle="LensTechnical"
          moduleBank="LENSTECHNICAL"
```

- [ ] **Step 3: `app/dashboard/page.tsx:515`**

```tsx
// SEBELUM
          body={isTrialExpired ? "Masa trial gratis 7 hari Anda telah berakhir. Upgrade ke Pro sekarang untuk terus menggunakan fitur Smart AI dari SahamLens." : `Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map((s: string) => s.replace('.JK', '')).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}
// SESUDAH
          body={isTrialExpired ? "Masa trial gratis 7 hari Anda telah berakhir. Upgrade ke Pro sekarang untuk terus menggunakan fitur Pro dari SahamLens." : `Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map((s: string) => s.replace('.JK', '')).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 99k/bulan untuk unlimited 10 filters + LensRadar LIVE.`}
```

- [ ] **Step 4: `app/dashboard/page.tsx:540-541`** (branch normal)

```tsx
// SEBELUM
        moduleTitle="Pure Algorithmic Trading (TS Analyzers)"
        moduleBank="SMART AI"
// SESUDAH
        moduleTitle="LensTechnical — Pure Algorithmic Trading"
        moduleBank="LENSTECHNICAL"
```

- [ ] **Step 5: `app/dashboard/page.tsx:517` dan `:1046`** (dua instance benefit list di file yang sama)

```tsx
// SEBELUM
            'Unlimited Technical Analyzer (10 filter)',
// SESUDAH (replace_all di file ini, kedua baris identik)
            'Unlimited LensTechnical (10 filter)',
```

- [ ] **Step 6: `components/AlgoFilters.tsx:37`**

```tsx
// SEBELUM
          Algo Filters
// SESUDAH
          LensTechnical
```

- [ ] **Step 7: `components/AlgoFilters.tsx:107`**

```tsx
// SEBELUM
            Running AI Algorithms...
// SESUDAH
            Menjalankan Filter Teknikal...
```

- [ ] **Step 8: `app/backtest/page.tsx:205`**

```tsx
// SEBELUM
                <Settings2 className="w-5 h-5 text-tv-blue" /> Algo Filters
// SESUDAH
                <Settings2 className="w-5 h-5 text-tv-blue" /> LensTechnical
```

- [ ] **Step 9: `app/backtest/page.tsx:460`**

```tsx
// SEBELUM
          'Unlimited Technical Analyzer (10 filter)',
// SESUDAH
          'Unlimited LensTechnical (10 filter)',
```

- [ ] **Step 10: `app/fundamental/page.tsx:411`** (section "Algo Breakdown Table", terpisah dari moduleBank halaman)

```tsx
// SEBELUM
                  Algo Filters
// SESUDAH
                  LensTechnical
```

- [ ] **Step 11: `app/fundamental/page.tsx:214` dan `:476`** (dua instance benefit list, JANGAN sentuh `moduleBank="SMART AI"` di line 202/255)

```tsx
// SEBELUM
            'Unlimited Technical Analyzer (10 filter)',
// SESUDAH (replace_all di file ini — hanya baris benefit list ini yang match, moduleBank tidak match pattern ini)
            'Unlimited LensTechnical (10 filter)',
```

- [ ] **Step 12: `app/breakout-radar/page.tsx:264`**

```tsx
// SEBELUM
          'Unlimited Technical Analyzer (10 filter)',
// SESUDAH
          'Unlimited LensTechnical (10 filter)',
```

- [ ] **Step 13: `components/UserProfileModal.tsx:251`**

```tsx
// SEBELUM
        'Unlimited Technical Analyzer (10 filter)',
// SESUDAH
        'Unlimited LensTechnical (10 filter)',
```

- [ ] **Step 14: `app/compare/page.tsx:238`**

```tsx
// SEBELUM
          'Unlimited Technical Analyzer (10 filter)',
// SESUDAH
          'Unlimited LensTechnical (10 filter)',
```

- [ ] **Step 15: `app/recommendations/page.tsx:408`**

```tsx
// SEBELUM
          'Unlimited Technical Analyzer (10 filter)',
// SESUDAH
          'Unlimited LensTechnical (10 filter)',
```

- [ ] **Step 16: `app/market-pulse/page.tsx:432`**

```tsx
// SEBELUM
          'Unlimited Technical Analyzer (10 filter)',
// SESUDAH
          'Unlimited LensTechnical (10 filter)',
```

- [ ] **Step 17: Verifikasi**

Run: `grep -rn "Technical Analyzer\|Technical AI Analytics\|Pure Algorithmic Trading\|Algo Filters\|Running AI Algorithms" --include=*.tsx --include=*.ts app components`
Expected: no match (semua sudah LensTechnical).

Run: `grep -rn "SMART AI" --include=*.tsx app components`
Expected: HANYA `app/fundamental/page.tsx:202` dan `:255` (sengaja tidak disentuh, lihat Global Constraints).

- [ ] **Step 18: Commit**

```bash
git add components/Sidebar.tsx app/dashboard/page.tsx components/AlgoFilters.tsx app/backtest/page.tsx app/fundamental/page.tsx app/breakout-radar/page.tsx components/UserProfileModal.tsx app/compare/page.tsx app/recommendations/page.tsx app/market-pulse/page.tsx
git commit -m "feat(brand): rename Technical Analyzer/Algo Filters jadi LensTechnical, hapus wording AI kontradiktif"
```

---

### Task 4: LensWatch + LensAlert + perbaiki klaim Telegram palsu

**Files:**
- Modify: `components/Sidebar.tsx:88`
- Modify: `app/watchlist/page.tsx:244,282,474,558,559`
- Modify: `shared/config/pricing.ts:71`
- Modify: `modules/notification/service/alert-evaluation.service.ts:69,78,88,94`

**Interfaces:** Tidak ada. Independen dari task lain. Perubahan klaim Telegram (`pricing.ts:71`, `Sidebar.tsx:88`) WAJIB dalam commit yang sama.

- [ ] **Step 1: `components/Sidebar.tsx:88`**

```tsx
// SEBELUM
      { id: 'watchlist', name: 'Watchlist & Alerts', subtitle: 'Portfolio & Telegram Bot', path: '/watchlist', icon: Bell },
// SESUDAH
      { id: 'watchlist', name: 'LensWatch', subtitle: 'Portfolio & Notifikasi', path: '/watchlist', icon: Bell },
```

- [ ] **Step 2: `app/watchlist/page.tsx:282`**

```tsx
// SEBELUM
              <h2 className="font-heading font-bold text-xl text-white tracking-tight">Watchlist & Alerts</h2>
// SESUDAH
              <h2 className="font-heading font-bold text-xl text-white tracking-tight">LensWatch</h2>
```

- [ ] **Step 3: `app/watchlist/page.tsx:474`**

```tsx
// SEBELUM
                <Bell className="w-5 h-5 text-tv-yellow" />
                Push Notifications (HP/Browser)
// SESUDAH
                <Bell className="w-5 h-5 text-tv-yellow" />
                LensAlert
```

- [ ] **Step 4: `app/watchlist/page.tsx:244`**

```tsx
// SEBELUM
            new Notification('SahamLens Alert', {
// SESUDAH
            new Notification('SahamLens LensAlert', {
```

- [ ] **Step 5: `app/watchlist/page.tsx:558-559`**

```tsx
// SEBELUM
          'Watchlist unlimited (bukan cuma 3 saham)',
          'Alert unlimited (bukan cuma 2)',
// SESUDAH
          'LensWatch unlimited (bukan cuma 3 saham)',
          'LensAlert unlimited (bukan cuma 2)',
```

- [ ] **Step 6: `shared/config/pricing.ts:71`** (perbaikan klaim palsu + rename)

```typescript
// SEBELUM
  'Watchlist & Alert unlimited - notifikasi Telegram real-time untuk harga turun/naik dari target, RSI oversold, & konsensus STRONG BUY',
// SESUDAH
  'LensWatch & LensAlert unlimited - notifikasi in-app/browser untuk harga turun/naik dari target, RSI oversold, & konsensus STRONG BUY',
```

- [ ] **Step 7: `modules/notification/service/alert-evaluation.service.ts:69,78,88,94`**

```typescript
// SEBELUM (line 69)
        '🚨 <b>ALERT SahamLens</b>',
// SESUDAH
        '🚨 <b>SahamLens LensAlert</b>',
```

```typescript
// SEBELUM (line 78)
        '🚨 <b>ALERT SahamLens - Breakout Radar</b>',
// SESUDAH
        '🚨 <b>SahamLens LensAlert - LensRadar</b>',
```

```typescript
// SEBELUM (line 88)
        '🚨 <b>ALERT SahamLens - Market Breadth</b>',
// SESUDAH
        '🚨 <b>SahamLens LensAlert - LensMarket Breadth</b>',
```

```typescript
// SEBELUM (line 94)
      return `🚨 ALERT SahamLens: ${alert.symbol} (${alert.condition_type})`;
// SESUDAH
      return `🚨 SahamLens LensAlert: ${alert.symbol} (${alert.condition_type})`;
```

- [ ] **Step 8: Verifikasi rename**

Run: `grep -rn "Watchlist & Alerts\|Push Notifications (HP/Browser)" --include=*.tsx app components`
Expected: no match.

Run: `grep -n "ALERT SahamLens" modules/notification/service/alert-evaluation.service.ts`
Expected: no match (semua sudah "SahamLens LensAlert").

- [ ] **Step 9: Verifikasi klaim Telegram sudah konsisten**

Run: `grep -rn "Telegram" shared/config/pricing.ts components/Sidebar.tsx`
Expected: no match (kedua tempat sudah tidak menjanjikan Telegram untuk fitur alert watchlist).

Run: `grep -n "notifikasi Telegram\|Telegram Bot" -r --include=*.ts --include=*.tsx app components shared modules`
Expected: no match sama sekali di codebase Next.js (klaim ini sepenuhnya hilang, bukan cuma dipindah).

- [ ] **Step 10: Commit**

```bash
git add components/Sidebar.tsx app/watchlist/page.tsx shared/config/pricing.ts modules/notification/service/alert-evaluation.service.ts
git commit -m "$(cat <<'EOF'
feat(brand): pisah Watchlist & Alerts jadi LensWatch + LensAlert

Sekaligus perbaiki klaim palsu "notifikasi Telegram real-time" di pricing.ts dan
Sidebar subtitle - alert watchlist tidak pernah dikirim lewat Telegram (cuma
browser Notification API), Telegram di kode cuma untuk notif admin pembayaran.
EOF
)"
```

---

### Task 5: Verifikasi akhir (build, lint, typecheck, test, smoke test manual)

**Files:** tidak ada file diubah.

- [ ] **Step 1: Typecheck** — Run: `npx tsc --noEmit` — Expected: 0 error baru.
- [ ] **Step 2: Lint** — Run: `npm run lint` — Expected: 0 error baru (warning pre-existing boleh).
- [ ] **Step 3: Test** — Run: `npm test` — Expected: semua test tetap pass (185 sebelum fase ini, tidak boleh berkurang).
- [ ] **Step 4: Production build** — Run: `npm run build` — Expected: build sukses, semua route ke-generate.

- [ ] **Step 5: Grep sapu bersih lintas-task**

Run: `grep -rln "Stock Screener\|Screener AI\|Technical Analyzer\|Technical AI Analytics\|Pure Algorithmic Trading\|Algo Filters\|Running AI Algorithms\|Watchlist & Alerts\|Push Notifications (HP/Browser)\|ALERT SahamLens\b" --include=*.tsx --include=*.ts app components modules shared | grep -v __tests__`
Expected: kosong (kalau ada `ALERT SahamLens` kena juga oleh substring "SahamLens LensAlert" - pastikan pola regex yang dipakai tidak false-positive; cek manual kalau ada hit).

Run: `grep -rn "Ringkasan Pasar" --include=*.tsx app`
Expected: HANYA sisa di `components/Dashboard.tsx` (root `/`, sengaja tidak disentuh) — TIDAK ADA lagi di `app/market-pulse/page.tsx`.

- [ ] **Step 6: Smoke test manual** (`npm run dev`, buka browser)

- `/screener` — Sidebar nav "LensScanner", moduleTitle/moduleBank pill "LensScanner Multi-Factor" / "LENSSCANNER"
- `/moat` — link "LensScanner" ke `/screener`
- `/recommendations` — h2 "Rekomendasi Top 50 (LensScanner)", badge "LENSSCANNER"
- `/market-pulse` — Sidebar nav "LensMarket", h2 "LensMarket"
- `/` (root) — pastikan MASIH "Ringkasan Pasar Hari Ini" (TIDAK berubah, verifikasi negatif scope)
- `/dashboard` (ticker valid) — Sidebar nav "LensTechnical", moduleTitle/moduleBank "LensTechnical — Pure Algorithmic Trading" / "LENSTECHNICAL", card "LensTechnical" (bekas Algo Filters), coba trigger paywall modal (habiskan kuota) - body sebut "fitur Pro dari SahamLens" bukan "Smart AI"
- `/backtest` — card "LensTechnical" (bekas Algo Filters)
- `/fundamental` — moduleBank TETAP "SMART AI" (verifikasi negatif — bukan bug kalau masih ada), tapi card breakdown jadi "LensTechnical"
- `/watchlist` — Sidebar nav "LensWatch", h2 "LensWatch", card alert "LensAlert", coba tambah alert baru dan cek copy tidak menyebut Telegram di mana pun di halaman ini

Kalau ada regresi, perbaiki dengan commit fix terpisah sebelum lapor selesai.
