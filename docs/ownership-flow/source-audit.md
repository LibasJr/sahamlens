# Audit Sumber Ownership Flow — checklist wajib

Status saat ini: **`UNVERIFIED` → ingestion produksi TERTUTUP (fail-closed).**

Dokumen ini adalah prosedur yang harus diselesaikan sebelum
`KSEI_REGISTERED_SECURITY.auditStatus` boleh dinaikkan ke `VERIFIED`.

---

## 0. Kenapa status masih UNVERIFIED

Struktur HTML sumber **tidak dapat diverifikasi dari sandbox pengembangan**:
kebijakan jaringan environment menolak seluruh host non-GitHub.

```
www.ksei.co.id:443   → CONNECT 403 (policy denial dari proxy environment)
www.idx.co.id        → diblokir
query1.finance...    → diblokir (padahal produksi memakainya)
```

**Ini keterbatasan sandbox, BUKAN bukti bahwa sumbernya tidak ada.** Dua hal itu
harus dibedakan dengan tegas:

| | Artinya |
|---|---|
| `SOURCE NOT ACCESSIBLE FROM SANDBOX` | Kita belum bisa melihatnya dari sini |
| `SOURCE DOES NOT EXIST` | Sumbernya memang tidak ada |

Yang berlaku di sini adalah yang **pertama**. Karena itu seluruh infrastruktur
tetap dibangun, hanya gerbang penulisannya yang ditutup.

Menulis parser berdasarkan ingatan tentang tata letak halaman lalu menandainya
"verified" sama dengan mengarang — bedanya, kesalahannya baru ketahuan setelah
ratusan baris palsu masuk tabel histori yang sifatnya append-only dan tidak
pernah ditimpa.

---

## 1. Sumber yang terdaftar

### 1a. Snapshot per emiten — `KSEI_REGISTERED_SECURITY`

```
https://web.ksei.co.id/services/registered-securities/shares/lc/{TICKER}?setLocale=id-ID
```

| Aspek | Status |
|---|---|
| Akses publik tanpa autentikasi | **belum diverifikasi** |
| Format | HTML (diharapkan) |
| Cadence | **UNKNOWN** — belum dibuktikan |
| Field diharapkan | Security Name, Issuer, ISIN Code, Short Code, Number of Securities, As of, Scripless Percentage, Local Percentage, Foreign Percentage |
| Rate limit | belum diketahui |
| Historis / snapshot | snapshot (histori dibangun sendiri sejak implementasi) |
| Per ticker | ya |

Cadence `UNKNOWN` membuat `assessFreshness()` fail-closed ke `STALE` — kita tidak
punya dasar menyebut data segar tanpa tahu seberapa sering sumbernya terbit.

### 1b. Arsip bulanan — `KSEI_HOLDING_COMPOSITION`

```
https://web.ksei.co.id/archive_download/holding_composition
```

⚠️ **Snapshot PERIODIK/BULANAN.** Ditandai `usage: 'HISTORICAL_SEED'`.

Boleh dipakai untuk: seed historis, cross-check, validasi bulanan.
**Tidak boleh** diperlakukan sebagai observasi harian. Baris bertanggal
`30 Jun 2026` wajib tersimpan dengan `observed_date = 2026-06-30` apa adanya —
mengubahnya menjadi tanggal cron akan menghasilkan delta 1D/7D yang fiktif.

---

## 2. Prosedur audit (dijalankan operator di VPS)

```bash
# VPS SahamLens, outbound internet normal
npm run audit:ksei-ownership

# atau dengan sampel sendiri
npm run audit:ksei-ownership -- --tickers BBRI,BBCA,TLKM
```

Sampel default sengaja mencampur emiten besar dan kecil —
`BBRI, BBCA, TLKM, ASII, GTSI, ERAL, SMRA`. Emiten kecil justru yang paling
mungkin punya halaman berbentuk berbeda atau data tidak lengkap.

Script berjalan **berurutan dengan jeda 1,5 detik**, bukan paralel: ini audit
atas server publik milik lembaga, bukan uji beban.

### Keluaran

```
reports/ksei-ownership-source-audit.json    ringkasan per ticker
data/source-fixtures/ksei/<TICKER>.html     fixture tersanitasi
```

Sanitasi fixture membuang: `<script>`, meta CSRF, `<input type=hidden>`,
atribut `nonce`, atribut `data-*token/session`, dan query param
token/session/auth/key. Fixture hanya disimpan untuk halaman yang **bukan**
captcha/login.

---

## 3. Kondisi GAGAL — jangan aktifkan apa pun

Jika audit menemukan salah satu dari:

- HTTP 403 / 429
- captcha atau tantangan anti-bot
- halaman login
- HTML tidak sesuai harapan
- label wajib tidak ditemukan
- Terms/robots/kebijakan melarang pengambilan otomatis

maka:

```
verdict = SOURCE_UNVERIFIED
→ status registry TIDAK dinaikkan
→ ingestion produksi TETAP tertutup
→ dokumentasikan temuannya di sini
```

Script keluar dengan exit code 1 pada kondisi ini.

---

## 4. Setelah audit LULUS

`LABELS_PRESENT` pada seluruh sampel **belum berarti parser sudah benar** — ia
baru berarti label yang dibutuhkan ada di halaman. Langkah berikutnya:

1. Implementasikan/koreksi parser **terhadap fixture nyata**
2. Tambahkan test yang membaca fixture itu (bukan HTML sintetis)
3. Verifikasi manual — cocokkan dengan halaman aslinya:
   - [ ] local percentage
   - [ ] foreign percentage
   - [ ] local + foreign ≈ 100
   - [ ] observed date (`As of`) — **bukan** tanggal fetch
   - [ ] number of securities
   - [ ] short code cocok dengan ticker yang diminta
4. Tentukan cadence: jalankan audit beberapa hari berturut-turut, bandingkan
   pergerakan nilai `As of`. **Jangan menebak.**
5. Perbarui `cadence` di registry dari `UNKNOWN` ke nilai sebenarnya
6. Ubah `auditStatus` → `VERIFIED`, **dalam commit yang sama** dengan fixture
   dan test-nya
7. Perbarui test `source-registry.test.ts` yang saat ini menegaskan `UNVERIFIED`
8. Baru aktifkan: `OWNERSHIP_FLOW_INGESTION_ENABLED=true`
9. Daftarkan timer cron (1× sehari) pada jam yang **terbukti** dari langkah 4,
   lalu perbarui `config/scheduled-jobs.json`

---

## 5. Batas yang tidak boleh dilanggar

- ❌ Reverse-engineering API privat yang menuntut login/token/cookie
- ❌ Menyalin session/cookie pribadi ke server produksi
- ❌ Menyamar sebagai browser untuk melewati pembatasan
- ❌ Menaikkan `auditStatus` tanpa fixture nyata
- ❌ Mengisi `cadence` dengan tebakan
- ✅ Halaman publik, User-Agent yang menyebut identitas & kontak, konkurensi
  kecil, jeda antar-permintaan
