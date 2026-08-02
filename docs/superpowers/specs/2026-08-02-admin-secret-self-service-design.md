# Ganti Password Admin Secara Mandiri (Self-Service)

## Konteks & Tujuan

Akses ke halaman `/admin` digerbang oleh `ADMIN_SECRET_KEY`, sebuah environment
variable bertipe "Sensitive" di Vercel. Insiden yang memicu perubahan ini:
nilai `ADMIN_SECRET_KEY` yang lama tidak bisa dibaca ulang oleh siapapun
(termasuk lewat `vercel env pull`, yang cuma mengembalikan placeholder
`[SENSITIVE]`) begitu tersimpan sebagai tipe Sensitive — satu-satunya cara
memperbaikinya adalah membuat nilai baru lewat Vercel CLI/dashboard lalu
deploy ulang, sesuatu yang tidak bisa dilakukan admin sendiri dari dalam
aplikasi.

Tujuan perubahan ini: admin bisa mengganti password akses `/admin` sendiri
lewat form di halaman itu juga, tanpa perlu deploy ulang, dengan tetap
menyediakan jalur darurat kalau password baru itu sendiri lupa/hilang.

## Arsitektur

Password admin dipindah ke database (tabel baru `admin_secret`, satu baris),
disimpan sebagai hash `bcrypt` — pola yang sama persis dengan
`password_hash` user biasa di `modules/user/service/auth.service.ts`.
`ADMIN_SECRET_KEY` di Vercel **tetap ada** dan tetap berfungsi sebagai jalur
login alternatif selamanya (bukan cuma bootstrap sekali pakai) — verifikasi
password saat login maupun saat ganti password mengecek KEDUA sumber (hash DB
ATAU env var), salah satu cocok sudah cukup. Ini sengaja dipertahankan
sebagai jalur darurat: kalau password baru di database sampai lupa, admin
(lewat saya) masih bisa reset akses dengan mengganti `ADMIN_SECRET_KEY` di
Vercel seperti biasa, tanpa perlu menyentuh database secara langsung.

**Tiga bagian yang berubah:**

1. `modules/user/repository/admin-secret.repository.ts` (baru) — baca/tulis
   hash password admin di tabel `admin_secret`.
2. `modules/user/controller/admin.controller.ts` — `handleAdminLoginByKey`
   diubah untuk mengecek hash DB ATAU env var (bukan cuma env var seperti
   sekarang); fungsi baru `handleChangeAdminSecret` untuk aksi ganti
   password, dipakai bersama lewat helper `verifyAdminSecret()`.
3. Form baru "Ganti Password Admin" di halaman `/admin`
   (`app/admin/ChangeSecretForm.tsx`) + route baru
   `POST /api/admin/change-secret`.

## Detail Komponen

### Skema database: tabel `admin_secret`

```sql
CREATE TABLE IF NOT EXISTS admin_secret (
  id INTEGER PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Selalu satu baris (`id = 1`), di-upsert. Mengikuti pola auto-migrate
`ensureSchema()` yang sudah ada di
`modules/user/repository/user.repository.ts` (bukan sistem migrasi formal -
proyek ini belum punya).

### `modules/user/repository/admin-secret.repository.ts` (baru)

```ts
export async function getAdminSecretHash(): Promise<string | null>
export async function setAdminSecretHash(hash: string): Promise<void>
```

`getAdminSecretHash()` mengembalikan `null` kalau tabel masih kosong (belum
pernah ganti password sejak fitur ini ada) - ini yang membuat env var tetap
jadi satu-satunya jalur sampai admin pertama kali memakai form ganti
password.

### `modules/user/controller/admin.controller.ts`

Helper baru (dipakai baik oleh login maupun ganti password):

```ts
async function verifyAdminSecret(key: string): Promise<boolean> {
  const dbHash = await getAdminSecretHash();
  if (dbHash && (await bcrypt.compare(key, dbHash))) return true;

  const envSecret = getAdminSecret();
  if (envSecret && timingSafeStringEqual(key, envSecret)) return true;

  return false;
}
```

`handleAdminLoginByKey` diubah dari membandingkan langsung ke `envSecret`
jadi memanggil `verifyAdminSecret(key)` - perilaku 404-untuk-key-salah yang
sudah ada (sengaja tidak membocorkan info apapun) tidak berubah.

Fungsi baru:

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
  return { status: 200, body: { success: true } };
}
```

Gerbang aksi ini `isAdminFromRequestCookies()` (harus sudah login admin lewat
cookie yang ada) DITAMBAH verifikasi ulang `currentKey` - pola standar "ganti
password" (bukti masih tahu password lama), konsisten dengan gerbang ganda
yang sudah dipakai `handleSetProStatus`.

### `POST /api/admin/change-secret` (baru)

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

### `app/admin/ChangeSecretForm.tsx` (baru) + wiring ke `app/admin/page.tsx`

Client component: 3 input (`Password Saat Ini`, `Password Baru`, `Konfirmasi
Password Baru`, semua `type="password"`), validasi client-side "Password
Baru" dan "Konfirmasi" harus sama sebelum kirim request, tombol submit,
pesan sukses/gagal - mengikuti pola `SetProForm.tsx` yang sudah ada
(state `loading`/`message`, `fetch` + try/catch/finally).

Dirender di `app/admin/page.tsx`, tepat setelah `<SetProForm />` dan sebelum
card "Aktif Sekarang" - dua aksi berbeda (aktivasi Pro vs ganti password
admin), dipisah jadi dua card terpisah, bukan digabung dalam satu form,
supaya tidak membingungkan.

## Error Handling

- `POST /api/admin/change-secret` tanpa cookie admin valid → 403.
- `currentKey`/`newKey` kosong atau bukan string → 400.
- `newKey` kurang dari 12 karakter → 400, pesan spesifik.
- `currentKey` tidak cocok (baik ke DB maupun env var) → 400, pesan "Password
  saat ini salah".
- Login admin (`/admin-login`) - perilaku 404-untuk-key-salah yang sudah ada
  TIDAK berubah, cuma logikanya sekarang mengecek dua sumber.

## Testing

- Unit test `verifyAdminSecret` (lewat `handleAdminLoginByKey` dan
  `handleChangeAdminSecret`, tidak diekspor sendiri): mock
  `getAdminSecretHash`/`setAdminSecretHash` dari repository baru, mock
  `bcrypt.compare`/`bcrypt.hash`, assert:
  - Hash DB ada dan cocok → berhasil, env var tidak ikut dicek.
  - Hash DB ada tapi tidak cocok, env var cocok → tetap berhasil (jalur
    darurat berfungsi).
  - Hash DB `null` (belum pernah ganti) → jatuh ke pengecekan env var.
  - Keduanya tidak cocok → gagal.
- Unit test `handleChangeAdminSecret`: assert path forbidden (bukan admin),
  path validasi (body kosong, newKey pendek), path currentKey salah, dan
  path sukses (assert `setAdminSecretHash` dipanggil dengan hash yang benar
  - bukan `newKey` mentah).
- Tidak menambah test untuk `ChangeSecretForm.tsx` (komponen client,
  konsisten dengan konvensi repo ini - `SetProForm.tsx` juga tidak ada
  test-nya).

## Dampak ke Dokumentasi

`DEPLOYMENT.md` mendapat catatan tambahan di baris `ADMIN_SECRET_KEY` yang
sudah ada: sekarang berfungsi sebagai jalur login CADANGAN (bukan
satu-satunya), password utama disimpan di database dan bisa diganti admin
sendiri lewat `/admin`.

## Di Luar Cakupan

- Riwayat/log siapa mengganti password admin kapan - tidak diminta, YAGNI
  (beda dari audit log aktivasi Pro yang sudah ada, yang menyangkut uang;
  ini murni kredensial akses).
- Rate limiting khusus untuk percobaan login admin - sudah ada gap ini
  sebelum perubahan ini (route `/admin-login/key` belum masuk matcher
  rate-limit `middleware.ts`), tidak diperluas cakupannya di sini.
- Multi-admin dengan password berbeda-beda - tetap satu password admin
  untuk semua yang tahu, sama seperti sistem `ADMIN_SECRET_KEY` yang lama.
