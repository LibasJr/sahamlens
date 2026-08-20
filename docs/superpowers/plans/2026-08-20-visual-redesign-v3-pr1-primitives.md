# Visual Redesign V3 — PR 1: Primitif, Workbench, dan Gerbang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun lima primitif komposisi, sebuah visual workbench yang bisa dipotret, dan dua gerbang yang menjaga sembilan PR berikutnya — tanpa mengubah satu pun tampilan aplikasi.

**Architecture:** Setiap primitif dipecah menjadi fungsi murni (dapat diuji sungguhan) plus JSX tipis. Komponen diuji lewat `renderToStaticMarkup` dari `react-dom/server`, bukan sekadar `toBeDefined()` — repo ini tidak punya jsdom, tetapi render ke string sudah cukup untuk menegakkan invarian markup. Workbench merender seluruh primitif di satu halaman non-produksi yang dipotret Playwright di tiga lebar.

**Tech Stack:** Next.js 16 (App Router), React 18, TypeScript, Tailwind 3, Vitest 4, Playwright, `cn()` (clsx + tailwind-merge).

**Spec:** `docs/superpowers/specs/2026-08-20-visual-redesign-v3-design.md`

## Global Constraints

- **Backend beku.** Dilarang menyentuh `app/api/**`, `modules/**/repository/**`, `modules/**/service/**`, `database/migrations/**`, `shared/auth/**`, `shared/http/**`. Task 1 membangun gerbang yang menegakkannya.
- **PR ini tidak boleh mengubah tampilan aplikasi.** Primitif dibuat dan diuji, tetapi belum dipakai permukaan mana pun. Perubahan visual dimulai di PR 2.
- Semua teks yang dilihat pengguna berbahasa Indonesia.
- Peran tipografi memakai kelas yang sudah ada: `lens-eyebrow`, `lens-section-title`, `lens-page-title`, `lens-body`, `lens-body-sm`, `lens-label`, `lens-meta`, `lens-metric`, `lens-metric-lg`, `lens-chip`. **Jangan membuat ukuran font arbitrer.**
- Warna hanya lewat token `tv-*` (`text-tv-text`, `text-tv-muted`, `text-tv-green`, `text-tv-red`, `text-tv-yellow`, `text-tv-blue`, `border-tv-border`). **Tidak ada hex mati.**
- Target sentuh kontrol interaktif minimal 44px di **semua** lebar (`min-h-11`).
- Komponen presentasi menerima keadaan lewat props. Tidak boleh memanggil `usePathname`, `fetch`, atau storage.
- Verifikasi akhir PR: `npm run verify:prod` dan `npm run test:responsive` keduanya EXIT=0.

---

### Task 1: Gerbang backend-freeze dan pemicu CI

**Files:**
- Create: `scripts/audit-frontend-only.mjs`
- Create: `__tests__/frontend-only-audit.test.ts`
- Modify: `package.json` (tambah script `audit:frontend-only`)
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: —
- Produces: perintah `npm run audit:frontend-only`; keluar kode 0 (lolos) atau 1 (ada berkas backend tersentuh). Menerima env `FRONTEND_ONLY_BASE` (default `origin/main`).

- [ ] **Step 1: Tulis test yang gagal**

Buat `__tests__/frontend-only-audit.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'audit-frontend-only.mjs');

/**
 * Sembilan PR lintas beberapa hari. Larangan menyentuh backend yang hanya hidup di
 * dokumen akan dilanggar tanpa ada yang menyadarinya - dan pelanggarannya justru paling
 * mungkin terjadi saat seseorang sedang buru-buru menyelesaikan satu tampilan.
 */
function jalankan(files: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, '--files', files.join('\n')], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('audit frontend-only', () => {
  it('skripnya ada', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it('meloloskan perubahan frontend', () => {
    const hasil = jalankan([
      'components/ui/SectionHeader.tsx',
      'app/globals.css',
      'shared/presentation/panel-result.ts',
    ]);
    expect(hasil.code).toBe(0);
  });

  it.each([
    'app/api/stock/[ticker]/route.ts',
    'modules/user/repository/user.repository.ts',
    'modules/technical/service/quote-summary.ts',
    'database/migrations/011_apa_saja.sql',
    'shared/auth/session.ts',
    'shared/http/api-client.ts',
  ])('menolak %s', (file) => {
    const hasil = jalankan([file]);
    expect(hasil.code).toBe(1);
    expect(hasil.out).toContain(file);
  });

  it('menyebut path pelanggarnya, bukan sekadar gagal', () => {
    // Gerbang yang cuma bilang "gagal" memaksa orang menebak; yang menyebut berkasnya
    // menyelesaikan percakapan dalam satu baris.
    const hasil = jalankan(['components/ui/SectionHeader.tsx', 'shared/auth/session.ts']);
    expect(hasil.out).toContain('shared/auth/session.ts');
    expect(hasil.out).not.toContain('components/ui/SectionHeader.tsx');
  });

  it('memakai pemisah path gaya posix di Windows', () => {
    // path.relative mengembalikan `app\api\...` di Windows; tanpa normalisasi, gerbang
    // ini menandai SETIAP berkas atau tidak satu pun - dan keduanya tidak memeriksa apa pun.
    const source = fs.readFileSync(SCRIPT, 'utf8');
    expect(source).toContain("split(path.sep).join('/')");
  });
}, 30_000);
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run __tests__/frontend-only-audit.test.ts`
Expected: FAIL — skrip belum ada.

- [ ] **Step 3: Tulis skripnya**

Buat `scripts/audit-frontend-only.mjs`:

```js
#!/usr/bin/env node
/**
 * Menolak perubahan backend selama Visual Redesign V3.
 *
 * KENAPA ADA. V3 mendarat lewat sembilan PR berturut-turut dengan satu aturan tunggal:
 * backend beku. Aturan yang hanya tertulis di PRD akan dilanggar tanpa ada yang
 * menyadarinya - biasanya oleh satu perubahan "kecil" di service saat sebuah tampilan
 * membutuhkan bentuk data yang sedikit berbeda. Kalau itu terjadi, PRD-nya sudah tidak
 * berlaku dan tidak ada yang tahu kapan berhentinya.
 *
 * Ini gerbang, bukan pengingat: kalau memang ada alasan sah menyentuh backend, ia memaksa
 * percakapan alih-alih diam.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const BEKU = [
  'app/api/',
  'modules/',            // repository & service; lihat PENGECUALIAN di bawah
  'database/migrations/',
  'shared/auth/',
  'shared/http/',
];

/** Bagian `modules/` yang murni presentasi tetap boleh disentuh. */
const PENGECUALIAN = [
  'modules/eligibility/presentation',
];

function berkasBerubah() {
  const arg = process.argv.indexOf('--files');
  if (arg !== -1 && process.argv[arg + 1]) {
    return process.argv[arg + 1].split('\n').filter(Boolean);
  }
  const base = process.env.FRONTEND_ONLY_BASE || 'origin/main';
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

// path.relative dan output git bisa memakai pemisah OS. Tanpa normalisasi, daftar
// ber-'/' di atas tidak pernah cocok di Windows dan gerbang ini lulus tanpa memeriksa.
const files = berkasBerubah().map((f) => f.split(path.sep).join('/'));

const pelanggar = files.filter((file) => {
  if (PENGECUALIAN.some((izin) => file.startsWith(izin))) return false;
  if (file.startsWith('modules/')) {
    return /\/(repository|service)\//.test(file);
  }
  return BEKU.some((beku) => beku !== 'modules/' && file.startsWith(beku));
});

console.log('SahamLens Frontend-Only Audit');
console.log(`Berkas diperiksa: ${files.length}`);

if (pelanggar.length > 0) {
  console.error('FAIL: Visual Redesign V3 membekukan backend, tetapi berkas berikut berubah:');
  for (const file of pelanggar) console.error(`  ${file}`);
  console.error('');
  console.error('Kalau sebuah ide visual menuntut backend: ubah idenya, bukan backend-nya.');
  console.error('Kalau perubahan ini memang perlu, keluarkan dari PR redesign dan bahas terpisah.');
  process.exit(1);
}

console.log('PASS: tidak ada berkas backend yang tersentuh.');
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run __tests__/frontend-only-audit.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Daftarkan script npm**

Di `package.json`, tepat setelah baris `"audit:adoption"`, tambahkan:

```json
    "audit:frontend-only": "node scripts/audit-frontend-only.mjs",
```

- [ ] **Step 6: Picu CI pada branch redesign**

Di `.github/workflows/ci.yml`, ganti blok `on:` menjadi:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    # `redesign/**` ikut dipicu karena PR ke base selain main TIDAK menjalankan CI sama
    # sekali - dan nol check terbaca persis seperti hijau di daftar PR (terukur PR #70,
    # 20 Agustus 2026). Visual Redesign V3 mendarat lewat sembilan PR ke redesign/v3.
    branches: [main, 'redesign/**']
```

Lalu tambahkan job baru **di akhir berkas**, setelah job `responsive`:

```yaml
  # Backend beku selama Visual Redesign V3. Hanya berjalan untuk PR yang menargetkan
  # branch redesign - PR biasa ke main memang boleh menyentuh backend.
  frontend-only:
    if: startsWith(github.base_ref, 'redesign/')
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run audit:frontend-only
        env:
          FRONTEND_ONLY_BASE: origin/${{ github.base_ref }}
```

- [ ] **Step 7: Commit**

```bash
git add scripts/audit-frontend-only.mjs __tests__/frontend-only-audit.test.ts package.json .github/workflows/ci.yml
git commit -m "feat: gate the V3 backend freeze instead of trusting it"
```

---

### Task 2: SectionHeader

**Files:**
- Create: `components/ui/SectionHeader.tsx`
- Create: `components/ui/__tests__/section-header.test.tsx`
- Modify: `components/ui/index.ts`

**Interfaces:**
- Consumes: `cn` dari `@/lib/utils/cn`
- Produces:
  ```ts
  interface SectionHeaderProps {
    eyebrow?: string;
    title: string;
    lede?: string;
    action?: React.ReactNode;
    id?: string;
    as?: 'h2' | 'h3';
    className?: string;
  }
  export function SectionHeader(props: SectionHeaderProps): JSX.Element;
  ```

- [ ] **Step 1: Tulis test yang gagal**

Buat `components/ui/__tests__/section-header.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SectionHeader } from '../SectionHeader';

/**
 * Repo ini tidak punya jsdom, tapi render ke string sudah cukup untuk menegakkan
 * invarian markup - dan jauh lebih bernilai daripada `expect(Komponen).toBeDefined()`,
 * yang lulus bahkan ketika komponennya merender halaman kosong.
 */
const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('SectionHeader', () => {
  it('merender judul sebagai heading', () => {
    const html = render(<SectionHeader title="Arus dana asing" />);
    expect(html).toContain('<h2');
    expect(html).toContain('Arus dana asing');
  });

  it('menghilangkan eyebrow dan lede saat tidak diberikan', () => {
    const html = render(<SectionHeader title="Judul" />);
    expect(html).not.toContain('lens-eyebrow');
    expect(html).not.toContain('lens-body');
  });

  it('menampilkan eyebrow dan lede saat diberikan', () => {
    const html = render(<SectionHeader eyebrow="Flow" title="Arus dana asing" lede="Net asing dan partisipasi." />);
    expect(html).toContain('Flow');
    expect(html).toContain('Net asing dan partisipasi.');
  });

  it('memakai peran tipografi, bukan ukuran arbitrer', () => {
    // Kalau seseorang mengganti ini dengan text-[15px], skala tipe berhenti jadi kontrak.
    const html = render(<SectionHeader eyebrow="Flow" title="Judul" lede="Lede." />);
    expect(html).toContain('lens-eyebrow');
    expect(html).toContain('lens-section-title');
    expect(html).toContain('lens-body-sm');
    expect(html).not.toMatch(/text-\[\d/);
  });

  it('menghormati as="h3" untuk sub-bagian', () => {
    const html = render(<SectionHeader title="Sub" as="h3" />);
    expect(html).toContain('<h3');
    expect(html).not.toContain('<h2');
  });

  it('menautkan id ke heading supaya jangkar mendarat di judul', () => {
    // Jangkar yang mendarat di pembungkus membuat judulnya tertutup header sticky.
    const html = render(<SectionHeader title="Arus dana" id="lens-flow" />);
    expect(html).toMatch(/<h2[^>]*id="lens-flow"/);
  });

  it('merender action di sisi kanan tanpa membungkusnya jadi kartu', () => {
    const html = render(<SectionHeader title="Judul" action={<a href="/x">Lihat semua</a>} />);
    expect(html).toContain('Lihat semua');
    expect(html).not.toContain('rounded-xl border');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run components/ui/__tests__/section-header.test.tsx`
Expected: FAIL — modul `../SectionHeader` tidak ditemukan.

- [ ] **Step 3: Tulis komponennya**

Buat `components/ui/SectionHeader.tsx`:

```tsx
import React from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Kepala sebuah bagian riset: eyebrow, judul, lede, dan satu aksi opsional.
 *
 * Pola ini sebelumnya disalin tangan di halaman technical, blok Flow, dan Hari Ini -
 * tiga salinan yang bebas menyimpang satu sama lain. Menyatukannya membuat ritme antar
 * bagian menjadi properti sistem, bukan hasil kebetulan.
 *
 * BUKAN kartu. Bagian dipisahkan oleh whitespace dan tipografi (PRD SEC.5.3); membungkus
 * tiap kepala bagian dengan border justru menambah densitas kartu yang sedang dikurangi.
 */
interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: React.ReactNode;
  /** Dipasang pada headingnya, bukan pembungkusnya, supaya jangkar mendarat di judul. */
  id?: string;
  as?: 'h2' | 'h3';
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  lede,
  action,
  id,
  as = 'h2',
  className,
}: SectionHeaderProps) {
  const Heading = as;

  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-1', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="lens-eyebrow mb-1 text-tv-muted">{eyebrow}</div>
        )}
        <Heading id={id} className={cn('lens-anchor-offset', as === 'h2' ? 'lens-section-title' : 'lens-label text-tv-text')}>
          {title}
        </Heading>
        {lede && <p className="lens-body-sm mt-1 max-w-2xl text-tv-muted">{lede}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run components/ui/__tests__/section-header.test.tsx`
Expected: PASS (7 test).

- [ ] **Step 5: Ekspor lewat barrel**

Di `components/ui/index.ts`, tambahkan setelah baris `export { ApiErrorHint } from './ApiErrorHint';`:

```ts
export { SectionHeader } from './SectionHeader';
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/SectionHeader.tsx components/ui/__tests__/section-header.test.tsx components/ui/index.ts
git commit -m "feat: add SectionHeader primitive"
```

---

### Task 3: MetricBand

**Files:**
- Create: `components/ui/MetricBand.tsx`
- Create: `components/ui/__tests__/metric-band.test.tsx`
- Modify: `components/ui/index.ts`

**Interfaces:**
- Consumes: `cn`
- Produces:
  ```ts
  export interface MetricBandItem {
    label: string;
    value: string | null;
    /** Baris kedua opsional: delta, status, atau keterangan singkat. */
    detail?: string;
    tone?: 'neutral' | 'positive' | 'negative' | 'caution';
    /** Ditampilkan saat value null. Bawaan: 'belum ada data'. */
    emptyHint?: string;
  }
  export function MetricBand(props: { items: MetricBandItem[]; className?: string }): JSX.Element;
  ```

- [ ] **Step 1: Tulis test yang gagal**

Buat `components/ui/__tests__/metric-band.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MetricBand } from '../MetricBand';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('MetricBand', () => {
  it('merender setiap metrik dengan label dan nilainya', () => {
    const html = render(<MetricBand items={[
      { label: 'IHSG', value: '8.123,45', detail: '+0,62%', tone: 'positive' },
      { label: 'Breadth', value: '62%', detail: 'Healthy' },
    ]} />);

    expect(html).toContain('IHSG');
    expect(html).toContain('8.123,45');
    expect(html).toContain('Breadth');
    expect(html).toContain('Healthy');
  });

  it('bukan deretan kartu', () => {
    // PRD SEC.13: band, bukan empat kartu. Kalau ini berubah jadi kartu, seluruh alasan
    // primitif ini ada ikut hilang.
    const html = render(<MetricBand items={[{ label: 'IHSG', value: '8.123' }]} />);
    expect(html).not.toContain('bg-tv-card');
    expect(html).not.toMatch(/rounded-(xl|2xl)[^"]*border/);
  });

  it('memakai angka tabular supaya kolom tidak bergoyang', () => {
    const html = render(<MetricBand items={[{ label: 'IHSG', value: '8.123' }]} />);
    expect(html).toContain('lens-metric');
  });

  it('menyatakan data kosong, bukan menampilkan strip polos', () => {
    // "-" tidak memberi tahu apakah datanya belum ada atau gagal dimuat.
    const html = render(<MetricBand items={[{ label: 'Regime', value: null }]} />);
    expect(html).toContain('belum ada data');
    expect(html).not.toContain('>-<');
  });

  it('menghormati emptyHint khusus', () => {
    const html = render(<MetricBand items={[{ label: 'Regime', value: null, emptyHint: 'butuh akun Pro' }]} />);
    expect(html).toContain('butuh akun Pro');
  });

  it('mewarnai tone lewat token, bukan hex', () => {
    const html = render(<MetricBand items={[
      { label: 'A', value: '1', tone: 'positive' },
      { label: 'B', value: '2', tone: 'negative' },
      { label: 'C', value: '3', tone: 'caution' },
    ]} />);

    expect(html).toContain('text-tv-green');
    expect(html).toContain('text-tv-red');
    expect(html).toContain('text-tv-yellow');
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('menjadi 2 kolom di ponsel dan sebaris di layar lebar', () => {
    // PRD SEC.13: mobile 2x2.
    const html = render(<MetricBand items={[
      { label: 'A', value: '1' }, { label: 'B', value: '2' },
      { label: 'C', value: '3' }, { label: 'D', value: '4' },
    ]} />);
    expect(html).toContain('grid-cols-2');
    expect(html).toMatch(/(sm|md):grid-cols-4/);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run components/ui/__tests__/metric-band.test.tsx`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Tulis komponennya**

Buat `components/ui/MetricBand.tsx`:

```tsx
import React from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Deret metrik yang dibaca sebagai satu baris konteks, bukan sebagai empat objek terpisah.
 *
 * `MetricCard` yang sudah ada adalah KARTU - tepat untuk metrik yang berdiri sendiri dan
 * bisa diklik. Band ini kebalikannya: angka-angka yang hanya punya arti bersama-sama
 * (IHSG, breadth, regime, kandidat radar), jadi membungkus masing-masing dengan border
 * justru memutus hubungan yang ingin ditunjukkan (PRD SEC.13).
 */
export interface MetricBandItem {
  label: string;
  /** null berarti datanya memang belum ada - band menyatakan itu, bukan menulis "-". */
  value: string | null;
  detail?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'caution';
  emptyHint?: string;
}

const TONE: Record<NonNullable<MetricBandItem['tone']>, string> = {
  neutral: 'text-tv-text',
  positive: 'text-tv-green',
  negative: 'text-tv-red',
  caution: 'text-tv-yellow',
};

export function MetricBand({ items, className }: { items: MetricBandItem[]; className?: string }) {
  return (
    <div
      className={cn(
        // 2 kolom di ponsel (PRD SEC.13), sebaris begitu ada ruang. Dipisah divider tipis,
        // bukan kartu - hubungan antar angka justru yang ingin terbaca.
        'grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <div className="lens-label mb-1 truncate text-tv-muted">{item.label}</div>
          {item.value === null ? (
            <div className="lens-body-sm text-tv-muted">{item.emptyHint ?? 'belum ada data'}</div>
          ) : (
            <div className={cn('lens-metric', TONE[item.tone ?? 'neutral'])}>{item.value}</div>
          )}
          {item.detail && item.value !== null && (
            <div className={cn('lens-meta mt-0.5', TONE[item.tone ?? 'neutral'])}>{item.detail}</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run components/ui/__tests__/metric-band.test.tsx`
Expected: PASS (7 test).

- [ ] **Step 5: Ekspor lewat barrel**

```ts
export { MetricBand, type MetricBandItem } from './MetricBand';
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/MetricBand.tsx components/ui/__tests__/metric-band.test.tsx components/ui/index.ts
git commit -m "feat: add MetricBand primitive"
```

---

### Task 4: InsightRow

**Files:**
- Create: `components/ui/InsightRow.tsx`
- Create: `components/ui/__tests__/insight-row.test.tsx`
- Modify: `components/ui/index.ts`

**Interfaces:**
- Consumes: `cn`
- Produces:
  ```ts
  export type InsightDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  export function InsightRow(props: {
    direction: InsightDirection;
    title: string;
    detail?: string;
    source?: string;
    className?: string;
  }): JSX.Element;
  ```

- [ ] **Step 1: Tulis test yang gagal**

Buat `components/ui/__tests__/insight-row.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InsightRow } from '../InsightRow';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('InsightRow', () => {
  it('merender judul dan penjelasannya', () => {
    const html = render(<InsightRow direction="BULLISH" title="Momentum membaik" detail="Harga bertahan di atas MA20." />);
    expect(html).toContain('Momentum membaik');
    expect(html).toContain('Harga bertahan di atas MA20.');
  });

  it('tidak pernah menyampaikan arah hanya lewat warna', () => {
    // WCAG 1.4.1 dan PRD SEC.24: status tidak boleh dibedakan warna saja. Panah adalah
    // bentuk, dan teks sr-only menamainya untuk pembaca layar.
    const bullish = render(<InsightRow direction="BULLISH" title="A" />);
    const bearish = render(<InsightRow direction="BEARISH" title="B" />);

    expect(bullish).toContain('↑');
    expect(bearish).toContain('↓');
    expect(bullish).toContain('sr-only');
    expect(bullish).toContain('condong positif');
    expect(bearish).toContain('condong negatif');
  });

  it('memakai token warna untuk tiap arah', () => {
    expect(render(<InsightRow direction="BULLISH" title="A" />)).toContain('text-tv-green');
    expect(render(<InsightRow direction="BEARISH" title="A" />)).toContain('text-tv-red');
    expect(render(<InsightRow direction="NEUTRAL" title="A" />)).toContain('text-tv-muted');
  });

  it('menampilkan sumber sebagai metadata, bukan judul kedua', () => {
    const html = render(<InsightRow direction="NEUTRAL" title="Valuasi tinggi" source="Analyzer PER" />);
    expect(html).toContain('Analyzer PER');
    expect(html).toContain('lens-meta');
  });

  it('bukan kartu', () => {
    // Tiga sampai lima temuan berturut-turut sebagai kartu akan menjadi dinding kotak.
    const html = render(<InsightRow direction="BULLISH" title="A" detail="B" />);
    expect(html).not.toContain('bg-tv-card');
  });

  it('menghilangkan detail dan sumber saat tidak ada', () => {
    const html = render(<InsightRow direction="NEUTRAL" title="Hanya judul" />);
    expect(html).toContain('Hanya judul');
    expect(html).not.toContain('lens-meta');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run components/ui/__tests__/insight-row.test.tsx`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Tulis komponennya**

Buat `components/ui/InsightRow.tsx`:

```tsx
import React from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Satu temuan: arah, judul bahasa biasa, penjelasan, dan analyzer yang memilihnya.
 *
 * Bentuk "Yang penting dari [ticker]" (PRD SEC.17). Baris, bukan kartu: tiga sampai lima
 * temuan berturut-turut sebagai kartu menjadi dinding kotak, dan yang harus menonjol
 * adalah temuannya - bukan wadahnya.
 */
export type InsightDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/** Simbol SELALU didampingi teks arah di `sr-only`: status tidak pernah hanya lewat warna,
 *  dan tidak pernah hanya lewat bentuk (WCAG 1.4.1, PRD SEC.24). */
const ARAH: Record<InsightDirection, { simbol: string; tone: string; teks: string }> = {
  BULLISH: { simbol: '↑', tone: 'text-tv-green', teks: 'condong positif' },
  BEARISH: { simbol: '↓', tone: 'text-tv-red', teks: 'condong negatif' },
  NEUTRAL: { simbol: '→', tone: 'text-tv-muted', teks: 'netral' },
};

export function InsightRow({
  direction,
  title,
  detail,
  source,
  className,
}: {
  direction: InsightDirection;
  title: string;
  detail?: string;
  source?: string;
  className?: string;
}) {
  const arah = ARAH[direction];

  return (
    <div className={cn('flex gap-3 py-2.5', className)}>
      <span className={cn('lens-metric shrink-0 leading-none', arah.tone)} aria-hidden="true">
        {arah.simbol}
      </span>
      <div className="min-w-0">
        <div className="lens-label text-tv-text">
          {title}
          <span className="sr-only"> — {arah.teks}</span>
        </div>
        {detail && <p className="lens-body-sm mt-0.5 text-tv-muted">{detail}</p>}
        {source && <div className="lens-meta mt-1 text-tv-muted/70">{source}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run components/ui/__tests__/insight-row.test.tsx`
Expected: PASS (6 test).

- [ ] **Step 5: Ekspor lewat barrel**

```ts
export { InsightRow, type InsightDirection } from './InsightRow';
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/InsightRow.tsx components/ui/__tests__/insight-row.test.tsx components/ui/index.ts
git commit -m "feat: add InsightRow primitive"
```

---

### Task 5: StatusMeta

**Files:**
- Create: `components/ui/StatusMeta.tsx`
- Create: `components/ui/__tests__/status-meta.test.tsx`
- Modify: `components/ui/index.ts`

**Interfaces:**
- Consumes: `cn`
- Produces:
  ```ts
  export interface StatusMetaItem {
    label: string;
    tone?: 'neutral' | 'caution';
    title?: string;
  }
  export function StatusMeta(props: { items: StatusMetaItem[]; className?: string }): JSX.Element | null;
  ```

- [ ] **Step 1: Tulis test yang gagal**

Buat `components/ui/__tests__/status-meta.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusMeta } from '../StatusMeta';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe('StatusMeta', () => {
  it('merender tiap keterangan dipisah pemisah', () => {
    const html = render(<StatusMeta items={[
      { label: 'Diperbarui 16:15 WIB' },
      { label: 'Coverage 92%' },
    ]} />);

    expect(html).toContain('Diperbarui 16:15 WIB');
    expect(html).toContain('Coverage 92%');
    expect(html).toContain('·');
  });

  it('menandai keterangan caution dengan token amber', () => {
    // STALE harus tetap terbaca sebagai peringatan, bukan sekadar teks abu-abu.
    const html = render(<StatusMeta items={[{ label: 'Data mungkin tertunda', tone: 'caution' }]} />);
    expect(html).toContain('text-tv-yellow');
  });

  it('meneruskan title sebagai penjelasan hover', () => {
    const html = render(<StatusMeta items={[{ label: 'Tertunda', tone: 'caution', title: 'Bar terakhir 18 Agu 16:15 WIB' }]} />);
    expect(html).toContain('title="Bar terakhir 18 Agu 16:15 WIB"');
  });

  it('tidak merender apa pun saat daftarnya kosong', () => {
    // Baris pemisah yang menggantung di bawah judul terlihat seperti kerusakan.
    expect(render(<StatusMeta items={[]} />)).toBe('');
  });

  it('memakai peran metadata, bukan ukuran arbitrer', () => {
    const html = render(<StatusMeta items={[{ label: 'Coverage 92%' }]} />);
    expect(html).toContain('lens-meta');
    expect(html).not.toMatch(/text-\[\d/);
  });

  it('pemisah tidak dibacakan pembaca layar', () => {
    const html = render(<StatusMeta items={[{ label: 'A' }, { label: 'B' }]} />);
    expect(html).toMatch(/aria-hidden="true"[^>]*>·|·[^<]*<\/span>/);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run components/ui/__tests__/status-meta.test.tsx`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Tulis komponennya**

Buat `components/ui/StatusMeta.tsx`:

```tsx
import React from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Baris kepercayaan: umur data, cakupan, dan asal sumber dalam satu baris tenang.
 *
 * Presentasi murni. Ia merender keluaran `describeFreshness()`
 * (shared/presentation/freshness-labels.ts) - keputusan DELAYED/EOD/STALE/UNKNOWN tetap
 * milik server, dan primitif ini tidak boleh menambah aturan keduanya.
 *
 * PRD SEC.5.6: kepercayaan harus terlihat. Tapi ia konteks, bukan judul - karena itu
 * lens-meta dan warna teredam, kecuali yang memang perlu dicermati.
 */
export interface StatusMetaItem {
  label: string;
  tone?: 'neutral' | 'caution';
  /** Penjelasan hover, mis. waktu bar harga terakhir. */
  title?: string;
}

export function StatusMeta({ items, className }: { items: StatusMetaItem[]; className?: string }) {
  // Baris pemisah yang menggantung di bawah judul terlihat seperti kerusakan.
  if (items.length === 0) return null;

  return (
    <div className={cn('lens-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-tv-muted', className)}>
      {items.map((item, index) => (
        <React.Fragment key={`${item.label}-${index}`}>
          {index > 0 && <span aria-hidden="true">·</span>}
          <span className={cn(item.tone === 'caution' && 'text-tv-yellow')} title={item.title}>
            {item.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run components/ui/__tests__/status-meta.test.tsx`
Expected: PASS (6 test).

- [ ] **Step 5: Ekspor lewat barrel**

```ts
export { StatusMeta, type StatusMetaItem } from './StatusMeta';
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/StatusMeta.tsx components/ui/__tests__/status-meta.test.tsx components/ui/index.ts
git commit -m "feat: add StatusMeta primitive"
```

---

### Task 6: ResearchTabs

**Files:**
- Create: `components/ui/ResearchTabs.tsx`
- Create: `components/ui/__tests__/research-tabs.test.tsx`
- Modify: `components/ui/index.ts`

**Interfaces:**
- Consumes: `cn`
- Produces:
  ```ts
  export interface ResearchTab { id: string; label: string; href: string; }
  export function ResearchTabs(props: {
    tabs: ResearchTab[];
    activeId: string | null;
    label: string;
    className?: string;
  }): JSX.Element | null;
  ```

- [ ] **Step 1: Tulis test yang gagal**

Buat `components/ui/__tests__/research-tabs.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResearchTabs } from '../ResearchTabs';

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

const TABS = [
  { id: 'technical', label: 'Technical', href: '/technical/BBCA.JK' },
  { id: 'fundamental', label: 'Fundamental', href: '/fundamental?symbol=BBCA.JK' },
];

describe('ResearchTabs', () => {
  it('merender tiap tab sebagai tautan', () => {
    const html = render(<ResearchTabs tabs={TABS} activeId="technical" label="Sudut pandang BBCA" />);
    expect(html).toContain('href="/technical/BBCA.JK"');
    expect(html).toContain('Fundamental');
  });

  it('menandai tab aktif dengan aria-current, bukan hanya warna', () => {
    const html = render(<ResearchTabs tabs={TABS} activeId="fundamental" label="Sudut pandang" />);
    expect(html).toMatch(/href="\/fundamental\?symbol=BBCA.JK"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/fundamental/);
  });

  it('memenuhi lantai sentuh 44px di semua lebar', () => {
    // Tablet mewarisi ukuran kontrol desktop sementara alat masukannya tetap jari -
    // rentang itulah yang paling sering meleset saat ditekan.
    const html = render(<ResearchTabs tabs={TABS} activeId={null} label="Sudut pandang" />);
    expect(html).toContain('min-h-11');
    expect(html).not.toMatch(/(sm|md|lg):min-h-(0|8|9|10)\b/);
  });

  it('memberi nama navigasinya untuk pembaca layar', () => {
    const html = render(<ResearchTabs tabs={TABS} activeId={null} label="Sudut pandang analisis BBCA" />);
    expect(html).toContain('aria-label="Sudut pandang analisis BBCA"');
    expect(html).toContain('<nav');
  });

  it('bisa digeser horizontal di layar sempit', () => {
    const html = render(<ResearchTabs tabs={TABS} activeId={null} label="x" />);
    expect(html).toContain('overflow-x-auto');
  });

  it('tidak merender apa pun saat tidak ada tab', () => {
    expect(render(<ResearchTabs tabs={[]} activeId={null} label="x" />)).toBe('');
  });

  it('activeId yang tidak cocok berarti tidak ada tab aktif', () => {
    // Halaman alat (mis. /moat) sengaja tidak menyalakan tab mana pun.
    const html = render(<ResearchTabs tabs={TABS} activeId="tidak-ada" label="x" />);
    expect(html).not.toContain('aria-current');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run components/ui/__tests__/research-tabs.test.tsx`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Tulis komponennya**

Buat `components/ui/ResearchTabs.tsx`:

```tsx
import Link from 'next/link';
import React from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Navigasi antar BAGIAN riset.
 *
 * Batas terhadap `SegmentedControl` sengaja dinyatakan, karena keduanya tampak mirip dan
 * akan tertukar:
 *   - ResearchTabs berpindah antar bagian konten (Technical / Fundamental / Flow / Valuation).
 *   - SegmentedControl mengubah cara data yang SAMA ditampilkan (mis. periode chart).
 *
 * Presentasi murni: `activeId` datang dari pemanggil, bukan dari `usePathname()` di dalam
 * sini. Itu yang membuatnya bisa dirender dan diuji tanpa router - dan membuat aturan
 * "tab aktif tidak pernah memindahkan pengguna" jadi milik pemanggil yang memang tahu
 * rutenya.
 */
export interface ResearchTab {
  id: string;
  label: string;
  href: string;
}

export function ResearchTabs({
  tabs,
  activeId,
  label,
  className,
}: {
  tabs: ResearchTab[];
  activeId: string | null;
  label: string;
  className?: string;
}) {
  if (tabs.length === 0) return null;

  return (
    <nav aria-label={label} className={cn('-mx-1 flex items-center gap-1 overflow-x-auto px-1', className)}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            // 44px di SEMUA lebar, tanpa varian yang mengecilkannya di md+.
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 lens-label transition-colors',
              active
                ? 'bg-tv-blue/10 text-tv-blue'
                : 'text-tv-muted hover:bg-white/[0.05] hover:text-tv-text',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run components/ui/__tests__/research-tabs.test.tsx`
Expected: PASS (7 test).

- [ ] **Step 5: Ekspor lewat barrel**

```ts
export { ResearchTabs, type ResearchTab } from './ResearchTabs';
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/ResearchTabs.tsx components/ui/__tests__/research-tabs.test.tsx components/ui/index.ts
git commit -m "feat: add ResearchTabs primitive"
```

---

### Task 7: Rute workbench dan penjaganya

**Files:**
- Create: `app/_workbench/page.tsx`
- Create: `app/_workbench/__tests__/workbench-guard.test.ts`
- Modify: `app/robots.ts`

**Interfaces:**
- Consumes: `SectionHeader`, `MetricBand`, `InsightRow`, `StatusMeta`, `ResearchTabs` dari `@/components/ui`
- Produces: rute `/_workbench` yang merender seluruh primitif dengan data contoh; `notFound()` di produksi.

- [ ] **Step 1: Tulis test yang gagal**

Buat `app/_workbench/__tests__/workbench-guard.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Rute internal yang "dimaksudkan hanya untuk dev" adalah cara paling lazim permukaan
 * debug bocor ke produksi. Niat tidak menggerbang apa pun; tiga hal di bawah yang
 * menggerbang, dan ketiganya harus tetap ada.
 */
const ROOT = path.resolve(__dirname, '../../..');

function baca(rel: string): string {
  const full = path.join(ROOT, rel);
  expect(fs.existsSync(full), `${rel} hilang - pindahkan gerbangnya, jangan biarkan lulus`).toBe(true);
  return fs.readFileSync(full, 'utf8');
}

describe('penjaga rute workbench', () => {
  const page = baca('app/_workbench/page.tsx');

  it('menolak diri sendiri di produksi', () => {
    expect(page).toContain("process.env.NODE_ENV === 'production'");
    expect(page).toContain('notFound()');
  });

  it('menandai dirinya noindex', () => {
    expect(page).toContain('noindex');
  });

  it('dilarang lewat robots.txt', () => {
    expect(baca('app/robots.ts')).toContain('/_workbench');
  });

  it('tidak masuk sitemap', () => {
    // sitemap.ts memakai allowlist, jadi ini menegaskan tidak ada yang menambahkannya.
    expect(baca('app/sitemap.ts')).not.toContain('_workbench');
  });

  it('merender setiap primitif V3', () => {
    // Kalau sebuah primitif tidak ada di workbench, ia tidak pernah terpotret - dan
    // ketidakkonsistenannya baru ketahuan setelah tersebar ke sepuluh halaman.
    for (const primitif of ['SectionHeader', 'MetricBand', 'InsightRow', 'StatusMeta', 'ResearchTabs']) {
      expect(page, `${primitif} tidak dirender di workbench`).toContain(primitif);
    }
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run app/_workbench/__tests__/workbench-guard.test.ts`
Expected: FAIL — `app/_workbench/page.tsx` hilang.

- [ ] **Step 3: Tulis halamannya**

Buat `app/_workbench/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  InsightRow,
  MetricBand,
  PageContainer,
  ResearchTabs,
  SectionHeader,
  StatusMeta,
} from '@/components/ui';

/**
 * Visual workbench Redesign V3.
 *
 * KENAPA ADA. Aplikasi ini tidak bisa dijalankan tanpa Postgres, Redis, dan data pasar
 * hulu, jadi tanpa halaman ini seluruh redesign ditulis sambil menebak hasilnya. Di sini
 * setiap primitif berdiri berdampingan dengan data contoh - dan berdampingan itulah
 * satu-satunya cara ketidakkonsistenan spacing dan tipografi terlihat SEBELUM tersebar ke
 * sepuluh halaman.
 *
 * TIDAK BOLEH BISA DIBUKA PENGGUNA. Tiga lapis, karena satu lapis akan dilupakan:
 * notFound() di produksi, noindex, dan disallow di robots.txt. Sitemap memakai allowlist,
 * jadi ia aman dengan sendirinya.
 */
export const metadata: Metadata = {
  title: 'Workbench V3',
  robots: { index: false, follow: false },
};

const TABS = [
  { id: 'technical', label: 'Technical', href: '#' },
  { id: 'fundamental', label: 'Fundamental', href: '#' },
  { id: 'flow', label: 'Flow', href: '#' },
  { id: 'valuation', label: 'Valuation', href: '#' },
];

export default function WorkbenchPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <PageContainer className="space-y-12 p-4 md:p-6 lg:p-7">
      <SectionHeader
        eyebrow="Redesign V3"
        title="Visual workbench"
        lede="Setiap primitif dengan data contoh. Dipotret di 375, 768, dan 1440."
      />

      <section className="space-y-4">
        <SectionHeader as="h3" title="MetricBand" lede="Deret metrik sebaris. 2 kolom di ponsel." />
        <MetricBand
          items={[
            { label: 'IHSG', value: '8.123,45', detail: '+0,62%', tone: 'positive' },
            { label: 'Breadth', value: '62%', detail: 'Healthy' },
            { label: 'Regime', value: 'Constructive' },
            { label: 'LensRadar', value: '8 kandidat' },
          ]}
        />
        <MetricBand
          items={[
            { label: 'Tanpa data', value: null },
            { label: 'Butuh Pro', value: null, emptyHint: 'butuh akun Pro' },
            { label: 'Turun', value: '4.820', detail: '-0,42%', tone: 'negative' },
            { label: 'Perhatian', value: '3 hari', detail: 'tertunda', tone: 'caution' },
          ]}
        />
      </section>

      <section className="space-y-1">
        <SectionHeader as="h3" title="InsightRow" lede="Tiga sampai lima temuan, bukan dinding kartu." />
        <InsightRow direction="BULLISH" title="Momentum membaik" detail="Harga bertahan di atas MA20 dan volume menguat." source="Analyzer MA Trend" />
        <InsightRow direction="BULLISH" title="Akumulasi asing" detail="Net foreign buy dalam empat sesi terakhir." source="LensFlow" />
        <InsightRow direction="BEARISH" title="Tekanan jual meningkat" detail="Distribusi terlihat pada volume harga tinggi." source="Analyzer Volume" />
        <InsightRow direction="NEUTRAL" title="Valuasi relatif tinggi" detail="Masih di atas median historis lima tahun." source="Analyzer PER" />
      </section>

      <section className="space-y-4">
        <SectionHeader as="h3" title="StatusMeta" lede="Baris kepercayaan: umur data, cakupan, sumber." />
        <StatusMeta items={[{ label: 'Diperbarui 16:15 WIB' }, { label: 'Coverage 92%' }, { label: 'Sumber resmi BEI' }]} />
        <StatusMeta items={[{ label: 'Data mungkin tertunda', tone: 'caution', title: 'Bar terakhir 18 Agu 16:15 WIB' }, { label: 'Coverage 71%' }]} />
      </section>

      <section className="space-y-4">
        <SectionHeader as="h3" title="ResearchTabs" lede="Berpindah antar bagian riset. 44px di semua lebar." />
        <ResearchTabs tabs={TABS} activeId="technical" label="Contoh sudut pandang" />
        <ResearchTabs tabs={TABS} activeId={null} label="Contoh tanpa tab aktif" />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Contoh"
          title="SectionHeader dengan aksi"
          lede="Eyebrow, judul, lede, dan satu aksi di kanan."
          action={<span className="lens-label text-tv-blue">Lihat semua</span>}
        />
      </section>
    </PageContainer>
  );
}
```

- [ ] **Step 4: Larang di robots.txt**

Di `app/robots.ts`, ubah baris `disallow` menjadi:

```ts
      // Endpoint/API, panel admin, dan workbench internal bukan konten hasil pencarian.
      disallow: ['/api/', '/admin', '/admin-login', '/_workbench'],
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npx vitest run app/_workbench/__tests__/workbench-guard.test.ts`
Expected: PASS (5 test).

- [ ] **Step 6: Commit**

```bash
git add app/_workbench app/robots.ts
git commit -m "feat: add non-production visual workbench for V3 primitives"
```

---

### Task 8: Potret workbench

**Files:**
- Create: `e2e/workbench-screenshots.spec.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `pageHtml` dari `e2e/support/stylesheet.ts`; `SectionHeader`, `MetricBand`, `InsightRow`, `StatusMeta` lewat path relatif per-berkas
- Produces: berkas PNG di `e2e/__screenshots__/workbench-{375,768,1440}.png`

- [ ] **Step 1: Tulis spec-nya**

Buat `e2e/workbench-screenshots.spec.ts`:

```tsx
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { pageHtml } from './support/stylesheet';
import { SectionHeader } from '../components/ui/SectionHeader';
import { MetricBand } from '../components/ui/MetricBand';
import { InsightRow } from '../components/ui/InsightRow';
import { StatusMeta } from '../components/ui/StatusMeta';

/**
 * Potret primitif V3 di tiga lebar.
 *
 * KENAPA ADA. Kriteria sukses V3 seluruhnya visual, sementara gerbang lain di repo ini
 * hanya mengukur angka. Tanpa gambar untuk diperiksa, redesign ditulis sambil menebak.
 *
 * Ini BUKAN uji regresi piksel - tidak ada baseline yang dibandingkan, dan memang tidak
 * boleh ada: selama V3 berjalan, setiap fase memang mengubah tampilannya. Berkasnya ada
 * untuk DILIHAT sebelum sebuah fase diserahkan.
 *
 * Komponennya dirender SUNGGUHAN lewat renderToStaticMarkup, bukan disalin sebagai HTML
 * ke dalam test. Markup salinan akan menyimpang diam-diam dari komponennya, dan potret
 * yang memotret salinan basi lebih buruk daripada tidak ada potret sama sekali.
 *
 * Diimpor per-berkas, bukan lewat `@/components/ui`: barrel itu ikut mengekspor
 * ResearchTabs yang memakai `next/link`, dan modul itu tidak bisa dirender di luar Next.
 * ResearchTabs punya test unitnya sendiri, dan tinggi 44px-nya sudah diukur
 * responsive-contract.spec.ts.
 */
const OUT = path.resolve(__dirname, '__screenshots__');
const LEBAR = [375, 768, 1440] as const;

function markupWorkbench(): string {
  return renderToStaticMarkup(
    <div className="p-4 md:p-6 lg:p-7 space-y-12">
      <SectionHeader
        eyebrow="Redesign V3"
        title="Visual workbench"
        lede="Setiap primitif dengan data contoh. Dipotret di 375, 768, dan 1440."
      />

      <MetricBand
        items={[
          { label: 'IHSG', value: '8.123,45', detail: '+0,62%', tone: 'positive' },
          { label: 'Breadth', value: '62%', detail: 'Healthy' },
          { label: 'Regime', value: 'Constructive' },
          { label: 'LensRadar', value: '8 kandidat' },
        ]}
      />

      <MetricBand
        items={[
          { label: 'Tanpa data', value: null },
          { label: 'Butuh Pro', value: null, emptyHint: 'butuh akun Pro' },
          { label: 'Turun', value: '4.820', detail: '-0,42%', tone: 'negative' },
          { label: 'Perhatian', value: '3 hari', detail: 'tertunda', tone: 'caution' },
        ]}
      />

      <div>
        <InsightRow direction="BULLISH" title="Momentum membaik" detail="Harga bertahan di atas MA20 dan volume menguat." source="Analyzer MA Trend" />
        <InsightRow direction="BULLISH" title="Akumulasi asing" detail="Net foreign buy dalam empat sesi terakhir." source="LensFlow" />
        <InsightRow direction="BEARISH" title="Tekanan jual meningkat" detail="Distribusi terlihat pada volume harga tinggi." source="Analyzer Volume" />
        <InsightRow direction="NEUTRAL" title="Valuasi relatif tinggi" detail="Masih di atas median historis lima tahun." source="Analyzer PER" />
      </div>

      <StatusMeta items={[{ label: 'Diperbarui 16:15 WIB' }, { label: 'Coverage 92%' }, { label: 'Sumber resmi BEI' }]} />
      <StatusMeta items={[{ label: 'Data mungkin tertunda', tone: 'caution' }, { label: 'Coverage 71%' }]} />
    </div>,
  );
}

test.describe('potret workbench', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  for (const lebar of LEBAR) {
    test(`workbench di ${lebar}px`, async ({ page }) => {
      const markup = markupWorkbench();
      // Penjaga jumlah: kalau render menghasilkan nyaris kosong, potretnya akan "lulus"
      // sambil memotret halaman kosong.
      expect(markup.length, 'markup workbench terlalu pendek - komponennya tidak merender').toBeGreaterThan(1500);

      await page.setViewportSize({ width: lebar, height: 1400 });
      await page.setContent(pageHtml(markup));
      await page.screenshot({ path: path.join(OUT, `workbench-${lebar}.png`), fullPage: true });

      const melebar = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(melebar, `workbench menggulir horizontal di ${lebar}px`).toBe(false);
    });
  }
});
```

**Catatan:** berkasnya berekstensi `.tsx`, bukan `.ts`, karena memuat JSX. Kalau Playwright
mengeluh soal JSX, tambahkan `esbuild: { jsx: 'automatic' }` — tetapi coba dulu tanpa itu;
Playwright mentransformasi TSX secara bawaan.

- [ ] **Step 2: Jalankan spec, pastikan menghasilkan gambar**

Run: `npx playwright test e2e/workbench-screenshots.spec.tsx`
Expected: PASS (3 test), dan `e2e/__screenshots__/` berisi tiga PNG.

- [ ] **Step 3: Abaikan hasil potret dari git**

Di `.gitignore`, tambahkan setelah blok Playwright yang sudah ada:

```
/e2e/__screenshots__/
```

- [ ] **Step 4: Periksa gambarnya**

Buka ketiga PNG. Yang dicari, dan ini bukan formalitas:
- kolom `MetricBand` menjadi 2 kolom di 375px dan sebaris di 1440px;
- angka sejajar secara vertikal (tabular numerics benar-benar bekerja);
- baris `InsightRow` punya ritme yang sama, panah sejajar dengan baris pertama teks;
- tab setinggi 44px di ketiga lebar;
- tidak ada yang terpotong di 375px.

- [ ] **Step 5: Commit**

```bash
git add e2e/workbench-screenshots.spec.tsx .gitignore
git commit -m "test: screenshot the V3 primitives at three widths"
```

---

### Task 9: Verifikasi PR

**Files:** —

**Interfaces:**
- Consumes: seluruh task sebelumnya
- Produces: bukti tertulis untuk badan PR

- [ ] **Step 1: Jalankan gerbang penuh**

Run:
```bash
rm -rf .next
npm run verify:prod
```
Expected: EXIT=0. Catat jumlah berkas test dan test.

- [ ] **Step 2: Jalankan harness responsif**

Run: `npm run test:responsive`
Expected: EXIT=0 — 5 test kontrak lama + 3 test potret workbench.

- [ ] **Step 3: Jalankan gerbang frontend-only terhadap main**

Run: `FRONTEND_ONLY_BASE=origin/main npm run audit:frontend-only`
Expected: `PASS: tidak ada berkas backend yang tersentuh.`

- [ ] **Step 4: Pastikan tampilan aplikasi belum berubah**

Run: `git diff --stat origin/main...HEAD -- app components | grep -v _workbench | grep -v __tests__`
Expected: hanya `components/ui/index.ts` dan `app/robots.ts`. Kalau ada permukaan lain yang berubah, PR ini melampaui lingkupnya — primitif dibuat di sini, **dipakai** mulai PR 2.

- [ ] **Step 5: Buka PR ke `redesign/v3`**

Badan PR memuat: hasil tepat langkah 1–3, daftar primitif beserta dua penyimpangan dari PRD (`Surface` tidak dibuat, `Divider` ditunda), dan tiga potret workbench sebagai bukti visual.
