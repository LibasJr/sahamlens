# LensScore — spesifikasi rumus terbuka

| | |
|---|---|
| Model | `lens-score` |
| Versi | `lens-score-v1.5.0` |
| Config hash | `fnv1a32-86968e1a` |
| Status | **RESEARCH_ONLY** — bukan nasihat investasi, belum tervalidasi out-of-sample |
| Sumber kebenaran | `modules/technical/service/scoring.service.ts` |
| Dijaga oleh | `modules/technical/service/__tests__/lens-score-snapshot.test.ts` |

Dokumen ini menjelaskan **seluruh** cara LensScore dihitung. Tidak ada komponen yang
disembunyikan, tidak ada faktor "rahasia", dan tidak ada model terlatih di belakangnya —
LensScore adalah fungsi deterministik dari input yang tercantum di bawah.

Angka contoh di §7 **dihasilkan dengan menjalankan kodenya**, bukan ditulis tangan. Ada
gerbang test yang membaca dokumen ini, menghitung ulang setiap barisnya, dan gagal kalau
salah satu angka berbeda. Dokumen ini tidak bisa basi tanpa membuat CI merah.

---

## 1. Bentuk umum

LensScore adalah gabungan tiga kelompok:

| Kelompok | Bobot | Isi |
|---|---|---|
| Teknikal (`technical`) | 40 | Tren MA, RSI, MACD, Volume |
| Fundamental (`fundamental`) | 30 | Valuasi, Profitabilitas, Kesehatan neraca |
| Arus dana (`flow`) | 30 | Besaran tekanan, Persistensi tekanan |

Bobotnya hidup di satu tempat, `shared/constants/lens-score-weights.ts`, dan penyebutnya
dihitung (`LENS_SCORE_TOTAL_WEIGHT`), bukan ditulis sebagai angka 100.

Skor akhir:

```
total_score = round( (skor_teknikal + skor_fundamental + skor_flow) / bobot_tersedia × 100 )
```

`bobot_tersedia` — bukan 100 — adalah inti dari §3. Kalau seluruh data ada, keduanya sama.

---

## 2. Sub-faktor dan pita nilainya

Setiap sub-faktor menghasilkan poin mentah dengan batas atasnya sendiri. Semua pita di
bawah adalah salinan langsung dari kode.

### 2.1 Teknikal (40)

**Tren MA — maks 15.** Butuh harga, MA20, MA50, MA200. MA200 wajib `null` kalau histori
kurang dari 200 bar; rata-rata seadanya yang dilabeli MA200 tidak diterima.

| Kondisi | Poin |
|---|---|
| `P > MA20 > MA50 > MA200` (uptrend sempurna) | 15 |
| `P > MA20` dan `P > MA50`, belum full uptrend | 10 |
| `P > MA200` tapi di bawah MA20/MA50 | 5 |
| Sideways / tidak ada tren jelas | 3 |
| `P < MA20 < MA50 < MA200` (downtrend penuh) | 0 |

Harga dan MA **wajib satu basis harga** (keduanya raw, atau keduanya adjusted). Kalau
basisnya tidak diketahui atau bersilangan, komponen ini fail-closed menjadi tidak
tersedia — bukan dinilai nol.

**RSI(14) — maks 8.** Ditafsirkan menurut rezim tren, bukan pita tetap. RSI > 78 selalu 0
di rezim mana pun.

| Rezim | Pita | Poin |
|---|---|---|
| UP | 50–78 (sehat di dalam uptrend) | 8 |
| UP | 40–49 (pullback) | 7 |
| UP | < 40 (oversold dalam uptrend) | 5 |
| DOWN | ≥ 55 (kemungkinan pembalikan) | 6 |
| DOWN | 45–54 | 3 |
| DOWN | 30–44 | 1 |
| DOWN | < 30 | 0 |
| SIDEWAYS | 50–70 | 6 |
| SIDEWAYS | 40–49 | 4 |
| SIDEWAYS | < 40 | 3 |
| SIDEWAYS | > 70 | 2 |

Alasan RSI rendah tidak diberi poin di downtrend: "oversold" bukan sinyal beli ketika
trennya sendiri sedang turun.

**MACD(12,26,9) — maks 7.** Dinilai dari histogram saja, karena `macdHist > 0` dan
`macdLine > macdSignal` identik secara matematis — menilai keduanya berarti menghitung
satu kuantitas dua kali.

| Kondisi | Poin |
|---|---|
| `macdHist > 0` | 7 |
| `macdHist = 0` | 3 |
| `macdHist < 0` | 0 |

**Volume — maks 10.** Volume adalah **besaran**, bukan arah, jadi ia memperkuat arah yang
sedang terjadi — ke atas maupun ke bawah. Rasio = volume hari ini / rata-rata 20 hari.

| Rasio | Harga naik (> +0,5%) | Harga turun (< −0,5%) | Datar | Arah tak diketahui |
|---|---|---|---|---|
| ≥ 2,0x | 10 | 0 | 5 | 5 |
| 1,5–2,0x | 8 | 1 | 4 | 5 |
| 1,0–1,5x | 4 | 4 | 4 | 4 |
| < 1,0x | 1 | 1 | 1 | 1 |
| Volume 0 | 0 | 0 | 0 | 0 |

Volume 0 dinilai 0, **bukan** diperlakukan sebagai data hilang: tidak ada transaksi adalah
fakta tentang emitennya, bukan kekurangan data.

### 2.2 Fundamental (30)

**Valuasi — maks 10** (PER 5 + PBV 5). Tidak memakai ambang tetap untuk seluruh IDX.
Pertanyaannya: *pengganda ini di atas atau di bawah pengganda yang dibenarkan fundamental
emiten itu sendiri?*

- PBV wajar: `PBV* = (ROE − g) / (r − g)`
- PER wajar: model Gordon bila payout ratio tersedia; kalau tidak, earnings yield vs biaya ekuitas
- Biaya ekuitas: `r = SBN10Y + β × ERP`, dengan β sektor sebagai cadangan bila β emiten tidak ada

Skor per pengganda berasal dari rasio `wajar / aktual` (`scoreMultipleRatio`), 0–5, dengan
label: diskon besar (5), di bawah wajar (4), wajar (3), di atas wajar (2), premium (1),
premium besar (0).

Tiga aturan yang membuatnya tidak menghukum dua kali:

- **PER ≤ 0** (emiten rugi) diberi 1 dari 5, bukan 0. Kerugiannya sendiri sudah dihukum
  penuh di Profitabilitas; menghukumnya lagi di Valuasi adalah hitung ganda.
- **ROE ≤ 0** dengan PBV positif diberi 1 dari 5, alasan yang sama.
- **ROE tidak tersedia** ⇒ PBV **tidak dinilai sama sekali** dan bobotnya direnormalisasi.
  Mengakui tidak bisa menilai lebih baik daripada menilai dengan ambang yang keliru.

**Penjaga puncak siklus.** Emiten energi/barang baku dengan PER sangat rendah *bersamaan
dengan* ROE sangat tinggi adalah tanda laba puncak siklus, bukan temuan saham murah. Skor
valuasinya dibatasi sebanding keparahan tanda tangannya: `cap = availableMax × (1 − 0,6 × keparahan)`,
dan alasannya ikut ditampilkan sebagai caveat.

**Profitabilitas — maks 10** (ROE 5 + Pertumbuhan pendapatan 5).

| ROE | Poin | | Rev Growth YoY | Poin |
|---|---|---|---|---|
| > 20% | 5 | | > 15% | 5 |
| 15–20% | 4 | | 5–15% | 3 |
| 8–15% | 2 | | 0–5% | 1 |
| < 8% | 0 | | ≤ 0% | 0 |

**Kesehatan neraca — maks 10** (DER 5 + Current Ratio 5). Ambang DER mengikuti struktur
pendanaan normal sektornya (`modules/sector`), bukan satu ambang untuk seluruh IDX.

| DER vs pita sektor | Poin | | Current Ratio | Poin |
|---|---|---|---|---|
| < konservatif | 5 | | > 2,0x | 5 |
| < sehat | 4 | | 1,5–2,0x | 4 |
| < agak tinggi | 2 | | 1,0–1,5x | 2 |
| ≥ agak tinggi | 0 | | < 1,0x | 0 |

Untuk **lembaga keuangan** (bank, multifinance), DER dan Current Ratio dinyatakan **TIDAK
BERLAKU** — leverage adalah model bisnisnya. Ini berbeda tegas dari "datanya tidak ada",
dan perbedaannya penting: lihat §3.

### 2.3 Arus dana (30)

Satu sumber (Chaikin Money Flow dari harga + volume), dua sifat berbeda yang masing-masing
dinilai sekali.

> **Batasan yang tidak boleh hilang:** ini **proxy** dari harga + volume Yahoo Finance,
> **bukan** data transaksi broker atau asing. IDX tidak menyediakan feed itu gratis. Karena
> itu keluarannya memakai istilah "arus dana"/"tekanan beli", bukan "asing net buy".

**Besaran tekanan (CMF20) — maks 20.**

| CMF20 | Poin |
|---|---|
| > +20% | 20 |
| +5% … +20% | 14 |
| −5% … +5% | 8 |
| −20% … −5% | 3 |
| < −20% | 0 |

**Persistensi — maks 10.** Diukur dari **proporsi jendela 20 hari** dengan Money Flow
Multiplier positif, bukan dari panjang streak berturut-turut. Streak putus total begitu ada
satu hari berlawanan, sehingga saham yang 18 dari 20 hari positif tapi hari terakhirnya
merah punya streak 0 — itu mengukur "hari terakhir", bukan persistensi.

| Proporsi 20 hari positif | Poin |
|---|---|
| ≥ 65% | 10 bila status AKUMULASI, 8 bila tidak |
| 55–65% | 7 |
| 45–55% | 5 |
| 35–45% | 3 |
| < 35% | 0 bila status DISTRIBUSI, 1 bila tidak |

Kalau histori < 20 bar, proporsi belum bisa dihitung dan penilaian jatuh balik ke status
akumulasi (7) / distribusi (2) / netral (5), dengan alasan yang menyatakan keterbatasannya.

---

## 3. Renormalisasi — kenapa data hilang tidak menghukum

Aturan tunggal yang mengatur seluruh mesin ini: **ketiadaan data tidak pernah berubah
menjadi poin, dan tidak pernah berubah menjadi hukuman.**

Untuk tiap kelompok:

```
tersedia    = komponen yang punya data
rawMax      = Σ availableMax komponen tersedia
raw         = Σ skor komponen tersedia
declared    = Σ declaredMax SELURUH komponen kelompok   (konstan)

availableMax = (rawMax / declared) × bobot_kelompok
skor         = (raw / rawMax) × availableMax
```

Dua penyebut yang berbeda, dan itu disengaja:

- **Skor** direnormalisasi atas bobot yang **tersedia** — emiten yang PER-nya tidak ada
  tidak kehilangan poin karenanya.
- **Kelengkapan** diukur terhadap bobot yang **dideklarasikan** (konstan) — kehilangan
  sub-faktor tetap terlihat, tidak ikut menyusut bersama pembilangnya.

Ada **dua** jenis "tidak dihitung", dan keduanya berperilaku berbeda:

| | Arti | Efek ke `coverage_pct` |
|---|---|---|
| `NA` | Seharusnya ada, tapi sumber data tidak memberi | **Turun** |
| `NOT_APPLICABLE` | Pertanyaannya memang tidak berlaku di sini | **Tetap** |

Contoh `NOT_APPLICABLE`: Current Ratio untuk bank. Menghukum kelengkapan datanya karena
itu sama salahnya dengan memberi nilai 0.

**Kelengkapan data:**

```
coverage_pct = round( (Σ availableMax semua kelompok / 100) × 100 )
```

---

## 4. Kategori

```
kategori = 'DATA TIDAK CUKUP'  bila coverage_pct < 55
         = 'STRONG BUY'        bila total_score  > 75
         = 'BUY'               bila total_score ≥ 60
         = 'HOLD'              bila total_score ≥ 45
         = 'SELL'              selain itu
```

Gerbang 55% adalah keputusan produk yang didokumentasikan, bukan disembunyikan: di bawah
itu skornya praktis hanya mencerminkan satu-dua dimensi, dan menerjemahkannya menjadi
BUY/SELL akan menyesatkan.

**Ambang ini bukan ambang yang sama dengan `/multi-agent`.** `ORCHESTRATOR_SCORE_THRESHOLDS`
menilai skor komposit yang berbeda dengan komposisi agen yang lebih luas. Keduanya
didokumentasikan berdampingan di `modules/technical/service/decision-thresholds.ts`, tapi
nilainya sengaja tetap terpisah — memaksanya identik tanpa menyamakan modelnya justru
menyembunyikan perbedaan nyata di balik angka yang kelihatan konsisten.

---

## 5. Parameter indikator

| Parameter | Nilai |
|---|---|
| Periode RSI | 14 |
| Periode ATR | 14 |
| EMA cepat / lambat | 20 / 50 |
| MACD cepat / lambat / signal | 12 / 26 / 9 |
| Rata-rata volume | 20 hari |
| Basis harga untuk imbal hasil | `SPLIT_ADJUSTED` |
| Basis harga untuk level trading | `RAW` |

---

## 6. Versi model

Setiap perubahan formula, bobot, atau ambang **wajib** menaikkan `version` di
`modules/technical/config/lens-score-model.ts`. Config hash (FNV-1a 32-bit atas
spesifikasi terkanonikalisasi) disimpan bersama setiap baris histori sebagai
`score_config_hash`.

Alasannya bukan kerapian. `partitionByScoreVersion()` **menolak** baris histori yang
versinya berbeda, jadi bobot yang berubah tanpa kenaikan versi membuat Calibration Lab dan
Bucket Backtest membandingkan angka dari dua model berbeda seolah satu model — dengan
spread, p-value, dan jumlah sampel yang semuanya tetap terlihat meyakinkan.

**Cara mengubah rumus:** ubah angkanya → naikkan `version` → perbarui dokumen ini →
perbarui golden vector di `lens-score-snapshot.test.ts` → `npm run verify:prod` →
jalankan `npm run backfill:lens-history`. Tidak ada jalur lain; panel `/admin/calibration`
sengaja tidak punya tombol yang mengubah nilai ini saat runtime.

---

## 7. Contoh hitungan

Delapan profil **sintetis**, sengaja bukan emiten sungguhan. Angka fundamental emiten nyata
berubah tiap kuartal, jadi contoh ber-ticker akan berubah arti tanpa satu baris kode pun
berubah — dan menuliskan angka fundamental emiten nyata yang tidak ditarik dari sumber data
melanggar kebijakan zero-dummy repo ini. Yang perlu dibuktikan di sini adalah **rumusnya**,
dan untuk itu profil stabil adalah alat yang benar.

Definisi input setiap profil ada di `lens-score-snapshot.test.ts`; angka di bawah dihitung
ulang oleh test setiap kali CI berjalan.

| Profil | Tek | Fun | Flow | Total | Coverage | Kategori | Yang ditunjukkan |
|---|---|---|---|---|---|---|---|
| P1 | 40 | 28 | 30 | 98 | 100% | STRONG BUY | Data lengkap, tren naik, valuasi diskon, akumulasi persisten |
| P2 | 1 | 0 | 0 | 1 | 100% | SELL | Downtrend penuh + distribusi; RSI 35 di downtrend hanya 1 poin, bukan "murah" |
| P3 | 40 | 27 | 30 | 97 | 100% | STRONG BUY | Bank DER 6,2x — DER & CR `NOT_APPLICABLE`, coverage **tetap** 100% |
| P4 | 40 | 12 | 30 | 82 | 100% | STRONG BUY | Emiten rugi: Profitabilitas 0, tapi Valuasi 2 — tidak dihukum dua kali |
| P5 | 40 | 0 | 0 | **100** | **40%** | DATA TIDAK CUKUP | Total 100 dari data teknikal saja; gerbang coverage yang menahannya, bukan skornya |
| P6 | 40 | 24 | 30 | 94 | 100% | STRONG BUY | PER 4,5x + ROE 42% di sektor batu bara: valuasi dibatasi penjaga puncak siklus |
| P7 | 16 | 13 | 13 | 42 | 100% | SELL | Profil biasa-biasa saja — inilah bentuk skor menengah yang sebenarnya |
| P8 | 40 | 25 | 30 | **100** | **95%** | STRONG BUY | PER hilang: fundamental turun ke 25/30, coverage 95%, tapi total tetap 100 |

**P5 dan P8 adalah yang paling penting untuk dipahami.** `total_score` diskalakan atas
bobot yang punya data, jadi ia **tidak** bisa dibaca tanpa `coverage_pct` di sebelahnya.
Skor 100 dengan coverage 40% berarti "sempurna pada 40% pertanyaan yang bisa dijawab" —
bukan "saham sempurna". Karena itu setiap permukaan yang menampilkan LensScore wajib ikut
menampilkan kelengkapan datanya.

---

## 8. Batasan yang diketahui

1. **Belum tervalidasi out-of-sample.** Status model `RESEARCH_ONLY`. Angka backtest dan
   p-value bersifat indikatif dan tidak boleh dibaca sebagai bukti keunggulan.
2. **Arus dana adalah proxy**, bukan data broker/asing sungguhan (§2.3).
3. **Bobot 40/30/30 belum dioptimasi out-of-sample.** Ia keputusan desain, bukan hasil
   pencarian. `lens-score-optimizer.service.ts` mengusulkan alternatif, tapi usulannya
   belum pernah dipromosikan jadi bobot produksi.
4. **Fundamental mengikuti kalender pelaporan**, jadi ia selalu tertinggal dari harga.
5. **Sumber Yahoo Finance dapat me-restate histori** setelah corporate action, sehingga
   indikator historis bisa sedikit berbeda dari yang benar-benar terlihat pada tanggal itu.
6. **Skor bukan rekomendasi.** Ia meringkas kondisi terukur pada satu tanggal, bukan
   prediksi harga.

Batasan spesifik simulasi backtest ada terpisah di
`modules/backtest/constants/backtest-limitations.ts` dan ditampilkan bersama hasilnya.
