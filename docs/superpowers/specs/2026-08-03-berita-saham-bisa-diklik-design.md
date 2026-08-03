# Kartu Sentimen Berita Bisa Diklik — Design

**Tanggal:** 2026-08-03
**Status:** Disetujui
**Menyentuh:** `app/dashboard/page.tsx`, `components/StockNewsModal.tsx` (baru)

## Masalah

Kartu "Sentimen Berita AI" di halaman Technical Analyzer menampilkan hitungan seperti
*"NETRAL • 0 positif, 0 negatif, 2 netral dari 2 berita"* — tetapi **judul beritanya tidak
pernah ditampilkan di mana pun**.

Penelusuran `stockNews` di `app/dashboard/page.tsx` menunjukkan variabel itu hanya dipakai
untuk menghitung angka di kartu tersebut (baris 811-814 dan 829). Tidak ada daftar artikel
di halaman itu.

Artinya berita sudah diambil dari `/api/news/stock/[code]`, sudah dianalisis sentimennya
satu per satu, lalu judulnya dibuang. Pengguna diberi tahu "ada 2 berita" tanpa cara
membacanya. Komentar di kode bahkan menyebut *"section Berita di bawah"* — section itu
tidak ada.

Permintaan ini bukan menambah fitur, melainkan menampilkan data yang sudah sampai di
browser.

## Keputusan

Kartu menjadi tombol; mengkliknya membuka modal berisi daftar berita saham tersebut.

Modal **tetap bisa dibuka meski tidak ada berita**, menampilkan pesan kosong — perilakunya
konsisten, pengguna tidak perlu menebak apakah kartunya rusak atau memang tidak ada berita.

## Arsitektur

Tidak ada perubahan backend. Endpoint, pengambilan data, dan bentuk respons persis seperti
sekarang.

```
/api/news/stock/[code]  →  stockNews (state, SUDAH ADA)
                             │
                  ┌──────────┴──────────┐
                  │                     │
          hitungan di kartu      daftar di modal (BARU)
             (sudah ada)
```

**`components/StockNewsModal.tsx`** (baru) — mengikuti pola `PaywallModal` yang sudah ada:
`AnimatePresence` + `motion.div`, `role="dialog"`, `aria-modal`, tutup lewat Escape, klik
latar, atau tombol ✕, plus focus trap. Menerima `open`, `onClose`, `symbol`, dan `items`.

Tiap berita menampilkan penanda sentimen berwarna (hijau POSITIF, merah NEGATIF, abu
NETRAL), judul sebagai tautan yang membuka tab baru (`target="_blank"`,
`rel="noopener noreferrer"`), lalu sumber dan waktu.

**Kartu jadi `<button>`**, bukan `<div onClick>` — supaya bisa difokus keyboard dan
terbaca pembaca layar. Efek hover mengikuti kartu DCF di sebelahnya agar terlihat bisa
diklik.

## Penanganan kegagalan

| Kondisi | Perilaku |
|---|---|
| Tidak ada berita | Modal terbuka, menampilkan "Belum ada berita untuk saham ini" |
| Berita masih dimuat | Kartu tetap bisa diklik; modal menampilkan daftar apa adanya (kosong sampai selesai) |
| `link` kosong pada satu artikel | Judul ditampilkan sebagai teks biasa, bukan tautan mati |
| `sentiment` bernilai tak dikenal | Diperlakukan sebagai NETRAL (abu), bukan error |

## Pengujian

Modal murni presentasi tanpa logika bisnis, jadi pengujiannya lewat pemeriksaan di aplikasi
berjalan, bukan unit test:

1. Kartu diklik → modal terbuka berisi judul berita saham yang sedang dilihat.
2. Saham tanpa berita → modal terbuka dengan pesan kosong.
3. Escape dan klik latar menutup modal.
4. Judul berita membuka tab baru ke sumber aslinya.

## Yang sengaja tidak dikerjakan

- **Tidak ada endpoint atau pengambilan data baru.** Semua sudah tersedia.
- **Halaman `/news` tidak disentuh.**
- **Tidak menambah filter berita per saham di halaman lain.**
