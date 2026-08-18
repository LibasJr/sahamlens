/**
 * LensAI product + Indonesian capital-market comprehensive knowledge layer.
 *
 * Design rules:
 * - Stable concepts, market theories, financial formulas, and technical principles may be explained comprehensively.
 * - Live/company-specific numbers must come from runtime context / verified server data.
 * - Regulatory thresholds that can change must NOT be invented from memory.
 * - SahamLens formulas/thresholds must follow actual application data/implementation.
 */
export const SAHAMLENS_KNOWLEDGE_BASE = `
## Pengetahuan Lengkap Produk SahamLens & Fitur Aplikasi

SahamLens adalah platform super-app analisis pasar modal Indonesia (Bursa Efek Indonesia / IDX) yang menggabungkan analisis kuantitatif, fundamental, teknikal, makroekonomi, dan flow analysis untuk memberikan sudut pandang objektif 360 derajat bagi investor dan trader.

---

### 1. Modul & Fitur Analisis SahamLens

#### A. LensTechnical (Analisis Teknikal & Konsensus Algoritmik)
- **Fungsi Utama**: Menganalisis struktur pergerakan harga (Price Action), tren, momentum, volatilitas, volume, dan support/resistance saham.
- **LensConsensus (10 Algoritma Independen)**: Rapat 10 agen teknikal rule-based (Trend Follower, RSI Momentum, MACD Oscillator, Moving Average Ribbon, Volume Flow, Volatility Squeeze, Breakout Detector, Candlestick Pattern, Support/Resistance Zone, ATR Reversion) yang melakukan voting transparan. Keputusan diringkas menjadi sinyal informasional: BUY / SELL / HOLD beserta tabel breakdown-voting per-indikator lengkap dengan kekuatan aturan/vote (rule strength; bukan probabilitas akurasi).
- **Indeks LQ45 vs Cap-Tier Real-Time (Fitur Baru)**:
  * **Badge "Indeks LQ45" (Biru)**: Menandakan emiten adalah konstituen resmi indeks LQ45 Bursa Efek Indonesia (berdasarkan evaluasi resmi BEI 6 bulanan). Hanya saham LQ45 resmi yang bisa menyandang badge ini, sehingga saham gorengan yang tiba-tiba naik volume tidak bisa menyamar sebagai blue-chip.
  * **Badge Likuiditas & Ukuran ("Large & Liquid · saat ini" vs "Small / Thin · saat ini")**: Klasifikasi real-time berdasarkan Market Cap (>= Rp 10 Triliun) dan Likuiditas rata-rata 20 hari (ADV20 >= Rp 5 Miliar/hari). Memberi konteks eksekusi dan volatilitas tanpa menghakimi kualitas emiten.
- **Trading Setup TP/CL Multidimensi**: Engine yang menghitung level Entry ideal, Take Profit 1 (TP1 konservatif), Take Profit 2 (TP2 agresif), dan Cut Loss (CL / Stop Loss) berbasis volatilitas Wilder's ATR dan fraksi harga (tick size) resmi IDX.
- **Export Card Technical**: Tombol untuk mengekspor kartu grafis ringkasan teknikal beresolusi tinggi (1080x1350 PNG) yang siap dibagikan ke media sosial atau catatan pribadi.

#### B. LensFundamental (Analisis Fundamental 12 Rasio & Kualitas Bisnis)
- **Fungsi Utama**: Membedah kesehatan keuangan, valuasi, profitabilitas, efisiensi operasional, solvabilitas, dan arus kas emiten dari laporan keuangan.
- **12 Rasio Finansial Utama**:
  1. *Valuasi*: PER (Price to Earnings Ratio), PBV (Price to Book Value), EV/EBITDA.
  2. *Profitabilitas*: ROE (Return on Equity), ROA (Return on Assets), ROIC (Return on Invested Capital), GPM (Gross Profit Margin), OPM (Operating Profit Margin), NPM (Net Profit Margin).
  3. *Solvabilitas & Likuiditas*: DER (Debt to Equity Ratio), Current Ratio, Quick Ratio, Interest Coverage Ratio.
  4. *Arus Kas*: Free Cash Flow (FCF = Operating Cash Flow - Capex).
- **Analisis Khusus Perbankan**: Menyesuaikan rasio non-manufaktur dengan metrik khusus bank (NIM, NPL Gross/Net, CAR, CASA ratio, LDR, Cost of Credit, BOPO/CIR).
- **Mode Ringkas vs Mode Lengkap**: Menyajikan intisari metrik valuasi, profitabilitas, dan margin terpilih untuk pemindaian cepat, atau tabel komprehensif untuk audit mendalam.
- **Export Card Fundamental**: Fitur ekspor kartu visual HD (1080x1350 PNG) berisi rangkuman kesehatan keuangan emiten.

#### C. LensRadar / AI Pick (Pemindai Peluang & Momentum Saham)
- **Fungsi Utama**: Memindai universe saham likuid IDX secara berkala untuk menyaring saham-saham dengan setup teknikal dan fundamental paling potensial.
- **LensScore**: Skor kuantitatif (0–100) gabungan dari teknikal, fundamental, flow, kelengkapan data, dan gerbang kelayakan (eligibility gate).
- **Breakout Radar**: Pemindai saham yang sedang mengalami lonjakan volume dan menembus resistance penting (Breakout Opportunity).
- **Indikator Kesegaran**: Dilengkapi status apakah data berasal dari sesi live atau data sesi terakhir (stale) saat bursa sedang tutup/libur.

#### D. LensMarket & Market Pulse (Denyut Pasar & Breadth)
- **Fungsi Utama**: Memberikan gambaran makro kesehatan seluruh bursa IDX dalam satu layar.
- **Market Breadth Modern (universe terpantau)**: Mengukur seberapa luas partisipasi kenaikan/penurunan pasar menggunakan sampel 100 emiten pertama dari universe aktif SahamLens; ini bukan konstituen Kompas100/IDX80 dan bukan indeks resmi IDX:
  * *Naik (Advancing)*: Saham dengan pergerakan > +0.10%.
  * *Netral/Stagnan (Unchanged)*: Saham di dalam pita toleransi -0.10% s/d +0.10%.
  * *Turun (Declining)*: Saham dengan pergerakan < -0.10%.
  * *Verdict Storytelling*: Menyimpulkan apakah pasar sedang "Bullish Terkonfirmasi Kuat", "Kenaikan Terkonsentrasi (Divergence)", "Konsolidasi", atau "Tekanan Jual Meluas".
- **11 Sektor Heatmap IDX**: Peta visual kekuatan 11 sektor resmi BEI (Financials, Energy, Basic Materials, Consumer Non-Cyclical, Consumer Cyclical, Healthcare, Properties, Industrials, Technology, Infrastructure & Utilities, Transportation & Logistics).
- **IHSG Real-Time & Kalender Libur Bursa**: Menampilkan status buka/tutup bursa yang terintegrasi langsung dengan kalender libur resmi BEI (termasuk libur nasional seperti 17 Agustus, Hari Raya, dan Cuti Bersama).

#### E. LensScanner (Screener Saham Multi-Faktor)
- **Fungsi Utama**: Menyaring saham dari seluruh bursa berdasarkan kriteria kustom.
- **Preset Profil Risiko**:
  * *Konservatif*: Mengutamakan emiten berfundamental kokoh, PER/PBV wajar, DER rendah (< 1x), dividen stabil, dan market cap besar.
  * *Moderat*: Menggabungkan pertumbuhan laba (growth), valuasi wajar (GARP - Growth at a Reasonable Price), dan momentum teknikal sehat.
  * *Agresif*: Mencari saham dengan volatilitas tinggi, momentum breakout kuat, lonjakan volume, dan potensi swing cepat.
- **Fitur Penyaring**: Filter Sektor, Batas Harga Maksimal/Minimal, Market Cap, Likuiditas Harian, Ekspor data ke CSV, dan penyimpanan preset filter di browser lokal.

#### F. Backtest Engine (Pengujian Strategi Historis)
- **Mode 1: Builder Filter Multi-Saham**: Menguji efektivitas kombinasi indikator (RSI, MA, MACD, Volume) terhadap data historis 3 hingga 60 bulan. Menampilkan metrik performa objektif: Total Return, Win Rate (%), Maximum Drawdown (%), Perbandingan terhadap IHSG Benchmark, dan "Live Filter Check" (melihat saham mana yang memenuhi kriteria tersebut saat ini).
- **Mode 2: Replay Candle Saham Tunggal**: Alat visualisasi untuk memutar ulang pergerakan candle historis emiten secara bertahap dari kiri ke kanan (Start/Stop Replay) untuk melatih kemampuan membaca pola grafik tanpa melihat masa depan (bukan simulasi statistik).

#### G. Valuation & DCF (Intrinsic Value Model)
- **Fungsi Utama**: Menghitung estimasi nilai wajar (Fair Value) saham menggunakan model Discounted Cash Flow (DCF), Graham Fair Value ($\sqrt{22.5 \times EPS \times BVPS}$), dan Price Multiple.
- **Margin of Safety (MoS)**: Menghitung persentase diskon harga pasar saat ini terhadap nilai intrinsik sebagai bantalan risiko investasi.

#### H. Dividend, Earnings & Corporate Calendar
- **Fungsi Utama**: Memantau kalender aksi korporasi emiten IDX.
- **Dividend Tracker & Planner**: Informasi yield/payout/histori yang tersedia dari provider, konsistensi dividen berbasis observasi historis, dan simulator skenario passive income/DRIP. Jangan menyatakan tanggal aksi korporasi atau status pajak bila field/sumbernya tidak tersedia.
- **Earnings Calendar**: Jadwal rilis laporan keuangan kuartalan (Q1, Q2, Q3, FY).

#### I. Ownership Flow (Data KSEI Kustodian)
- **Fungsi Utama**: Melacak perubahan komposisi kepemilikan asing vs domestik hanya dari snapshot yang lolos source-registry/provenance SahamLens. Jangan menyebut data KSEI sebagai tersedia/terverifikasi bila pipeline menandainya UNVERIFIED atau DATA_UNAVAILABLE.
- **Keunggulan**: Mengukur akumulasi/distribusi struktural riil, bukan sekadar lalu lintas broker harian yang bisa berupa transaksi spekulatif jangka pendek.

#### J. Akun Demo / Portfolio Virtual & Watchlist
- **Portfolio Virtual (Paper Trading)**: Fasilitas simulasi trading bebas risiko dengan modal virtual. Mendukung order Buy/Sell lot, pencatatan otomatis Average Buy Price, Realized PnL, Unrealized PnL, cash allocation, dan riwayat transaksi.
- **Watchlist & Price Alert**: Menyimpan daftar pantau saham favorit dan menyetel notifikasi target harga.
- **Aturan Akses**: Hanya Portfolio dan Watchlist yang mewajibkan login akun (karena menyimpan data privat pengguna). Seluruh fitur analisis lainnya (LensTechnical, LensFundamental, LensRadar, Screener, Backtest, DCF, Macro, Moat, dll.) terbuka PENUH dan GRATIS untuk semua pengunjung/tamu.

#### K. Lab Internal & Fitur Admin (Riset & Integritas Kuantitatif)
- **LensRadar Calibration Lab**: Menguji kalibrasi reliabilitas LensScore terhadap outcome masa depan (T+20), Brier Score, ECE, dan confidence intervals.
- **TP/CL Validation Lab**: Validasi empiris efektivitas level Take Profit dan Stop Loss terhadap struktur harga historis.
- **Intraday Validation Lab**: Riset strategi day trading (horizon 15m, 30m, 60m, EOD) dengan memperhitungkan biaya transaksi dan slippage.
- **Fundamental Point-in-Time (PIT) Backfill & Coverage**: Memastikan data laporan keuangan dicatat pada tanggal pengumuman publik riil (*observed date*) untuk mencegah bias melihat masa depan (*look-ahead bias*) dalam riset kuantitatif.
- **Financial Integrity & Adoption Gate**: Tata kelola data di mana bukti baru tidak otomatis mengubah bobot produksi sebelum melalui uji regresi dan protokol validasi formal.
- **Macro PIT & Valuation Inputs**: Audit provenance SBN 10Y, ERP Indonesia, perpetual growth cap, dan BI-Rate/inflasi.
- **Bank Fundamentals Evidence**: Menyimpan data NIM, NPL, CASA, CAR, LDR, CoC, CIR per periode berstatus DATA_ONLY sebelum tervalidasi.
- **Ownership Flow Validation Lab & Broker Summary**: Validasi distribusi flow investor asing vs lokal dan rekonsiliasi transaksi broker.
- **Kesehatan Operasional / Jobs**: Pemantauan cron warmer, redis cache, postgresql database, dan pipeline data otomatis.
- **Feedback LensAI**: Peninjauan rating jempol dan prompt pengguna untuk continual improvement kualitas jawaban AI.

### Panduan fungsi dan cara pakai setiap menu pengguna
Jika pengguna menanyakan fungsi atau cara pakai menu, jelaskan secara ringkas: **fungsi → langkah pakai → hasil yang dibaca → batasannya**:
- **Beranda**: Ringkasan snapshot kondisi pasar, kartu penggerak pasar, Peluang Hari Ini (LensRadar), kalender aksi korporasi, dan watchlist.
- **LensMarket**: Kondisi pasar makro (IHSG real-time, Market Breadth universe terpantau, Market Regime, dan 11 Sektor Heatmap).
- **LensRadar**: Pemindai saham berpeluang tinggi (Breakout Radar & Momentum) dari universe likuid beserta LensScore.
- **LensTechnical**: Analisis teknikal emiten, rapat 10 agen LensConsensus, badge Indeks LQ45 & Large/Small Cap, level Entry/TP1/TP2/CL, dan ekspor kartu grafis PNG.
- **LensScanner**: Penyaringan multi-faktor per profil risiko (Konservatif/Moderat/Agresif), filter sektor, market cap, dan ekspor CSV.
- **Compare**: Perbandingan multi-emiten berdampingan (fundamental, teknikal, valuasi).
- **Backtest**: Menguji kombinasi filter pada histori. Pilih preset atau indikator, modal dan periode 3–60 bulan, tekan Backtest, lalu baca return, win rate, drawdown, dan pembanding IHSG. Gunakan **Live Filter Check** untuk melihat kandidat yang memenuhi filter sekarang. Mode **Backtest Saham Tunggal** memutar ulang candle historis (Start/Stop Replay).
- **LensFundamental**: Membedah 12 rasio finansial, kualitas neraca, profitabilitas, arus kas, mode ringkas/lengkap, dan ekspor kartu grafis PNG.
- **Valuation / DCF**: Estimasi nilai intrinsik wajar saham dan Margin of Safety (MoS).
- **Moat**: Proksi keunggulan kompetitif berbasis rasio fundamental; petunjuk rasio tidak membuktikan brand, switching cost, network effect, atau moat kualitatif.
- **Earnings**: Monitor rilis laporan keuangan kuartalan emiten.
- **Dividend**: Informasi jadwal dividen, yield, pay-out ratio, dan simulator passive income bulanan.
- **LensWatch**: Watchlist dan alert harga pribadi pengguna (wajib login).
- **Akun Demo**: Paper trading / portofolio virtual dengan saldo simulasi dan pencatatan riwayat transaksi (wajib login).
- **Risk Matrix & Risk Calculator**: Simulasi stres portofolio dan kalkulator ukuran posisi (Position Sizing) berbasis toleransi risiko 1-2%.
- **News & Sentiment**: Berita terkini dan klasifikasi sentimen pasar modal.
- **Corporate Calendar**: Kalender terintegrasi dividen, earnings, dan aksi korporasi emiten IDX.
- **Macro**: Analisis BI-Rate, inflasi, kurs USD/IDR, dan peta transmisi rule-based ke sektor. Mapping sektor bersifat heuristik/indikatif, bukan forecast return sektor.
- **Transparansi**: Publikasi metodologi, bukti validasi empiris, dan akurasi model kuantitatif.
- **Tentang**: Filosofi dan prinsip objektivitas SahamLens.
- **Pattern**: Deteksi pola grafik teknikal dan konfirmasinya.

---

### 2. Teori & Pengetahuan Pasar Modal Mendalam (IDX Capital Market Mastery)

#### A. Analisis Fundamental & Valuasi Saham
1. **Analisis DuPont 3-Tahap**:
   $$\text{ROE} = \text{Net Profit Margin} \times \text{Asset Turnover} \times \text{Financial Leverage}$$
   $$\text{ROE} = \left(\frac{\text{Laba Bersih}}{\text{Pendapatan}}\right) \times \left(\frac{\text{Pendapatan}}{\text{Total Aset}}\right) \times \left(\frac{\text{Total Aset}}{\text{Ekuitas}}\right)$$
   *Membedakan apakah tingginya ROE emiten didorong oleh profitabilitas produk yang tebal (Net Margin), efisiensi perputaran aset (Asset Turnover), atau leverage utang yang berisiko tinggi (Financial Leverage).*
2. **Kualitas Laba & Arus Kas (Quality of Earnings)**:
   * Perusahaan dengan laba bersih tinggi tetapi Operating Cash Flow (OCF) negatif patut diwaspadai karena laba tersebut tertahan di piutang atau persediaan (akrual tinggi).
   * **Free Cash Flow (FCF)**: Kas riil yang tersisa setelah belanja modal wajib ($\text{Capex}$). FCF adalah darah utama untuk membayar dividen, melunasi utang, atau melakukan buyback saham.
3. **Valuasi Relatif vs Valuasi Absolut**:
   * *PER (P/E)*: Wajib dibandingkan dengan pertumbuhan laba (PEG Ratio) dan rata-rata historis 5 tahun emiten serta peers sektornya.
   * *PBV (P/B)*: Sangat relevan untuk sektor perbankan, properti, dan aset-berat. PBV < 1 belum tentu murah jika ROE emiten sangat rendah dan asetnya terus menyusut.
   * *EV/EBITDA*: Menilai harga perusahaan secara keseluruhan (termasuk utang dan kas) tanpa terdistorsi perbedaan struktur pajak dan depresiasi.

#### B. Dinamika Khusus Sektor Perbankan (Financials)
- **Mengapa Bank Tidak Memakai DER & Current Ratio Biasa?**
  Bagi bank, dana pihak ketiga (tabungan/deposito nasabah) dicatat sebagai liabilitas/utang, padahal itu adalah bahan baku utama bisnis bank. Oleh karena itu, rasio solvabilitas bank menggunakan metrik khusus:
  * **NIM (Net Interest Margin)**: Selisih bunga kredit yang diterima bank dikurangi bunga simpanan yang dibayarkan ke nasabah. Semakin tinggi NIM, semakin menguntungkan operasional bank.
  * **CASA (Current Account Savings Account) Ratio**: Porsi dana murah (giro dan tabungan) dibanding total DPK. CASA tinggi (>60-80% seperti BBCA/BMRI) membuat *Cost of Funds* (CoF) bank sangat rendah.
  * **NPL (Non-Performing Loan) Gross & Net**: Rasio kredit macet/bermasalah. NPL Gross aman di bawah 3% (batas regulasi OJK 5%).
  * **NPL Coverage Ratio**: Cadangan kerugian penurunan nilai (CKPN) dibanding NPL. Coverage >200% menunjukkan bank sangat konservatif dan siap menghadapi krisis kredit.
  * **CAR (Capital Adequacy Ratio)**: Rasio kecukupan modal inti bank terhadap aset tertimbang menurut risiko (ATMR). CAR bank besar di Indonesia umumnya sangat kuat (>20-25%).
  * **LDR (Loan to Deposit Ratio) / LFR**: Rasio penyaluran kredit dibanding dana simpanan, mengukur optimalisasi likuiditas bank (rentang ideal 80-92%).
  * **Cost of Credit (CoC)**: Beban provisi pencadangan kredit dibagi total kredit.

#### C. Dinamika Saham Komoditas & Siklikal (Energy, Mining, CPO)
- **Siklus Harga Komoditas Global**: Emiten batubara (ADRO, PTBA, ITMG), nikel (INCO, ANTM), tembaga/emas (AMMN, MDKA), dan CPO (AALI, LSIP) adalah *price taker*—laba mereka ditentukan oleh harga komoditas dunia, bukan penetapan harga sendiri.
- **Jebakan Valuasi Puncak Siklus (Cyclical Value Trap)**:
  * Di puncak siklus komoditas (*peak cycle*), laba emiten melonjak rekor sehingga PER terlihat "sangat murah" (misal PER 2x-4x). Membeli di saat ini sangat berbahaya karena harga komoditas akan mengalami normalisasi turun (*mean reversion*).
  * Di dasar siklus (*bottom cycle*), laba emiten anjlok atau rugi sehingga PER terlihat sangat tinggi. Saat itulah biasanya momentum akumulasi terbaik sebelum siklus baru dimulai.
- **Cash Cost**: Keunggulan emiten komoditas terletak pada efisiensi biaya tunai produksi (*low-cost producer*). Emiten dengan cash cost terendah tetap mencetak laba saat harga komoditas anjlok.

#### D. Analisis Teknikal, Price Action & Struktur Pasar
1. **Prinsip Utama Price Action**:
   * *Uptrend*: Struktur puncak dan lembah yang semakin meninggi (*Higher Highs & Higher Lows*).
   * *Downtrend*: Struktur puncak dan lembah yang semakin merendah (*Lower Highs & Lower Lows*).
   * *Support/Resistance Flip (Role Reversal)*: Level resistance yang berhasil ditembus dengan volume tebal akan berubah fungsi menjadi area support kuat saat terjadi retest/pullback.
2. **Volume Price Analysis (VPA) & Konfirmasi**:
   * *Valid Breakout*: Kenaikan harga menembus resistance kunci yang disertai lonjakan volume di atas rata-rata 20 hari (Volume Spike), menandakan partisipasi institusi / smart money.
   * *False Breakout (Bull Trap)*: Harga menembus resistance tetapi volume kecil/kempes, lalu membentuk candle berekor panjang atas (rejection) dan ditutup kembali di bawah resistance.
3. **Osilator & Momentum**:
   * *RSI (Relative Strength Index)*: Nilai >70 (Overbought) dan <30 (Oversold). Dalam tren naik yang sangat kuat (*strong uptrend*), RSI bisa bertahan di atas 70 untuk waktu lama; jangan melakukan short/sell hanya karena RSI overbought.
   * *RSI Bullish Divergence*: Harga membuat lembah lebih rendah (*Lower Low*), tetapi indikator RSI membuat lembah lebih tinggi (*Higher Low*)—indikasi pelemahan momentum jual dan potensi pembalikan arah naik (*reversal*).
   * *RSI Bearish Divergence*: Harga membuat puncak lebih tinggi (*Higher High*), tetapi RSI membuat puncak lebih rendah (*Lower High*)—indikasi pelemahan momentum beli.
   * *MACD (Moving Average Convergence Divergence)*: Menilai arah tren dan akselerasi momentum melalui perpotongan garis MACD, Signal Line, dan ekspansi histogram.
4. **Volatilitas & Wilder's ATR (Average True Range)**:
   * Mengukur rentang pergerakan rata-rata harian emiten. ATR digunakan untuk menentukan batas Stop Loss adaptif (misal $1.5 \times \text{ATR}$ atau $2 \times \text{ATR}$ di bawah support) agar tidak mudah terhempas oleh *market noise* normal.

#### E. Struktur Mikro & Mekanisme Perdagangan BEI (IDX)
- **Jam Perdagangan Pasar Reguler IDX (WIB = UTC+7)**:
  * *Senin – Kamis*:
    - Sesi I  : 09:00 – 12:00 WIB (Istirahat 12:00 – 13:30 WIB)
    - Sesi II : 13:30 – 15:49 WIB
  * *Jumat*:
    - Sesi I  : 09:00 – 11:30 WIB (Istirahat 11:30 – 14:00 WIB untuk ibadah Sholat Jumat)
    - Sesi II : 14:00 – 15:49 WIB
  * *Pra-Penutupan & Pasca-Penutupan*:
    - Pre-Closing (Pembentukan Harga Penutupan) : 15:50 – 16:00 WIB
    - Post-Closing (Transaksi pada Harga Penutupan) : 16:00 – 16:15 WIB
- **Fraksi Harga (Tick Size) IDX**:
  * Kelompok < Rp 200: Fraksi Rp 1, Maksimal perubahan per step Rp 10.
  * Kelompok Rp 200 – < Rp 500: Fraksi Rp 2, Maksimal perubahan per step Rp 20.
  * Kelompok Rp 500 – < Rp 2.000: Fraksi Rp 5, Maksimal perubahan per step Rp 50.
  * Kelompok Rp 2.000 – < Rp 5.000: Fraksi Rp 10, Maksimal perubahan per step Rp 100.
  * Kelompok >= Rp 5.000: Fraksi Rp 25, Maksimal perubahan per step Rp 250.
- **Auto Rejection (ARA / ARB)**: Batas persentase maksimal kenaikan (ARA) atau penurunan (ARB) harian yang diizinkan bursa untuk menjaga volatilitas tertib.
- **UMA & Suspensi**:
  * *UMA (Unusual Market Activity)*: Pengumuman bursa terhadap lonjakan harga/volume yang tidak wajar di luar kebiasaan. UMA adalah status pemantauan, bukan sanksi atau vonis bersalah.
  * *Suspensi*: Penghentian sementara perdagangan saham oleh bursa (Cooling Down) jika volatilitas terus berlanjut tanpa penjelasan emiten.

#### F. Transmisi Makroekonomi ke Sektor IDX
1. **Suku Bunga Acuan (BI-Rate & US Fed Funds Rate)**:
   * *Kenaikan Suku Bunga*: Menekan sektor Properti dan Otomotif (karena bunga KPR/KKB naik), menaikkan beban bunga emiten berutang tinggi, dan memicu *capital outflow* dari negara berkembang jika selisih imbal hasil dengan US Treasury menyempit.
   * *Penurunan Suku Bunga*: Mendorong likuiditas pasar, menurunkan *cost of funds*, menggairahkan kredit perbankan, konsumsi, dan ekspansi bisnis.
2. **Nilai Tukar Rupiah (USD/IDR)**:
   * *Depresiasi Rupiah (USD menguat)*: Menguntungkan emiten berbasis ekspor dengan pendapatan USD dan biaya IDR (Tambang, Sawit, Petrokimia tertentu). Merugikan emiten yang mengimpor bahan baku dalam USD tetapi menjual produk dalam IDR (Farmasi, Pakan Ternak, Manufaktur) serta emiten dengan obligasi global berdenominasi USD.
3. **Inflasi (Indeks Harga Konsumen / IHK)**:
   * Mengukur daya beli riil masyarakat. Inflasi terkendali (2–3%) mencerminkan pertumbuhan ekonomi sehat; inflasi tinggi menekan margin laba emiten konsumer karena kenaikan harga bahan baku sulit diteruskan seluruhnya ke konsumen (*lagging pricing power*).

#### G. Manajemen Risiko & Psikologi Trading Profesional
- **Position Sizing Berbasis Risiko (Rule 1-2%)**:
  * Jangan pernah mempertaruhkan lebih dari 1% hingga 2% total modal portofolio dalam satu kali transaksi (*Risk per Trade*).
  $$\text{Ukuran Posisi (Jumlah Lembar)} = \frac{\text{Modal} \times \text{Maksimal Risiko (\%)}}{\text{Harga Beli (Entry)} - \text{Harga Stop Loss (CL)}}$$
- **Risk to Reward Ratio (R:R)**:
  * Selalu targetkan setup transaksi dengan potensi reward minimal 2 kali lipat dari risiko kerugian ($R:R \ge 1:2$). Dengan R:R 1:2, seorang trader tetap menghasilkan profit konsisten meskipun tingkat kemenangan (*win rate*) hanya 40-50%.
- **Psikologi & Bias Kognitif**:
  * *Disposition Effect*: Kebiasaan buruk lekas merealisasikan profit kecil (*taking small profits*) namun membiarkan saham rugi turun dalam karena enggan mengakui kesalahan (*holding big losers*).
  * *FOMO (Fear of Missing Out)*: Membeli saham yang sudah terbang tinggi secara impulsif tanpa memperhitungkan area support dan risiko cut loss.
  * *Disiplin Trading Plan*: Tentukan Entry, Target Profit (TP1 & TP2), dan Cut Loss (CL) **sebelum** memasukkan order, dan patuhi rencana tersebut tanpa emosi.

---

### 3. Pedoman Komunikasi & Tata Bahasa LensAI

Sebagai Senior Equity & Quantitative Research Analyst yang ramah dan edukatif, gunakan gaya bahasa berikut:
1. **Lugaskan Jawaban Sejak Kalimat Pertama (Executive Summary)**:
   * Awali jawaban dengan kesimpulan inti atau definisi kunci dalam 1–2 kalimat tegas.
   * Jangan gunakan kalimat pembuka klise atau template robotik seperti *"Tentu, mari kita bahas secara mendalam..."*, *"Pertanyaan yang sangat bagus..."*, atau *"Sebelum saya menjawab..."*.
2. **Struktur Penjelasan Mengalir & Rapi**:
   * Gunakan paragraf ringkas, poin-poin terstruktur, dan penekanan cetak tebal pada istilah penting.
   * Hubungkan konsep teori dengan aplikasi nyata di pasar modal Indonesia (IDX) dan fitur relevan di SahamLens.
3. **Edukasi Praktis Tanpa Menumpuk Jargon**:
   * Jika menggunakan istilah teknis/finansial (misal *Free Float, ROE DuPont, ATR, Divergence, MoS*), jelaskan logika praktisnya secara sederhana sehingga investor pemula paham dan investor berpengalaman merasa puas dengan kedalamannya.
4. **Patuhi Integritas Data & Otoritas Server**:
   * Angka emiten spesifik (harga, rasio, skor) hanya boleh diambil dari Data Terverifikasi Server. Jika data tidak tersedia di konteks, sampaikan dengan transparan bahwa data spesifik emiten tersebut belum tersedia, dan jelaskan teori/metodologinya secara mendalam.
`;
