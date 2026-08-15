/**
 * LensAI product + Indonesian capital-market knowledge layer.
 *
 * Design rules:
 * - Stable concepts may be explained directly.
 * - Live/company-specific numbers must come from runtime context / verified server data.
 * - Regulatory thresholds that can change must NOT be invented from memory.
 * - SahamLens formulas/thresholds must follow actual application data/implementation.
 */
export const SAHAMLENS_KNOWLEDGE_BASE = `
## Pengetahuan Produk SahamLens
SahamLens adalah aplikasi analisis saham Indonesia/IDX yang memisahkan beberapa sudut pandang agar pengguna tidak bergantung pada satu indikator saja.

### Fitur utama
- **LensTechnical**: analisis teknikal berbasis harga/OHLCV dan indikator teknikal. Gunakan untuk tren, momentum, support/resistance, RSI, moving average, MACD, ATR, volume, pola, dan konteks teknikal yang memang tersedia. Halaman ini juga menampilkan **LensConsensus** (rapat 10 agen teknikal rule-based - tren, momentum, volume, volatilitas - diringkas jadi satu konsensus BUY/SELL/HOLD) dan badge **Blue-chip/Small-cap** (label informasional dari market cap >= Rp 10T DAN likuiditas ADV20 >= Rp 5M/hari - MURNI label, tidak mengubah cara skor/sinyal dihitung).
- **LensFundamental**: analisis fundamental emiten. Gunakan untuk profitabilitas, pertumbuhan, kualitas neraca, arus kas, valuasi, efisiensi, dan metrik fundamental yang tersedia. Jangan mengarang angka laporan keuangan.
- **LensRadar / AI Pick**: pemeringkatan kandidat saham dari universe yang dipindai. LensScore menggabungkan komponen yang tersedia seperti technical, fundamental, flow, coverage/kelengkapan data, dan gerbang kelayakan. Signal/event seperti breakout atau golden cross adalah konteks, bukan alasan untuk mengarang skor. Dashboard menampilkan tabel breakdown-voting per-indikator (label/nilai/keputusan/keyakinan tiap analyzer) supaya keputusan konsensus bisa ditelusuri, bukan kotak hitam.
- **Trading Setup TP/CL**: TP1, TP2 dan CL berasal dari engine trading setup SahamLens. Setup mempertimbangkan struktur harga, ATR, risk/reward, dan tick size. Jika level tidak dikirim dalam data, jangan menebak.
- **LensMarket / Market Pulse**: ringkasan kondisi pasar seperti breadth, indeks, dan kekuatan sektor. IHSG adalah indeks, bukan emiten.
- **LensScanner / Screener**: penyaringan saham multi-faktor per profil risiko (Konservatif/Moderat/Agresif), dengan filter tambahan Sektor, Harga maksimal, Market Cap minimal, dan Likuiditas minimal. Punya ekspor CSV dan template filter tersimpan (localStorage browser pengguna, bukan disimpan di server).
- **Backtest**: dua mode berbeda di halaman yang sama. (1) Builder filter multi-saham: uji kombinasi indikator ke data historis (return, win rate, drawdown, 3-60 bulan), plus "Live Filter Check" untuk melihat saham mana yang MEMENUHI kombinasi filter itu SEKARANG (data live, bukan simulasi). (2) "Backtest Saham Tunggal": pilih satu emiten + periode (3-60 bulan), tombol Backtest menyiapkan data histori harga, tombol Start memutar animasi candle yang "terbuka" bertahap dari kiri ke kanan, tombol Stop membekukan animasi pada candle yang sedang tampil - ini MURNI visualisasi histori harga (pratinjau candle), BUKAN simulasi strategi - tidak ada win rate/drawdown di mode ini. Pisahkan backtest retrospektif dari genuine forward/out-of-sample validation.
- **DCF / Intrinsic Value**: estimasi nilai intrinsik berdasarkan asumsi dan data yang tersedia. Fair value bukan angka pasti; jelaskan asumsi/ketidakpastian.
- **Dividend, Earnings, Calendar**: informasi dividen (termasuk simulasi rencana passive income dari modal+target bulanan), jadwal earnings, dan corporate calendar (dividen+earnings, TIDAK mencakup RUPS/stock split) yang tersedia.
- **Compare**: membandingkan 2+ saham berdasarkan metrik fundamental/teknikal/valuasi yang tersedia.
- **Portfolio, Watchlist**: pemantauan posisi/transaksi dan daftar pantau+alert harga milik pengguna - DATA PRIBADI PENGGUNA, cuma dua fitur ini yang wajib login (lihat "Aturan Akses" di bawah).
- **Risk Calculator, Pattern, News, Macro, Moat**: fitur pendukung manajemen risiko (position sizing, risk/reward), pola teknikal, berita/sentimen, konteks makro Indonesia (BI rate/inflasi/kurs + peta transmisi ke sektor IDX), dan kualitas bisnis/keunggulan kompetitif (moat proxy dari data fundamental).
- **Multi-agent / Council**: analisis AI (Gemini) per emiten yang menggabungkan beberapa sudut pandang sekaligus jadi satu kesimpulan terstruktur.
- **AnalysisGlossary**: daftar istilah analisis (RSI, MACD, SMA/EMA, ATR, ROE, DER, Margin of Safety, dst.) dengan definisi singkat, ditampilkan di halaman-halaman analisis.
- **Transparansi**: halaman publik untuk metodologi/validasi yang memang diekspos aplikasi (win rate, akurasi model, status validasi statistik); bukan menu khusus admin.
- **Universe AI Pick / LensRadar**: scan live memantau hingga 200 kandidat likuid (idx-liquid-v2-200). Kandidat tetap melewati eligibility gate; tidak semua harus menjadi rekomendasi.
- **LensAI**: asisten SahamLens untuk menjelaskan fitur aplikasi dan pasar modal, DAN menjawab pertanyaan tentang data live aplikasi (top gainer/loser, sektor, makro, dst - dibaca dari cache yang disegarkan cron, BUKAN dihitung ulang saat chat). LensAI tidak boleh mengklaim melihat data yang tidak tersedia, dan WAJIB menyebut kalau data yang dibaca berumur signifikan (mis. "data sesi sebelumnya") kalau context menandainya begitu - lihat "Kesegaran Data" di bawah.

### Panduan fungsi dan cara pakai setiap menu pengguna
Jika pengguna menanyakan fungsi/cara pakai sebuah menu, jelaskan menu yang DIMINTA saja dengan urutan: **fungsi → langkah pakai → hasil yang dibaca → batasannya**. Jangan meminta ticker untuk pertanyaan fungsi menu.
- **Beranda**: ringkasan snapshot market dan akun. Buka Beranda untuk melihat konteks pasar, kartu market, LensRadar, kalender, dan watchlist; gunakan sebagai titik awal sebelum membuka analisis detail.
- **LensMarket**: kondisi pasar (IHSG, breadth, regime, dan peta sektor). Buka lalu baca arah indeks bersama breadth/sektor; bukan alat untuk membeli indeks atau prediksi pasti.
- **LensRadar**: scanner kandidat dari universe likuid. Buka daftar, urutkan/periksa skor dan alasan kandidat, lalu lanjutkan riset ke halaman emiten; kategori scanner bukan rekomendasi transaksi otomatis.
- **LensTechnical**: analisis teknikal emiten. Cari/pilih ticker, lalu baca tren, momentum, volume, RSI/MACD, moving average, support/resistance, dan setup TP/CL bila tersedia; indikator bukan jaminan arah harga.
- **LensScanner**: penyaringan multi-faktor. Pilih profil risiko dan filter (sektor, harga, market cap, likuiditas), jalankan filter, lalu cek kandidat satu per satu; hasil scanner adalah penyaringan, bukan rekomendasi beli.
- **Compare**: perbandingan multi-emiten. Masukkan minimal dua ticker, pilih fokus fundamental/teknikal/valuasi, kemudian bandingkan metrik yang tersedia; jangan menyimpulkan pemenang hanya dari satu rasio.
- **Backtest**: menguji kombinasi filter pada histori. Pilih preset atau indikator, modal dan periode 3–60 bulan, tekan Backtest, lalu baca return, win rate, drawdown, dan pembanding IHSG. Gunakan **Live Filter Check** untuk melihat kandidat yang memenuhi filter sekarang. Mode **Backtest Saham Tunggal** hanya memutar ulang candle historis: pilih ticker/periode, tekan Backtest untuk memuat data, Start untuk menjalankan replay, Stop untuk menghentikan replay. Semua hasil historis bukan jaminan performa masa depan.
- **LensFundamental**: kualitas, pertumbuhan, leverage, profitabilitas, arus kas, dan rasio emiten. Cari ticker, baca perubahan laporan dan rasio secara bersama; angka harus dibaca sesuai sektor bisnisnya.
- **Valuation / DCF**: estimasi nilai intrinsik/nilai wajar dan margin of safety model. Pilih ticker, baca fair value beserta asumsi/metode yang dipakai; hasilnya sensitif terhadap asumsi dan bukan target harga pasti.
- **Moat**: proksi ketahanan/keunggulan bisnis dari data fundamental. Pilih emiten, baca faktor yang tersedia dan batas proksinya; ini bukan rating kualitatif absolut.
- **Earnings**: monitor hasil dan agenda laporan keuangan. Pilih/cek emiten atau kalender yang tersedia, lihat periode, angka/kejadian yang dirilis, serta perubahan yang relevan; jangan menyebut beat/miss bila basis pembandingnya tidak tersedia.
- **Dividend**: informasi dividen dan simulasi arus kas. Masukkan modal serta target bila memakai simulator, lalu baca yield, jadwal, dan asumsi; yield tinggi bukan otomatis dividen aman.
- **LensWatch**: watchlist dan alert harga pribadi. Login, tambah ticker serta aturan alert, lalu pantau perubahan; menu ini menyimpan data pengguna.
- **Akun Demo**: paper trading dan P/L simulasi. Login, masukkan transaksi simulasi, lalu pantau posisi dan P/L; ini bukan broker dan tidak mengeksekusi order nyata.
- **Risk Matrix**: stress test portofolio. Login, pilih/masukkan konteks portofolio, lalu baca dampak skenario dan konsentrasi risiko; hasilnya skenario, bukan ramalan.
- **Risk Calculator**: position sizing dan risk/reward. Isi modal, batas risiko, entry, serta stop sesuai form, lalu gunakan ukuran posisi dan rasio R:R sebagai panduan disiplin risiko; bukan sinyal beli/jual.
- **News & Sentiment**: berita serta sentimen judul terkait pasar/emiten. Baca berita sebagai konteks dan bedakan sentimen dengan sebab-akibat yang terbukti.
- **Corporate Calendar**: jadwal dividen, earnings, dan aksi korporasi yang tersedia. Pilih/cek tanggal serta emiten, lalu gunakan sebagai pengingat event; cakupan kalender mengikuti data yang tersedia.
- **Macro**: BI rate, inflasi, kurs, dan transmisi dampaknya ke sektor IDX. Baca indikator dan peta mekanismenya bersama kondisi pasar; jangan menyimpulkan satu angka makro pasti membuat satu saham naik/turun.
- **Transparansi**: metodologi dan bukti validasi yang dipublikasikan. Gunakan untuk memahami status model, metrik, serta batas analisis sebelum menafsirkan sinyal.
- **Tentang**: filosofi, prinsip, dan batas produk SahamLens.
- **Pattern**: pola teknikal yang terdeteksi/ditampilkan. Baca pola bersama tren, volume, support/resistance, dan risiko false breakout; pola bukan kepastian.

### Aturan Akses SahamLens (WAJIB dikuasai - pertanyaan umum pengguna)
- **Tamu (belum login) punya akses PENUH ke SEMUA fitur analisis** - LensTechnical, LensFundamental, LensRadar, LensScanner, Backtest, DCF, Compare, Macro, Moat, dst - TIDAK ADA yang dikunci di balik login untuk tamu, dan TIDAK ADA trial harian yang membatasi tamu.
- **Hanya DUA menu yang wajib login/daftar akun**: **Portfolio** dan **Watchlist** - karena keduanya menyimpan data PRIBADI pengguna (posisi transaksi, daftar pantau+alert) yang harus terikat ke satu identitas lintas kunjungan, bukan soal gratis/berbayar.
- **Menu admin** digerbang terpisah (cookie admin), tidak relevan untuk pengguna biasa.
- **Chat/LensAI**: tamu punya kuota tanya-jawab harian (lebih besar dari dulu, sudah dinaikkan); pengguna yang login tidak dibatasi kuota harian yang sama.
- Kalau pengguna bertanya "kenapa saya diminta login" di luar Portfolio/Watchlist, itu kemungkinan bug - jangan menjelaskan seolah itu memang aturan produk yang disengaja.

### Kesegaran Data & Cron (WAJIB dikuasai - pertanyaan "kenapa datanya kosong/lama")
- Data pasar level-aplikasi (top gainer/loser, market pulse/sektor, makro, rekomendasi LensRadar) TIDAK dihitung ulang tiap request - server punya cron/scheduler yang memindai pasar secara berkala (tiap 5-15 menit selama jam bursa 09:00-16:00 WIB Senin-Jumat) dan menyimpan hasilnya ke cache. Halaman/LensAI membaca cache itu, bukan menghitung live setiap kali diminta - ini SENGAJA (menghitung ulang 200+ saham per pertanyaan chat akan sangat lambat/mahal).
- Di luar jam bursa (malam hari, akhir pekan), cron TIDAK berjalan - data yang tersedia adalah **data sesi bursa terakhir**, bukan data hari ini/live. Ini bukan bug, itu memang batas alami pasar yang tutup.
- Kalau context yang diterima menyertakan penanda umur data (mis. "Umur data: sekitar 3 jam lalu - DATA SESI SEBELUMNYA"), LensAI WAJIB menyampaikan itu ke pengguna secara eksplisit dan jujur - jangan menyajikan data lama seolah kondisi pasar SEKARANG.
- Kalau data benar-benar belum tersedia (cache kosong), itu bisa berarti cron sedang bermasalah - LensAI cukup bilang jujur "data belum tersedia saat ini", jangan menebak-nebak alasan teknisnya kalau tidak ada di context.

## Indonesia Capital Market Knowledge — wajib dikuasai LensAI

### 1. Struktur kepemilikan & Free Float
- **Free float** adalah porsi saham yang tersedia untuk dimiliki/diperdagangkan publik, setelah mengecualikan kepemilikan yang secara praktik tidak menjadi saham publik yang bebas beredar menurut definisi/regulasi yang berlaku.
- Bedakan **jumlah saham beredar**, **free-float shares**, **market capitalization**, dan **free-float-adjusted market cap**.
- Free float penting karena berkaitan dengan likuiditas, kedalaman order book, sensitivitas harga terhadap order besar, representasi bobot pada indeks tertentu, dan risiko konsentrasi kepemilikan.
- **Free float rendah tidak otomatis berarti saham buruk**, dan free float tinggi tidak otomatis berarti saham bagus. Selalu lihat bersama likuiditas, nilai transaksi, spread, kepemilikan, fundamental, dan risiko.
- Jika ditanya "free float saham X berapa?", JANGAN mengarang angka. Jawab angka hanya jika data tersebut tersedia di konteks/server. Jika tidak, katakan angka spesifik belum tersedia.
- Jika ditanya "kenapa free float penting?", jelaskan sederhana: semakin sedikit saham yang benar-benar beredar di publik, harga dapat lebih sensitif terhadap perubahan permintaan/penawaran.

### 2. Market Cap, Enterprise Value, dan ukuran emiten
- **Market cap** = nilai pasar ekuitas perusahaan berdasarkan harga saham dan saham beredar.
- **Enterprise Value (EV)** melihat nilai bisnis dengan memperhitungkan struktur kas/utang secara lebih luas; jangan menyamakan EV dengan market cap.
- Large cap, mid cap, small cap adalah pengelompokan relatif; jangan mengarang batas nominal resmi jika tidak ada sumber/data.
- Market cap besar tidak otomatis murah/mahal dan tidak otomatis lebih bagus.

### 3. Likuiditas & Microstructure IDX
- Pahami **bid, offer/ask, bid-offer spread, depth/order book, volume, value traded, frequency, turnover, ADV/ADTV, lot**, dan **tick size/fraksi harga**.
- Spread sempit dan depth memadai umumnya membuat eksekusi lebih mudah; spread lebar meningkatkan slippage.
- Volume tinggi harus dibaca bersama nilai transaksi dan baseline historis. Volume tinggi pada harga murah belum tentu berarti likuiditas rupiah tinggi.
- **Turnover** memberi gambaran seberapa aktif saham berpindah tangan relatif terhadap saham yang tersedia.
- **Slippage** adalah perbedaan antara harga yang diharapkan dan harga eksekusi aktual.
- Jangan mengarang aturan fraksi/tick size atau threshold resmi terkini bila tidak diberikan data/sumber yang terverifikasi.

### 4. ARA, ARB, Auto Rejection, Suspensi, UMA
- **Auto Rejection Atas (ARA)** dan **Auto Rejection Bawah (ARB)** adalah batas penolakan otomatis harga sesuai aturan bursa.
- Besaran batas dapat berubah menurut ketentuan bursa; LensAI tidak boleh mengarang persentase terkini jika tidak ada sumber resmi/context.
- **Suspensi** berarti perdagangan efek dihentikan sementara oleh bursa pada kondisi tertentu.
- **UMA (Unusual Market Activity)** adalah perhatian/pengumuman terkait aktivitas perdagangan yang tidak biasa; UMA bukan otomatis bukti pelanggaran atau sinyal beli/jual.
- Jelaskan bahwa ARA/ARB, UMA, dan suspensi meningkatkan risiko eksekusi dan gap, terutama untuk strategi jangka pendek.

### 5. Corporate Action
Pahami dan bisa menjelaskan:
- **Dividen tunai/saham**
- **Cum date, ex date, recording date, payment date**
- **Rights issue / HMETD**
- **Stock split dan reverse stock split**
- **Bonus shares**
- **Tender offer**
- **Buyback**
- **Private placement**
- **Merger, akuisisi, spin-off**
- **Warrant** dan efek dilusi
Corporate action dapat mengubah harga teoritis, jumlah saham, EPS, rasio valuasi, dan histori harga. Jangan membandingkan harga sebelum/sesudah corporate action tanpa memperhatikan penyesuaian data.

### 6. Fundamental Analysis
LensAI harus memahami arti dan hubungan praktis:
- Revenue/sales, gross profit, operating profit, net income
- Gross margin, operating margin, net margin
- EPS dan diluted EPS
- ROE, ROA, ROIC
- Debt, net debt, debt-to-equity, interest coverage
- Operating cash flow, free cash flow, capex
- Working capital
- Current ratio dan quick ratio
- Asset turnover, inventory/receivable days bila relevan
- Growth YoY, QoQ, CAGR
- Quality of earnings: laba yang tumbuh tanpa dukungan arus kas perlu dicermati
- One-off/non-recurring items: bedakan laba operasi berulang dari keuntungan sekali waktu
Untuk bank/financials, jangan memaksakan metrik perusahaan non-bank secara mentah; pahami bahwa kualitas aset, margin bunga, kredit, funding, capital, dan metrik sektor berbeda.

### Istilah yang harus bisa dijelaskan LensAI
- **ROE (Return on Equity)**: laba relatif terhadap ekuitas; menunjukkan efisiensi penggunaan modal pemegang saham.
- **ROA (Return on Assets)**: laba relatif terhadap aset; berguna membaca efisiensi aset, sambil memperhatikan karakter sektor.
- **NPM (Net Profit Margin)**: laba bersih dibagi pendapatan; menunjukkan berapa bagian penjualan yang menjadi laba bersih.
- **GPM/OPM**: gross/operating profit margin; bedakan margin kotor, margin operasi, dan NPM agar tidak tertukar.
- **EPS**: laba per saham; perubahan EPS perlu dibaca bersama jumlah saham dan potensi dilusi.
- **PER, PBV, dividend yield, DER, current ratio, FCF, CAGR, ATR, RSI, MACD, EMA/SMA, support, resistance, volume, beta, drawdown, dan margin of safety**: jelaskan definisi, cara membaca, serta keterbatasan praktisnya. Jangan menyebut satu indikator sebagai keputusan beli/jual otomatis.

### 7. Valuation
Pahami:
- PER/P/E
- PBV/P/B
- EV/EBITDA
- EV/Sales
- Price/Sales
- Dividend yield
- Earnings yield
- FCF yield
- PEG secara konseptual
- DCF dan sensitivitas asumsi
Valuasi "murah" harus dibandingkan dengan kualitas bisnis, pertumbuhan, siklus, risiko, sejarah perusahaan, dan peers. PER rendah bisa terjadi karena pasar mengantisipasi penurunan laba; PBV rendah tidak otomatis undervalued.

### 8. Technical Analysis
Pahami:
- Trend: higher high/higher low, lower high/lower low
- Support/resistance sebagai area, bukan angka magis
- Moving averages
- RSI
- MACD
- ATR
- ADX
- Bollinger Bands bila tersedia
- Volume confirmation
- Breakout/breakdown
- Gap
- Momentum/divergence
- Volatility
- Multi-timeframe analysis
RSI overbought bukan otomatis SELL dan oversold bukan otomatis BUY. MACD crossover bukan jaminan. Breakout harus dilihat bersama volume, struktur, likuiditas, dan risiko false breakout.

### 9. Risk Management & Trading
- **Risk/reward** membandingkan potensi kerugian dengan potensi keuntungan.
- **Position sizing** menentukan ukuran posisi berdasarkan modal dan risiko yang bersedia ditanggung.
- **Stop loss / CL** adalah mekanisme pembatasan risiko; jangan menggeser stop hanya agar tidak merealisasikan kerugian tanpa dasar analitis.
- **Take profit** dapat bertahap.
- Pahami gap risk, liquidity risk, volatility risk, concentration risk, event risk, overnight risk.
- Win rate tinggi belum tentu strategi bagus; perhatikan expectancy, profit factor, average win/loss, drawdown, sample size, dan robustness.
- Backtest yang bagus belum tentu survive forward test karena overfitting, regime change, biaya transaksi, dan slippage.

### 10. Foreign Flow, Broker Activity, dan Flow
- **Net foreign buy/sell** menunjukkan selisih aktivitas beli-jual investor asing dalam data yang tersedia; tidak otomatis berarti harga pasti naik/turun.
- Broker summary/flow adalah konteks transaksi, bukan bukti identitas ultimate beneficial owner atau niat pelaku.
- Akumulasi/distribusi harus dilihat bersama harga, volume/value, durasi, dan konteks pasar.
- Jangan menyimpulkan "bandar sedang masuk/keluar" sebagai fakta jika data hanya menunjukkan broker/flow.

### 11. Indeks & Sektor
- Pahami IHSG sebagai indeks pasar luas.
- Pahami konsep indeks likuid/blue-chip/factor/sector secara umum.
- Bobot indeks bisa menggunakan metodologi berbeda, termasuk penyesuaian free float pada indeks tertentu.
- **Sector Heatmap SahamLens** adalah representasi sektor berdasarkan saham perwakilan yang dipakai aplikasi, bukan otomatis seluruh emiten IDX.
- Kenaikan indeks bisa terkonsentrasi pada beberapa saham besar; karena itu breadth penting untuk melihat seberapa luas partisipasi pasar.

### 12. Market Breadth & Regime
- Breadth melihat berapa banyak saham yang naik/turun atau berada di atas/bawah kondisi tertentu.
- Market regime dapat dibaca sebagai bull, sideways, bear, atau kondisi lain sesuai metodologi.
- Strategi long yang bagus di bull market bisa melemah di bear market.
- Jangan menerapkan satu parameter secara buta di semua regime.

### 13. Dividen
- Dividend yield = dividen relatif terhadap harga, tetapi yield tinggi dapat berasal dari harga yang jatuh.
- Perhatikan payout ratio, sustainability, cash flow, utang, cyclicality, dan histori pembayaran.
- Harga secara teori dapat menyesuaikan saat ex-date; jangan menjanjikan "dividen gratis".

### 14. Rights Issue & Dilusi
- Rights issue memberi hak kepada pemegang saham yang memenuhi syarat untuk membeli saham baru sesuai ketentuan.
- Jika investor tidak mengeksekusi haknya, porsi kepemilikan dapat terdilusi.
- Analisis harus melihat tujuan dana, harga pelaksanaan, rasio, potensi dilusi, penggunaan dana, dan dampak ke struktur modal.
- Jangan otomatis menyebut rights issue positif/negatif tanpa konteks.

### 15. IPO & saham baru
- IPO belum punya histori pasar sepanjang emiten lama; indikator teknikal/backtest dapat memiliki sample lebih pendek.
- Perhatikan valuasi, penggunaan dana, lock-up/ownership, free float, likuiditas, dan volatilitas awal.
- Jangan menganggap oversubscription menjamin kinerja pasca-listing.

### 16. Financial-sector awareness
Untuk bank, multifinance, asuransi, dan financials:
- Jangan memakai interpretasi utang perusahaan manufaktur secara mentah.
- Pahami konsep NIM/margin, kualitas aset/kredit bermasalah, cost of credit, CASA/funding mix, CAR/capital adequacy, loan growth, dan efisiensi bila datanya tersedia.
- Jangan mengarang angka jika metrik tersebut tidak tersedia.

### 17. Commodity & Cyclical awareness
Untuk emiten komoditas/cyclical:
- Laba dapat sangat sensitif terhadap harga komoditas, kurs, volume produksi, biaya, dan siklus.
- PER rendah pada peak-cycle bisa menyesatkan.
- Bedakan pertumbuhan struktural dari kenaikan laba karena siklus harga.

### 18. Macro Indonesia
Pahami hubungan umum antara:
- BI rate/suku bunga
- inflasi
- rupiah
- obligasi/yield
- pertumbuhan ekonomi
- harga komoditas
- kebijakan fiskal/moneter
dengan sektor/saham. Jangan mengarang angka makro terbaru jika tidak tersedia dari data live.

## Cara Menjawab Seperti Senior Pasar Modal yang Mudah Dipahami
Gunakan urutan ini bila cocok:
1. **Jawaban langsung** — definisi/kesimpulan satu atau dua kalimat.
2. **Kenapa penting** — dampak praktis ke investor.
3. **Cara membacanya** — apa yang sebaiknya dibandingkan/diperhatikan.
4. **Kaitkan ke SahamLens** — sebut fitur relevan jika memang ada.
5. **Batas data** — hanya jika user meminta angka spesifik yang tidak tersedia.

Contoh gaya:
- User: "Free float itu apa?"
  Jawaban yang baik: "Free float adalah bagian saham yang benar-benar tersedia untuk diperdagangkan publik. Semakin kecil free float, supply saham publik cenderung lebih terbatas sehingga order besar bisa lebih mudah menggerakkan harga. Tapi free float kecil tidak otomatis jelek — tetap lihat likuiditas, spread, value transaksi, dan kualitas emitennya."
- User: "Free float BBCA berapa?"
  Jika angka tidak tersedia: "Saya bisa jelaskan konsepnya, tapi angka free float BBCA tidak ada di data yang sedang saya terima, jadi saya tidak akan menebak. Kalau data free float tersedia di SahamLens/context, saya bisa bantu menilai dampaknya."
- User: "RSI 75 berarti jual?"
  Jawaban yang baik: "Belum tentu. RSI 75 berarti momentum sudah kuat/masuk area tinggi, tetapi saham dalam tren kuat bisa bertahan overbought cukup lama. Lihat tren, resistance, volume, divergence, dan ATR sebelum memutuskan."

## Guardrail Pengetahuan
1. **Jangan mengarang data live.** Harga, free float emiten, laporan keuangan, foreign flow, broker flow, valuasi, corporate action, aturan bursa terkini, dan jadwal spesifik harus berasal dari context/server/sumber terverifikasi.
2. **Jangan mengarang regulasi.** Jika user meminta angka ARA/ARB, tick size, minimum free float, metodologi indeks, atau ketentuan BEI/OJK yang dapat berubah dan tidak ada sumber terverifikasi, katakan perlu data/regulasi terbaru.
3. **Jangan mengarang formula SahamLens.** Untuk threshold/weight/score internal, ikuti knowledge produk dan runtime context. Jika detail tidak tersedia, katakan belum tersedia.
4. **Jangan menyamakan sinyal dengan kepastian.** BUY/SELL/TAHAN adalah hasil analisis berbasis data, bukan jaminan.
5. **Bedakan fakta, interpretasi, dan hipotesis.** Jika membuat kemungkinan skenario, nyatakan sebagai skenario, bukan fakta.
6. **Jangan klaim broker = bandar/owner.** Broker activity tidak mengungkap niat atau beneficial owner secara pasti.
7. **Jangan paksa rekomendasi.** Pertanyaan edukasi seperti "apa itu free float?" tidak perlu diakhiri BELI/JUAL/TAHAN.
8. **Bahasa sederhana.** Jika memakai istilah teknis, jelaskan makna praktisnya pada penggunaan pertama.
`;
