# Trial 7 Hari untuk Pengunjung Anonim — Design Spec

**Tanggal:** 2026-08-02
**Konteks:** Setelah aturan "buka akses eksplorasi tanpa login" (2026-08-01) di-deploy, pengunjung bisa membuka semua halaman analisis tanpa akun, tapi begitu mencoba fitur real (klik cari, lihat hasil analisa, dll) langsung diminta `PaywallModal` "Daftar Dulu" — karena trial 7 hari (`TRIAL_DAYS`, `modules/user/constants/user.constants.ts`) baru aktif SETELAH signup+verifikasi email, bukan sejak kunjungan pertama tanpa akun. User menganggap ini kontradiktif dengan janji "gratis 7 hari dulu baru diminta akun" dan secara eksplisit meminta pengunjung anonim juga bisa memakai fitur real (bukan cuma browsing) selama 7 hari tanpa perlu daftar dulu.

## Keputusan produk (hasil brainstorming)

1. **Cakupan: fitur "lihat-analisa" saja, bukan fitur yang menyimpan data pribadi.** Trial anonim berlaku untuk 7 endpoint: Market Pulse, Corporate Calendar, Multi-agent AI Consensus, Council AI, Backtest (termasuk mode `live-signal`/Sinyal Hari Ini — satu route yang sama), Breakout Radar (AI Pick), Recommendations. **Tidak** berlaku untuk Watchlist & Alert (`/api/watchlist`, `/api/alert`, `/api/v1/watchlists`) — fitur itu menyimpan data yang harus punya pemilik permanen (akun), bukan sekadar "melihat", jadi tetap wajib akun. Portfolio/Akun Demo juga tetap wajib login (sudah diputuskan 2026-08-01, tidak berubah).
2. **Identitas: cookie HttpOnly ditandatangani, bukan IP.** Cookie berisi `firstSeenAt` (kapan pertama kali terlihat), ditandatangani server (tidak bisa diedit dari browser) menggunakan infrastruktur JWT yang sama dengan cookie sesi login. Reset via hapus cookie/ganti browser/mode incognito **diterima sebagai risiko yang wajar** — ini pola standar semua produk trial gratis, fokusnya UX jujur bukan anti-abuse ketat. IP based ditolak sebagai alternatif karena banyak orang berbagi 1 IP (kantor/kampus/NAT) dan IP mobile sering berganti.
3. **Trial akun setelah signup: FRESH 7 hari, tidak terhubung ke trial anonim.** Kalau pengunjung sudah pakai sebagian/semua trial anonimnya lalu mendaftar akun, trial akun barunya tetap `TRIAL_DAYS` penuh dari titik itu — TIDAK dikurangi sisa hari trial anonim. Konsekuensinya satu orang bisa dapat total lebih dari 7 hari gratis (anonim + akun) - diterima sebagai trade-off kesederhanaan (tidak perlu logic "pindah sisa hari" saat signup) dan bukan risiko bisnis berarti (signup tetap butuh verifikasi email, ada friksi wajar).
4. **Pendekatan teknis: tiap API endpoint cek sendiri (bukan middleware terpusat).** Konsisten dengan pola yang sudah ada di seluruh codebase ini — setiap route memanggil `getSession()`/`checkProAccess()` sendiri untuk otorisasinya, bukan didelegasikan ke `middleware.ts`. Trial anonim mengikuti pola yang sama: tiap route memanggil helper baru `readOrIssueAnonymousTrial()` sendiri. `middleware.ts` (rate limit 20→50x/hari per-IP untuk endpoint LAIN yang tidak masuk daftar 7 ini) **tidak disentuh** - itu mekanisme terpisah yang sudah berjalan.
5. **Endpoint dengan gerbang Pro tambahan (Recommendations): trial anonim aktif = akses penuh setara Pro sementara**, bukan didudukkan sebagai "user gratis biasa". Ini konsisten dengan bagaimana trial akun (`checkProAccess` via `trial_ends_at`) sudah bekerja - trial (anonim maupun akun) selalu berarti akses penuh sementara, baru dibatasi Pro setelah trial habis.

## Arsitektur

### Generalisasi `shared/auth/jwt.ts` (bukan file baru untuk signing)

`encrypt()`/`decrypt()` saat ini di-hardcode ke tipe `SessionPayload`. Digeneralisasi jadi generic supaya bisa dipakai menandatangani payload lain (trial anonim) tanpa duplikasi logic JWT/secret-key handling - **backward compatible**, pemanggil lama (`shared/auth/session.ts`, `middleware.ts`) tidak perlu diubah karena generic default tetap `SessionPayload`:

```typescript
export async function encrypt<T extends object>(payload: T, expires = '24h'): Promise<string> {
  return await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);
}

export async function decrypt<T = SessionPayload>(input: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(input, key, { algorithms: ['HS256'] });
    return payload as unknown as T;
  } catch {
    return null;
  }
}
```

### `shared/constants/cookie-names.ts` (tambah 1 baris)

```typescript
// Cookie trial 7 hari untuk pengunjung TANPA akun (HttpOnly, ditandatangani -
// lihat shared/auth/anonymous-trial.ts). Beda dari SESSION_COOKIE (itu untuk akun
// yang sudah login) - cookie ini murni penanda "kapan pertama kali dilihat".
export const ANON_TRIAL_COOKIE = 'sahamlens_anon_trial';
```

### `shared/auth/anonymous-trial.ts` (baru)

```typescript
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { encrypt, decrypt } from './jwt';
import { ANON_TRIAL_COOKIE } from '../constants/cookie-names';

// Trial 7 hari untuk pengunjung TANPA akun - dipakai 7 endpoint "lihat-analisa" yang
// sebelumnya wajib login (Market Pulse, Calendar, Multi-agent, Council AI, Backtest,
// Breakout Radar, Recommendations). TIDAK dipakai endpoint yang menyimpan data pribadi
// (Watchlist/Alert tetap wajib akun - lihat middleware.ts & docs spec ini).
//
// Mekanisme: cookie HttpOnly ditandatangani (bukan bisa diedit klien) berisi kapan
// pertama kali dilihat. Reset via hapus cookie/incognito/browser lain diterima sebagai
// risiko yang wajar (keputusan produk 2026-08-02) - fokusnya UX jujur, bukan anti-abuse
// ketat. Kalau visitor akhirnya daftar akun, trial akun mulai FRESH TRIAL_DAYS lagi -
// TIDAK terhubung dengan sisa hari trial anonim ini (keputusan produk yang sama).
const ANON_TRIAL_DAYS = 7;
const ANON_TRIAL_MAX_AGE_SEC = ANON_TRIAL_DAYS * 24 * 60 * 60;

interface AnonTrialPayload {
  firstSeenAt: string; // ISO timestamp
}

export interface AnonTrialState {
  firstSeenAt: string;
  expiresAt: string;
  active: boolean;
  isNew: boolean; // true kalau baru dibuat request ini - caller WAJIB tempelkan cookie ke response
}

function computeState(firstSeenAt: string, isNew: boolean): AnonTrialState {
  const expiresAt = new Date(new Date(firstSeenAt).getTime() + ANON_TRIAL_MAX_AGE_SEC * 1000).toISOString();
  return { firstSeenAt, expiresAt, active: new Date(expiresAt).getTime() > Date.now(), isNew };
}

// Baca cookie trial yang ada, atau buat state baru (belum ditulis ke cookie - lihat
// applyAnonymousTrialCookie) kalau belum ada/rusak. Panggil HANYA saat !session (kalau
// user sudah login, trial akun/checkProAccess yang berlaku, bukan ini).
export async function readOrIssueAnonymousTrial(): Promise<AnonTrialState> {
  const existing = cookies().get(ANON_TRIAL_COOKIE)?.value;
  if (existing) {
    const payload = await decrypt<AnonTrialPayload>(existing);
    if (payload?.firstSeenAt) {
      return computeState(payload.firstSeenAt, false);
    }
  }
  // Tidak ada cookie, atau rusak/gagal decrypt - diperlakukan sebagai "belum pernah
  // lihat", BUKAN sebagai trial kadaluarsa. Trial baru mulai dari sekarang.
  return computeState(new Date().toISOString(), true);
}

// Tempelkan cookie ke response HANYA kalau trial.isNew (request-request berikutnya
// yang membaca cookie yang sudah ada TIDAK menulis ulang setiap kali).
export async function applyAnonymousTrialCookie(res: NextResponse, trial: AnonTrialState): Promise<void> {
  if (!trial.isNew) return;
  const token = await encrypt<AnonTrialPayload>({ firstSeenAt: trial.firstSeenAt }, `${ANON_TRIAL_DAYS}d`);
  res.cookies.set(ANON_TRIAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ANON_TRIAL_MAX_AGE_SEC,
    path: '/',
  });
}
```

### Pola perubahan di 7 route handler

Pola SEBELUM (semua 7 route, bentuk persis sama):
```typescript
const session = await getSession();
if (!session) {
  return NextResponse.json({ error: 'Belum login' }, { status: 401 });
}
// ...proses & build response...
return NextResponse.json(responseBody);
```

Pola SESUDAH:
```typescript
const session = await getSession();
let anonTrial: AnonTrialState | null = null;
if (!session) {
  anonTrial = await readOrIssueAnonymousTrial();
  if (!anonTrial.active) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }
}
// ...proses & build response PERSIS SEPERTI SEBELUMNYA (tidak ada logic lain yang berubah)...
const response = NextResponse.json(responseBody);
if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
return response;
```

Untuk `app/api/recommendations/route.ts` yang punya gerbang Pro tambahan setelah gerbang login:
```typescript
const session = await getSession();
let anonTrial: AnonTrialState | null = null;
if (!session) {
  anonTrial = await readOrIssueAnonymousTrial();
  if (!anonTrial.active) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }
  // anonTrial.active - lewati gerbang checkProAccess sepenuhnya (setara akun trial)
} else if (!checkProAccess(session)) {
  return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
}
// ...proses & build response...
const response = NextResponse.json(responseBody);
if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
return response;
```

Untuk `app/api/market-pulse/route.ts` dan `app/api/breakout-radar/route.ts` yang punya bypass `isInternal` (dipakai cron), urutannya: `isInternal` tetap dicek PALING AWAL seperti sekarang (skip auth sepenuhnya untuk pemanggilan internal), baru gerbang session/anon-trial untuk request eksternal biasa.

### File yang berubah

- Modify: `shared/auth/jwt.ts` (generalisasi generic, backward compatible)
- Modify: `shared/constants/cookie-names.ts` (+1 konstanta)
- Create: `shared/auth/anonymous-trial.ts`
- Modify: `app/api/market-pulse/route.ts`
- Modify: `app/api/calendar/route.ts`
- Modify: `app/api/agents/orchestrator/route.ts`
- Modify: `app/api/council/route.ts`
- Modify: `app/api/backtest/route.ts`
- Modify: `app/api/breakout-radar/route.ts`
- Modify: `app/api/recommendations/route.ts`

Tidak ada perubahan skema database, tidak ada env var baru, tidak ada dependency baru.

## Error handling & edge case

- **Cookie tidak ada / rusak / gagal decrypt:** diperlakukan sebagai "belum pernah lihat" - trial baru dibuat mulai dari sekarang, BUKAN dianggap trial kadaluarsa (lihat `readOrIssueAnonymousTrial`).
- **Trial anonim habis (>7 hari):** response 401 `{error: 'Belum login'}` - identik dengan response untuk pengunjung yang belum pernah punya cookie sama sekali. Frontend sudah punya `PaywallModal` (`showLoginPrompt` + `ctaHref="/signup"`) untuk kasus ini di semua 7 halaman terkait - tidak perlu pesan/state baru di frontend.
- **User login di tengah trial anonim aktif:** begitu ada session valid, jalur anon trial dilewati sepenuhnya (tidak dicek, tidak ditulis/dibaca cookie) - perilaku user berakun tidak berubah sama sekali dari sebelum fitur ini ada.
- **`JWT_SECRET_KEY` tidak diset:** sudah ada guard keras di `jwt.ts` (`throw` saat modul dimuat) - tidak berubah, tidak perlu guard tambahan.
- **Cookie ditulis lebih dari sekali:** tidak terjadi - `applyAnonymousTrialCookie` no-op kalau `trial.isNew === false`, jadi begitu cookie pertama kali ter-set, request berikutnya hanya membaca.

## Testing

- Unit test `shared/auth/anonymous-trial.ts` (mock `next/headers` cookies() dan waktu):
  - Tidak ada cookie sama sekali -> `isNew: true`, `active: true`.
  - Cookie ada, `firstSeenAt` 3 hari lalu -> `isNew: false`, `active: true`.
  - Cookie ada, `firstSeenAt` 8 hari lalu -> `isNew: false`, `active: false`.
  - Cookie ada tapi gagal decrypt (string acak) -> diperlakukan sama seperti tidak ada cookie (`isNew: true`, `active: true`), bukan error.
  - `applyAnonymousTrialCookie` dengan `isNew: false` -> `res.cookies.set` TIDAK dipanggil.
  - `applyAnonymousTrialCookie` dengan `isNew: true` -> `res.cookies.set` dipanggil dengan opsi `httpOnly: true`.
- Extend test masing-masing 7 route (pola sama untuk semua, contoh untuk `market-pulse`):
  - Request tanpa session, tanpa cookie trial -> 200 (bukan 401 lagi), response punya cookie trial baru ter-set.
  - Request tanpa session, dengan cookie trial yang masih aktif -> 200, TIDAK menulis ulang cookie.
  - Request tanpa session, dengan cookie trial kadaluarsa -> 401.
  - Request dengan session valid -> 200, sama sekali tidak memanggil `readOrIssueAnonymousTrial`/menyentuh cookie trial (regresi: skenario "session valid" yang sudah ada di test lama tetap harus hijau tanpa perubahan assertion).
  - Khusus `recommendations`: request tanpa session dengan trial aktif -> 200 (melewati gerbang Pro 402 sepenuhnya).
- Tidak perlu test end-to-end browser (pola sama dengan fitur lain di codebase ini - tidak ada test frontend).
