# Audit kuantitatif & validasi historis — 11 Agustus 2026

Laporan lengkap: [`SAHAMLENS_QUANT_FINANCIAL_AUDIT_2026.md`](../../SAHAMLENS_QUANT_FINANCIAL_AUDIT_2026.md) di root repo.

Folder ini berisi **pemeriksa yang bisa dijalankan ulang** untuk tiga temuan CRITICAL yang punya bukti numerik.

## Status

| Tanggal | Hasil |
|---|---|
| 11 Agustus 2026 (audit) | C-1, C-2, C-3 **FAIL** |
| 12 Agustus 2026 (setelah Fase 1) | C-1, C-2, C-3 **PASS** — `RINGKASAN: 3/3 PASS`, exit code 0 |

Skrip ini sengaja **tidak** dibekukan sebagai catatan sejarah: ia keluar dengan exit code
1 kalau salah satu temuan kembali muncul, jadi bisa dipasang di CI sebagai penjaga regresi.

## Menjalankan verifikasi

```bash
# C-2 dan C-3 (offline, ~2 detik)
node docs/audit-2026-08-11/verify-findings.mjs

# tambah C-1 (butuh akses ke Yahoo Finance)
node docs/audit-2026-08-11/verify-findings.mjs --network
```

## Yang diverifikasi

| Kode | Temuan asli | Perbaikan | Yang diperiksa sekarang |
|---|---|---|---|
| **C-1** | ATR produksi memakai rata-rata aritmatik 14 True Range, sementara TP/CL Lab memakai Wilder. Selisih −1,5% s/d −14,4% pada emiten nyata. Karena TP dan CL diturunkan dari ATR, Lab memvalidasi setup yang tidak pernah dikirim ke pengguna. | `modules/technical/service/atr.ts` jadi satu-satunya implementasi; tiga salinan dihapus. Jendela struktur dipotong di dalam `buildLongTradingSetup()`. | ATR dari analyzer produksi dibandingkan dengan helper bersama pada data Yahoo yang sama — harus identik. Formula lama tetap dihitung sebagai kolom pembanding supaya besar masalahnya tetap terlihat. RSI vs implementasi independen dipakai sebagai kontrol metode (~1e-14). |
| **C-2** | Backfill mengirim konteks sektor kosong ke `calculateScore()`, produksi mengirim sektor Yahoo asli. Selisih LensScore sampai 10 poin, 8,4% kombinasi berpindah bucket. | `fundamental_history` bertambah 3 kolom sektor; `sectorContextAsOf()` meneruskannya ke scoring historis. | `sectorContextAsOf()` dipanggil atas baris arsip dan harus mengembalikan sektor, bukan null. Sensitivitas model terhadap sektor (110.592 kombinasi) tetap dilaporkan sebagai konteks. |
| **C-3** | `barAtTradingOffset(offset=1, tolerance=2)` dapat memilih bar tanggal sinyal — bahkan bar H-1 — sebagai bar entry ketika bar H+1 tidak ada di histori ticker. | `barAtForwardTradingOffset()` dipakai untuk entry; sinyal tanpa bar maju dibuang dan dihitung. | Tiga bentuk histori diuji; tidak satu pun boleh menghasilkan entry pada/sebelum tanggal sinyal. Fungsi lama tetap dipanggil sebagai kontrol untuk menunjukkan perbedaannya nyata. |

Skrip memanggil sumber produksi lewat hook TypeScript yang sama dengan `scripts/backfill-lens-history.mjs`, jadi ia menguji kode yang benar-benar berjalan — bukan salinannya. Satu pengecualian yang disalin secara sadar dan diberi komentar: formula ATR **lama**, karena ia sudah tidak ada lagi di basis kode dan hanya dipakai sebagai kontrol negatif.

## Penjaga regresi di test suite

Verifikasi di atas melengkapi, bukan menggantikan, test yang sudah masuk suite:

- `modules/technical/service/__tests__/atr.test.ts` — golden value Wilder yang bisa diturunkan tangan, plus invarian lintas-jalur produksi vs lab (9 test).
- `scripts/__tests__/backfill-scoring-parity.test.ts` — skor jalur backfill harus identik dengan skor jalur produksi untuk input yang sama (5 test).
- `modules/lens-radar/service/__tests__/history-return-utils.test.ts` — bar entry tidak pernah mundur, diuji atas seluruh 32 kombinasi ketersediaan bar (7 test).
