# Runbook: pasang 9Router untuk cascade LensAI

9Router adalah proxy OpenAI-compatible yang merutekan satu request ke banyak provider AI
sekaligus (Claude/GPT/Gemini/GLM/dst) dengan fallback internal. SahamLens memakainya
sebagai satu entri provider di `lib/aiProviders.ts` - lihat `DEPLOYMENT.md` bagian
"2026-08-13" untuk daftar env var dan keputusan desainnya.

Dokumen ini urutan kerjanya, dari VPS kosong sampai production.

**Estimasi**: 30-45 menit.

---

## Yang perlu disiapkan dulu

- VPS dengan akses root/sudo (bisa VPS yang sama dengan Redis).
- Satu subdomain yang bisa diarahkan ke IP VPS, mis. `router.sahamlens.com`.
- Akun-akun AI yang mau dipakai (Claude/GPT/Gemini/GLM/Kiro/dst).
- Akses sudo ke VPS tempat `sahamlens.service` berjalan.

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
  -v 9router-data:/app/data \
  --log-opt max-size=10m --log-opt max-file=3 \
  decolua/9router:latest
```

Nama image yang benar `decolua/9router` (diverifikasi lewat Docker Hub, sejalan dengan
repo `github.com/decolua/9router` dan paket npm `9router`). Beberapa panduan pihak ketiga
menulis `decocua/9router` - itu salah ketik, repositorinya tidak ada.

`-p 127.0.0.1:20128:20128` itu bagian yang tidak boleh diubah - itu yang membuat port ini
hanya bisa dijangkau dari mesin itu sendiri (yaitu cloudflared), bukan dari internet.

`-v 9router-data:/app/data` juga tidak boleh diubah. Path-nya diverifikasi dari log
container yang berjalan (`[DB] Driver: better-sqlite3 | file: /app/data/db/data.sqlite`).
Panduan pihak ketiga menyebut `/root/.9router` - itu path versi CLI/npm; kalau dipakai
untuk image Docker, volume-nya kosong dan SELURUH konfigurasi provider hidup di lapisan
tulis container, ikut terhapus begitu container di-`rm`.

Verifikasi dari VPS:

```bash
# 9Router tidak punya endpoint /health - "/" (dashboard) dipakai sebagai bukti hidup.
curl -s -o /dev/null -w 'root: %{http_code}\n'      http://127.0.0.1:20128/
curl -s -o /dev/null -w 'v1/models: %{http_code}\n' http://127.0.0.1:20128/v1/models
```

Yang diharapkan: `root: 200` (atau 30x) dan `v1/models: 401`. **401 itu tandanya benar** -
artinya `REQUIRE_API_KEY=true` bekerja dan endpoint API menolak pemanggil tanpa key.
Kalau `v1/models` malah 200 tanpa key, router Anda terbuka - hentikan dan periksa
environment container sebelum menyambungkannya ke internet.

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

**Kalau dikelola dashboard** (kasus SahamLens - cloudflared dijalankan dengan token di
`/etc/cloudflared/token`, jadi seluruh konfigurasi rute ada di Cloudflare, bukan di VPS):

[one.dash.cloudflare.com](https://one.dash.cloudflare.com) -> **Networks** -> **Tunnels**
-> `sahamlens-prod` -> tab **Published application routes** -> Add.

Cloudflare mengganti nama bagian ini beberapa kali (dulu "Public Hostnames"); per
2026-08-13 labelnya "Published application routes". Kalau tidak ketemu, cari tab yang
BUKAN "Hostname routes" - yang itu untuk private network lewat WARP, bukan publikasi ke
internet.

Isi formnya:

| Field | Isi |
| --- | --- |
| Subdomain | `router` |
| Domain | `sahamlens.id` |
| **Path** | `^/v1(/.*)?$` |
| Service Type | `HTTP` |
| URL | `localhost:20128` |

Field **Path** menerima regular expression (Go syntax) - sama seperti key `path` di
config lokal. Dengan regex di atas, HANYA `/v1/...` yang diteruskan; `/dashboard` tidak
cocok aturan mana pun lalu jatuh ke catch-all tunnel dan dibalas 404. Jadi dashboard
tetap tertutup dari internet tanpa perlu Cloudflare Access.

DNS record `router.sahamlens.id` dibuat otomatis - jangan bikin A record manual.

Kalau nanti perlu membuka dashboard dari internet (mis. tidak bisa SSH tunnel), tambahkan
public hostname kedua dengan Path `^/dashboard` DAN lindungi dengan Cloudflare Access
(Zero Trust -> Access -> Applications, policy Allow hanya email Anda). Jangan dibuka
tanpa Access - isinya seluruh API key provider AI Anda.

### A4. Verifikasi

```bash
curl -s -o /dev/null -w 'v1/models: %{http_code}\n' https://router.sahamlens.id/v1/models
curl -s -o /dev/null -w 'dashboard: %{http_code}\n'  https://router.sahamlens.id/dashboard
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
3. Menunggu 9Router menjawab HTTP di `127.0.0.1:20128`.
4. Memasang config Nginx + minta sertifikat SSL Let's Encrypt.

Aman dijalankan ulang: password, config Nginx, dan volume data tidak pernah ditimpa.

Setelah selesai, cek dari laptop:

```bash
curl -s -o /dev/null -w 'v1/models: %{http_code}\n' https://router.DOMAIN-ANDA.com/v1/models
curl -s -o /dev/null -w 'dashboard: %{http_code}\n'  https://router.DOMAIN-ANDA.com/dashboard
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

## Langkah 6 - Uji SEBELUM menyentuh aplikasi production

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
| `No active credentials for provider: X` | Model `auto` memilih provider yang belum dipasang kredensialnya - isi `NINEROUTER_MODELS` eksplisit, atau tambah provider X di dashboard |
| `model ... tidak ada di instance ini` | Sama, tapi ketahuan sebelum request dikirim |
| `Semua pemeriksaan lolos` | Aman dipasang di `.env.production` |

**Jangan lanjut ke langkah 7 sebelum langkah ini lolos.**

## Langkah 7 - Pasang env var di aplikasi

SahamLens dilayani dari VPS ini juga (systemd `sahamlens.service`, next-server di
`127.0.0.1:3001`, di belakang Nginx). Env var-nya ada di
`/opt/sahamlens/app/.env.production`.

Cek dulu belum ada isian lama:

```bash
grep -c '^NINEROUTER_' /opt/sahamlens/app/.env.production
```

Kalau `0`, tambahkan:

```bash
sudo tee -a /opt/sahamlens/app/.env.production >/dev/null <<'ENVEOF'

# 9Router - proxy AI multi-provider (lihat docs/operations/9ROUTER.md)
NINEROUTER_BASE_URL=http://127.0.0.1:20128/v1
NINEROUTER_MODELS=ds/deepseek-v4-pro,xai/grok-4,gemini/gemini-3.6-flash,groq/llama-3.3-70b-versatile
ENVEOF
```

API key ditulis terpisah supaya tidak masuk `~/.bash_history`:

```bash
read -rsp "Tempel API key 9Router: " K; echo
printf 'NINEROUTER_API_KEY=%s\n' "$K" | sudo tee -a /opt/sahamlens/app/.env.production >/dev/null
unset K
# Memeriksa NILAI-nya, bukan cuma ada barisnya. `.\+` mewajibkan minimal satu karakter
# setelah tanda "=" - baris kosong `NINEROUTER_API_KEY=` TIDAK dihitung.
grep -c '^NINEROUTER_API_KEY=.\+' /opt/sahamlens/app/.env.production    # harus 1
```

**`BASE_URL` memakai `127.0.0.1`, bukan `router.sahamlens.id`** - aplikasi dan 9Router
satu mesin, jadi panggilannya tidak usah keluar ke internet: lebih cepat, dan bebas dari
batas 100 detik Cloudflare. Hostname publiknya tetap berguna untuk uji dari luar.

`NINEROUTER_MODELS` sebaiknya JANGAN dikosongkan di instance ini - defaultnya `auto`, dan
`auto` terbukti memilih provider yang belum dipasang kredensialnya.

Opsional: `NINEROUTER_PRIORITY`, `NINEROUTER_TIMEOUT_MS`, `NINEROUTER_PROMPT_BUDGET`
(lihat `.env.example`).

Lalu ambil kode terbaru dan restart:

```bash
cd /opt/sahamlens/app
git pull origin main
npm ci
npm run build
sudo systemctl restart sahamlens
sudo systemctl status sahamlens --no-pager | head -5
```

`npm run build` wajib - perubahan `lib/aiProviders.ts` ikut ke bundle server saat build,
bukan dibaca ulang saat restart. Env var sendiri dibaca saat runtime, jadi kalau HANYA
env yang berubah, cukup restart tanpa build.

## Langkah 8 - Verifikasi di production

SahamLens TIDAK punya halaman `/chat` - LensAI dihapus dari menu di commit `9d208be`,
yang tersisa hanya route API `app/api/chat`. Jadi verifikasinya lewat API, bukan UI:

```bash
curl -sS -w '\n[HTTP %{http_code} | %{time_total}s]\n' \
  http://127.0.0.1:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Apa itu PBV?"}'
```

Dipanggil ke `127.0.0.1:3001` (langsung ke next-server) supaya hasilnya murni soal
aplikasi + 9Router, tanpa dipengaruhi Nginx atau Cloudflare. Route ini mengizinkan tamu
dengan kuota, jadi tidak perlu login.

Yang menandakan 9Router dipakai: jawaban keluar, DAN `detailCode` TIDAK berisi
`NO_PROVIDER_CONFIGURED`. Kalau balasannya 503 `NO_PROVIDER_CONFIGURED`, berarti
`.env.production` belum terbaca - cek ejaan env var lalu restart service.

Lalu periksa log:

1. `sudo journalctl -u sahamlens -n 50`
2. Tidak ada baris `[AI:9router] ... HTTP xxx` = request sudah lewat 9Router dengan mulus.
3. Kalau ada `[AI:9router]` gagal tapi jawaban tetap keluar, itu cascade lama yang
   menyelamatkan - routernya bermasalah, balik ke langkah 6.
4. Log 9Router sendiri: `sudo docker logs --tail=50 9router` - di sini terlihat model
   mana yang benar-benar dipakai dan provider mana yang menjawab.

---

## Kalau ada masalah

| Gejala | Penyebab paling sering |
| --- | --- |
| `certbot` gagal | DNS belum propagasi (langkah 1), port 80 tertutup, atau record masih Proxied di Cloudflare |
| HTTP 524 dari router | Batas 100 detik Cloudflare terlampaui - turunkan `NINEROUTER_TIMEOUT_MS` atau pilih model lebih cepat |
| HTTP 502/1033 dari router | `cloudflared` mati atau container 9Router berhenti - cek `systemctl status cloudflared` dan `docker compose ps` |
| Request dari luar VPS diblokir | WAF/Bot Fight Mode Cloudflare - buat WAF skip rule untuk path `/v1/*`. Tidak berlaku kalau `BASE_URL` memakai `127.0.0.1` (tidak lewat Cloudflare sama sekali) |
| Env var terisi tapi tidak berpengaruh | Lupa `npm run build` + `systemctl restart sahamlens` setelah kode berubah |
| Tidak ada log `[AI:9router]` sama sekali, `docker logs 9router` kosong | 9Router tidak masuk cascade. Paling sering: `NINEROUTER_API_KEY=` tertulis dengan nilai KOSONG. Cek `grep -c '^NINEROUTER_API_KEY=.\+' <env>` harus 1, dan cari peringatan "NINEROUTER_API_KEY kosong" di `journalctl -u sahamlens` |
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

## Memindahkan data ke volume yang benar

Kalau container terlanjur berjalan dengan `-v 9router-data:/root/.9router` (path salah),
konfigurasi provider Anda ada di lapisan tulis container. Pindahkan tanpa kehilangan data:

```bash
# 1. Salin data keluar SELAGI container masih hidup
sudo docker cp 9router:/app/data /tmp/9router-data-backup
ls -la /tmp/9router-data-backup/db     # harus ada data.sqlite

# 2. Hentikan dan hapus container (data sudah aman di /tmp)
sudo docker stop 9router && sudo docker rm 9router

# 3. Buat volume baru dan isi dari salinan
sudo docker volume create 9router-data-app
sudo docker run --rm -v 9router-data-app:/dest -v /tmp/9router-data-backup:/src \
  alpine sh -c 'cp -a /src/. /dest/'

# 4. Jalankan ulang dengan volume di path yang benar
sudo docker run -d --name 9router --restart unless-stopped \
  -p 127.0.0.1:20128:20128 \
  -e PORT=20128 -e HOSTNAME=0.0.0.0 \
  -e REQUIRE_API_KEY=true -e AUTH_COOKIE_SECURE=true \
  -v 9router-data-app:/app/data \
  --log-opt max-size=10m --log-opt max-file=3 \
  decolua/9router:latest

# 5. Buktikan konfigurasinya utuh - API key lama harus tetap diterima
sleep 10
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:20128/v1/models \
  -H "Authorization: Bearer <API-KEY-ANDA>"
```

`INITIAL_PASSWORD` sengaja tidak disertakan lagi di langkah 4 - password dashboard sudah
tersimpan di dalam data yang dipindahkan. Simpan `/tmp/9router-data-backup` sampai Anda
yakin semuanya normal.

## Rollback

9Router tidak menggantikan apa pun - cascade provider lama tetap utuh. Untuk mematikan:
hapus (atau beri komentar `#`) baris `NINEROUTER_BASE_URL` dan `NINEROUTER_API_KEY` di
`/opt/sahamlens/app/.env.production`, lalu `sudo systemctl restart sahamlens`. Aplikasi
kembali memakai Gemini/Groq/OpenRouter/Kimi/NVIDIA seperti sebelumnya. Tidak perlu build
ulang - hanya env yang berubah.
