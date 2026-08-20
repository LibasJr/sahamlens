# PRD — SahamLens Total Visual Redesign V3
## “Calm Intelligence — Full Visual System”

**Product:** SahamLens.id  
**Tagline:** *Lihat Peluang Lebih Jelas*  
**Status:** Beta / Production  
**Scope:** Total frontend visual redesign, information hierarchy, interaction polish, responsive composition  
**Backend Scope:** **Frozen — no backend/API/database/business-logic changes**

---

## 1. Executive Summary

SahamLens sudah memiliki fondasi engineering yang matang. Redesign V2 meningkatkan hierarchy, consistency, responsive rules, request deduplication, navigation semantics, freshness, dan UX correctness, tetapi perubahan visual belum cukup besar untuk terasa sebagai redesign total.

V3 bertujuan melakukan **visual redesign total pada frontend** tanpa mengubah backend. Targetnya adalah research workspace yang lebih tenang, premium, editorial, mudah dipindai, dan terlihat berbeda secara nyata bahkan dari screenshot sebelum/sesudah.

Prinsip utama:

> **Answer first. Evidence second. Detail third.**

Tambahan untuk V3:

> **The visual hierarchy must be obvious before the user reads the copy.**

---

## 2. Hard Constraint: Backend Freeze

V3 **tidak boleh mengubah backend**.

Dilarang mengubah:
- API route contracts
- response schemas
- database schema
- migrations
- authentication
- entitlement/subscription logic
- guest limits
- rate limiting
- LensScore/scoring logic
- financial calculations
- market semantics
- request ID behavior
- data provenance/freshness semantics
- analytics schema
- LensAI server prompt/streaming/verification
- cron/scheduled jobs
- deployment topology

Frontend hanya boleh memakai data yang sudah tersedia, menyusun ulang presentation, menambah derived presentation state murni, mengubah layout, styling, responsive composition, dan UX copy non-financial.

Jika sebuah desain membutuhkan backend baru, ubah desainnya agar memakai data yang sudah tersedia.

---

## 3. Product Vision

SahamLens harus terasa seperti:

> **A calm Indonesian equities research workspace that turns complex market data into understandable, traceable insight.**

Bukan social trading app, flashy crypto terminal, generic SaaS admin dashboard, Bloomberg clone, atau chatbot generik.

Karakter visual:
- calm
- precise
- editorial
- premium
- trustworthy
- data-dense but breathable
- dark-first
- restrained

---

## 4. Visual Success Criterion

Redesign dianggap berhasil bila screenshot halaman yang sama sebelum dan sesudah V3 terlihat jelas berbeda tanpa penjelasan.

Perubahan harus terlihat pada:
- composition
- spacing
- typography hierarchy
- section rhythm
- card density
- surface treatment
- metric presentation
- tabs/navigation
- chart framing
- responsive behavior
- loading/empty/error states

Tidak cukup hanya mengganti warna, radius, atau ukuran font.

---

## 5. Core Design Principles

### 5.1 Calm Intelligence
Mayoritas UI netral; warna hanya untuk makna.

### 5.2 Insight > Raw Data
Insight dan decision-support surfaces harus punya bobot visual lebih tinggi daripada tabel mentah.

### 5.3 Fewer Containers, Stronger Composition
Kurangi card soup. Gunakan whitespace, divider, alignment, grouped rows, dan typography.

### 5.4 One Product, Many Perspectives
Technical, Fundamental, Flow, Valuation, Screener, Watchlist, LensRadar, dan LensAI harus terasa dari sistem visual yang sama.

### 5.5 Dense ≠ Crowded
Data boleh padat tetapi hierarchy harus jelas.

### 5.6 Trust Is Visible
Freshness, provenance, proxy/official state, coverage, dan request reference harus tetap terlihat.

---

## 6. Global Visual System

### Layout
Desktop:
- max content width 1440–1600px sesuai surface
- gutters 24–40px
- section rhythm 32–48px

Tablet:
- gutters 20–24px
- research-first composition

Mobile:
- gutters 16px
- no unnecessary nested cards

### Spacing
Macro: 8 / 16 / 24 / 32 / 40 / 48 / 64 / 80  
Micro: 4 / 12 / 20

### Typography
Gunakan semantic roles untuk hero title, page title, section title, lede, body, metadata, metric, metric-large, financial change, tab label.

Financial numerics menggunakan tabular numerics.

### Color
- Blue: actions/selected
- Green: positive
- Red: negative/risk
- Amber: stale/warning
- Violet: LensAI
- Neutral: default majority

Tidak ada neon/glow/gradient-heavy surfaces.

### Borders/Shadows
Prioritas hierarchy:
1. whitespace
2. background tone
3. divider
4. border bila perlu

Shadow minimal.

---

## 7. Application Shell

Target:
```text
Sidebar
Top Market Bar
Running Market Context
Main Research Canvas
```

Requirements:
- Sidebar lebih tenang.
- Active state jelas tanpa berisik.
- Top bar compact.
- Search tetap utility utama.
- IHSG + market status terbaca cepat.
- Running ticker jadi ambient context.
- Sticky layers tidak menumpuk secara visual.

---

## 8. Sidebar

IA tetap:

### UTAMA
- Beranda
- Market
- LensRadar
- Watchlist

### RISET
- Technical
- Fundamental
- Ownership
- Compare

### TOOLS
- Screener
- Valuation
- Backtest
- Risk

### INTELLIGENCE
- LensAI
- News
- Calendar
- Macro

Visual redesign:
- quieter group labels
- compact spacing
- subtle active surface
- reduced border
- consistent icon sizing
- LensAI distinct but subtle
- guest/Pro locks remain visible

No navigation behavior changes.

---

## 9. Top Market Bar

Target:
```text
[Search........................]   IHSG 8,123.45 +0.62%   Market Open   14:21   [Profile]
```

Requirements:
- one visual baseline
- price + percent grouped
- compact market status
- no card stack
- no glow
- graceful mobile compression

---

## 10. Running Market Context

Keep the running ticker.

Target:
```text
BBCA 9,725 +1.30% · BBRI 4,820 -0.42% · BMRI 6,400 +0.55% · TLKM 3,150 +0.81%
```

Requirements:
- one row
- slow
- subtle
- pause hover/focus
- reduced-motion static horizontal scroller
- semantic green/red only
- no gradient/glow

---

## 11. Homepage — Total Redesign

Hierarchy:
```text
Hero
↓
Market Snapshot
↓
Hari Ini
↓
Peluang & Risiko
↓
LensRadar
↓
Watchlist
↓
Calendar / News
↓
Deep Market Evidence
```

Homepage harus terasa editorial, bukan grid dashboard.

---

## 12. Homepage Hero

Required headline:

# Lihat Peluang
# Lebih Jelas.

Supporting copy:

> Riset saham Indonesia dengan data, konteks pasar, dan intelligence yang dapat ditelusuri.

Search adalah primary interaction.

Hero harus compact, confident, product-first, dan tidak terlihat seperti landing page SaaS.

No giant empty hero, multiple competing CTAs, purple glow, atau decorative illustration wajib.

---

## 13. Market Snapshot

Gunakan horizontal metric band, bukan empat card.

Example:
```text
IHSG                Breadth              Regime              LensRadar
8,123.45            62%                  Constructive        8 candidates
+0.62%              Healthy
```

No additional requests. Mobile menjadi 2×2.

---

## 14. Hari Ini

Harus menjadi visual anchor utama setelah hero.

Target:
```text
Hari ini

Market cukup konstruktif
Breadth positif dan momentum membaik, namun beberapa sektor mulai extended.

Peluang                                 Risiko
BBCA       82  Momentum ↑               USD/IDR menguat
ANTM       78  Breakout forming         Banking extended
TLKM       74  Flow improving           Foreign sell selective
```

Use fewer cards, stronger title/lede, lightweight rows.

---

## 15. LensRadar Homepage

Curated list 3–5 candidates, bukan mini terminal.

Example:
```text
BBCA
82
Momentum ↑
Foreign flow improving
```

CTA: **Lihat semua peluang**

No new API calls.

---

## 16. Watchlist Homepage

Compact research rows.

Desktop:
```text
BBCA        9,725    +1.30%     Lens 82      Fresh 2m
BBRI        4,820    -0.42%     Lens 76      Fresh 4m
```

Mobile: stacked, no card-heavy layout.

---

## 17. Stock Detail — Highest Priority

Target first viewport:
```text
BBCA
Bank Central Asia Tbk

9,725
+125  +1.30%

Lens Score
82 / 100
Positive

Technical 86    Fundamental 84    Flow 76

Updated 2m ago · Coverage 92%

Yang penting dari BBCA

↑ Momentum membaik
  Harga bertahan di atas MA20 dan volume menguat.

↑ Foreign accumulation
  Flow positif dalam beberapa sesi terakhir.

→ Valuasi relatif tinggi
  Masih di atas median historis.
```

Then:
```text
Technical  Fundamental  Flow  Valuation
────────────────────────────────────────
[Chart / Evidence]
```

Requirements:
- summary visually dominates chart
- price + LensScore form one composition
- sub-scores are not separate cards
- findings use editorial rows
- freshness/coverage visible but subdued
- no fabricated narrative
- no scoring changes

---

## 18. Technical / Fundamental / Flow

Unify their visual language.

Technical order:
1. summary
2. chart
3. trend/momentum
4. support/resistance
5. volume
6. indicators
7. evidence/detail

Fundamental:
- identity
- health summary
- financial trends
- analyzers

Flow:
- summary
- source/provenance
- detailed evidence

Keep existing bank-specific interpretation and official/proxy behavior.

---

## 19. Screener

No backend/filter behavior changes.

Desktop/tablet:
- full table from `md`
- sticky ticker columns
- compact density
- calmer header
- logical filters

Mobile:
- simplified list/cards
- primary metrics
- easy filters/reset

Existing responsive contract must remain.

---

## 20. LensAI Research

Frontend redesign only.

Do not change server prompt, NDJSON streaming, verification, rate limits, or guest quota.

Improve:
- contextual title
- starter prompt presentation
- message hierarchy
- evidence treatment
- request-ID error reference
- spacing/reading width

Violet may be used subtly.

---

## 21. Watchlist

Desktop: compact research rows.  
Mobile: actual price + freshness must remain visible.

Preserve add/remove/alert/P&L/LensScore behavior.

---

## 22. Loading / Empty / Error

Loading:
- structure-matching skeletons
- no giant center spinner

Empty:
differentiate valid empty result vs failed load.

Error:
show Request ID when available:
```text
Data belum dapat dimuat.
Coba lagi beberapa saat.

Reference
SL-8f93ac
[Copy]
```

No backend contract changes.

---

## 23. Responsive Requirements

Validate at:
- 375px
- 430px
- 768px
- 1024px
- 1280px
- 1440px+

Mobile:
- 16px gutters
- no giant hero
- 44px touch targets
- horizontal tabs
- critical price visible
- useful chart sizing

Tablet:
- research-first
- Screener table from md
- no forced mobile composition

Desktop:
- stronger whitespace
- aligned financial metrics
- editorial hierarchy

---

## 24. Accessibility

Required:
- WCAG AA
- focus-visible
- keyboard navigation
- semantic headings
- correct table semantics
- reduced motion
- touch >=44px
- status not communicated only by color

---

## 25. Performance Guardrails

The redesign must not:
- add market requests
- add auth requests
- add duplicate endpoint calls
- break current request dedupe
- load heavy charts earlier
- materially increase bundle size without justification

Existing shared request behavior must remain.

---

## 26. Analytics

Do not change analytics schema.

Preserve all current instrumentation and event dispatches.

---

## 27. Implementation Phases

### Phase 0 — Baseline
Run current verification; inspect homepage, stock detail, shell, Technical, Fundamental, Flow, Screener, Watchlist, LensAI.

### Phase 1 — Design Primitives
Typography, spacing, section header, metric band, insight row, research tabs, status meta, skeleton.

### Phase 2 — App Shell
Sidebar, Top Market Bar, ticker, page container.

### Phase 3 — Homepage
End-to-end visual redesign.

### Phase 4 — Stock Detail
Hero, LensScore composition, findings, navigation, chart framing.

### Phase 5 — Research Surfaces
Technical, Fundamental, Flow, Valuation, Screener, Watchlist.

### Phase 6 — LensAI
Frontend presentation only.

### Phase 7 — Responsive & Accessibility
375 / 430 / 768 / 1024 / 1440.

### Phase 8 — Verification
Run all existing gates.

---

## 28. Explicit Non-Goals

Do not:
- rewrite backend
- create new API endpoints
- add migrations
- change DB schema
- change auth
- change scoring
- change entitlement
- change rate limits
- change analytics schema
- change LensAI backend
- add new financial calculations
- add fake data
- refactor unrelated backend modules

---

## 29. Acceptance Criteria

V3 complete when:
- [ ] Homepage visibly different from V2.
- [ ] App shell feels redesigned, not merely restyled.
- [ ] Hero compact and premium.
- [ ] Market snapshot typography-led, not card-led.
- [ ] Hari Ini visually dominant.
- [ ] Running ticker remains calm.
- [ ] Stock first viewport clearly redesigned.
- [ ] Price + LensScore + findings form one composition.
- [ ] Technical/Fundamental/Flow feel like one product.
- [ ] Card density materially lower.
- [ ] Mobile does not feel like shrunk desktop.
- [ ] Tablet remains research-capable.
- [ ] Screener md-table contract passes.
- [ ] Reduced motion works.
- [ ] Trust/freshness/provenance remains visible.
- [ ] LensAI streaming works.
- [ ] No backend/API/schema changes.
- [ ] No unnecessary new network requests.
- [ ] Analytics preserved.
- [ ] typecheck PASS.
- [ ] lint PASS.
- [ ] tests PASS.
- [ ] responsive tests PASS.
- [ ] production build PASS.
- [ ] repository audits PASS.

---

## 30. Definition of Done

SahamLens should no longer feel like a collection of dashboards and tools. It should feel like one coherent research product.

Final experience:

# Lihat peluang.
# Pahami alasannya.
# Periksa buktinya.

Visual standard:

**calm enough to trust, structured enough to scan, dense enough to research, and distinct enough to feel redesigned.**
