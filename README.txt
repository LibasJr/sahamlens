SAHAMLENS — MORNING STREAM 4:5 + ADAPTIVE SOCIAL SNAPSHOT
Tanggal: 18 Agustus 2026

TUJUAN
Menambahkan output khusus untuk dibagikan ke Stockbit Stream setiap pagi tanpa mengganti Detail 360° yang sudah ada.

FITUR BARU
1. Format output:
   - Detail 360° (tetap seperti sekarang)
   - Morning Stream 4:5 (1080 x 1350)

2. Morning Stream Technical
   - Header ticker, nama emiten, harga provider, perubahan %
   - Headline teknikal berbasis jumlah signal analyzer valid (HEURISTIC, bukan probability)
   - Bullish / Neutral / Bearish count
   - Maks. 8 indikator yang dipilih lewat dropdown Teknikal
   - Missing/N/A tidak dibuatkan angka pengganti
   - Volume hanya ditampilkan sebagai volume provider/partial, tidak diproyeksikan full-day
   - Font dan angka dibuat jauh lebih besar untuk feed HP

3. Morning Stream Fundamental
   - Header ticker, sektor, harga provider, perubahan %
   - Maks. 8 rasio valid dari dropdown Fundamental
   - Profitability / Valuation / Growth / Balance Sheet / Dividend tersusun adaptif
   - Moat hanya tampil jika ada dan diberi label PROXY
   - Earnings date hanya tampil jika benar-benar tersedia
   - Tidak ada card besar N/A; missing disembunyikan

4. Integritas data
   - Tidak menambah fallback harga/score/ratio
   - Tidak menghasilkan dummy untuk mengisi slot kosong
   - Headline Technical diberi label HEURISTIC
   - Proxy tetap diberi label PROXY
   - Detail 360° lama tidak dihapus atau ditimpa

CARA PASANG DI VPS
1. Extract ZIP.
2. Dari root SahamLens:
   cd /opt/sahamlens/app
3. Jalankan installer dari folder hasil extract, contoh:
   python3 /path/ke/patch/apply_morning_stream_mode.py

Installer akan:
- backup app/admin/infographic-studio/page.tsx
- copy 2 component Morning Stream baru
- menambahkan switch Detail 360° / Morning Stream 4:5
- mempertahankan dropdown Technical/Fundamental sebelumnya

VALIDASI
npm run typecheck
npm run lint
npm test
npm run build

Jika semua PASS:
git add app/admin/infographic-studio/page.tsx components/export/TechnicalMorningStreamCard.tsx components/export/FundamentalMorningStreamCard.tsx
git commit -m "feat: add adaptive morning stream infographic mode"
git push origin main
sudo systemctl restart sahamlens

CATATAN
Patch dibuat sebagai installer agar tidak menimpa hardening Zero Dummy dan perubahan terbaru lain di page Infographic Studio.
