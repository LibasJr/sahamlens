# Autentikasi Email sahamlens.id — Status Terverifikasi 13 September 2026

Dokumen ini mencatat **bukti terukur**, bukan konfigurasi yang diharapkan. Setiap klaim
di bawah berasal dari pengujian nyata pada tanggal tersebut dan mencantumkan cara
mengulangnya.

## Topologi

| Lapis | Penyedia | Bukti |
|---|---|---|
| DNS otoritatif | Cloudflare | `NS sahamlens.id` → `rodrigo.ns.cloudflare.com`, `alexa.ns.cloudflare.com` |
| Mailbox | Hostinger Email (terkelola) | `MX` → `5 mx1.hostinger.com`, `10 mx2.hostinger.com` |
| Relay keluar | Hostinger SMTP | `smtp.hostinger.com:465` (SSL), dipakai `email.repository.ts` |
| Aplikasi | mesin lokal via `cloudflared` | `A sahamlens.id` → Cloudflare; IP mesin `101.0.6.75` |

**Konsekuensi operasional penting:** mailbox TIDAK berada di VPS mana pun. Tidak ada
Postfix/Dovecot/Exim yang memegangnya (`systemctl is-active postfix exim4` → `inactive`
di mesin aplikasi). Pembuatan/penghapusan mailbox hanya lewat hPanel atau API Hostinger —
SSH ke VPS tidak bisa melakukannya. Ini pernah ditanyakan dan jawabannya bukan intuitif.

Karena DNS di Cloudflare sementara mail di Hostinger, tombol "Connect automatically" di
hPanel tidak berlaku. Setiap record autentikasi wajib ditambahkan manual di Cloudflare,
dan **semua record email harus DNS-only (abu-abu), bukan proxied**.

## Mailbox aktif

Diverifikasi lewat `RCPT TO` ke MX resmi — tanpa mengirim email, tanpa password:

| Alamat | Hasil | Dipakai di |
|---|---|---|
| `no-reply@sahamlens.id` | `250 Ok` | `SMTP_EMAIL` — pengirim semua email transaksional (OTP, reset password) |
| `support@sahamlens.id` | `250 Ok` | kontak pengguna di email OTP (`Reply-To` + badan), User-Agent ownership-flow, dan VAPID subject push notification |
| `pasti-tidak-ada-zzq91@` | `550 Reject` | **kontrol** |

Sejak 13 September 2026 `admin@sahamlens.id` **tidak lagi dipakai sebagai kontak pengguna**
di produk: email OTP pendaftaran dan reset kata sandi hanya menyebut `support@`, dan
pengirimnya tetap `no-reply@`. Alamat `admin@` masih dipakai sebagai tujuan laporan DMARC
(`rua`/`ruf`) — itu urusan operasional, bukan alamat yang ditawarkan ke pengguna.

Kontrol `550` itu bagian dari buktinya: ia membuktikan server membedakan mailbox yang ada
dari yang tidak. Tanpa kontrol, tiga jawaban `250` tidak membuktikan apa pun — server yang
menerima segalanya (catch-all) akan memberi `250` untuk alamat karangan juga.

Mengulang:

```bash
python3 - <<'PY'
import smtplib
s = smtplib.SMTP("mx1.hostinger.com", 25, timeout=20)
s.ehlo("sahamlens.id"); s.mail("postmaster@sahamlens.id")
for a in ["admin@sahamlens.id", "support@sahamlens.id", "tidak-ada-xyz@sahamlens.id"]:
    print(a, s.rcpt(a))
s.quit()
PY
```

## SPF — lolos

```
sahamlens.id            TXT  "v=spf1 include:_spf.mail.hostinger.com ~all"
_spf.mail.hostinger.com TXT  "v=spf1 include:relay.mail.hostinger.com include:relay.mailchannels.net ~all"
```

Hostinger merelai lewat MailChannels; itu sudah tercakup include, jadi tidak perlu
ditambah apa pun.

## DKIM — aktif dan terbukti menandatangani

**Catatan untuk siapa pun yang memeriksa ini lagi:** selector Hostinger adalah
`hostingermail-a/-b/-c`, **dengan tanda hubung**. Pemeriksaan pertama 13 September 2026
memakai `hostingermail1/2/3` (tanpa hubung, pola penyedia lain), tidak menemukan apa pun,
dan menyimpulkan DKIM belum aktif — kesimpulan yang salah. Selector yang salah
menghasilkan "tidak ada record", yang terbaca sama dengan "belum dikonfigurasi".

```
hostingermail-a._domainkey.sahamlens.id  CNAME  hostingermail-a.dkim.mail.hostinger.com
hostingermail-b._domainkey.sahamlens.id  CNAME  hostingermail-b.dkim.mail.hostinger.com
hostingermail-c._domainkey.sahamlens.id  CNAME  hostingermail-c.dkim.mail.hostinger.com
```

Hanya selector `-a` yang memuat kunci aktif (`p=MIIBIjANBgkq…`); `-b` dan `-c` berisi
`v=DKIM1;p=` kosong. Itu normal — Hostinger menyiapkannya untuk rotasi kunci. Ketiganya
tetap wajib dipasang supaya rotasi tidak memutus penandatanganan.

Bukti tidak berhenti di DNS. Email nyata dikirim `no-reply@` ke dirinya sendiri, lalu
header dibaca lewat IMAP:

```
Authentication-Results: fr-int-smtpin16.hostinger.io;
  dkim=pass header.d=sahamlens.id header.s=hostingermail-a header.b=s3Tv2Zpl;
  spf=pass smtp.mailfrom=no-reply@sahamlens.id;
  dmarc=pass (policy=none) header.from=sahamlens.id
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=sahamlens.id; s=hostingermail-a; …
```

Record DNS yang ada hanya membuktikan kuncinya dipublikasikan. Header `dkim=pass` dari
email sungguhan membuktikan relay benar-benar menandatangani dan verifikasi berhasil —
dua hal berbeda, dan yang kedua yang menentukan.

## DMARC — dinaikkan ke quarantine, dan dibuktikan dari DUA arah

Sebelum: `v=DMARC1; p=none` — memantau tanpa tindakan, dan tanpa `rua` tidak ada laporan
yang dikirim ke siapa pun. Artinya `p=none` di sini bukan "tahap pemantauan", melainkan
tidak ada perlindungan sekaligus tidak ada data.

Sesudah:

```
_dmarc.sahamlens.id  TXT  "v=DMARC1; p=quarantine; rua=mailto:admin@sahamlens.id; ruf=mailto:admin@sahamlens.id; fo=1; adkim=r; aspf=r; pct=100"
```

Alasan menaikkan langsung ke `quarantine`, bukan bertahap dari `none`: syarat yang biasanya
membuat penegakan berbahaya sudah dipenuhi dan diukur lebih dulu —

1. DKIM `pass` pada email nyata, bukan hanya record terpasang;
2. SPF `pass`, include MailChannels sudah tercakup;
3. **satu-satunya** jalur kirim adalah Hostinger SMTP. Diperiksa dengan inversi: tidak ada
   SendGrid/Mailgun/Postmark/Resend/SES/Brevo di seluruh `modules lib shared app
   package.json`, dan `nodemailer` hanya dipakai satu berkas
   (`modules/user/repository/email.repository.ts`). Tidak ada `postfix`/`exim4` aktif di
   mesin aplikasi, dan tidak ada `sendmail`/`msmtp` terpasang.

Yang membuat kenaikan DMARC merusak adalah pengirim sah yang terlupakan — layanan
pemasaran, monitoring, invoice, atau relay di server lain. Di sini tidak ada satu pun,
sehingga tidak ada yang bisa jatuh ke karantina.

### Verifikasi arah 1 — email SAH tetap lolos

Setelah record diubah dan menyebar (dicek di `8.8.8.8`, `1.1.1.1`, `9.9.9.9`, dan
langsung ke `rodrigo.ns.cloudflare.com` untuk melewati cache), email nyata dikirim ulang:

```
dkim=pass   header.d=sahamlens.id header.s=hostingermail-a
spf=pass    smtp.mailfrom=no-reply@sahamlens.id
dmarc=pass  (policy=quarantine)
```

Email transaksional tidak terdampak — OTP dan reset password tetap terkirim normal.

### Verifikasi arah 2 — email PALSU benar-benar ditindak

Arah pertama saja tidak membuktikan kebijakannya bekerja. Record `p=quarantine` yang
tidak ditegakkan memberi hasil yang **persis sama** untuk email sah. Yang membedakan
perlindungan nyata dari record hiasan hanya satu hal: apa yang terjadi pada pemalsuan.

Diuji dengan mengirim email yang mengaku `From: admin@sahamlens.id` langsung ke MX dari
mesin aplikasi (`101.0.6.75`) — IP yang tidak ada di SPF, tanpa kredensial apa pun, persis
bentuk serangan phishing:

```
MAIL FROM -> 250 Ok
RCPT TO   -> 250 Ok
DATA      -> 250 Ok: queued as 4hj9yN3zC3z3wyc
```

Diterima di tahap SMTP — itu memang definisi `quarantine` (menandai, bukan menolak).
Pertanyaan sebenarnya ada di mana ia mendarat:

```
folder: INBOX.Junk          <-- bukan INBOX
Authentication-Results: dkim=none;
  dmarc=fail reason="No valid SPF, No valid DKIM" header.from=sahamlens.id (policy=quarantine);
  spf=softfail (101.0.6.75 is neither permitted nor denied by domain of admin@sahamlens.id)
```

`dmarc=fail` + mendarat di `INBOX.Junk`, sementara email sah `dmarc=pass` dan masuk
`INBOX`. Kebijakannya ditegakkan, bukan sekadar dipublikasikan.

Catatan untuk pengujian berikutnya: `spf=softfail` (bukan `fail`) berasal dari `~all` di
record SPF. Menggantinya dengan `-all` akan membuat penolakan lebih tegas, tetapi juga
memutus email sah yang diteruskan (forwarded) — karena itu tidak dilakukan sekarang.


`adkim=r`/`aspf=r` (relaxed) dipilih, bukan `strict`: relaxed menerima subdomain, jadi
kalau nanti ada `mail.sahamlens.id` atau `notifications.sahamlens.id` ia tidak langsung
gagal alignment.

`pct=100` eksplisit meski itu nilai bawaan — supaya siapa pun yang membaca record ini tahu
kebijakannya berlaku penuh, bukan sampel sebagian.

## Yang masih terbuka

`ruf` (laporan forensik) dikirim ke `admin@sahamlens.id`. Laporan agregat DMARC datang
harian dari penerima besar (Google, Microsoft, Yahoo) dalam bentuk XML terkompresi — tidak
nyaman dibaca manual. Kalau volumenya mengganggu, pilihannya mengarahkan `rua` ke layanan
pengurai laporan, bukan mematikan `rua`: tanpa laporan, kenaikan ke `p=reject` nanti akan
jadi tebakan.

Kenaikan berikutnya (`quarantine` → `reject`) sebaiknya menunggu laporan agregat dua
sampai empat minggu menunjukkan nol pengirim sah yang gagal. Bedanya material: `quarantine`
menaruh email palsu ke spam (masih bisa diselamatkan kalau ternyata sah), `reject`
menolaknya di server (tidak bisa dipulihkan).

## Mengapa ini penting untuk SahamLens secara khusus

`admin@sahamlens.id` jauh lebih menarik dipalsukan daripada `no-reply@` — ia terdengar
berwenang. Untuk aplikasi yang pengguna percayai soal keputusan uang, email palsu "dari
admin SahamLens" yang meminta klik tautan adalah serangan termurah yang ada. SPF tanpa
DMARC yang ditegakkan tidak menghentikannya: SPF memeriksa amplop, sedangkan yang dilihat
pengguna adalah header `From:`, dan itu yang dijaga alignment DMARC.
