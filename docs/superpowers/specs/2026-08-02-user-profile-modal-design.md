# Modal Detail Profil User + User Aktif untuk Admin — Design Spec

**Tanggal:** 2026-08-02
**Konteks:** Nama user di footer Sidebar (mis. "sabll873 / ADMIN") saat ini cuma teks statis, tidak bisa diklik. User ingin klik nama itu menampilkan detail profil (email, status akun, dll). Untuk akun dengan role admin, user juga ingin bisa melihat siapa saja yang sedang aktif — sempat dikira fitur ini belum ada, tapi ternyata SUDAH dibangun sebelumnya di halaman `/admin` (`getActiveUsers()`, `shared/auth/presence.ts`), hanya saja halaman itu: (1) tidak ditautkan dari menu manapun (tidak ditemukan lewat UI), dan (2) digerbang oleh sistem admin TERPISAH (`isAdminServer()`/`ADMIN_COOKIE` dari `/admin-login` + secret key) yang tidak terhubung ke `role: 'admin'` di akun biasa — jadi meskipun akun user sendiri sudah admin, dia tetap tidak bisa masuk ke `/admin` tanpa proses login admin yang berbeda itu. Fitur ini menutup celah itu dengan menaruh "User Aktif" di tempat yang mudah dijangkau (modal profil) dan menggerbangnya dengan role akun biasa.

## Keputusan produk (hasil brainstorming)

1. **Tidak ada kolom database baru.** Modal cuma menampilkan data yang SUDAH ada di tabel `users` (`modules/user/repository/user.repository.ts`): email, role, status verifikasi, status Pro, sisa masa trial, tanggal daftar. Tidak ada field nama lengkap/telepon baru — database saat ini tidak punya kolom itu sama sekali, dan menambahkannya di luar scope permintaan ini.
2. **Bentuk tampilan: modal**, bukan halaman terpisah — konsisten dengan pola `PaywallModal` yang sudah ada (overlay + panel, tanpa pindah halaman/URL baru).
3. **Section "User Aktif Sekarang" digabung ke DALAM modal profil yang sama** (bukan link ke `/admin` yang terpisah), muncul HANYA kalau `role` akun yang login adalah `'admin'` — pakai fungsi `getActiveUsers()` yang sudah ada, degradasi aman ke daftar kosong kalau Redis belum dikonfigurasi (perilaku existing, tidak diubah).
4. **Gerbang admin pakai role akun biasa** (`session.role === 'admin'`, sama seperti dicek di tempat lain di aplikasi ini, mis. `checkProAccess`), BUKAN sistem `isAdminServer()`/`ADMIN_COOKIE` milik halaman `/admin` lama — dua sistem admin ini sengaja dibiarkan terpisah (di luar scope untuk menyatukannya), fitur baru ini murni menambah jalur baru yang lebih mudah dijangkau.

## Arsitektur

### Backend: 1 endpoint baru

**`GET /api/user/profile`** (baru) — `app/api/user/profile/route.ts`, memanggil `handleGetProfile()` (baru, ditambahkan ke `modules/user/controller/auth.controller.ts` di samping `handleMe` yang sudah ada, pola controller/`HttpResult` yang sama):

```typescript
export async function handleGetProfile(): Promise<HttpResult> {
  const session = await getSession();
  if (!session) return { status: 401, body: { error: 'Belum login' } };

  const user = await getUserById(session.id);
  if (!user) return { status: 401, body: { error: 'Belum login' } };

  const body: Record<string, unknown> = {
    email: user.email,
    role: user.role,
    isPro: user.is_pro,
    isVerified: user.is_verified,
    trialEndsAt: user.trial_ends_at,
    createdAt: user.created_at,
  };

  if (user.role === 'admin') {
    body.activeUsers = await getActiveUsers();
  }

  return { status: 200, body };
}
```

`getUserById` (`modules/user/repository/user.repository.ts:46`, sudah ada) dipakai lewat import langsung di dalam module `modules/user` sendiri (bukan lintas-module, jadi tidak melanggar aturan "cuma index.ts yang boleh diimpor dari luar"). `getActiveUsers` diimpor dari `shared/auth/presence` (arah impor modules/user -> shared/ sudah benar, konsisten dengan `session.ts` yang sudah mengimpor `touchPresence` dari file yang sama).

Kenapa endpoint baru (bukan memperluas `/api/auth/me` yang sudah ada): `/api/auth/me` dipakai luas di banyak halaman cuma untuk cek status login dasar (badge UI) - payload-nya berasal dari JWT sesi yang TIDAK punya `created_at` (kolom itu cuma ada di database, bukan di token). Endpoint terpisah menjaga `/api/auth/me` tetap ringan/tidak berubah, dan `/api/user/profile` boleh melakukan 1 query database tambahan (`getUserById`) karena cuma dipanggil saat modal benar-benar dibuka, bukan di setiap render halaman.

### Frontend: 1 komponen baru + Sidebar diubah

**`components/UserProfileModal.tsx`** (baru) — modal dengan struktur overlay/panel yang sama gayanya dengan `PaywallModal.tsx` (fokus trap, Escape untuk tutup, sudah ada polanya di komponen itu - dipakai ulang caranya, bukan komponennya, karena props `PaywallModal` spesifik untuk konten paywall/upgrade, bukan info profil).

- Props: `{ open: boolean; onClose: () => void }`
- Saat `open` berubah jadi `true`: fetch `GET /api/user/profile`, tampilkan skeleton/loading singkat, lalu render:
  - Email, badge role, badge status (Terverifikasi/Belum, Pro/Free, sisa X hari trial kalau `trialEndsAt` di masa depan)
  - Tanggal daftar (format Indonesia, dari `createdAt`)
- Kalau response punya `activeUsers` (array, bisa kosong): render section terpisah "User Aktif Sekarang (N)" - daftar email + role + "terakhir aktif X menit lalu" (`lastSeen`), array kosong -> teks "Tidak ada user lain yang aktif saat ini" (bukan section kosong tanpa keterangan).
- Response 401 (sesi habis di antara buka Sidebar dan klik nama): tutup modal, tidak perlu pesan khusus (kasus tepi, jarang terjadi).

**`components/Sidebar.tsx`** (modify) — footer block yang sekarang berupa `<div>` statis (baris ~267-274) diubah jadi `<button type="button" onClick={() => setShowProfileModal(true)}>` yang membungkus avatar+nama+role (tombol logout di sebelahnya TETAP elemen terpisah dengan `onClick` sendiri, tidak berubah - supaya klik logout tidak ikut membuka modal). State baru `const [showProfileModal, setShowProfileModal] = useState(false);`, render `<UserProfileModal open={showProfileModal} onClose={() => setShowProfileModal(false)} />` di akhir komponen (hanya relevan saat `user` truthy, yang memang sudah jadi syarat blok footer ini dirender sama sekali).

### Diagram alur

```
Sidebar footer (user truthy) -> klik nama -> setShowProfileModal(true)
  -> UserProfileModal fetch GET /api/user/profile
       -> handleGetProfile(): getSession() -> getUserById() -> body dasar
                              -> kalau role==='admin': + getActiveUsers()
  -> render detail profil (+ section User Aktif kalau ada activeUsers)
```

## Error handling & edge case

- **Tidak ada sesi / sesi habis saat fetch:** 401 -> modal tutup otomatis, tidak menampilkan pesan error (kasus tepi normal, bukan kegagalan sistem yang perlu ditonjolkan).
- **Redis presence down/belum dikonfigurasi:** `getActiveUsers()` sudah balikin `[]` (perilaku existing, tidak berubah) -> section "User Aktif" tampil dengan pesan "Tidak ada user lain yang aktif saat ini", BUKAN error.
- **User bukan admin:** response tidak punya field `activeUsers` sama sekali -> frontend cukup cek `if (data.activeUsers)` untuk menampilkan section itu, tidak perlu flag boolean terpisah.
- **`trialEndsAt` di masa lalu atau null:** badge trial tidak ditampilkan sama sekali (bukan "trial: habis" yang membingungkan) - cukup tampilkan status Pro/Free biasa.
- **Gagal fetch (network error):** modal tampilkan pesan singkat "Gagal memuat profil" + tombol tutup, bukan spinner tanpa akhir.

## Testing

- Unit test `handleGetProfile` (`modules/user/controller/__tests__/auth.controller.test.ts` atau file baru sejenis, ikuti pola test controller yang sudah ada di module ini) - mock `getSession`, `getUserById`, `getActiveUsers`:
  - Tanpa sesi -> 401.
  - Sesi ada, user bukan admin -> 200, body TANPA `activeUsers`, `getActiveUsers` tidak dipanggil sama sekali.
  - Sesi ada, user admin -> 200, body DENGAN `activeUsers` dari mock `getActiveUsers`.
  - `getUserById` balikin null (user terhapus tapi sesi masih valid) -> 401.
- Tidak perlu test otomatis untuk `UserProfileModal.tsx`/perubahan `Sidebar.tsx` (pola sama dengan komponen frontend lain di codebase ini - tidak ada test frontend) - verifikasi manual di browser: klik nama sebagai user biasa (tanpa section User Aktif), klik nama sebagai admin (dengan section User Aktif terisi dari sesi aktif sungguhan), coba di mobile (modal tidak terpotong layar).
