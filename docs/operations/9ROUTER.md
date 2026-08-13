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

## Pilih jalur dulu: Tunnel atau Nginx

| | **Jalur A - Cloudflare Tunnel** | **Jalur B - Nginx + Let's Encrypt** |
| --- | --- | --- |
| Kapan dipakai | VPS sudah pakai Cloudflare Tunnel | VPS biasa dengan IP publik terbuka |
| Port masuk | **tidak ada** (cloudflared connect keluar) | 80 + 443 harus terbuka |
| Sertifikat | otomatis oleh Cloudflare | certbot / Let's Encrypt |
| DNS | CNAME ke tunnel | A record ke IP VPS |
| Batas waktu request | **100 detik** (Cloudflare balas 524 lewat dari itu) | bebas |

**SahamLens memakai Jalur A** - domain `sahamlens.id` sudah di Cloudflare dengan tunnel
`sahamlens-prod`. Jalur B tetap didokumentasikan untuk VPS lain di masa depan.

---

## Jalur A - Cloudflare Tunnel

### A1. Siapkan VPS

Yang dibutuhkan cuma Docker + Compose. **Tidak perlu** Nginx maupun certbot.

```bash
docker --version
docker compose version || docker-compose --version
```

Kalau Compose belum ada: `sudo apt-get install -y docker-compose-plugin` (atau
`docker-compose` untuk Ubuntu yang paketnya belum tersedia).

Jangan buka port apa pun di firewall. Container 9Router bind ke `127.0.0.1:20128` dan
hanya cloudflared di mesin yang sama yang boleh menjangkaunya.

### A2. Jalankan 9Router

Di jalur tunnel, `nginx-9router.conf` dan bagian certbot di installer TIDAK terpakai -
yang tersisa cuma "jalankan container dengan flag yang benar". Jadi tidak perlu menyalin
file deploy sama sekali; satu perintah sudah cukup dan menghilangkan satu sumber
kesalahan (menempel ratusan baris lewat SSH sering gagal diam-diam).

```bash
# 1. Buat password dashboard dan SIMPAN keluarannya
openssl rand -base64 24 | tee ~/9router-dashboard-password.txt
chmod 600 ~/9router-dashboard-password.txt

# 2. Jalankan 9Router
sudo docker run -d --name 9router --restart unless-stopped \
  -p 127.0.0.1:20128:20128 \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -e REQUIRE_API_KEY=true \
  -e AUTH_COOKIE_SECURE=true \
  -e INITIAL_PASSWORD="$(cat ~/9router-dashboard-password.txt)" \
  -v 9router-data:/root/.9router \
  --log-opt max-size=10m --log-opt max-file=3 \
  decolua/9router:latest
```

Nama image yang benar `decolua/9router` (diverifikasi lewat Docker Hub, sejalan dengan
repo `github.com/decolua/9router` dan paket npm `9router`). Beberapa panduan pihak ketiga
menulis `decocua/9router` - itu salah ketik, repositorinya tidak ada.

`-p 127.0.0.1:20128:20128` itu bagian yang tidak boleh diubah - itu yang membuat port ini
hanya bisa dijangkau dari mesin itu sendiri (yaitu cloudflared), bukan dari internet.
`-v 9router-data:...` menyimpan seluruh konfigurasi provider; jangan dihapus saat update.

Verifikasi dari VPS:

```bash
curl -fsS http://127.0.0.1:20128/health && echo OK
```

Alternatif dengan file deploy (Langkah 3 + `sudo bash install-9router.sh` tanpa
`--domain`) tetap berlaku dan hasilnya setara - pilih salah satu, bukan dua-duanya.

### A3. Tambah hostname ke tunnel

Cek dulu tunnel Anda dikelola dari file lokal atau dari dashboard:

```bash
sudo cat /etc/cloudflared/config.yml 2>/dev/null \
  || sudo cat ~/.cloudflared/config.yml 2>/dev/null \
  || echo "tidak ada config lokal -> tunnel dikelola dari dashboard Zero Trust"
```

**Kalau ada config lokal**: tambahkan blok ingress dari
`deploy/9router/cloudflared-ingress.yml` ke daftar `ingress`, **di atas** catch-all
`service: http_status:404` yang paling bawah. Urutan menentukan - cloudflared memakai
aturan pertama yang cocok.

```bash
sudo nano /etc/cloudflared/config.yml
sudo cloudflared tunnel ingress validate     # wajib lolos sebelum restart
sudo systemctl restart cloudflared
```

**Kalau dikelola dashboard**: Cloudflare Zero Trust -> Networks -> Tunnels ->
`sahamlens-prod` -> Public Hostnames -> Add:

- Subdomain `router`, Domain `sahamlens.id`
- Service: `HTTP` -> `localhost:20128`
- Additional settings -> Connect timeout `15s`

Dashboard tidak punya filter path, jadi `/dashboard` ikut terbuka. Tutup dengan
Cloudflare Access (Zero Trust -> Access -> Applications, `router.sahamlens.id/dashboard`,
policy Allow hanya email Anda), atau pakai config lokal yang mendukung filter path.

### A4. Verifikasi

```bash
curl https://router.sahamlens.id/health        # harus OK
curl -o /dev/null -w '%{http_code}\n' https://router.sahamlens.id/dashboard   # harus 404
```

DNS record `router.sahamlens.id` dibuat otomatis oleh cloudflared - tidak perlu bikin
A record manual. Lanjut ke **Langkah 5**.

---

## Jalur B - Nginx + Let's Encrypt

### Langkah 1 - Arahkan subdomain ke VPS

Di panel DNS domain Anda, buat record:

```
Type: A     Name: router     Value: <IP-VPS>     TTL: auto
```

Tunggu sampai propagasi selesai sebelum lanjut ke langkah 4 (SSL akan gagal kalau DNS
belum menunjuk ke VPS). Cek dari laptop:

```bash
dig +short router.DOMAIN-ANDA.com     # harus mengembalikan IP VPS
```

Kalau domain ada di Cloudflare, **matikan proxy (awan oranye)** untuk record ini saat
certbot dijalankan - kalau tetap proxied, validasi HTTP-01 tidak sampai ke VPS.

### Langkah 2 - Siapkan VPS

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

---

## Langkah 3 - Ambil file deploy ke VPS

*(dipakai kedua jalur)*

Repo SahamLens **private**, jadi VPS tidak bisa clone tanpa kredensial. Pilih salah satu:

### Opsi A (disarankan) - tanpa clone, tanpa token

Di VPS, buat satu file lalu tempel isi `deploy/9router/bootstrap-9router.sh` ke dalamnya:

```bash
nano ~/bootstrap-9router.sh     # tempel isinya, Ctrl+O simpan, Ctrl+X keluar
bash ~/bootstrap-9router.sh     # menulis 3 file deploy ke ~/9router
cd ~/9router
```

Skrip itu tidak mengunduh apa pun dan tidak butuh sudo - isinya cuma tiga file deploy
yang ditulis apa adanya, jadi bisa dibaca dulu sebelum dijalankan.

### Opsi B - clone dengan Personal Access Token

Perhatikan urutannya: `deploy/9router/` baru ada **setelah** checkout branch fiturnya,
jadi `cd` ke folder itu harus dilakukan paling akhir.

```bash
git clone https://<GITHUB-TOKEN>@github.com/LibasJr/sahamlens.git ~/sahamlens
cd ~/sahamlens
git checkout claude/9router-proxy-sahajamlens-api-79iye3
cd deploy/9router
```

Token perlu scope `repo`. Setelah selesai, hapus remote-nya (`git remote set-url origin
https://github.com/LibasJr/sahamlens.git`) supaya token tidak tersimpan di `.git/config`
VPS. Kalau branch ini sudah di-merge ke `main`, langkah `git checkout` tidak diperlukan.

## Langkah 4 - Jalankan installer

**Jalur A (tunnel)** - tanpa `--domain`, lalu lanjut ke A3 di atas:

```bash
sudo bash install-9router.sh
```

**Jalur B (Nginx)**:

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
Password ada di file `.env` sebelah installer di VPS - `cat ~/9router/.env` (Opsi A) atau
`cat ~/sahamlens/deploy/9router/.env` (Opsi B).

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
| `certbot` gagal | DNS belum propagasi (langkah 1), port 80 tertutup, atau record masih Proxied di Cloudflare |
| HTTP 524 dari router | Batas 100 detik Cloudflare terlampaui - turunkan `NINEROUTER_TIMEOUT_MS` atau pilih model lebih cepat |
| HTTP 502/1033 dari router | `cloudflared` mati atau container 9Router berhenti - cek `systemctl status cloudflared` dan `docker compose ps` |
| Request dari Vercel diblokir | WAF/Bot Fight Mode Cloudflare - buat WAF skip rule untuk path `/v1/*` |
| `/health` OK tapi Vercel tetap gagal | `NINEROUTER_BASE_URL` masih `localhost` - harus URL publik |
| Log penuh `[AI:9router] HTTP 429` | Kuota provider upstream habis; tambah provider di dashboard |
| Jawaban lambat/timeout | Naikkan `NINEROUTER_TIMEOUT_MS`, atau pilih model lebih cepat |
| Semua AI mati mendadak | Cek `docker compose logs -f` di VPS; container mungkin OOM |

## Perawatan

```bash
cd ~/9router                        # atau ~/sahamlens/deploy/9router kalau pakai Opsi B
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
