# SahamLens Guest LensAI + Public Transparency Patch

Perubahan:
1. `/api/chat` tidak lagi mewajibkan session login.
2. Batas prompt/context/history yang sudah ada tetap dipertahankan.
3. LensAI memperkenalkan diri secara natural sebagai "LensAI" / "LensAI dari SahamLens".
4. Label persona "senior pasar modal" dihapus dari system prompt.
5. `/transparency` dihapus dari `PROTECTED_PAGES`.
6. Sidebar tetap menampilkan Transparansi untuk guest (`guest: true`).

Tidak diubah:
- Admin authorization
- Protected pages lain
- LensScore / LensRadar
- TP/CL
- Database
- AI provider cascade
- SahamLens knowledge base v2
