# Keputusan siklus LensIntraday — 24 September 2026

**Keputusan:** lini intraday **DITUTUP untuk promosi** dan tetap `RESEARCH_ONLY`.
Pengumpulan bar harian **tetap berjalan** sebagai arsip. Kriteria validasi yang sudah
dibekukan **tidak diubah**.

- Model: `lens-intraday-v0.2.0`
- Protokol OOS beku: `oos-lens-intraday-v0.2.0-cfg-1715aa11` (freeze 13 Sep 2026)
- Pengukuran: `npm run dissect:intraday` — baca-saja, memakai loader produksi
  (`loadIntradayObservations`), sampel = sinyal **setelah** freeze

## Angka yang menjadi dasar (apa adanya)

| Ukuran | Nilai |
| --- | --- |
| Sampel OOS | **15.112 baris** / 8 hari bursa / 60 emiten |
| Bruto per transaksi | **−0,00025** |
| Biaya per transaksi | **0,00802** (fee 0,15% beli + 0,25% jual + slippage terpasang) |
| Netto per transaksi | **−0,00827** |
| Win rate / profit factor | 11,31% / 0,113 |
| Irisan netto > 0 dengan p < 0,05 | **0 (nol)** |
| Irisan bruto terbaik | EOD jam 15:00: +0,00229 (n=480, p=1,00) |
| Gerbang hari OOS | 8/60 hari bursa (sisa 52 hari bursa) |

Irisan yang diperiksa: setiap horizon (M15, H1, H4, H30, EOD) × bucket skor (≥80, 70–79,
60–69, <60) × jam sinyal (09:00–15:00) × band likuiditas (≥Rp 50 M, 10–50 M, 1–10 M, <Rp 1 M).
Tidak ada satu pun yang lolos setelah biaya.

## Mengapa ditutup, bukan "ditunggu sampai 60 hari"

Kesimpulannya bukan *biayanya terlalu besar*, melainkan **bruto-nya sendiri tidak
berkeunggulan**: rata-rata bruto praktis nol (−0,00025), dan kehidupan lini ini bergantung
pada bruto melampaui biaya 0,802% per transaksi. Menambah hari OOS hanya memperbesar sampel
untuk sifat yang sama; yang bisa mengubah sifat itu adalah perubahan model — dan itu berarti
**freeze baru dengan hitungan OOS mulai dari nol**.

Mengubah ambang, bobot, atau kriteria supaya lolos adalah p-hacking, bukan validasi. Itu
sebabnya tidak ada satu pun ambang yang disentuh dalam keputusan ini.

## Syarat pembukaan kembali

1. Ada konfigurasi model **baru** yang dibekukan (freeze timestamp baru) — bukan menunggu
   protokol lama.
2. Bruto per transaksi **melampaui biaya 0,802%** dengan selisih yang jelas, bukan setipis noise.
3. Kriteria beku yang sama terpenuhi apa adanya: ≥ 60 hari bursa OOS pasca-freeze,
   ≥ 30 emiten, ≥ 500 sampel efektif.
4. Minimal satu irisan OOS punya netto > 0 dengan **p < 0,05** setelah biaya, dan irisan itu
   **bisa dieksekusi** (lolos saringan tradability).
5. Tidak ada ambang/bobot/kriteria yang diubah untuk membuat syarat di atas terpenuhi.

## Yang tetap berjalan

- `sahamlens-intraday-collect.timer` (Mon–Fri 17:30 WIB) — mengumpulkan 60 emiten sebagai arsip.
- `sahamlens-intraday-watchdog.timer` (Mon–Fri 18:30 WIB) — melaporkan hari bursa yang terlewat
  dan progres gerbang apa adanya.
- Lab `/admin/intraday-validation` tetap ada untuk keperluan riset, dengan penanda status
  di bagian atas halaman.

## Fokus yang dialihkan

Lini **horizon harian** (LensRadar/LensScore + validasi T+20) tetap menjadi jalur prioritas:
itu satu-satunya lini yang sudah punya bukti terukur dan panjang (ratusan ribu observasi,
gabungan arsip multi-tahun). Energi baru diarahkan ke sana dan ke pemeliharaan data yang
menopangnya, bukan ke penambahan hari OOS intraday.

## Cara menegakkan keputusan ini

`modules/intraday/constants/intraday-lifecycle.ts` menyimpan keputusan + angka bukti sebagai
konstanta, dan halaman admin menampilkannya dari konstanta itu (bukan angka yang ditulis ulang).
`modules/intraday/__tests__/lifecycle-decision.test.ts` menjaga supaya:

- status tidak pernah berubah menjadi klaim produksi,
- `netto = bruto − biaya` tetap konsisten (kalau salah satu angka diubah tanpa mengukur ulang, uji gagal),
- irisan bruto terbaik tetap tercatat di bawah biaya,
- syarat pembukaan kembali tetap ada dan menuntut freeze baru.

Skrip pengukuran ulang: `npm run dissect:intraday`
(`scripts/intraday-oos-dissection.mjs`, baca-saja, tidak menulis apa pun ke basis data).