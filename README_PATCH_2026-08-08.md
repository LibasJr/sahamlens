# SahamLens UI + LensAI + Coverage Patch

Perubahan:
1. LensAI card di Beranda auto-switch setiap 12 detik (sebelumnya 50 detik).
2. LensMarket diberi keterangan transparan bahwa heatmap = 11 sektor berbasis sampel emiten representatif, bukan seluruh emiten IDX.
3. AI Pick / LensRadar live scan diperluas dari 109 menjadi 150 kandidat.
   - 109 kandidat lama dipertahankan.
   - 41 tambahan diambil berurutan dari MARKET_STOCKS 250-saham yang sudah ada.
   - Runtime `evaluateMinimalEligibility()` tetap menjadi gerbang sebelum saham dianggap advisory.
   - BACKTEST_UNIVERSE tidak diubah agar validasi historis lama tidak bergeser diam-diam.
4. Menu Transparansi dipindah keluar dari grup Admin ke Discover dan diberi akses guest/public.
5. LensAI diperkuat untuk:
   - menjawab fitur SahamLens;
   - membedakan fakta aplikasi vs pengetahuan pasar umum;
   - menjelaskan istilah teknis dengan bahasa sederhana;
   - menjawab lebih langsung, ringkas, dan praktis;
   - mengetahui bahwa Transparansi publik dan live scan memantau hingga 150 kandidat.
6. Copy UI Ask LensAI diperjelas agar pengguna tahu bisa bertanya soal fitur aplikasi dan pasar.

Catatan Sector Heatmap:
Heatmap saat ini memiliki 11 kelompok sektor dan memakai sampel 4-8 saham per sektor dari `IDX_SECTORS`. Ini bukan batas maksimal emiten IDX dan bukan indeks sektor resmi berbobot kapitalisasi.
