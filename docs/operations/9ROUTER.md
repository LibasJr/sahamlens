# Runbook: pasang 9Router untuk cascade LensAI

9Router adalah proxy OpenAI-compatible yang merutekan satu request ke banyak provider AI
sekaligus (Claude/GPT/Gemini/GLM/dst) dengan fallback internal. SahamLens memakainya
sebagai satu entri provider di `lib/aiProviders.ts` - lihat `DEPLOYMENT.md` bagian
"2026-08-13" untuk daftar env var dan keputusan desainnya.

Dokumen ini urutan kerjanya, dari VPS kosong sampai production.

**Estimasi**: 30-45 menit, sebagian besar menunggu DNS.

---

## Yang perlu disiapkan dulu

- VPS dengan akses root/sudo (bisa VPS yang sama dengan Redis).
- Satu subdomain yang bisa diarahkan ke IP VPS, mis. `router.sahamlens.com`.
- Akun-akun AI yang mau dipakai (Claude/GPT/Gemini/GLM/Kiro/dst).
- Akses ke Vercel project `libas/trading`.

---

## Langkah 1 - Arahkan subdomain ke VPS

Di panel DNS domain Anda, buat record:

```
Type: A     Name: router     Value: <IP-VPS>     TTL: auto
```

Tunggu sampai propagasi selesai sebelum lanjut ke langkah 4 (SSL akan gagal kalau DNS
belum menunjuk ke VPS). Cek dari laptop:

```bash
dig +short router.DOMAIN-ANDA.com     # harus mengembalikan IP VPS
```

## Langkah 2 - Siapkan VPS

SSH ke VPS, lalu pastikan Docker, Nginx, dan Certbot ada:

```bash
ssh user@<IP-VPS>

# Docker (lewati kalau sudah ada)
curl -fsSL https://get.docker.com | sh

# Nginx + Certbot
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx docker-compose-plugin
```

Pastikan firewall hanya membuka 80/443 - **jangan** buka 20128:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status          # 20128 TIDAK boleh ada di daftar
```

## Langkah 3 - Ambil file deploy

```bash
git clone https://github.com/LibasJr/sahamlens.git ~/sahamlens
cd ~/sahamlens/deploy/9router
```

Kalau tidak mau clone seluruh repo, cukup salin tiga file di folder itu
(`docker-compose.yml`, `nginx-9router.conf`, `install-9router.sh`) ke VPS.

## Langkah 4 - Jalankan installer

```bash
sudo bash install-9router.sh --domain router.DOMAIN-ANDA.com --email email@anda.com
```

Yang dilakukan skrip ini:

1. Membuat password dashboard acak di `deploy/9router/.env` (chmod 600).
2. Menjalankan container 9Router **bind ke 127.0.0.1:20128** - tidak terekspos ke internet.
3. Menunggu `/health` hijau.
4. Memasang config Nginx + minta sertifikat SSL Let's Encrypt.

Aman dijalankan ulang: password, config Nginx, dan volume data tidak pernah ditimpa.

Setelah selesai, cek dari laptop:

```bash
curl https://router.DOMAIN-ANDA.com/health      # harus balas OK
curl https://router.DOMAIN-ANDA.com/dashboard   # harus 404 - dashboard memang ditutup
```

## Langkah 5 - Pasang provider AI di dashboard

Dashboard sengaja **tidak** dibuka ke internet - isinya seluruh API key provider Anda.
Akses lewat SSH tunnel dari laptop:

```bash
ssh -L 20128:127.0.0.1:20128 user@<IP-VPS>
```

Biarkan terminal itu terbuka, lalu di browser buka `http://127.0.0.1:20128/dashboard`.
Password ada di `~/sahamlens/deploy/9router/.env` di VPS (`cat .env`).

Di dashboard:

1. **Settings -> Providers**: tambahkan akun AI Anda satu per satu.
2. **Settings -> API Keys**: buat satu key khusus SahamLens, salin.
3. Ganti password dashboard dari yang digenerate acak.

## Langkah 6 - Uji dari laptop SEBELUM menyentuh Vercel

Dari checkout SahamLens di laptop:

```bash
NINEROUTER_BASE_URL=https://router.DOMAIN-ANDA.com \
NINEROUTER_API_KEY=<key-dari-langkah-5> \
npm run check:9router
```

Skrip ini memisahkan penyebab kegagalan yang di produksi gejalanya identik semua
("LensAI tidak tersedia atau kena limit"):

| Pesan | Artinya |
| --- | --- |
| `tidak bisa menghubungi .../models` | Router mati, DNS/SSL salah, atau firewall menutup 443 |
| `HTTP 401` / `403` | API key salah atau sudah di-rotate |
| `HTTP 404` pada chat completions | Nama model di `NINEROUTER_MODELS` tidak ada di instance ini |
| `model ... tidak ada di instance ini` | Sama, tapi ketahuan sebelum request dikirim |
| `Semua pemeriksaan lolos` | Aman dipasang di Vercel |

**Jangan lanjut ke langkah 7 sebelum langkah ini lolos.**

## Langkah 7 - Pasang env var di Vercel

Vercel -> project `libas/trading` -> Settings -> Environment Variables. Scope
**Production + Preview**:

| Env var | Nilai | Catatan |
| --- | --- | --- |
| `NINEROUTER_BASE_URL` | `https://router.DOMAIN-ANDA.com` | |
| `NINEROUTER_API_KEY` | key dari langkah 5 | tandai **Sensitive** |

Opsional: `NINEROUTER_MODELS`, `NINEROUTER_PRIORITY`, `NINEROUTER_TIMEOUT_MS`,
`NINEROUTER_PROMPT_BUDGET` (lihat `.env.example`).

Env var tidak berlaku sampai ada deploy baru:

```bash
npx vercel --prod
```

## Langkah 8 - Verifikasi di production

1. Buka https://sahamlens.vercel.app/chat, kirim satu pertanyaan.
2. Vercel -> Deployments -> Functions -> log `/api/chat`.
3. Jawaban keluar **tanpa** baris `[AI:9router] ... HTTP xxx` = request sudah lewat 9Router.
4. Kalau ada `[AI:9router]` gagal tapi jawaban tetap keluar, itu cascade lama yang
   menyelamatkan - routernya bermasalah, balik ke langkah 6.

---

## Kalau ada masalah

| Gejala | Penyebab paling sering |
| --- | --- |
| `certbot` gagal | DNS belum propagasi (langkah 1) atau port 80 tertutup |
| `/health` OK tapi Vercel tetap gagal | `NINEROUTER_BASE_URL` masih `localhost` - harus URL publik |
| Log penuh `[AI:9router] HTTP 429` | Kuota provider upstream habis; tambah provider di dashboard |
| Jawaban lambat/timeout | Naikkan `NINEROUTER_TIMEOUT_MS`, atau pilih model lebih cepat |
| Semua AI mati mendadak | Cek `docker compose logs -f` di VPS; container mungkin OOM |

## Perawatan

```bash
cd ~/sahamlens/deploy/9router
docker compose logs -f              # log
docker compose pull && docker compose up -d   # update
docker compose restart              # restart
```

Sertifikat Let's Encrypt diperpanjang otomatis oleh timer certbot. Volume
`9router-data` menyimpan seluruh konfigurasi provider - **jangan** dihapus saat update
(`docker compose down -v` akan menghapusnya).

## Rollback

9Router tidak menggantikan apa pun - cascade provider lama tetap utuh. Untuk mematikan:
hapus `NINEROUTER_BASE_URL` dan `NINEROUTER_API_KEY` di Vercel, lalu redeploy. Aplikasi
kembali memakai Gemini/Groq/OpenRouter/Kimi/NVIDIA seperti sebelumnya.
