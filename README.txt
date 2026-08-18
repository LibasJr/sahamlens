SAHAMLENS - INFOGRAPHIC STUDIO 360° METRIC DROPDOWNS
Tanggal: 18 Agustus 2026

Tujuan:
- Tambah dropdown multi-select "Indikator Teknikal" di Admin > Infographic Studio 360°.
- Opsi teknikal diambil langsung dari analyzer SahamLens yang TERSEDIA untuk emiten aktif.
- Tambah dropdown multi-select "Fundamental".
- Opsi fundamental hanya menampilkan field dengan angka valid pada payload emiten aktif.
- Maksimal 8 indikator/rasio per infografis agar layout 3D tetap rapi.
- Pilihan langsung memengaruhi Live Preview dan file PNG export.
- Tidak membuat angka fallback/dummy baru. Field N/A tidak ditawarkan sebagai pilihan.

KENAPA PATCH BERUPA INSTALLER:
Installer hanya memodifikasi app/admin/infographic-studio/page.tsx secara kontekstual,
sehingga perubahan Zero Dummy/hardening lain yang sudah ada di VPS tidak ditimpa file lama.
Script juga membuat backup otomatis sebelum mengubah file.

CARA PAKAI DI VPS:
1. Copy file apply_infographic_metric_dropdowns.py ke root repo:
   /opt/sahamlens/app/

2. Jalankan:
   cd /opt/sahamlens/app
   python3 apply_infographic_metric_dropdowns.py

3. Validasi:
   npm run typecheck
   npm run lint
   npm test
   npm run build

4. Jika semua PASS:
   git add app/admin/infographic-studio/page.tsx
   git commit -m "feat: add selectable technical and fundamental metrics to infographic studio"
   git push origin main
   sudo systemctl restart sahamlens

HASIL UI:
- Dropdown Teknikal: daftar aktual seperti EMA, RSI, MACD, Momentum, ATR,
  Volume, Support/Resistance, Market Flow, dll sesuai payload analyzer yang tersedia.
- Dropdown Fundamental: ROE, ROA, NPM, OPM, GPM, PER, Forward P/E, PBV,
  DER, Current Ratio, Quick Ratio, Revenue Growth, Earnings Growth,
  Dividend Yield, Market Cap, Total Revenue, EBITDA — hanya yang datanya tersedia.
- Tombol "Default" mengembalikan maksimal 8 pilihan standar.
