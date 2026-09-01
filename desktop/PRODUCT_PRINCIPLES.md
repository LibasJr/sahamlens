# Prinsip Produk SahamLens Desktop

SahamLens Desktop adalah workspace analisis saham Indonesia, bukan aplikasi broker dan tidak pernah mengeksekusi jual-beli.

## Aturan data

- Setiap angka, sinyal, grafik, dan status berasal dari API SahamLens atau ditampilkan sebagai belum tersedia.
- Tidak ada data contoh, angka statis yang dipresentasikan sebagai data pasar, atau status koneksi palsu.
- Jika request gagal, UI menjelaskan kegagalannya dan menyediakan aksi muat ulang; ia tidak mengganti respons dengan data dummy.

## Aturan pengalaman

- Chart dan riset emiten adalah pusat workspace.
- Watchlist, screener, serta navigasi cepat berada di sisi kiri.
- Insight, kualitas data, risiko, dan LensAI berada di sisi kanan.
- Bahasa UI menjelaskan analisis dan kualitas bukti, bukan instruksi transaksi.
