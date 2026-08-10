# SahamLens SEO Homepage Patch

Patch kecil untuk memperkuat SEO homepage `https://sahamlens.id/`.

Isi:
- title
- description
- canonical root `/`
- Open Graph
- Twitter metadata
- robots
- favicon metadata
- saran H1 homepage

Cara pakai:
1. Buka `app/layout.SEO.patch.txt`.
2. Merge ke `app/layout.tsx` existing. Jangan replace seluruh layout.
3. Opsional ikuti `app/page.SEO.patch.txt`.
4. Jalankan:

```powershell
npm run typecheck
npm run build
```

5. Deploy Production.
6. Ikuti `VERIFY-AFTER-DEPLOY.txt`.
