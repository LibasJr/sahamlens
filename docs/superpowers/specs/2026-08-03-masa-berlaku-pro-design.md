# Masa Berlaku Pro — Design

**Tanggal:** 2026-08-03
**Status:** Menunggu review
**Menyentuh:** `shared/auth/session.ts`, `modules/user/**`, `app/admin/**`, halaman akun

## Masalah

Status Pro tidak punya masa berlaku sama sekali. Kolomnya hanya boolean:

```sql
users.is_pro BOOLEAN NOT NULL DEFAULT false
```

Admin panel membalik nilai itu dan tidak menyimpan apa pun tentang durasi
(`modules/user/controller/admin.controller.ts:104`):

```ts
await updateUser(user.id, { is_pro: body.isPro });
```

Gerbang aksesnya (`shared/auth/session.ts:28-33`) hanya membaca boolean:

```ts
export function checkProAccess(session: SessionPayload | null): boolean {
  if (!session) return false;
  if (session.role === 'admin' || session.role === 'pro' || session.is_pro) return true;
  if (session.trial_ends_at && new Date(session.trial_ends_at) > new Date()) return true;
  return false;
}
```

**Akibatnya siapa pun yang sekali diaktifkan jadi Pro mendapat akses selamanya.**
Pengguna yang membayar Rp 99.000 untuk satu bulan tidak akan pernah kehilangan akses
kecuali admin mematikannya manual. Ini kebocoran pendapatan yang sedang berjalan, bukan
risiko teoretis.

Tidak ada pula konsep paket. Satu-satunya penyebutan durasi ada di teks tombol WhatsApp
(`components/PaywallModal.tsx:66`, "Rp99.000/bulan") — sistemnya sendiri tidak mengenal
konsep bulan.

Temuan tambahan: `role === 'pro'` memberi akses tanpa syarat, tetapi **tidak ada satu baris
kode pun yang menulis nilai itu**. Hanya `is_pro` yang pernah ditulis. Jalur itu praktis
mati, namun tetap membuka akses abadi yang tidak bisa dicabut lewat tanggal seandainya ada
baris lama di database.

## Keputusan

| Pertanyaan | Keputusan |
|---|---|
| Akun Pro yang sudah ada | Diberi masa berlaku 1 bulan sejak migrasi |
| Paket | 1 bulan, 1 tahun, plus tanggal bebas untuk kasus khusus |
| Perpanjangan sebelum habis | Ditambahkan dari tanggal berakhir — sisa hari tidak hangus |
| Yang dilihat pengguna | Tanggal berakhir + sisa hari |
| Yang dilihat admin | Kolom tanggal berakhir di daftar user, dengan penanda kedaluwarsa |

## Arsitektur

Satu kolom baru, satu titik pengecekan. Tidak ada layanan baru, tidak ada cron.

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;
```

Meniru pola `trial_ends_at` yang sudah ada di tabel dan gerbang yang sama — pola itu sudah
terbukti bekerja, jadi tidak perlu mekanisme kedua yang berbeda bentuk.

`null` berarti tanpa batas waktu. Nilai itu dipakai untuk akun admin dan sebagai keadaan
awal kolom, **bukan** sebagai jalan pintas memberi akses abadi ke pengguna biasa.

### Gerbang akses

Seluruh perubahan perilaku terjadi di `checkProAccess()`:

```ts
function isProExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;          // null = tanpa batas
  return new Date(expiresAt) <= new Date();
}

export function checkProAccess(session: SessionPayload | null): boolean {
  if (!session) return false;
  if (session.role === 'admin') return true;
  if (session.is_pro && !isProExpired(session.pro_expires_at)) return true;
  if (session.trial_ends_at && new Date(session.trial_ends_at) > new Date()) return true;
  return false;
}
```

Tiga perubahan:

1. **`is_pro` kini tunduk pada tanggal.** Inti perbaikannya.
2. **`role === 'pro'` dihapus dari kondisi.** Tidak ada kode yang menulisnya, dan
   membiarkannya berarti menyisakan jalur akses yang kebal tanggal. Admin tetap lolos
   tanpa syarat lewat cabang pertama.
3. **Tanpa cron.** Kedaluwarsa dihitung saat diperiksa, bukan lewat job terjadwal yang
   bisa gagal diam-diam dan menyisakan akun aktif melewati masa bayarnya.

`checkProAccessLive()` tidak perlu diubah logikanya — ia sudah membaca ulang dari database
ketika JWT bilang "tidak". Yang perlu ditambahkan agar tanggal ikut terbawa:

- `SessionPayload` di `shared/auth/jwt.ts` mendapat `pro_expires_at?: string | null`
- `fetchLiveProFields()` di `shared/auth/pro-status.ts` menambahkan kolom itu ke `SELECT`
  dan ke tipe kembaliannya
- `checkProAccessLive()` meneruskannya saat menyusun ulang objek sesi
- Token yang dibuat di `modules/user/service/auth.service.ts` menyertakan field itu

Field dibuat opsional supaya JWT lama yang belum memuatnya tetap bisa didekode — nilainya
`undefined`, diperlakukan sama dengan null, lalu dikoreksi oleh pembacaan ulang ke database.

Karena `checkProAccess()` adalah satu-satunya gerbang untuk **16 route** (`/api/backtest`,
`/api/ai-pick`, `/api/council`, `/api/compare`, `/api/market-pulse`, `/api/stock/[ticker]`,
dan seterusnya), begitu tanggal lewat, akses tertutup di semuanya sekaligus tanpa perubahan
lain di route mana pun.

### Perpanjangan menumpuk

```ts
/** Menambah durasi dari tanggal berakhir kalau masa berlaku BELUM habis, supaya sisa
 * hari yang sudah dibayar tidak hangus. Kalau sudah lewat atau belum pernah ada,
 * dihitung dari sekarang. */
export function extendProExpiry(current: string | null, months: number): string {
  const now = new Date();
  const base = current && new Date(current) > now ? new Date(current) : now;
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}
```

Fungsi murni, tanpa I/O, sehingga bisa diuji langsung.

Keterbatasan yang diketahui dan diterima: `setMonth()` melimpah untuk tanggal yang tidak
ada di bulan tujuan — 31 Januari + 1 bulan menghasilkan 3 Maret, bukan 28/29 Februari. Ini
perilaku baku JavaScript, memihak pengguna (dapat 1-2 hari lebih), dan terjadi paling
banyak beberapa kali setahun. Tidak perlu pustaka tanggal tambahan hanya untuk itu.

### Admin panel

Menggantikan tombol aktivasi boolean yang ada sekarang:

| Aksi | Efek |
|---|---|
| **+1 Bulan** | `is_pro = true`, `pro_expires_at = extendProExpiry(current, 1)` |
| **+1 Tahun** | `is_pro = true`, `pro_expires_at = extendProExpiry(current, 12)` |
| **Tanggal bebas** | `is_pro = true`, `pro_expires_at = <tanggal pilihan>` |
| **Cabut** | `is_pro = false`, `pro_expires_at = null` |

Daftar user mendapat kolom tanggal berakhir, dengan penanda merah untuk yang sudah lewat
supaya admin bisa melihat sekilas siapa yang perlu ditagih.

### Migrasi akun lama

Dijalankan sekali saat kolom dibuat, di tempat yang sama dengan pembuatan kolom
(`modules/user/repository/user.repository.ts`, mengikuti pola `ALTER TABLE ... ADD COLUMN
IF NOT EXISTS` yang sudah ada di sana):

```sql
UPDATE users
SET pro_expires_at = NOW() + INTERVAL '1 month'
WHERE is_pro = true AND pro_expires_at IS NULL AND role <> 'admin';
```

Akun admin sengaja dilewati agar tidak mengunci diri sendiri. Kondisi
`pro_expires_at IS NULL` membuat pernyataan ini aman dijalankan berulang — akun yang sudah
punya tanggal tidak akan tertimpa.

## Tampilan pengguna

Halaman akun menampilkan:

> **Pro aktif sampai 3 September 2026** (31 hari lagi)

Sisa hari dihitung di sisi klien dari tanggal yang dikirim API, sehingga tidak ada
perhitungan waktu yang tersimpan dan menjadi basi.

Kalau `pro_expires_at` bernilai null pada pengguna Pro (kasus lama yang belum termigrasi),
tampilkan **"Pro aktif"** tanpa tanggal — jangan menampilkan tanggal palsu.

## Penanganan kegagalan

| Kondisi | Perilaku |
|---|---|
| `pro_expires_at` null pada pengguna Pro | Dianggap tanpa batas — akses diberikan, UI menampilkan "Pro aktif" tanpa tanggal |
| `pro_expires_at` lewat | Akses ditolak di 16 route sekaligus; UI menampilkan status non-Pro dan ajakan perpanjang |
| JWT lama tanpa field `pro_expires_at` | `undefined` diperlakukan seperti null oleh `isProExpired()`; `checkProAccessLive()` membaca ulang dari DB dan mendapat nilai yang benar |
| Database gagal saat re-check | Tetap tolak (fail-closed) — perilaku yang sudah ada, tidak diubah |
| Admin memasukkan tanggal di masa lalu | Diterima apa adanya; efeknya sama dengan mencabut akses, dan itu memang bisa disengaja |

## Pengujian

Gerbang akses diuji paling ketat karena satu kesalahan di situ membuka 16 route sekaligus.
Ditulis lebih dulu, masing-masing harus gagal sebelum implementasi ada:

1. Pro dengan `pro_expires_at` di masa depan → lolos.
2. Pro dengan `pro_expires_at` di masa lalu → **ditolak**. Ini inti perbaikannya.
3. Pro dengan `pro_expires_at` null → lolos (kompatibilitas akun lama).
4. `role: 'pro'` dengan tanggal di masa lalu → **ditolak**; celah lama tertutup.
5. Admin tanpa `pro_expires_at` → selalu lolos.
6. Trial masih aktif meski bukan Pro → tetap lolos, tidak terganggu perubahan ini.
7. Trial kedaluwarsa dan bukan Pro → ditolak.
8. `extendProExpiry()` menumpuk dari tanggal berakhir saat masa berlaku belum habis.
9. `extendProExpiry()` menghitung dari sekarang saat tanggal sudah lewat.
10. `extendProExpiry()` menghitung dari sekarang saat `current` null.
11. `extendProExpiry(current, 12)` menghasilkan tahun berikutnya.

## Yang sengaja tidak dikerjakan

- **Tidak ada peringatan menjelang habis.** Diputuskan tidak perlu untuk sekarang;
  menampilkan tanggal sudah menjawab keluhan aslinya.
- **Tidak ada cron kedaluwarsa.** Pengecekan berbasis tanggal saat diperiksa lebih andal
  daripada job yang bisa gagal diam-diam.
- **Tidak menyentuh alur pembayaran.** Aktivasi tetap manual lewat admin setelah bukti
  transfer via WhatsApp, persis seperti sekarang.
- **Harga tidak ditetapkan di kode.** Paket hanya menentukan durasi; nominal tetap urusan
  di luar sistem.
- **Backtest, AI Pick, dan Screener tidak disentuh.**
