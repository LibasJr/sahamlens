SahamLens AI Pick Scan Diagnostic Patch

Basis: file route.ts dan history-archive.service.ts yang Anda upload.

Perubahan:
- route.ts: hanya menambahkan variable stage agar error menunjukkan apakah gagal di scan, cache, atau archive.
- history-archive.service.ts: disertakan sama persis dengan file upload Anda yang sudah memakai $22.

Tidak mengubah scoring, TP/CL, schema database, QStash signature, cache format, atau parameter model.

Cara pasang:
1. Extract ZIP.
2. Copy folder app dan modules ke root project SahamLens.
3. Replace file saat diminta.
4. Commit + push.
5. Deploy production.
6. Cek log run QStash terbaru. Cari field stage pada error.
