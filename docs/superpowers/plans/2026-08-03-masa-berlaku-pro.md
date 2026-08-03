# Masa Berlaku Pro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memberi masa berlaku pada status Pro sehingga akun yang membayar satu bulan tidak lagi mendapat akses selamanya.

**Architecture:** Satu kolom baru `pro_expires_at` dan satu fungsi `checkProAccess()` yang menjaga 16 route sekaligus. Kedaluwarsa dihitung saat diperiksa, bukan lewat cron. Admin memilih durasi (1 bulan / 1 tahun / tanggal bebas) dan perpanjangan menumpuk dari tanggal berakhir bila belum habis.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest, PostgreSQL (Neon), jose (JWT).

## Global Constraints

- Semua teks yang tampil ke pengguna berbahasa Indonesia.
- `checkProAccess()` di `shared/auth/session.ts` adalah **satu-satunya** gerbang Pro untuk 16 route. Tidak ada route yang boleh diubah gerbangnya sendiri.
- Admin (`role === 'admin'`) selalu lolos tanpa syarat tanggal — jangan sampai admin mengunci diri sendiri.
- `pro_expires_at = null` berarti tanpa batas; itu keadaan sah untuk akun lama, bukan celah yang harus ditutup paksa.
- Tidak boleh menambah cron atau job terjadwal untuk kedaluwarsa.
- Migrasi harus aman dijalankan berulang (`IF NOT EXISTS` + `WHERE pro_expires_at IS NULL`).
- Endpoint admin baru wajib memakai gerbang `isAdminFromRequestCookies()` yang sudah ada, dan tidak boleh mengembalikan `password_hash`, `verification_code`, atau `reset_code`.
- Test ditulis lebih dulu dan harus dilihat gagal sebelum implementasi.
- Perintah test: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Dijalankan **terpisah, tidak paralel** — bersamaan menyebabkan keduanya berebut cache Vite dan gagal palsu.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `shared/auth/jwt.ts` | **Modify.** `SessionPayload` dapat `pro_expires_at?: string \| null`. |
| `shared/auth/session.ts` | **Modify.** `checkProAccess()` menghormati tanggal; `checkProAccessLive()` meneruskan field baru. |
| `shared/auth/__tests__/session.test.ts` | **Create/Modify.** Test gerbang akses — bagian paling kritis. |
| `shared/auth/pro-status.ts` | **Modify.** `SELECT` menambahkan `pro_expires_at`. |
| `modules/user/types/user.types.ts` | **Modify.** `User` dapat `pro_expires_at`. |
| `modules/user/repository/user.repository.ts` | **Modify.** Kolom + migrasi + `UPDATABLE_COLUMNS`. |
| `modules/user/service/pro-expiry.service.ts` | **Create.** `extendProExpiry()` — fungsi murni. |
| `modules/user/service/__tests__/pro-expiry.service.test.ts` | **Create.** Test fungsi murni. |
| `modules/user/controller/admin.controller.ts` | **Modify.** `handleSetProStatus()` menerima durasi; `handleGetProStatus()` baru. |
| `modules/user/service/auth.service.ts` | **Modify.** Token menyertakan `pro_expires_at`. |
| `modules/user/index.ts` | **Modify.** Ekspor controller baru. |
| `app/api/admin/pro-status/route.ts` | **Create.** Endpoint cek status. |
| `app/admin/SetProForm.tsx` | **Modify.** Tombol durasi + tanggal bebas + tombol Cek. |
| `components/UserProfileModal.tsx` | **Modify.** Menampilkan tanggal berakhir + sisa hari. |

Urutan task mengikuti ketergantungan: fungsi murni → gerbang akses → penyimpanan → admin → tampilan.

---

### Task 1: Fungsi perpanjangan

**Files:**
- Create: `modules/user/service/pro-expiry.service.ts`
- Test: `modules/user/service/__tests__/pro-expiry.service.test.ts`

**Interfaces:**
- Produces: `extendProExpiry(current: string | null, months: number): string` — mengembalikan ISO string.

- [ ] **Step 1: Tulis test yang gagal**

```typescript
// modules/user/service/__tests__/pro-expiry.service.test.ts
import { describe, it, expect } from 'vitest';
import { extendProExpiry } from '../pro-expiry.service';

function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d;
}

describe('extendProExpiry', () => {
  it('menumpuk dari tanggal berakhir kalau masa berlaku belum habis', () => {
    const belumHabis = monthsFromNow(1).toISOString();

    const hasil = new Date(extendProExpiry(belumHabis, 1));

    // 1 bulan lagi + 1 bulan = sekitar 2 bulan dari sekarang, bukan 1
    const duaBulan = monthsFromNow(2);
    expect(Math.abs(hasil.getTime() - duaBulan.getTime())).toBeLessThan(60_000);
  });

  it('menghitung dari sekarang kalau tanggal sudah lewat', () => {
    const sudahLewat = monthsFromNow(-3).toISOString();

    const hasil = new Date(extendProExpiry(sudahLewat, 1));

    const satuBulan = monthsFromNow(1);
    expect(Math.abs(hasil.getTime() - satuBulan.getTime())).toBeLessThan(60_000);
  });

  it('menghitung dari sekarang kalau belum pernah punya tanggal', () => {
    const hasil = new Date(extendProExpiry(null, 1));

    const satuBulan = monthsFromNow(1);
    expect(Math.abs(hasil.getTime() - satuBulan.getTime())).toBeLessThan(60_000);
  });

  it('12 bulan menghasilkan tahun berikutnya', () => {
    const hasil = new Date(extendProExpiry(null, 12));

    expect(hasil.getFullYear()).toBe(new Date().getFullYear() + 1);
  });

  it('mengembalikan ISO string, bukan objek Date', () => {
    expect(typeof extendProExpiry(null, 1)).toBe('string');
    expect(extendProExpiry(null, 1)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run modules/user/service/__tests__/pro-expiry.service.test.ts`
Expected: FAIL — `Failed to resolve import "../pro-expiry.service"`.

- [ ] **Step 3: Tulis implementasi**

```typescript
// modules/user/service/pro-expiry.service.ts

/** Menambah durasi langganan Pro.
 *
 * Kalau masa berlaku BELUM habis, ditambahkan dari tanggal berakhir supaya sisa hari
 * yang sudah dibayar tidak hangus - pengguna yang memperpanjang lebih awal tidak
 * dirugikan. Kalau sudah lewat atau belum pernah ada, dihitung dari sekarang.
 *
 * Catatan: setMonth() melimpah untuk tanggal yang tidak ada di bulan tujuan (31 Januari
 * + 1 bulan = 3 Maret). Perilaku baku JavaScript, memihak pengguna, terjadi beberapa kali
 * setahun - tidak perlu pustaka tanggal tambahan hanya untuk itu. */
export function extendProExpiry(current: string | null, months: number): string {
  const now = new Date();
  const base = current && new Date(current) > now ? new Date(current) : now;
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run modules/user/service/__tests__/pro-expiry.service.test.ts`
Expected: 5 test PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/user/service/pro-expiry.service.ts modules/user/service/__tests__/pro-expiry.service.test.ts
git commit -m "feat(user): fungsi perpanjangan masa berlaku Pro"
```

---

### Task 2: Gerbang akses

Bagian paling kritis — satu kesalahan di sini membuka atau menutup 16 route sekaligus.

**Files:**
- Modify: `shared/auth/jwt.ts:13-20`, `shared/auth/session.ts:28-53`, `shared/auth/pro-status.ts`
- Test: `shared/auth/__tests__/session.test.ts`

**Interfaces:**
- Produces: `checkProAccess(session)` menolak Pro yang `pro_expires_at`-nya sudah lewat.

- [ ] **Step 1: Periksa apakah file test sudah ada**

Run: `ls shared/auth/__tests__/`

Kalau `session.test.ts` sudah ada, **tambahkan** blok `describe` di bawah ke file itu tanpa menghapus test yang ada. Kalau belum ada, buat file baru dengan isi lengkap di Step 2.

- [ ] **Step 2: Tulis test yang gagal**

```typescript
// shared/auth/__tests__/session.test.ts
import { describe, it, expect } from 'vitest';
import { checkProAccess } from '../session';

function session(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'user@test.com',
    role: 'free',
    is_pro: false,
    trial_ends_at: null,
    ...over,
  } as any;
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

describe('checkProAccess - masa berlaku', () => {
  it('Pro dengan tanggal di masa depan tetap lolos', () => {
    expect(checkProAccess(session({ is_pro: true, pro_expires_at: daysFromNow(30) }))).toBe(true);
  });

  it('Pro dengan tanggal yang sudah lewat DITOLAK', () => {
    expect(checkProAccess(session({ is_pro: true, pro_expires_at: daysFromNow(-1) }))).toBe(false);
  });

  it('Pro tanpa tanggal (null) lolos - kompatibilitas akun lama', () => {
    expect(checkProAccess(session({ is_pro: true, pro_expires_at: null }))).toBe(true);
  });

  it('Pro dengan field tanggal tidak ada sama sekali lolos - JWT lama', () => {
    expect(checkProAccess(session({ is_pro: true }))).toBe(true);
  });

  it("role 'pro' dengan tanggal lewat DITOLAK - celah lama tertutup", () => {
    expect(checkProAccess(session({ role: 'pro', is_pro: true, pro_expires_at: daysFromNow(-1) }))).toBe(false);
  });

  it('admin selalu lolos meski tanpa tanggal', () => {
    expect(checkProAccess(session({ role: 'admin' }))).toBe(true);
  });

  it('admin lolos meski pro_expires_at sudah lewat', () => {
    expect(checkProAccess(session({ role: 'admin', is_pro: true, pro_expires_at: daysFromNow(-30) }))).toBe(true);
  });

  it('trial aktif tetap lolos meski bukan Pro', () => {
    expect(checkProAccess(session({ trial_ends_at: daysFromNow(3) }))).toBe(true);
  });

  it('trial kedaluwarsa dan bukan Pro ditolak', () => {
    expect(checkProAccess(session({ trial_ends_at: daysFromNow(-1) }))).toBe(false);
  });

  it('sesi null ditolak', () => {
    expect(checkProAccess(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Jalankan test untuk memastikan gagal**

Run: `npx vitest run shared/auth/__tests__/session.test.ts`
Expected: FAIL pada dua test — "Pro dengan tanggal yang sudah lewat DITOLAK" dan "role 'pro' dengan tanggal lewat DITOLAK". Keduanya masih mengembalikan `true` karena tanggal belum diperiksa.

- [ ] **Step 4: Tambahkan field ke SessionPayload**

Di `shared/auth/jwt.ts`, tambahkan satu baris ke interface:

```typescript
export interface SessionPayload {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'free' | 'pro' | string;
  is_pro: boolean;
  trial_ends_at: string | null;
  /** Opsional supaya JWT lama yang belum memuatnya tetap bisa didekode - nilainya
   * undefined, diperlakukan sama dengan null, lalu dikoreksi checkProAccessLive()
   * yang membaca ulang dari database. */
  pro_expires_at?: string | null;
  [key: string]: any;
}
```

- [ ] **Step 5: Ubah gerbang akses**

Di `shared/auth/session.ts`, ganti `checkProAccess()`:

```typescript
function isProExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false; // null/undefined = tanpa batas
  return new Date(expiresAt) <= new Date();
}

// role === 'pro' SENGAJA tidak lagi memberi akses sendiri: tidak ada satu baris kode pun
// yang menulis nilai itu (hanya is_pro yang pernah ditulis), sementara membiarkannya
// berarti menyisakan jalur akses yang kebal terhadap tanggal kedaluwarsa. Admin tetap
// lolos tanpa syarat lewat cabang pertama.
export function checkProAccess(session: SessionPayload | null): boolean {
  if (!session) return false;
  if (session.role === 'admin') return true;
  if (session.is_pro && !isProExpired(session.pro_expires_at)) return true;
  if (session.trial_ends_at && new Date(session.trial_ends_at) > new Date()) return true;
  return false;
}
```

- [ ] **Step 6: Teruskan field saat re-check ke database**

Masih di `shared/auth/session.ts`, di dalam `checkProAccessLive()`, ganti baris penyusunan ulang sesi:

```typescript
    return checkProAccess({
      ...session,
      role: live.role,
      is_pro: live.is_pro,
      trial_ends_at: live.trial_ends_at,
      pro_expires_at: live.pro_expires_at,
    });
```

- [ ] **Step 7: Tambahkan kolom ke query live**

Di `shared/auth/pro-status.ts`, ubah tipe kembalian dan query:

```typescript
export async function fetchLiveProFields(
  userId: string
): Promise<{ role: 'free' | 'pro' | 'admin'; is_pro: boolean; trial_ends_at: string | null; pro_expires_at: string | null } | null> {
  const { rows } = await pool.query(
    'SELECT role, is_pro, trial_ends_at, pro_expires_at FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || null;
}
```

- [ ] **Step 8: Jalankan test untuk memastikan lulus**

Run: `npx vitest run shared/auth/__tests__/session.test.ts`
Expected: 10 test PASS.

- [ ] **Step 9: Jalankan seluruh test**

Run: `npx vitest run`
Expected: seluruh test PASS. Kalau ada test lama yang gagal karena mengandalkan `role: 'pro'` memberi akses, perbarui test itu — perubahan perilakunya memang disengaja dan tercatat di spec.

- [ ] **Step 10: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 11: Commit**

```bash
git add shared/auth/jwt.ts shared/auth/session.ts shared/auth/pro-status.ts shared/auth/__tests__/session.test.ts
git commit -m "fix(auth): status Pro menghormati masa berlaku"
```

---

### Task 3: Penyimpanan dan migrasi

**Files:**
- Modify: `modules/user/types/user.types.ts`, `modules/user/repository/user.repository.ts`, `modules/user/service/auth.service.ts`

**Interfaces:**
- Consumes: —
- Produces: kolom `pro_expires_at` tersedia di tabel `users` dan bisa diperbarui lewat `updateUser()`.

- [ ] **Step 1: Tambahkan field ke tipe User**

Di `modules/user/types/user.types.ts`, tambahkan setelah `trial_ends_at`:

```typescript
  pro_expires_at: string | null;
```

- [ ] **Step 2: Tambahkan kolom dan migrasi**

Di `modules/user/repository/user.repository.ts`, di dalam string SQL `ensureSchema()`, tambahkan setelah baris `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires TIMESTAMPTZ;`:

```sql
      -- Masa berlaku Pro (2026-08-03). Sebelumnya is_pro cuma boolean tanpa batas waktu,
      -- sehingga akun yang membayar satu bulan mendapat akses selamanya.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;
      -- Akun Pro yang sudah ada diberi masa berlaku 1 bulan sejak migrasi ini jalan.
      -- Admin dilewati supaya tidak mengunci diri sendiri. Kondisi IS NULL membuat
      -- pernyataan ini aman dijalankan berkali-kali - akun yang sudah punya tanggal
      -- tidak akan tertimpa.
      UPDATE users SET pro_expires_at = NOW() + INTERVAL '1 month'
      WHERE is_pro = true AND pro_expires_at IS NULL AND role <> 'admin';
```

- [ ] **Step 3: Izinkan kolom diperbarui**

Masih di file yang sama, tambahkan ke `UPDATABLE_COLUMNS` setelah `'trial_ends_at'`:

```typescript
  'pro_expires_at',
```

- [ ] **Step 4: Sertakan di token login**

Di `modules/user/service/auth.service.ts` baris 43, tambahkan field ke payload token:

```typescript
    { id: user.id, email: user.email, role: user.role, is_pro: user.is_pro, trial_ends_at: user.trial_ends_at, pro_expires_at: user.pro_expires_at },
```

Lakukan hal yang sama pada pembuatan token di baris 102 (`encrypt({ ... })`), menambahkan `pro_expires_at: user.pro_expires_at` ke objeknya.

- [ ] **Step 5: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error. Kalau muncul error "Property 'pro_expires_at' is missing" di berkas test yang membuat objek `User` palsu, tambahkan `pro_expires_at: null` ke objek itu.

- [ ] **Step 6: Jalankan seluruh test**

Run: `npx vitest run`
Expected: seluruh test PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/user/types/user.types.ts modules/user/repository/user.repository.ts modules/user/service/auth.service.ts
git commit -m "feat(user): kolom pro_expires_at dan migrasi akun lama"
```

---

### Task 4: Admin — aktivasi berdurasi dan cek status

**Files:**
- Modify: `modules/user/controller/admin.controller.ts:94-107`, `modules/user/index.ts`
- Create: `app/api/admin/pro-status/route.ts`
- Test: `modules/user/controller/__tests__/admin.controller.test.ts`

**Interfaces:**
- Consumes: `extendProExpiry()` (Task 1).
- Produces:
  - `handleSetProStatus(cookieStore, { email, isPro, months?, expiresAt? })`
  - `handleGetProStatus(cookieStore, { email })` → `{ email, isPro, proExpiresAt }`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `modules/user/controller/__tests__/admin.controller.test.ts`. Sertakan `handleGetProStatus` pada baris import yang sudah ada dari `../admin.controller`, lalu tambahkan blok ini di akhir file:

```typescript
describe('handleSetProStatus - durasi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('months: 1 menulis is_pro true beserta tanggal berakhir', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({ id: 'user-42', pro_expires_at: null } as any);

    await handleSetProStatus(adminCookies(), { email: 'a@b.com', isPro: true, months: 1 });

    const arg = vi.mocked(updateUser).mock.calls[0][1] as any;
    expect(arg.is_pro).toBe(true);
    expect(new Date(arg.pro_expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('isPro false mengosongkan tanggal, bukan menyisakannya', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({ id: 'user-42', pro_expires_at: '2027-01-01T00:00:00.000Z' } as any);

    await handleSetProStatus(adminCookies(), { email: 'a@b.com', isPro: false });

    expect(updateUser).toHaveBeenCalledWith('user-42', { is_pro: false, pro_expires_at: null });
  });

  it('expiresAt eksplisit dipakai apa adanya', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({ id: 'user-42', pro_expires_at: null } as any);
    const target = '2027-06-30T00:00:00.000Z';

    await handleSetProStatus(adminCookies(), { email: 'a@b.com', isPro: true, expiresAt: target });

    const arg = vi.mocked(updateUser).mock.calls[0][1] as any;
    expect(arg.pro_expires_at).toBe(target);
  });
});

describe('handleGetProStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menolak permintaan tanpa cookie admin', async () => {
    await expect(
      handleGetProStatus({ get: () => undefined }, { email: 'a@b.com' })
    ).rejects.toThrow();
  });

  it('mengembalikan status dan tanggal, tanpa field sensitif', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({
      id: 'user-42',
      email: 'a@b.com',
      is_pro: true,
      pro_expires_at: '2027-01-01T00:00:00.000Z',
      password_hash: 'RAHASIA',
      verification_code: '123456',
      reset_code: '654321',
    } as any);

    const res = await handleGetProStatus(adminCookies(), { email: 'a@b.com' });

    expect(res.body).toEqual({ email: 'a@b.com', isPro: true, proExpiresAt: '2027-01-01T00:00:00.000Z' });
    expect(JSON.stringify(res.body)).not.toContain('RAHASIA');
    expect(JSON.stringify(res.body)).not.toContain('123456');
    expect(JSON.stringify(res.body)).not.toContain('654321');
  });
});
```

Kalau berkas test yang ada belum punya pembantu `adminCookies()`, tambahkan di dekat bagian atas file — sesuaikan nilainya dengan cara test yang sudah ada memalsukan cookie admin:

```typescript
function adminCookies() {
  return { get: (name: string) => (name === 'sahamlens_admin' ? { value: 'valid' } : undefined) };
}
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run modules/user/controller/__tests__/admin.controller.test.ts`
Expected: FAIL — `handleGetProStatus` belum ada, dan `handleSetProStatus` belum menerima `months`.

- [ ] **Step 3: Ubah handleSetProStatus**

Di `modules/user/controller/admin.controller.ts`, ganti fungsinya:

```typescript
export async function handleSetProStatus(
  cookieStore: { get(name: string): { value: string } | undefined },
  body: { email?: unknown; isPro?: unknown; months?: unknown; expiresAt?: unknown }
): Promise<HttpResult> {
  if (!isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  if (typeof body.email !== 'string' || !body.email || typeof body.isPro !== 'boolean') {
    throw new ValidationError('email dan isPro wajib diisi dengan tipe yang benar');
  }
  const user = await getUserByEmail(body.email);
  if (!user) throw new NotFoundError('User tidak ditemukan');

  let proExpiresAt: string | null = null;
  if (body.isPro) {
    if (typeof body.expiresAt === 'string' && body.expiresAt) {
      // Tanggal bebas dipakai apa adanya - termasuk tanggal di masa lalu, yang efeknya
      // sama dengan mencabut akses. Itu bisa disengaja, jadi tidak ditolak.
      proExpiresAt = new Date(body.expiresAt).toISOString();
    } else {
      const months = typeof body.months === 'number' && body.months > 0 ? body.months : 1;
      proExpiresAt = extendProExpiry(user.pro_expires_at ?? null, months);
    }
  }

  // Saat dicabut, tanggal ikut dikosongkan - menyisakan tanggal lama pada akun non-Pro
  // membingungkan dan bisa menghidupkan akses lagi kalau is_pro dinyalakan tanpa durasi.
  await updateUser(user.id, { is_pro: body.isPro, pro_expires_at: proExpiresAt });
  logger.info('Admin set-pro', { email: body.email, isPro: body.isPro, proExpiresAt });
  return { status: 200, body: { email: body.email, isPro: body.isPro, proExpiresAt } };
}

export async function handleGetProStatus(
  cookieStore: { get(name: string): { value: string } | undefined },
  query: { email?: unknown }
): Promise<HttpResult> {
  if (!isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  if (typeof query.email !== 'string' || !query.email) {
    throw new ValidationError('email wajib diisi');
  }
  const user = await getUserByEmail(query.email);
  if (!user) throw new NotFoundError('User tidak ditemukan');

  // Hanya tiga field - JANGAN kembalikan objek user apa adanya, di dalamnya ada
  // password_hash, verification_code, dan reset_code.
  return {
    status: 200,
    body: { email: user.email, isPro: user.is_pro, proExpiresAt: user.pro_expires_at ?? null },
  };
}
```

Tambahkan import `extendProExpiry` di bagian atas file:

```typescript
import { extendProExpiry } from '../service/pro-expiry.service';
```

- [ ] **Step 4: Ekspor controller baru**

Di `modules/user/index.ts`, tambahkan `handleGetProStatus` ke baris ekspor yang sudah memuat `handleSetProStatus`.

- [ ] **Step 5: Buat endpoint**

Buat `app/api/admin/pro-status/route.ts`, mengikuti pola `app/api/admin/set-pro/route.ts`:

```typescript
import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { handleGetProStatus } from '@/modules/user';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return runController(async () => handleGetProStatus(cookies(), { email: searchParams.get('email') ?? undefined }));
}
```

- [ ] **Step 6: Jalankan test untuk memastikan lulus**

Run: `npx vitest run modules/user/controller/__tests__/admin.controller.test.ts`
Expected: seluruh test PASS.

- [ ] **Step 7: Verifikasi typecheck lalu seluruh test**

Run: `npx tsc --noEmit`
Expected: tanpa error.

Run: `npx vitest run`
Expected: seluruh test PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/user/controller/admin.controller.ts modules/user/index.ts app/api/admin/pro-status/route.ts modules/user/controller/__tests__/admin.controller.test.ts
git commit -m "feat(admin): aktivasi Pro berdurasi dan endpoint cek status"
```

---

### Task 5: Tampilan admin dan akun pengguna

**Files:**
- Modify: `app/admin/SetProForm.tsx`
- Modify: `components/UserProfileModal.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/set-pro` dengan `{ email, isPro, months? , expiresAt? }`; `GET /api/admin/pro-status?email=`.

- [ ] **Step 1: Ganti isi SetProForm**

Ganti seluruh isi `app/admin/SetProForm.tsx`:

```tsx
'use client';

import React, { useState } from 'react';

type Status = { email: string; isPro: boolean; proExpiresAt: string | null };

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function sisaHari(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function SetProForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const cek = async () => {
    if (!email.trim()) {
      setMessage({ text: 'Isi email dulu', isError: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/pro-status?email=${encodeURIComponent(email.trim())}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data.error || 'Gagal mengambil status', isError: true });
        return;
      }
      setStatus(data);
    } catch {
      setMessage({ text: 'Gagal terhubung ke server', isError: true });
    } finally {
      setLoading(false);
    }
  };

  const simpan = async (payload: { isPro: boolean; months?: number; expiresAt?: string }) => {
    if (!email.trim()) {
      setMessage({ text: 'Isi email dulu', isError: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/set-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data.error || 'Gagal memproses', isError: true });
        return;
      }
      setMessage({
        text: data.isPro
          ? `${data.email} Pro sampai ${formatTanggal(data.proExpiresAt)}`
          : `${data.email} bukan Pro lagi`,
        isError: false,
      });
      setStatus({ email: data.email, isPro: data.isPro, proExpiresAt: data.proExpiresAt });
    } catch {
      setMessage({ text: 'Gagal terhubung ke server', isError: true });
    } finally {
      setLoading(false);
    }
  };

  const tombol = 'text-white font-bold px-4 py-2 rounded-md text-sm transition-opacity disabled:opacity-50 hover:opacity-90';

  return (
    <div className="bg-tv-card border border-tv-border rounded-lg p-6 mb-8">
      <h2 className="font-heading text-lg font-bold text-tv-text mb-4">Aktivasi Pro</h2>

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setStatus(null); }}
          placeholder="email@user.com"
          className="flex-1 bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <button type="button" disabled={loading} onClick={cek} className={`bg-tv-blue ${tombol}`}>
          Cek Status
        </button>
      </div>

      {status && (
        <p className="text-sm mb-4 text-tv-text">
          {!status.isPro
            ? 'Bukan Pro'
            : status.proExpiresAt == null
            ? 'Pro aktif (tanpa batas waktu)'
            : sisaHari(status.proExpiresAt) > 0
            ? `Pro sampai ${formatTanggal(status.proExpiresAt)} (${sisaHari(status.proExpiresAt)} hari lagi)`
            : `Pro sudah berakhir ${formatTanggal(status.proExpiresAt)}`}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <button type="button" disabled={loading} onClick={() => simpan({ isPro: true, months: 1 })} className={`bg-tv-green ${tombol}`}>
          +1 Bulan
        </button>
        <button type="button" disabled={loading} onClick={() => simpan({ isPro: true, months: 12 })} className={`bg-tv-green ${tombol}`}>
          +1 Tahun
        </button>
        <input
          type="date"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text focus:outline-none focus:border-tv-blue"
        />
        <button
          type="button"
          disabled={loading || !customDate}
          onClick={() => simpan({ isPro: true, expiresAt: new Date(customDate).toISOString() })}
          className={`bg-tv-blue ${tombol}`}
        >
          Set Tanggal
        </button>
        <button type="button" disabled={loading} onClick={() => simpan({ isPro: false })} className={`bg-tv-red ${tombol}`}>
          Cabut Pro
        </button>
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.isError ? 'text-tv-red' : 'text-tv-green'}`}>{message.text}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Cari tempat status Pro ditampilkan ke pengguna**

Run: `grep -n "is_pro\|isPro\|Pro" components/UserProfileModal.tsx`

Catat baris yang menampilkan status Pro — di situlah tanggal ditambahkan.

- [ ] **Step 3: Tampilkan tanggal berakhir di profil pengguna**

Di `components/UserProfileModal.tsx`, pada bagian yang menampilkan status Pro, tambahkan tanggal ketika tersedia. Pola yang dipakai:

```tsx
{user?.isPro && user?.proExpiresAt && (
  <p className="text-xs text-tv-muted mt-1">
    Aktif sampai {new Date(user.proExpiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
    {' '}({Math.ceil((new Date(user.proExpiresAt).getTime() - Date.now()) / 86_400_000)} hari lagi)
  </p>
)}
```

Kalau `proExpiresAt` bernilai null pada pengguna Pro, jangan menampilkan baris ini sama
sekali — cukup "Pro aktif" seperti sebelumnya. Jangan menampilkan tanggal palsu.

- [ ] **Step 4: Pastikan API profil mengirim field itu**

Run: `grep -n "isPro\|is_pro" modules/user/controller/auth.controller.ts`

Di endpoint yang mengembalikan profil (sekitar baris 79-86), tambahkan `proExpiresAt: user.pro_expires_at ?? null` ke objek respons. Tanpa ini, `user.proExpiresAt` di Step 3 akan selalu `undefined`.

- [ ] **Step 5: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: tanpa error.

- [ ] **Step 6: Periksa di aplikasi berjalan**

Run: `npm run dev`

Buka `http://localhost:3001/admin`, lalu:
1. Masukkan email akun uji, klik **Cek Status** → muncul status sekarang
2. Klik **+1 Bulan** → pesan menampilkan tanggal sekitar sebulan ke depan
3. Klik **+1 Bulan** lagi → tanggal bertambah lagi sebulan, **bukan** kembali ke sebulan dari hari ini (membuktikan penumpukan)
4. Klik **Cabut Pro** → status jadi "Bukan Pro"

- [ ] **Step 7: Commit**

```bash
git add app/admin/SetProForm.tsx components/UserProfileModal.tsx modules/user/controller/auth.controller.ts
git commit -m "feat(admin): tombol durasi, cek status, dan tanggal berakhir di profil"
```

---

## Verifikasi akhir

- [ ] `npx vitest run` — seluruh test PASS
- [ ] `npx tsc --noEmit` — bersih
- [ ] `npm run build` — Compiled successfully
- [ ] Akun Pro dengan `pro_expires_at` lampau ditolak di route yang digerbangi — uji dengan menyetel tanggal ke masa lalu lewat admin, lalu `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/backtest -X POST -H "Content-Type: application/json" -d '{"filters":["RSI 14"],"modal":100000000,"period":12}'` mengembalikan `402`
- [ ] Akun admin tetap bisa mengakses semua route meski tanpa `pro_expires_at`
- [ ] Migrasi aman dijalankan dua kali: jalankan `npm run dev` dua kali, tanggal akun yang sudah punya nilai tidak berubah
- [ ] Tidak ada cron baru: `ls app/api/cron/` tidak bertambah
- [ ] Backtest, AI Pick, Screener tidak tersentuh: `git diff --stat <commit-awal> HEAD -- modules/backtest modules/market app/backtest app/screener` kosong
