# Popup Promo Upgrade Pro di Beranda

## Konteks & Tujuan

Saat ini upgrade ke Pro hanya bisa dipicu secara pasif (user kena limit lalu
melihat `PaywallModal`). User ingin ada dorongan aktif berupa popup promo
mirip iklan yang muncul di halaman Beranda (`/home`), menampilkan
perbandingan 3 paket (Gratis / Bulanan Pro / Tahunan Pro) sesuai mockup yang
diberikan, dengan tiap kartu bisa langsung diklik untuk lanjut ke alur
pembayaran manual yang sudah ada (DANA/GoPay/Bank transfer, lihat
`docs/superpowers/specs/2026-08-02-manual-payment-method-design.md`).

Selama investigasi, ditemukan bahwa daftar fitur Pro yang selama ini
ditampilkan di 7 halaman (`dashboard`, `fundamental`, `watchlist`,
`recommendations`, `breakout-radar`, `market-pulse`, `compare` - 8 kemunculan
total karena `dashboard` dan `fundamental` masing-masing punya 2 instance)
secara konsisten salah: menyebut "Fundamental Analyzer" sebagai perk Pro
padahal fitur itu **gratis untuk semua orang** (tidak ada gerbang
`checkProAccess` di `app/api/fundamental/[ticker]/route.ts` sama sekali), dan
halaman Watchlist menyebut "Sinkronisasi alert ke Telegram" sebagai perk Pro
padahal notifikasi Telegram jalan untuk SEMUA user - yang dibatasi Pro cuma
JUMLAH alert-nya (2 untuk gratis, unlimited untuk Pro), bukan fitur
notifikasinya. Perubahan ini juga memperbaiki kedelapan kemunculan itu
sekalian, supaya tidak ada klaim fitur yang keliru di manapun.

## Fitur Pro yang Genuinely Ter-gerbang (diverifikasi langsung dari kode)

Dicek lewat `grep checkProAccess` di `app/api/**`, bukan ditebak dari mockup:

| Fitur | Endpoint yang menggerbang |
|---|---|
| Technical Analyzer unlimited (bebas limit 5 analisa/hari) | `app/api/stock/[ticker]/route.ts` |
| AI Pick LIVE (Breakout Radar & Rekomendasi) | `app/api/breakout-radar/route.ts`, `app/api/recommendations/route.ts` |
| Council AI (10-Agent Analysis) | `app/api/council/route.ts` |
| Multi-agent AI Orchestrator | `app/api/agents/orchestrator/route.ts` |
| Compare Tool | `app/api/compare/route.ts` |
| Market Pulse (halaman penuh) | `app/api/market-pulse/route.ts` |
| Bandar & Foreign Flow Pro | `app/api/flow/[ticker]/route.ts` |
| Watchlist & Alert unlimited (bebas limit 3 saham/2 alert) | `modules/watchlist/controller/{watchlist,alert}.controller.ts` |

**Fitur yang GRATIS untuk semua orang** (dikonfirmasi tidak ada gerbang Pro
sama sekali - jangan pernah dicantumkan sebagai perk Pro): Fundamental
Analyzer, Stock Screener, Risk Calculator, Backtest, Corporate Calendar,
Akun Demo (paper trading).

## Arsitektur

**Komponen baru `components/PromoUpgradeModal.tsx`** - 3 kartu statis (harga
di-hardcode di komponen ini, bukan dari env var - beda dari nomor
pembayaran yang memang harus rahasia, harga Pro sudah publik di banyak
tempat lain di aplikasi). Tidak ada state pembayaran di komponen ini sendiri
- klik kartu Bulanan/Tahunan cukup memanggil callback `onSelectPlan('monthly'
| 'annual')` yang disediakan pemanggil (halaman `/home`), yang lalu membuka
`PaywallModal` yang sudah ada dengan judul/harga/pesan WA sesuai paket.

**Kapan muncul** - di `app/home/page.tsx`, setelah `/api/user/profile`
(endpoint yang sudah ada) berhasil di-fetch dan `!hasProAccess`, DAN
localStorage key `sahamlens_promo_last_seen` bukan tanggal hari ini (format
`YYYY-MM-DD`, mengikuti pola localStorage lain di app seperti
`sahamlens_sidebar_collapsed`). Popup TIDAK muncul untuk:
- Pengunjung anonim (fetch profile 401 - user belum login).
- User yang `hasProAccess` true (Pro/admin/masih trial aktif).
- User yang sudah lihat popup ini hari ini (localStorage).

**Menutup popup** (lewat tombol X, klik kartu "Paket Gratis", atau klik
backdrop) menulis tanggal hari ini ke `sahamlens_promo_last_seen` sebelum
menutup - popup tidak muncul lagi otomatis sampai besok, walau
dibuka-tutup app berkali-kali hari yang sama.

**Klik kartu Bulanan/Tahunan Pro** menutup `PromoUpgradeModal` (localStorage
tetap ditulis, sama seperti menutup manual) DAN membuka `PaywallModal` yang
sudah ada, dengan props yang disesuaikan per paket (lihat detail komponen).
Tidak ada logika backend baru sama sekali - aktivasi Pro tetap manual oleh
admin lewat `/admin` seperti sekarang (sistem tidak melacak durasi/tanggal
kedaluwarsa langganan, konsisten dengan desain yang sudah ada).

## Detail Komponen

### `components/PromoUpgradeModal.tsx`

```tsx
interface PromoUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onSelectPlan: (plan: 'monthly' | 'annual') => void;
}
```

Struktur overlay/backdrop/Escape-to-close/focus-trap mengikuti pola yang
sama persis dengan `PaywallModal.tsx`/`UserProfileModal.tsx` (komponen
terpisah, bukan reuse langsung, karena kontennya beda - 3 kartu, bukan
1 CTA).

Konten 3 kartu (statis, sesuai mockup):

1. **Paket Gratis** - Rp0/bulan. Fitur: "Watchlist maks. 3 saham", "Alert
   maks. 2", "5 analisa saham/hari". Tombol "Mulai Gratis" memanggil
   `onClose()` saja (user sudah di paket ini).
2. **Bulanan Pro** - badge "POPULER". Rp99.000/bulan. Fitur (4 baris,
   dipadatkan dari 8 fitur ter-gerbang di atas): "Unlimited Technical
   Analyzer (10 filter)", "AI Pick LIVE & Rekomendasi Saham", "Council AI,
   Compare Tool & Market Pulse", "Bandar Flow Pro & Watchlist/Alert
   Unlimited". Tombol "Upgrade ke Pro" memanggil `onSelectPlan('monthly')`.
3. **Tahunan Pro** - badge "HEMAT 2 BULAN". Rp990.000/tahun (setara
   Rp82.500/bulan - lebih murah dari 12x harga bulanan Rp1.188.000, selisih
   ~2 bulan gratis, sesuai badge). Fitur sama persis dengan Bulanan Pro.
   Tombol "Upgrade ke Pro" memanggil `onSelectPlan('annual')`.

### Wiring di `app/home/page.tsx`

Tambah state:

```tsx
const [showPromoModal, setShowPromoModal] = useState(false);
const [promoPlan, setPromoPlan] = useState<'monthly' | 'annual'>('monthly');
const [showPaywallFromPromo, setShowPaywallFromPromo] = useState(false);
```

Fetch profile sekali di effect yang sudah ada (tambah satu `fetch` baru ke
`/api/user/profile`), cek kondisi tampil, baca/tulis localStorage.

`onSelectPlan`:
```tsx
const handleSelectPlan = (plan: 'monthly' | 'annual') => {
  setPromoPlan(plan);
  setShowPromoModal(false);
  setShowPaywallFromPromo(true);
};
```

Render `<PaywallModal open={showPaywallFromPromo} onClose={...} ... />` DUA
varian teks berdasarkan `promoPlan`:

- `monthly`: `title="Upgrade ke Bulanan Pro"`, `body="Rp99.000/bulan - buka semua fitur Pro SahamLens."`, `waText="Halo, saya sudah transfer untuk upgrade ke SahamLens Pro BULANAN (Rp99.000/bulan). Ini bukti transfernya."`, `ctaLabel="Kirim Bukti Transfer via WhatsApp"` (default, tidak perlu diubah).
- `annual`: `title="Upgrade ke Tahunan Pro"`, `body="Rp990.000/tahun - buka semua fitur Pro SahamLens, hemat setara 2 bulan dibanding bulanan."`, `waText="Halo, saya sudah transfer untuk upgrade ke SahamLens Pro TAHUNAN (Rp990.000/tahun). Ini bukti transfernya."`.

`benefits` prop kedua varian sama, pakai daftar akurat yang sudah
distandarkan (lihat bagian berikutnya).

## Perbaikan daftar fitur di 7 halaman yang sudah ada (8 kemunculan)

Ganti isi array `benefits={[...]}` di titik-titik berikut - dari yang salah
(menyebut "Fundamental Analyzer" atau "Sinkronisasi alert ke Telegram"
sebagai perk Pro) jadi akurat:

**6 kemunculan** (`app/dashboard/page.tsx` baris ~506 & ~1044,
`app/fundamental/page.tsx` baris ~213 & ~475, `app/breakout-radar/page.tsx`
baris ~862, `app/compare/page.tsx` baris ~236, `app/market-pulse/page.tsx`
baris ~539, `app/recommendations/page.tsx` baris ~392 - baris bisa sedikit
berbeda, cari lewat teks `'Fundamental Analyzer + Watchlist unlimited'`)
dari:
```
'Unlimited Technical Analyzer (10 filter)',
'AI Pick LIVE',
'Fundamental Analyzer + Watchlist unlimited',
```
jadi:
```
'Unlimited Technical Analyzer (10 filter)',
'AI Pick LIVE, Council AI & Compare Tool',
'Watchlist & Alert unlimited',
```

**1 kemunculan** (`app/watchlist/page.tsx` baris ~550) dari:
```
'Watchlist unlimited (bukan cuma 3 saham)',
'Sinkronisasi alert ke Telegram (Libas Bot)',
'Semua fitur Pro lainnya',
```
jadi:
```
'Watchlist unlimited (bukan cuma 3 saham)',
'Alert unlimited (bukan cuma 2)',
'AI Pick LIVE, Council AI & fitur Pro lainnya',
```

## Error Handling

- `/api/user/profile` gagal/401/network error → anggap "jangan tampilkan
  popup" (fail-safe, jangan pernah menampilkan popup promo ke pengunjung
  yang statusnya tidak jelas/gagal diverifikasi).
- localStorage tidak tersedia (mis. private browsing ekstrem) → popup boleh
  tampil setiap kali (`typeof window === 'undefined'` guard sudah jadi pola
  di banyak tempat lain di app ini, dipakai ulang) - bukan kegagalan fatal,
  cuma kehilangan fitur "sekali sehari".

## Testing

- Tidak ada test otomatis untuk `PromoUpgradeModal.tsx` (komponen client,
  konsisten dengan `PaywallModal.tsx`/`UserProfileModal.tsx`/`SetProForm.tsx`
  yang semuanya juga tidak ada test).
- Verifikasi manual di browser: popup muncul untuk akun free/trial yang
  baru login, tidak muncul untuk akun Pro/admin, tidak muncul untuk
  pengunjung anonim, tidak muncul lagi setelah ditutup sampai tanggal
  berganti (bisa disimulasikan dengan mengubah localStorage manual di
  devtools), klik Bulanan/Tahunan membuka PaywallModal dengan teks yang
  sesuai paketnya.

## Di Luar Cakupan

- Gambar QRIS - sama seperti fitur pembayaran manual sebelumnya, belum ada
  file gambar QRIS asli.
- Tracking/analytics berapa kali popup ini dilihat/diklik - tidak diminta,
  YAGNI.
- A/B testing varian harga/copy - tidak diminta.
- Popup serupa di halaman lain selain `/home` - eksplisit diminta cuma di
  Beranda.
