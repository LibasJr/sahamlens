# SahamLens Decision Lab — Stack Role

## Diagram singkat

```text
Data real
  ↓
LensScore v1.6.1
  ↓
Decision Engine
  ↓
Review Layer
  ├─ Research
  ├─ Analyst
  ├─ Reviewer
  ├─ Security
  ├─ Frontend
  ├─ Ops
  └─ Lead
  ↓
Human final
```

## Struktur role

| Role | Tugas utama | Output yang diharapkan |
|---|---|---|
| Lead | Ambil keputusan akhir dan jaga konsistensi aturan | keputusan final yang patuh v1.6 |
| Analyst | Hitung skor, baca indikator, rangkum angka | ringkasan berbasis data real |
| Reviewer | Validasi hasil dan cari konflik sinyal | verdict grounded / challenge |
| Security | Cek kebocoran, auth boundary, exposure | temuan hardening |
| Frontend | Jaga penyajian hasil dan UX | tampilan yang jelas dan ringkas |
| Ops | Jaga service, health check, deploy | status produksi yang sehat |
| Research | Cari konteks berita dan evidence | evidensi pendukung |

## Prinsip

- Tidak ada data dummy untuk keputusan produksi.
- LensScore v1.6.1 tetap sumber skor.
- Review layer hanya menguatkan, menolak, atau meminta bukti tambahan.
- Keputusan final tetap manusia.
