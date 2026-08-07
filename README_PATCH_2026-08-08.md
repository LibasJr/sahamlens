# SahamLens UI + LensAI + Vertical Signal Patch

Basis: sahamlens-main.zip yang di-upload user pada 2026-08-08.

Perubahan:
1. Ask LensAI floating button dikembalikan di kanan bawah untuk desktop + mobile.
2. Tombol Ask LensAI di header atas dihapus dari Dashboard dan TopMarketBar supaya tidak double.
3. Landing page: label Teknikal -> LensTechnical, Fundamental -> LensFundamental.
4. Landing hero: card Signal Saham di sebelah IHSG pada desktop; rotasi vertikal bawah-ke-atas setiap ~4 detik.
   - Data memakai /api/ai-pick yang sudah ada.
   - TP1/TP2/CL memakai field trading setup yang sama; frontend tidak menghitung ulang.
   - Jika model belum advisory, label aman WATCH; jika flagged, WASPADA; BUY hanya jika advisory enabled.
5. LensAI product knowledge base ditambahkan dan diinjeksi ke system prompt.
   - Mengenali fitur utama SahamLens dan konsep pasar Indonesia.
   - Tidak boleh mengarang formula/angka/data live yang tidak tersedia.
   - Pertanyaan fitur tidak dipaksa menjadi rekomendasi BUY/SELL/HOLD.

Validation:
- Quick TypeScript parser check: tidak ditemukan syntax-class error pada file yang diubah.
- Full Next build tidak dijalankan di sandbox karena node_modules tidak ada di ZIP.

Suggested commit:
Improve LensAI UX knowledge and homepage signals
