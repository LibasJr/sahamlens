# V3 BELUM SELESAI — tampilan belum berubah sebagaimana dituntut PRD

**Tanggal:** 20 Agustus 2026
**Status:** utang terbuka, wajib diselesaikan
**PRD:** `SAHAMLENS_PRD_TOTAL_VISUAL_REDESIGN_V3.md`
**Laporan V3 sebelumnya:** `docs/notes/LAPORAN_VISUAL_REDESIGN_V3_2026-08-20.md`

---

## Pernyataan

Delapan fase V3 sudah mendarat di produksi. **Kriteria sukses PRD §4 TIDAK terpenuhi.**

PRD §4 menyatakan redesign berhasil bila *"screenshot halaman yang sama sebelum dan sesudah
V3 terlihat jelas berbeda tanpa penjelasan"*. Diperiksa langsung di produksi oleh pemilik
produk pada 20 Agustus 2026: **tampilannya terbaca sama.**

Ini bukan masalah cache maupun deploy. Diverifikasi: HTML produksi memuat markup V3
(`lens-eyebrow` ada, build baru tersaji). Yang salah adalah pekerjaannya.

---

## Kenapa ini terjadi

V3 dikerjakan sebagai proyek **kepatuhan sistem desain**, bukan proyek **komposisi visual**.

Delapan fase menghabiskan usaha pada: menghapus 98 ukuran font arbitrer, 9 warna hex mati,
menurunkan densitas kartu, dan memindahkan komponen ke primitif bersama. Semua itu nyata
dan berguna — tema akhirnya bekerja, sistem jadi konsisten — tetapi **hampir seluruhnya
tidak terlihat** oleh pengguna.

**Gerbangnya ikut salah sasaran.** `shell-design-system`, `homepage-composition`,
`tools-surface-tokens`, dan seluruh gerbang fase mengukur KEPATUHAN: adakah hex, adakah
`text-[Npx]`, berapa `<Card>`. Tidak satu pun bertanya apakah tampilannya berubah. Jadi
sembilan PR bisa hijau berturut-turut tanpa redesign yang terasa.

Kelemahan itu paling jelas terlihat pada satu angka: `lens-section-title` berukuran
**sama persis** dengan `lens-body` (0.9375rem), hanya dibedakan tebal huruf. Setiap komponen
memakai peran yang BENAR, dan halaman tetap terbaca rata — karena skalanya sendiri datar.

---

## Yang sudah benar-benar berubah

Jujur, daftarnya pendek:

- densitas kartu turun (beranda 10→4, halaman emiten 8→5, Technical+Flow 18→9);
- jawaban LensAI berhenti menjadi gelembung percakapan;
- ringkasan arus dana asing menjadi band metrik;
- **skala tipe direnggangkan dan ritme bagian dinaikkan** (V3.1, perubahan ini) — hierarki
  akhirnya berjenjang: hero 60px / judul halaman 34px / judul bagian 20px / body 15px.

---

## Yang BELUM dikerjakan — inilah utangnya

PRD §4 menuntut perubahan pada sebelas hal. Yang belum tersentuh sama sekali:

| # | Aspek PRD §4 | Keadaan |
|---|---|---|
| 1 | **Composition** | Urutan dan tata letak beranda serta halaman emiten masih persis V2 |
| 2 | **Surface treatment** | Border, radius, elevation tidak berubah |
| 3 | **Palet** | Warna latar, permukaan, dan aksen sama persis |
| 4 | **Hero** | Bentuk dan proporsinya sama |
| 5 | **Tabs / navigation** | Sidebar dan navigasi sudut pandang bentuknya sama |
| 6 | **Chart framing** | Tidak disentuh |
| 7 | **Loading / empty / error states** | Tidak disentuh |
| 8 | **Spacing makro** | Baru ritme antar bagian; gutter dan lebar konten belum |

---

## Kenapa menambal per-berkas tidak akan cukup

Delapan fase kemarin membuktikannya. Mengganti kelas satu per satu di lima puluh berkas
menghasilkan kepatuhan, bukan komposisi. Yang dibutuhkan adalah **merancang ulang tata letak
halamannya**, lalu menerapkan rancangan itu.

Ada hambatan nyata yang harus dihadapi terus terang: aplikasi ini **tidak bisa dijalankan
tanpa Postgres, Redis, dan data pasar hulu**, sehingga agen yang mengerjakannya tidak pernah
melihat halaman yang sedang diubahnya. Delapan fase kemarin ditulis sambil menebak, dan
hasilnya adalah dokumen ini.

---

## Jalan penyelesaian

**Rancang dulu, tunjukkan, baru terapkan.**

1. Bangun mock komposisi halaman UTUH di `/_workbench` — beranda lebih dulu: hero, snapshot,
   Hari Ini, peluang/risiko, radar — dengan data contoh.
2. Potret di 375 dan 1440, **perlihatkan gambarnya** sebelum satu baris pun disentuh di
   halaman sungguhan.
3. Perbaiki di gambar sampai arahnya benar. Koreksi di mock jauh lebih murah daripada
   koreksi setelah delapan PR.
4. Baru terapkan ke halaman nyata.
5. Ulangi untuk halaman emiten.

**Gerbang yang perlu ditambahkan:** sesuatu yang menanyakan apakah komposisi berubah, bukan
sekadar apakah kelasnya patuh. Perbandingan potret sebelum/sesudah adalah kandidat paling
jujur — bukan sebagai uji regresi piksel, melainkan sebagai bukti yang harus dilihat manusia
sebelum sebuah fase dinyatakan selesai.

---

## Catatan untuk yang melanjutkan

Kerja kepatuhan kemarin **tidak sia-sia**, dan jangan dibongkar: justru karena seluruh
aplikasi kini memakai peran tipografi bersama, merenggangkan skala di `globals.css` merambat
ke setiap halaman lewat satu berkas. Perbaikan komposisi berikutnya akan jauh lebih murah
karena fondasinya sudah rapi.

Yang keliru bukan pekerjaannya, melainkan berhenti di situ dan menyebutnya redesign.
