# Ganti Password Admin Secara Mandiri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin bisa mengganti password akses `/admin` sendiri lewat form di halaman itu, tersimpan di database, tanpa perlu deploy ulang - dengan `ADMIN_SECRET_KEY` di Vercel tetap berfungsi sebagai jalur darurat selamanya.

**Architecture:** Password admin disimpan sebagai hash bcrypt di tabel baru `admin_secret` (satu baris). Login maupun ganti password mengecek DUA sumber - hash di database ATAU `ADMIN_SECRET_KEY` env var - salah satu cocok sudah cukup, lewat satu helper `verifyAdminSecret()` yang dipakai bersama.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, bcryptjs, Postgres.

## Global Constraints

- `ADMIN_SECRET_KEY` (env var) TIDAK PERNAH dihapus/diabaikan - tetap salah satu dari dua sumber valid untuk login maupun untuk verifikasi "password saat ini" saat ganti password, selamanya (bukan cuma bootstrap sekali pakai).
- Password baru minimal 12 karakter.
- Ganti password digerbang GANDA: harus sudah login admin (`isAdminFromRequestCookies()`) DAN harus membuktikan tahu password saat ini (`currentKey` cocok salah satu dari dua sumber) - bukan cuma salah satu.
- Password baru disimpan sebagai hash bcrypt (cost factor 10, sama seperti `password_hash` user biasa di `modules/user/service/auth.service.ts`) - tidak pernah sebagai plaintext di database.
- Perilaku 404-untuk-key-salah di `/admin-login` yang sudah ada TIDAK berubah (tidak membocorkan info apapun ke pihak yang salah masukkan key).
- Tidak menambah test untuk komponen client (`ChangeSecretForm.tsx`) - konsisten dengan konvensi repo ini (`SetProForm.tsx` juga tidak ada test-nya).
- Tidak menambah audit log/riwayat penggantian password - di luar cakupan (beda dari audit log aktivasi Pro yang menyangkut uang).

---

## Task 1: Backend - simpan & verifikasi password admin di database

**Files:**
- Create: `modules/user/repository/admin-secret.repository.ts`
- Modify: `modules/user/controller/admin.controller.ts`
- Modify: `modules/user/index.ts`
- Create: `app/api/admin/change-secret/route.ts`
- Test: `modules/user/controller/__tests__/admin.controller.test.ts` (file sudah ada, ditambah test baru)

**Interfaces:**
- Produces: `export async function getAdminSecretHash(): Promise<string | null>` dan `export async function setAdminSecretHash(hash: string): Promise<void>` dari `admin-secret.repository.ts` - dipakai oleh `admin.controller.ts` di task ini sendiri, tidak dipakai task lain.
- Produces: `export async function handleChangeAdminSecret(cookieStore: { get(name: string): { value: string } | undefined }, body: { currentKey?: unknown; newKey?: unknown }): Promise<HttpResult>` - dipakai Task 2 secara tidak langsung lewat route `POST /api/admin/change-secret` (dipanggil `ChangeSecretForm.tsx`).

- [ ] **Step 1: Tulis test yang gagal untuk `handleAdminLoginByKey` (perilaku baru) dan `handleChangeAdminSecret`**

Modify `modules/user/controller/__tests__/admin.controller.test.ts`. Ubah bagian import di atas dari:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../repository/user.repository', () => ({
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../../../shared/database/postgres.client', () => ({
  pool: { query: vi.fn() },
}));

import { handleSetProStatus } from '../admin.controller';
import { getUserByEmail, updateUser } from '../../repository/user.repository';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '../../../../shared/constants/cookie-names';
import { ForbiddenError, ValidationError, NotFoundError } from '../../../../shared/errors/app-error';
import type { User } from '../../types/user.types';
```

jadi:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('../../repository/user.repository', () => ({
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../repository/admin-secret.repository', () => ({
  getAdminSecretHash: vi.fn(),
  setAdminSecretHash: vi.fn(),
}));
vi.mock('../../../../shared/database/postgres.client', () => ({
  pool: { query: vi.fn() },
}));

import { handleSetProStatus, handleAdminLoginByKey, handleChangeAdminSecret } from '../admin.controller';
import { getUserByEmail, updateUser } from '../../repository/user.repository';
import { getAdminSecretHash, setAdminSecretHash } from '../../repository/admin-secret.repository';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '../../../../shared/constants/cookie-names';
import { ForbiddenError, ValidationError, NotFoundError } from '../../../../shared/errors/app-error';
import type { User } from '../../types/user.types';
```

Tambahkan blok test baru di akhir file (setelah `describe('handleSetProStatus', ...)` yang sudah ada, sebelum kurung kurawal penutup file):

```ts

describe('handleAdminLoginByKey', () => {
  const ORIGINAL_ENV = process.env.ADMIN_SECRET_KEY;

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    process.env.ADMIN_SECRET_KEY = ORIGINAL_ENV;
  });

  it('key null -> 404', async () => {
    const result = await handleAdminLoginByKey(null);
    expect(result.status).toBe(404);
  });

  it('hash di DB ada dan cocok -> berhasil, env var tidak perlu dicek', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-tidak-dipakai';
    vi.mocked(getAdminSecretHash).mockResolvedValue(bcrypt.hashSync('password-db-benar', 10));

    const result = await handleAdminLoginByKey('password-db-benar');

    expect(result.status).toBe(302);
    expect(result.redirectTo).toBe('/dashboard');
  });

  it('hash di DB ada tapi tidak cocok, env var cocok -> tetap berhasil (jalur darurat)', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(bcrypt.hashSync('password-db-lain', 10));

    const result = await handleAdminLoginByKey('env-secret-darurat');

    expect(result.status).toBe(302);
  });

  it('hash di DB null (belum pernah ganti) -> jatuh ke env var', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(null);

    const result = await handleAdminLoginByKey('env-secret-darurat');

    expect(result.status).toBe(302);
  });

  it('tidak cocok keduanya -> 404', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(bcrypt.hashSync('password-db-lain', 10));

    const result = await handleAdminLoginByKey('salah-semua');

    expect(result.status).toBe(404);
  });
});

describe('handleChangeAdminSecret', () => {
  const ORIGINAL_ENV = process.env.ADMIN_SECRET_KEY;

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    process.env.ADMIN_SECRET_KEY = ORIGINAL_ENV;
  });

  it('tanpa cookie admin valid -> ForbiddenError, setAdminSecretHash tidak dipanggil', async () => {
    await expect(
      handleChangeAdminSecret(adminCookieStore(false), { currentKey: 'apa-saja', newKey: 'password-baru-yang-panjang' })
    ).rejects.toThrow(ForbiddenError);
    expect(setAdminSecretHash).not.toHaveBeenCalled();
  });

  it('currentKey/newKey kosong atau bukan string -> ValidationError', async () => {
    await expect(
      handleChangeAdminSecret(adminCookieStore(true), { currentKey: undefined, newKey: 'password-baru-yang-panjang' })
    ).rejects.toThrow(ValidationError);
  });

  it('newKey kurang dari 12 karakter -> ValidationError', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';

    await expect(
      handleChangeAdminSecret(adminCookieStore(true), { currentKey: 'env-secret-darurat', newKey: 'pendek' })
    ).rejects.toThrow(ValidationError);
  });

  it('currentKey salah (tidak cocok DB maupun env var) -> ValidationError, setAdminSecretHash tidak dipanggil', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(null);

    await expect(
      handleChangeAdminSecret(adminCookieStore(true), { currentKey: 'salah-total', newKey: 'password-baru-yang-panjang' })
    ).rejects.toThrow(ValidationError);
    expect(setAdminSecretHash).not.toHaveBeenCalled();
  });

  it('path sukses lewat env var -> setAdminSecretHash dipanggil dengan hash (bukan plaintext), balas 200', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(null);
    vi.mocked(setAdminSecretHash).mockResolvedValue(undefined);

    const result = await handleChangeAdminSecret(adminCookieStore(true), {
      currentKey: 'env-secret-darurat',
      newKey: 'password-baru-yang-panjang',
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true });
    expect(setAdminSecretHash).toHaveBeenCalledTimes(1);
    const savedHash = vi.mocked(setAdminSecretHash).mock.calls[0][0];
    expect(savedHash).not.toBe('password-baru-yang-panjang');
    expect(bcrypt.compareSync('password-baru-yang-panjang', savedHash)).toBe(true);
  });

  it('path sukses lewat password DB lama -> berhasil', async () => {
    vi.mocked(getAdminSecretHash).mockResolvedValue(bcrypt.hashSync('password-db-lama', 10));
    vi.mocked(setAdminSecretHash).mockResolvedValue(undefined);

    const result = await handleChangeAdminSecret(adminCookieStore(true), {
      currentKey: 'password-db-lama',
      newKey: 'password-baru-yang-lain-lagi',
    });

    expect(result.status).toBe(200);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run modules/user/controller/__tests__/admin.controller.test.ts`
Expected: FAIL - `handleAdminLoginByKey`/`handleChangeAdminSecret` tidak mengenali mock baru / `Cannot find module '../../repository/admin-secret.repository'`.

- [ ] **Step 3: Buat repository baru**

Buat file `modules/user/repository/admin-secret.repository.ts`:

```ts
import { pool } from '../../../shared/database/postgres.client';

// Password akses /admin disimpan di sini (hash bcrypt, bukan plaintext) - sebelumnya
// cuma ADMIN_SECRET_KEY env var yang tidak bisa dibaca ulang begitu tersimpan sebagai
// tipe "Sensitive" di Vercel, dan butuh deploy ulang tiap ganti. Tabel ini bikin admin
// bisa ganti sendiri lewat form di /admin, langsung aktif tanpa deploy ulang.
// ADMIN_SECRET_KEY TETAP dipertahankan terpisah sebagai jalur darurat - lihat
// verifyAdminSecret() di admin.controller.ts.
let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool
      .query(
        `
      CREATE TABLE IF NOT EXISTS admin_secret (
        id INTEGER PRIMARY KEY,
        secret_hash TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `
      )
      .then(() => {});
  }
  return schemaReady;
}

export async function getAdminSecretHash(): Promise<string | null> {
  await ensureSchema();
  const { rows } = await pool.query('SELECT secret_hash FROM admin_secret WHERE id = 1');
  return rows[0]?.secret_hash ?? null;
}

export async function setAdminSecretHash(hash: string): Promise<void> {
  await ensureSchema();
  await pool.query(
    `INSERT INTO admin_secret (id, secret_hash, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET secret_hash = EXCLUDED.secret_hash, updated_at = EXCLUDED.updated_at`,
    [hash]
  );
}
```

- [ ] **Step 4: Ubah `admin.controller.ts` - tambah `verifyAdminSecret`, ubah `handleAdminLoginByKey`, tambah `handleChangeAdminSecret`**

Modify `modules/user/controller/admin.controller.ts`. Ubah baris import paling atas dari:

```ts
import crypto from 'crypto';
import { ForbiddenError, ValidationError, NotFoundError } from '../../../shared/errors/app-error';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE, ADMIN_BADGE_COOKIE, ROLE_BADGE_COOKIE } from '../../../shared/constants/cookie-names';
import { isAdminFromRequestCookies, getAdminStatsToday, getAdminExportData } from '../service/admin.service';
import { getUserByEmail, updateUser } from '../repository/user.repository';
import { logger } from '../../../shared/logger/logger';
import type { HttpResult, CookieToSet } from '../../../shared/types/http-result.types';
```

jadi:

```ts
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ForbiddenError, ValidationError, NotFoundError } from '../../../shared/errors/app-error';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE, ADMIN_BADGE_COOKIE, ROLE_BADGE_COOKIE } from '../../../shared/constants/cookie-names';
import { isAdminFromRequestCookies, getAdminStatsToday, getAdminExportData } from '../service/admin.service';
import { getUserByEmail, updateUser } from '../repository/user.repository';
import { getAdminSecretHash, setAdminSecretHash } from '../repository/admin-secret.repository';
import { logger } from '../../../shared/logger/logger';
import type { HttpResult, CookieToSet } from '../../../shared/types/http-result.types';
```

Ubah `handleAdminLoginByKey` dari:

```ts
// Key salah / env var belum di-set -> 404 (tidak membocorkan bahwa route ini ada).
export async function handleAdminLoginByKey(key: string | null): Promise<HttpResult> {
  const secret = getAdminSecret();
  if (!secret || !key || !timingSafeStringEqual(key, secret)) {
    return { status: 404, body: { error: 'Not found' } };
  }
  return { status: 302, body: null, redirectTo: '/dashboard', cookiesToSet: adminCookies() };
}
```

jadi:

```ts
// Password admin sekarang ada DUA sumber valid - hash di database (bisa diganti
// admin sendiri lewat /admin, lihat handleChangeAdminSecret) ATAU ADMIN_SECRET_KEY
// env var (jalur darurat permanen, bukan cuma bootstrap - lihat spec
// docs/superpowers/specs/2026-08-02-admin-secret-self-service-design.md). Salah
// satu cocok sudah cukup.
async function verifyAdminSecret(key: string): Promise<boolean> {
  const dbHash = await getAdminSecretHash();
  if (dbHash && (await bcrypt.compare(key, dbHash))) return true;

  const envSecret = getAdminSecret();
  if (envSecret && timingSafeStringEqual(key, envSecret)) return true;

  return false;
}

// Key salah -> 404 (tidak membocorkan bahwa route ini ada).
export async function handleAdminLoginByKey(key: string | null): Promise<HttpResult> {
  if (!key || !(await verifyAdminSecret(key))) {
    return { status: 404, body: { error: 'Not found' } };
  }
  return { status: 302, body: null, redirectTo: '/dashboard', cookiesToSet: adminCookies() };
}
```

Tambahkan fungsi baru di akhir file (setelah `handleSetProStatus`):

```ts

const MIN_ADMIN_SECRET_LENGTH = 12;

export async function handleChangeAdminSecret(
  cookieStore: { get(name: string): { value: string } | undefined },
  body: { currentKey?: unknown; newKey?: unknown }
): Promise<HttpResult> {
  if (!isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  if (typeof body.currentKey !== 'string' || !body.currentKey || typeof body.newKey !== 'string') {
    throw new ValidationError('Password saat ini dan password baru wajib diisi');
  }
  if (body.newKey.length < MIN_ADMIN_SECRET_LENGTH) {
    throw new ValidationError(`Password baru minimal ${MIN_ADMIN_SECRET_LENGTH} karakter`);
  }
  if (!(await verifyAdminSecret(body.currentKey))) {
    throw new ValidationError('Password saat ini salah');
  }
  const newHash = await bcrypt.hash(body.newKey, 10);
  await setAdminSecretHash(newHash);
  logger.info('Admin secret diganti');
  return { status: 200, body: { success: true } };
}
```

- [ ] **Step 5: Jalankan test, pastikan lolos**

Run: `npx vitest run modules/user/controller/__tests__/admin.controller.test.ts`
Expected: PASS - 16 test lolos (5 `handleSetProStatus` yang sudah ada + 5 `handleAdminLoginByKey` baru + 6 `handleChangeAdminSecret` baru).

- [ ] **Step 6: Ekspor `handleChangeAdminSecret` dari `modules/user/index.ts`**

Modify `modules/user/index.ts`, ubah blok ekspor admin controller dari:

```ts
export {
  handleAdminLoginByKey,
  handleAdminStatus,
  handleAdminStats,
  handleAdminExport,
  handleSetProStatus,
} from './controller/admin.controller';
```

jadi:

```ts
export {
  handleAdminLoginByKey,
  handleAdminStatus,
  handleAdminStats,
  handleAdminExport,
  handleSetProStatus,
  handleChangeAdminSecret,
} from './controller/admin.controller';
```

- [ ] **Step 7: Buat route handler**

Buat file `app/api/admin/change-secret/route.ts`:

```ts
import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { handleChangeAdminSecret } from '@/modules/user';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return runController(async () => handleChangeAdminSecret(cookies(), body));
}
```

- [ ] **Step 8: Jalankan seluruh suite test + typecheck**

Run: `npx vitest run`
Expected: semua test lolos (termasuk yang baru dari Step 5).

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: tidak ada error.

- [ ] **Step 9: Commit**

```bash
git add modules/user/repository/admin-secret.repository.ts modules/user/controller/admin.controller.ts modules/user/controller/__tests__/admin.controller.test.ts modules/user/index.ts app/api/admin/change-secret/route.ts
git commit -m "feat: simpan password admin di database, tambah jalur ganti password mandiri"
```

---

## Task 2: UI - form ganti password admin + dokumentasi

**Files:**
- Create: `app/admin/ChangeSecretForm.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `DEPLOYMENT.md`

**Interfaces:**
- Consumes: `POST /api/admin/change-secret` (Task 1) - request body `{ currentKey: string; newKey: string }`, response `{ success: true }` (200) atau `{ error: string; code: string }` (403/400).

- [ ] **Step 1: Buat komponen form**

Buat file `app/admin/ChangeSecretForm.tsx`:

```tsx
'use client';

import React, { useState } from 'react';

export default function ChangeSecretForm() {
  const [currentKey, setCurrentKey] = useState('');
  const [newKey, setNewKey] = useState('');
  const [confirmKey, setConfirmKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentKey || !newKey) {
      setMessage({ text: 'Isi password saat ini dan password baru', isError: true });
      return;
    }
    if (newKey.length < 12) {
      setMessage({ text: 'Password baru minimal 12 karakter', isError: true });
      return;
    }
    if (newKey !== confirmKey) {
      setMessage({ text: 'Konfirmasi password baru tidak cocok', isError: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/change-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentKey, newKey }),
      });
      let data: { success?: boolean; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        setMessage({ text: `Server error (HTTP ${res.status})`, isError: true });
        return;
      }
      if (!res.ok) {
        setMessage({ text: data.error || 'Gagal memproses', isError: true });
        return;
      }
      setMessage({ text: 'Password admin berhasil diganti', isError: false });
      setCurrentKey('');
      setNewKey('');
      setConfirmKey('');
    } catch {
      setMessage({ text: 'Gagal terhubung ke server', isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-tv-card border border-tv-border rounded-lg p-6 mb-8">
      <h2 className="font-heading text-lg font-bold text-tv-text mb-1">Ganti Password Admin</h2>
      <p className="text-xs text-tv-muted mb-4">Berlaku langsung, tanpa perlu deploy ulang. Minimal 12 karakter.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
        <input
          type="password"
          value={currentKey}
          onChange={(e) => setCurrentKey(e.target.value)}
          placeholder="Password saat ini"
          autoComplete="off"
          className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <input
          type="password"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="Password baru (min. 12 karakter)"
          autoComplete="off"
          className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <input
          type="password"
          value={confirmKey}
          onChange={(e) => setConfirmKey(e.target.value)}
          placeholder="Konfirmasi password baru"
          autoComplete="off"
          className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 text-sm text-tv-text placeholder:text-tv-muted focus:outline-none focus:border-tv-blue"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-tv-blue hover:bg-tv-blueHover text-white font-bold px-4 py-2 rounded-md text-sm transition-colors disabled:opacity-50"
        >
          Ganti Password
        </button>
      </form>
      {message && (
        <p className={`mt-3 text-sm ${message.isError ? 'text-tv-red' : 'text-tv-green'}`}>{message.text}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wiring ke `app/admin/page.tsx`**

Modify `app/admin/page.tsx`. Ubah import di baris atas dari:

```tsx
import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getActiveUsers } from '@/shared/auth/presence';
import ExportButton from './ExportButton';
import SetProForm from './SetProForm';
```

jadi:

```tsx
import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getActiveUsers } from '@/shared/auth/presence';
import ExportButton from './ExportButton';
import SetProForm from './SetProForm';
import ChangeSecretForm from './ChangeSecretForm';
```

Lalu tambahkan `<ChangeSecretForm />` tepat setelah `<SetProForm />`:

```tsx
        <SetProForm />
        <ChangeSecretForm />
```

- [ ] **Step 3: Jalankan typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: tidak ada error.

- [ ] **Step 4: Verifikasi manual di browser**

Run `npm run dev`, login admin lewat `/admin-login` (pakai `ADMIN_SECRET_KEY` dari `.env.local`), buka `/admin`. Pastikan:
- Card "Ganti Password Admin" muncul di bawah card "Aktivasi Pro".
- Isi "Password saat ini" dengan nilai `ADMIN_SECRET_KEY` dari `.env.local`, "Password baru" dengan string 12+ karakter, konfirmasi yang sama -> submit -> pesan sukses hijau.
- Logout, login lagi ke `/admin-login` pakai PASSWORD BARU tadi -> berhasil masuk.
- Login lagi ke `/admin-login` pakai `ADMIN_SECRET_KEY` env var yang LAMA -> tetap berhasil masuk (jalur darurat masih jalan).
- Coba ganti password lagi dengan "Password saat ini" yang SALAH -> pesan error "Password saat ini salah".
- Coba isi "Password baru" kurang dari 12 karakter -> pesan error client-side, tidak ada request terkirim (cek Network tab devtools).
- Coba isi "Konfirmasi password baru" beda dengan "Password baru" -> pesan error client-side, tidak ada request terkirim.

- [ ] **Step 5: Update dokumentasi**

Modify `DEPLOYMENT.md`. Cari baris ini (baris ~60):

```
| `ADMIN_SECRET_KEY` | ✅ (baru ditambahkan 2026-07-29) | buat jalur `/admin-login/key?key=...` supaya dapet cookie admin di production. **Nilai aslinya ada di Vercel env vars (encrypted) dan `.env.local` lokal (gitignored) - jangan pernah commit nilainya ke git atau taruh di file yang ke-track.** |
```

Ganti jadi:

```
| `ADMIN_SECRET_KEY` | ✅ (baru ditambahkan 2026-07-29, dirotasi 2026-08-02) | Sejak 2026-08-02 ini JALUR DARURAT, bukan satu-satunya cara login admin lagi - password utama sekarang disimpan sebagai hash di tabel `admin_secret` (database), bisa diganti admin sendiri lewat form "Ganti Password Admin" di `/admin` tanpa deploy ulang (lihat `modules/user/controller/admin.controller.ts` `handleChangeAdminSecret`). Env var ini tetap harus di-set sebagai cadangan kalau password database sampai lupa. **Nilai aslinya ada di Vercel env vars (Sensitive - TIDAK BISA dibaca ulang sekali tersimpan, lihat insiden 2026-08-02) dan `.env.local` lokal (gitignored) - jangan pernah commit nilainya ke git atau taruh di file yang ke-track.** |
```

- [ ] **Step 6: Commit**

```bash
git add app/admin/ChangeSecretForm.tsx app/admin/page.tsx DEPLOYMENT.md
git commit -m "feat: tambah form ganti password admin mandiri + dokumentasi"
```

---

## Verifikasi Akhir (setelah semua task selesai)

- [ ] Run `npx vitest run` - semua test lolos (termasuk test baru dari Task 1).
- [ ] Run `npx tsc --noEmit -p tsconfig.json` - tidak ada error.
- [ ] Uji end-to-end manual di browser sesuai Task 2 Step 4 - password lama (env var) dan password baru (database) SAMA-SAMA harus bisa dipakai login setelah penggantian.
