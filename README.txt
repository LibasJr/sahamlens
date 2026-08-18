SAHAMLENS INFOGRAPHIC STUDIO TS7006 HOTFIX
Tanggal: 18 Agustus 2026

Masalah:
app/admin/infographic-studio/page.tsx:
- TS7006 item implicitly has an any type pada baris sekitar 136, 138, 573, 580.

Penyebab:
Payload technical.analyzers bertipe longgar/any sehingga Array.isArray(...)? payload : []
mewariskan any ke technicalIndicatorOptions. Callback .some/.map lalu ikut menjadi implicit any.

Perbaikan:
- Tambah StudioTechnicalIndicatorOption.
- useMemo<StudioTechnicalIndicatorOption[]>.
- source analyzers dipaksa unknown[].
- map memiliki return type eksplisit.
- callback downstream diberi type eksplisit sebagai defensive guard.

Cara:
1. Extract ZIP.
2. Copy apply_infographic_ts7006_hotfix.py ke root /opt/sahamlens/app.
3. Jalankan:
   python3 apply_infographic_ts7006_hotfix.py
4. Lalu:
   npm run typecheck
   npm run lint
   npm test
   npm run build

Patch tidak mengubah data/rumus indikator. Ini hanya perbaikan typing TypeScript.
