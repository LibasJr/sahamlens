# Visual Redesign V3 — PR 2: App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Menenangkan Sidebar, Top Market Bar, dan Running Ticker sehingga aplikasi sudah terasa berbeda sebelum satu halaman pun dibuka — dan mengembalikan ketiganya ke sistem token yang sudah dimiliki V2.

**Architecture:** Gerbang dibangun lebih dulu (Task 1) dan merah; tiga task berikutnya menghijaukannya satu berkas per task. Perilaku navigasi tidak berubah sama sekali.

**Spec:** `docs/superpowers/specs/2026-08-20-visual-redesign-v3-design.md`

## Global Constraints

Sama dengan PR 1. Tambahan khusus fase ini:

- **Tidak ada perubahan perilaku navigasi.** Rute, gerbang tamu/Pro, collapse grup, dan item `action` LensAI tetap persis. `components/__tests__/sidebar-navigation.test.ts` harus tetap hijau tanpa disunting.
- Tidak boleh menambah request. `TopMarketBar` dan `MarketTicker` memakai `shared/http/shared-market-request.ts` — jangan sentuh jalur itu.

## Baseline terukur (20 Agustus 2026)

| Berkas | Hex mati | Ukuran font arbitrer |
|---|---|---|
| `components/Sidebar.tsx` | 3 (`#090E18`, `#111A29` ×2) | 9 |
| `components/TopMarketBar.tsx` | 1 (`#080D16`) | 6 |
| `components/MarketTicker.tsx` | 0 | 4 |

Angka inilah yang harus turun ke nol.

---

### Task 1: Gerbang sistem desain shell

**Files:**
- Create: `components/__tests__/shell-design-system.test.ts`

**Interfaces:**
- Consumes: —
- Produces: gerbang yang gagal selama shell masih memuat hex mati atau ukuran font arbitrer.

- [ ] **Step 1: Tulis gerbangnya (akan merah)**

Gerbang memindai tiga berkas shell setelah membuang komentar, lalu menuntut:
1. nol hex mati,
2. nol `text-[Npx]`,
3. peran tipografi semantik benar-benar dipakai (`lens-eyebrow` untuk label grup, `lens-label`, `lens-meta`),
4. penjaga jumlah: pemindainya membaca >2000 karakter per berkas.

- [ ] **Step 2: Jalankan, pastikan merah** — `npx vitest run components/__tests__/shell-design-system.test.ts`

- [ ] **Step 3: Commit gerbangnya sendiri**

Gerbang di-commit merah lebih dulu, supaya riwayat menunjukkan apa yang sedang diperbaiki.

---

### Task 2: Sidebar

**Files:**
- Modify: `components/Sidebar.tsx`

Yang berubah (PRD §8):
- `bg-[#090E18]/98` → `bg-tv-bg/95`; tooltip `bg-[#111A29]` → `bg-tv-card`.
- `shadow-[18px_0_60px_rgba(0,0,0,0.28)]` dilepas — PRD §6 menaruh shadow di urutan terakhir hierarki, setelah whitespace, tone, dan divider.
- Border `border-white/[0.07]` → `border-tv-border`.
- Label grup: `text-xs uppercase tracking-[0.14em] text-white/50` → `lens-eyebrow text-tv-muted`. Lebih tenang, dan berhenti mengarang skala tipe kedua.
- Seluruh `text-[Npx]` → peran tipografi (`lens-label`, `lens-meta`, `lens-chip`).
- Ukuran ikon diseragamkan.

Yang **tidak** berubah: struktur `NAV_GROUPS`, `isPathActive`, `grupTerbuka`, `balikGrup`, gerbang tamu, item `action`, dan seluruh perilaku collapse.

- [ ] **Step 1: Sunting** — [ ] **Step 2:** `npx vitest run components/__tests__/sidebar-navigation.test.ts components/__tests__/shell-design-system.test.ts` — [ ] **Step 3: Commit**

---

### Task 3: TopMarketBar

**Files:**
- Modify: `components/TopMarketBar.tsx`

Yang berubah (PRD §9): satu baseline visual, harga dan persen dikelompokkan, status pasar ringkas, `bg-[#080D16]/88` → token, seluruh ukuran arbitrer → peran tipografi, tanpa tumpukan kartu.

- [ ] **Step 1: Sunting** — [ ] **Step 2:** jalankan gerbang shell + `shared-market-request.test.ts` — [ ] **Step 3: Commit**

---

### Task 4: MarketTicker

**Files:**
- Modify: `components/MarketTicker.tsx`

Yang berubah (PRD §10): tetap satu baris, pelan, teredam. Hanya token dan peran tipografi; pause hover/focus dan perilaku reduced-motion **tidak disentuh**.

- [ ] **Step 1: Sunting** — [ ] **Step 2:** jalankan gerbang shell + `market-ticker-rows.test.ts` — [ ] **Step 3: Commit**

---

### Task 5: Verifikasi PR

- [ ] `rm -rf .next && npm run verify:prod` → EXIT=0
- [ ] `npm run test:responsive` → EXIT=0
- [ ] `FRONTEND_ONLY_BASE=origin/main npm run audit:frontend-only` → PASS
- [ ] Hitung ulang baseline: hex mati dan `text-[Npx]` di tiga berkas shell harus **0**
- [ ] Buka PR ke `redesign/v3`

**Catatan jujur:** shell memakai hook router dan fetch, jadi ia tidak bisa dipotret workbench. Bukti visual fase ini bertumpu pada gerbang di atas plus QA manual — dan itu harus dinyatakan apa adanya di badan PR, bukan disamarkan.
