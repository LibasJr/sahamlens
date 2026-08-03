# AI Pick Satu Tab — Design

**Tanggal:** 2026-08-03
**Status:** Menunggu review
**Menggantikan:** 8 tab di `app/breakout-radar/page.tsx`

## Masalah

Halaman AI Pick punya 8 tab: Breakout, Rekomendasi, Menarik, Undervalue, Berisiko,
Golden Cross, Dead Cross, Akumulasi Asing. Audit 2026-08-03 menemukan empat masalah
yang saling menguatkan.

**1. Angka antar tab tidak sebanding.** Tiap tab memindai universe berbeda:

| Sumber | Universe | Dipakai tab |
|---|---|---|
| `WATCHLIST` (breakout.service.ts) | 15 | Breakout, Golden Cross, Dead Cross |
| `MARKET_STOCKS` (market-summary.service.ts) | 250 | Menarik, Berisiko, Undervalue, Akumulasi Asing |
| `REC_LIQUID_STOCKS` (breakout-radar/page.tsx) | 220 | Rekomendasi |

"Breakout (7)" dan "Menarik (50)" bukan berarti saham menarik 7x lebih banyak — jaringnya
saja yang beda ukuran.

**2. Isi tab tumpang tindih dan saling bertentangan.** Dari 80 baris di semua tab, hanya
69 saham unik. `Undervalue x Berisiko` beririsan 6 saham (SIDO, BUAH, MSIN, TCPI, BNLI,
HEAL) — satu tab menyuruh beli, satu lagi menandai berisiko, untuk saham yang sama, tanpa
user pernah tahu keduanya bicara tentang saham yang sama.

**3. Tab Rekomendasi memindai sendiri.** `page.tsx:230-233` memecah 220 saham jadi ~22
request dengan `cache: 'no-store'` setiap tab dibuka — melanggar aturan "AI Pick hanya
membaca cache". Dua fallback live-scan lain ada di `daily-picks/route.ts:29-30` dan
`breakout-radar/route.ts:44`.

**4. Skor dasar peringkat hampir tidak membedakan apa pun.** `technicalScore` di
`market-summary.service.ts:138` hanya menjumlah 3 boolean:

```ts
const conditions = [currentPrice > ma20, ma20 > ma50, volRatio > 1];
technicalScore = Math.round((met / conditions.length) * 100);
```

Nilainya cuma bisa 0, 33, 67, atau 100. Pengukuran nyata: 19 dari 20 saham di tab
"Menarik" berskor **67 persis sama**, seluruh tab "Berisiko" berskor **0**. Urutan
sebenarnya ditentukan tie-break `changePct` — jadi peringkatnya adalah "yang paling naik
hari ini", bukan yang paling layak dibeli.

Ditambah temuan kualitas universe: dari 250 `MARKET_STOCKS`, hanya **101 yang lolos**
tiga floor kualitas. 20 berharga di bawah Rp 200, 27 bertransaksi di bawah Rp 1 M/hari,
101 nyaris tanpa transaksi sama sekali. Separuh daftar bukan jawaban yang bisa dieksekusi
untuk pertanyaan "hari ini beli apa".

## Yang tidak bermasalah

Audit yang sama mengonfirmasi hal-hal ini sudah benar dan **tidak boleh diubah**:

- Akumulasi Asing memakai Chaikin Money Flow asli — `((close-low)-(high-close))/range` di
  `foreign-flow-proxy.ts:31`, MFV = MFM x Volume di baris 72. Bukan dummy.
- Konfirmasi akumulasi 4-lapis (`analyzeAccumulationSignal`) lebih ketat dari streak biasa.
- Disclaimer "BUKAN data broker/asing resmi" sudah tampil di UI (`page.tsx:772`).
- Tidak ada data palsu di seluruh repo — sapuan `hash(`/`charCodeAt`/`Math.random` hanya
  menyisakan bcrypt, `crypto.randomInt` untuk OTP, dan pemilih warna avatar.
- Timestamp tab breakout benar, dibaca dari `lastUpdate` milik cache.

## Keputusan

Delapan tab dilebur jadi **satu daftar berperingkat**. Tidak ada tab lain.

Halaman menjawab satu pertanyaan: **hari ini beli apa?**

## Arsitektur

```
QStash 5 menit ──> /api/cron/breakout-scan
                     scanBreakouts() + scanCrossSignals()
                     universe: AI_PICK_UNIVERSE
                          └──> Redis: sahamlens:cache:computed:breakout-radar

QStash harian  ──> /api/cron/fundamental-snapshot
                     yahooFinance.quoteSummary() per saham
                          └──> Redis: ...:fundamental-snapshot   (TTL 24 jam)

QStash 5 menit ──> /api/cron/ai-pick-scan
                     per saham: indikator + calculateScore()
                          └──> Redis: ...:ai-pick-scores

        /api/ai-pick ◄── baca ai-pick-scores + breakout-radar, tidak memindai apa pun
              └──> lebur + urutkan + potong ambang ──> UI satu tabel
```

### Kenapa butuh cache skor sendiri

`getMarketSummary()` hanya mengembalikan **top-N list** (`topTechnical`, `topRsiOversold`,
dan seterusnya), bukan data per saham, dan tidak menghitung MA200 maupun MACD. Padahal
`calculateScore()` mensyaratkan keduanya lewat `TechnicalInput`. Jadi membaca cache
market-summary saja tidak cukup — nilai yang dibutuhkan memang tidak ada di sana.

Perhitungan per saham dipindah ke cron `/api/cron/ai-pick-scan` yang menyimpan hasil
`calculateScore()` siap pakai. Ini juga yang membuat halaman berhenti memindai sendiri:
pekerjaan yang dulu dilakukan 22 request per klik di tab Rekomendasi sekarang dikerjakan
sekali oleh cron untuk seluruh universe.

`getMarketSummary()` dan `/api/daily-picks` tidak diubah — keduanya masih melayani widget
beranda dan `/api/ai-briefing`.

### Komponen

**`AI_PICK_UNIVERSE`** (`modules/market/constants/ai-pick-universe.ts`, baru)
Satu universe dipakai bersama breakout-scan dan market-summary. Disaring tiga floor yang
sama dengan `BACKTEST_UNIVERSE`: harga rata-rata 3 bulan >= Rp 200, nilai transaksi >= Rp 1
M/hari, volatilitas 12 bulan <= 120%/tahun. Dihasilkan ulang oleh skrip yang sudah ada,
`scripts/backtest-universe-refresh.mjs`.

Menghapus ketimpangan 15 vs 250 vs 220: setiap saham dinilai dengan jaring yang sama, jadi
bonus breakout bisa didapat saham mana pun, bukan hanya 15 yang kebetulan hardcoded.

**`/api/ai-pick`** (baru) — murni pembaca cache. Tidak ada fallback `scanBreakouts()`.
Kalau cache belum terisi, jawab `{ items: [], ready: false }` dan UI menampilkan "data
sedang disiapkan", bukan diam-diam memindai 220 saham.

**`modules/recommendation/service/ai-pick.service.ts`** (baru) — logika peleburan dan
peringkat, murni fungsi tanpa I/O supaya bisa diuji tanpa Redis maupun jaringan.

### Sumber data skor, dan biayanya

`calculateScore()` menerima tiga kelompok masukan, dan hanya dua di antaranya sudah
tersedia di cache yang ada:

| Kelompok | Isi | Sumber | Sudah ada? |
|---|---|---|---|
| Technical | MA20/50/200, RSI, MACD, volume | perhitungan dari data chart | ya, di market-summary |
| Flow | foreignFlow, streak, volRatio | `foreign-flow-proxy.ts` | ya, di market-summary |
| Fundamental | PER, PBV, ROE, DER, current ratio, revenue growth | `yahooFinance.quoteSummary()` | **tidak** |

Data fundamental butuh satu request `quoteSummary` terpisah per saham
(`recommendation.service.ts:148`). Untuk universe ~109 saham itu berarti ~109 request
tambahan di luar request chart yang sudah ada — melipatduakan beban precompute.

**Mitigasi: cache fundamental terpisah dengan TTL 24 jam.** PER, PBV, ROE, dan DER berubah
per kuartal mengikuti laporan keuangan, bukan per 5 menit. Menyegarkannya semenit sekali
bersama harga adalah pemborosan tanpa manfaat.

- Key: `sahamlens:cache:computed:fundamental-snapshot`, TTL 24 jam
- Diisi cron harian `/api/cron/fundamental-snapshot`, bukan oleh cron yang berjalan tiap
  5 menit; dibaca oleh `/api/cron/ai-pick-scan` sebagai masukan `calculateScore()`
- Kalau snapshot fundamental belum ada, `calculateScore()` tetap dipanggil dengan
  fundamental `null` — `scoreValuasi`/`scoreProfitabilitas`/`scoreKesehatan` sudah
  menangani itu dengan mengembalikan 0 dan alasan "DATA TIDAK LENGKAP"
  (`scoring.service.ts:69`). Peringkat tetap jalan, hanya kehilangan komponen fundamental,
  dan UI memberi catatan bahwa skor sedang berbasis teknikal + flow saja.

Konsekuensi yang diterima: skor bisa berbeda antara jam-jam awal setelah deploy (sebelum
snapshot fundamental pertama terisi) dan setelahnya. Ini lebih baik daripada menunda
seluruh halaman sampai 109 request fundamental selesai.

### Yang dihapus

- Tab Rekomendasi, `REC_LIQUID_STOCKS`, dan ~22 request per klik. Fungsinya diserap
  peringkat — `calculateScore()` yang tadinya hanya dipakai tab itu justru jadi dasar
  peringkat, sesuai maksud asli "Rekomendasi harusnya ranking dari kategori lain".
- Fallback live-scan di `daily-picks/route.ts:29-30` dan `breakout-radar/route.ts:44`.
- `CATEGORY_TABS` dan seluruh mesin tab di `page.tsx`.

`/api/daily-picks` tetap ada — masih dipakai widget "Hari Ini AI Menemukan" di beranda dan
`/api/ai-briefing`. Yang berubah hanya fallback scan-nya dihapus.

## Rumus peringkat

Dasar: `calculateScore().total_score` (skala 0-100, `scoring.service.ts:278`), menjumlah
delapan komponen — MA trend, RSI/MACD, volume, valuasi, profitabilitas, kesehatan, asing,
bandar. Dipilih menggantikan `technicalScore` 4-nilai karena skor inilah yang benar-benar
membedakan saham.

Sinyal langka menambah:

| Sinyal | Tambahan | Alasan |
|---|---|---|
| Breakout terkonfirmasi | +15 | paling jarang, 6-7 saham/hari dari ratusan |
| Akumulasi terkonfirmasi 4-lapis | +10 | syaratnya ketat, jarang lolos |
| Golden Cross hari ini | +10 | kejadian, bukan kondisi |
| RSI < 30 | +5 | kondisi umum, bukan pemicu |

Bobot mencerminkan kelangkaan: makin jarang sebuah sinyal muncul, makin besar artinya
ketika muncul.

**Penanda merah** — tidak mengurangi skor, hanya menandai: saham masuk daftar bearish
teknikal, atau kena Dead Cross. Saham bisa berada di 10 besar sambil bertanda merah.
Itu justru gunanya: kontradiksi seperti 6 saham yang muncul di Undervalue dan Berisiko
sekaligus akhirnya terlihat dalam satu baris, bukan tersembunyi di dua tab.

**Ambang potong:** `total_score >= 60` — batas kategori BUY yang sudah dipakai
`getKategori()`, bukan angka baru. Di hari sepi daftar boleh berisi kurang dari 10 baris,
atau kosong dengan pesan "belum ada sinyal kuat hari ini". Daftar tidak diisi paksa sampai
10, supaya tidak memancing beli hanya karena ada yang tercantum.

**Batas tampil:** 10 teratas.

## Tampilan

Tabel dengan rincian skor terbuka:

```
#  SAHAM   HARGA    CHG     SKOR   RINCIAN
1  BBCA     8.950   +1,2%    103   78  +15 breakout  +10 akumulasi
2  ANTM     1.845   +3,4%     92   77  +15 breakout
3  MDKA     2.410   +0,9%     88   78  +10 golden cross
4  SIDO       625   -0,8%     71   66   +5 oversold   ! berisiko
5  TINS     1.120   +2,1%     69   69
```

Kolom RINCIAN menunjukkan skor dasar lalu tiap tambahan, sehingga user bisa menilai
sendiri kenapa suatu saham berada di atas — bukan disuruh percaya satu angka akhir.

Disclaimer CMF tetap ditampilkan untuk baris yang punya tambahan akumulasi.

Timestamp dibaca dari `lastUpdate` milik cache, bukan jam client. Ini memperbaiki
`setRecLastUpdate(new Date())` di `page.tsx:227` dan `:279` yang selama ini menampilkan jam
saat tombol diklik seolah-olah waktu data dihitung.

## Penanganan kegagalan

| Kondisi | Perilaku |
|---|---|
| Kedua cache kosong | `{ items: [], ready: false }`, UI: "data sedang disiapkan" |
| Hanya cache breakout kosong | Peringkat jalan tanpa bonus breakout/golden cross, UI memberi catatan |
| Hanya `ai-pick-scores` kosong | `ready: false` — tanpa skor dasar tidak ada peringkat yang bermakna |
| Saham ada di breakout tapi tidak di market-summary | Dilewati, dicatat di log; menandakan universe kedua cache tidak sinkron |
| Skor tertinggi di bawah 60 | Daftar kosong + "belum ada sinyal kuat hari ini" |
| Snapshot fundamental kosong/kadaluarsa | Skor dihitung dari teknikal + flow saja, UI memberi catatan; bukan error |

Tidak ada kondisi yang memicu pemindaian langsung.

## Pengujian

Logika peringkat murni fungsi, diuji tanpa Redis maupun jaringan (pola sama dengan
`modules/backtest/service/__tests__/simulate.service.test.ts`).

Kasus yang harus ditulis lebih dulu, masing-masing sebagai test yang gagal sebelum ada
implementasi:

1. Saham dengan breakout mengalahkan saham berskor dasar lebih tinggi tanpa sinyal —
   membuktikan bonus benar-benar berpengaruh.
2. Saham dengan skor dasar sama diurutkan secara deterministik, tidak bergantung urutan
   array universe (pelajaran dari bug seleksi alfabetis di `simulate.service.ts`).
3. Saham bertanda merah tetap muncul di daftar, tidak tersaring keluar.
4. Skor di bawah 60 tidak muncul meski daftar jadi kurang dari 10.
5. Semua skor di bawah 60 menghasilkan daftar kosong, bukan 10 saham terbaik dari yang buruk.
6. Cache breakout kosong menghasilkan peringkat tanpa bonus, bukan error.
7. Saham yang hanya ada di satu cache tidak membuat seluruh respons gagal.
8. Snapshot fundamental kosong menghasilkan skor teknikal + flow, bukan error maupun skor 0
   untuk semua saham.

## Yang sengaja tidak dikerjakan

- **Tidak menyentuh Backtest.** Diminta eksplisit; `simulate.service.ts` dan
  `BACKTEST_UNIVERSE` tetap apa adanya.
- **Tidak membuat skor baru.** Sistem sudah punya dua; spec ini memilih salah satu yang
  ada, tidak menambah yang ketiga.
- **Tidak menyentuh `/api/recommendations`.** Endpointnya tetap untuk pemakai lain; yang
  dihapus hanya pemanggilan massal dari halaman AI Pick.
- **Tidak menambah data intraday.** Sumber tetap end-of-day.
