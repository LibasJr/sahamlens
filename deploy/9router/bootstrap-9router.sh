#!/usr/bin/env bash
#
# Bootstrap 9Router di VPS TANPA clone repo SahamLens.
#
# Repo SahamLens private, dan file deploy ini ada di branch fitur - jadi `git clone`
# di VPS butuh Personal Access Token. Skrip ini menghindari itu: dia menulis ketiga
# file deploy (docker-compose.yml, nginx-9router.conf, install-9router.sh) ke
# ~/9router, lalu Anda tinggal menjalankan installer-nya.
#
# Pakai:
#   nano ~/bootstrap-9router.sh     # tempel isi file ini, simpan
#   bash ~/bootstrap-9router.sh
#   cd ~/9router && sudo bash install-9router.sh --domain router.anda.com --email you@mail.com
#
# Isinya bisa dibaca semua - tidak ada base64 atau curl ke internet. Silakan periksa
# dulu sebelum dijalankan; installer-nya nanti butuh sudo.

set -euo pipefail

TARGET="${1:-$HOME/9router}"
mkdir -p "$TARGET"
cd "$TARGET"
echo "[bootstrap] Menulis file deploy ke $TARGET"

cat > docker-compose.yml <<'__9ROUTER_FILE_EOF__'
# 9Router - proxy AI multi-provider untuk cascade LensAI (lihat lib/aiProviders.ts).
#
# CATATAN KEAMANAN PALING PENTING: port di-bind ke 127.0.0.1, BUKAN 0.0.0.0.
# Image resmi 9Router default-nya bind ke 0.0.0.0 - kalau dibiarkan begitu, dashboard
# dan endpoint /v1 bisa diakses siapa pun yang tahu IP VPS, bahkan sebelum firewall
# sempat salah konfigurasi. Satu-satunya pintu masuk dari internet adalah Nginx
# (lihat nginx-9router.conf), yang memaksa HTTPS dan menutup /dashboard dari publik.

services:
  9router:
    # Diverifikasi 2026-08-13 lewat Docker Hub API: decolua/9router, tag latest = 0.5.50,
    # ~201rb pulls, sejalan dengan paket npm `9router` (maintainer decolua) dan repo
    # github.com/decolua/9router. JANGAN ganti ke "decocua/9router" - itu salah ketik yang
    # beredar di beberapa panduan pihak ketiga, dan repositorinya memang tidak ada.
    image: decolua/9router:latest
    container_name: 9router
    restart: unless-stopped
    # "127.0.0.1:" di depan itu bukan hiasan - itu yang bikin port ini tidak pernah
    # terekspos ke internet. Jangan dihapus.
    ports:
      - "127.0.0.1:20128:20128"
    environment:
      PORT: "20128"
      HOSTNAME: "0.0.0.0"
      # Wajib true: tanpa ini siapa pun yang bisa menjangkau port ini boleh memakai
      # seluruh kuota AI Anda tanpa API key.
      REQUIRE_API_KEY: "true"
      # Dashboard di belakang HTTPS - cookie auth-nya harus secure.
      AUTH_COOKIE_SECURE: "true"
      # Password login dashboard pertama kali. Diisi dari file .env di folder ini
      # (dibuat otomatis oleh install-9router.sh). Ganti lewat dashboard setelah login.
      INITIAL_PASSWORD: "${NINEROUTER_DASHBOARD_PASSWORD:?NINEROUTER_DASHBOARD_PASSWORD belum diisi di deploy/9router/.env}"
    volumes:
      # Config, API key, dan jwt-secret 9Router hidup di sini. JANGAN dihapus saat
      # update - semua akun provider yang sudah dipasang ikut hilang.
      - 9router-data:/root/.9router
    healthcheck:
      # 9Router TIDAK punya endpoint /health - endpoint resminya cuma /v1/chat/completions,
      # /v1/models, dan dashboard di "/" (diverifikasi 2026-08-13 dari README upstream;
      # beberapa panduan pihak ketiga menyebut /health, dan itu memang 404).
      # Dipakai "/" karena /v1/models butuh API key (REQUIRE_API_KEY=true) - status < 500
      # sudah cukup membuktikan prosesnya hidup dan melayani HTTP.
      # `node -e` dipakai, bukan curl/wget, karena image ini berbasis Node dan belum tentu
      # membawa keduanya.
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:20128/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    logging:
      # Tanpa batas ini, log request AI bisa memenuhi disk VPS kecil dalam hitungan minggu.
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  9router-data:
__9ROUTER_FILE_EOF__

cat > nginx-9router.conf <<'__9ROUTER_FILE_EOF__'
# Nginx reverse proxy untuk 9Router.
#
# Pasang di VPS sebagai /etc/nginx/sites-available/9router, lalu:
#   ln -s /etc/nginx/sites-available/9router /etc/nginx/sites-enabled/
#   certbot --nginx -d router.DOMAIN-ANDA.com     # mengisi blok SSL di bawah
#   nginx -t && systemctl reload nginx
#
# Ganti SEMUA "router.DOMAIN-ANDA.com" dengan domain Anda sebelum dipakai.

server {
    listen 80;
    listen [::]:80;
    server_name router.DOMAIN-ANDA.com;

    # certbot menambahkan blok redirect ke HTTPS di sini saat dijalankan.
    # Sebelum certbot jalan, biarkan HTTP apa adanya supaya challenge-nya bisa lewat.
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name router.DOMAIN-ANDA.com;

    # Baris ssl_certificate diisi otomatis oleh certbot --nginx.
    # ssl_certificate     /etc/letsencrypt/live/router.DOMAIN-ANDA.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/router.DOMAIN-ANDA.com/privkey.pem;

    # Prompt analisa saham bisa panjang; 1 MB cukup dan tetap membatasi abuse.
    client_max_body_size 1m;

    # Endpoint API - ini yang dipanggil SahamLens (NINEROUTER_BASE_URL).
    location /v1/ {
        proxy_pass http://127.0.0.1:20128;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 9Router melakukan fallback ke upstream-nya sendiri, jadi satu request bisa
        # berjalan lebih lama dari default Nginx (60s). 300s memberi ruang tanpa
        # membiarkan koneksi menggantung selamanya.
        proxy_connect_timeout 15s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;

        # Wajib untuk streaming SSE - tanpa ini respons ditahan Nginx sampai selesai.
        proxy_buffering off;
        proxy_cache off;
    }

    # CATATAN: tidak ada location /health di sini. 9Router tidak menyediakan endpoint itu
    # (cek 2026-08-13: cuma /v1/* dan dashboard di "/"). Untuk memantau dari luar, panggil
    # GET /v1/models dengan API key - itu sekaligus membuktikan router DAN autentikasinya
    # bekerja, bukan sekadar prosesnya hidup.

    # Dashboard TIDAK dibuka ke publik. Isinya seluruh API key provider Anda -
    # satu password bocor = semua akun AI ikut. Akses lewat SSH tunnel dari laptop:
    #   ssh -L 20128:127.0.0.1:20128 user@IP-VPS
    #   lalu buka http://127.0.0.1:20128/dashboard
    #
    # Kalau memang harus dibuka dari internet, hapus "deny all" di bawah, ganti
    # dengan "allow <IP-kantor-anda>;" lalu "deny all;" - jangan dibuka tanpa filter.
    location / {
        deny all;
        return 404;
    }
}
__9ROUTER_FILE_EOF__

cat > install-9router.sh <<'__9ROUTER_FILE_EOF__'
#!/usr/bin/env bash
#
# Pasang 9Router di VPS untuk dipakai cascade LensAI SahamLens.
#
# Pakai (dari folder deploy/9router di VPS):
#   sudo bash install-9router.sh                          # container saja (127.0.0.1)
#   sudo bash install-9router.sh --domain router.anda.com # + Nginx + SSL Let's Encrypt
#
# Aman dijalankan ulang: tidak menimpa password/konfigurasi yang sudah ada, dan tidak
# pernah menghapus volume data 9Router (tempat API key provider Anda disimpan).

set -euo pipefail

DOMAIN=""
EMAIL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email)  EMAIL="${2:-}"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -12
      exit 0 ;;
    *) echo "Argumen tidak dikenal: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log()  { echo "[9router] $*"; }
fail() { echo "[9router] GAGAL: $*" >&2; exit 1; }

# --- 1. Prasyarat ------------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "Docker belum terpasang. Pasang dulu: curl -fsSL https://get.docker.com | sh"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  fail "Docker Compose belum ada. Pasang plugin: apt-get install -y docker-compose-plugin"
fi

# --- 2. Password dashboard ---------------------------------------------------
# Dibuat sekali lalu dipakai terus. Kalau .env sudah ada, TIDAK ditimpa - menimpa
# password di sini tidak mengubah password yang sudah tersimpan di dalam volume
# 9Router, jadi hasilnya cuma bikin bingung.
if [[ -f .env ]]; then
  log ".env sudah ada - password dashboard yang lama dipertahankan."
else
  PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"
  umask 077
  printf 'NINEROUTER_DASHBOARD_PASSWORD=%s\n' "$PASSWORD" > .env
  log "Password dashboard dibuat dan disimpan di $SCRIPT_DIR/.env (chmod 600)."
fi
chmod 600 .env

# --- 3. Jalankan container ---------------------------------------------------
log "Menarik image terbaru..."
$COMPOSE pull

log "Menjalankan 9Router (bind 127.0.0.1:20128, tidak terekspos ke internet)..."
$COMPOSE up -d

log "Menunggu 9Router siap..."
for i in $(seq 1 30); do
  # 9Router tidak menyediakan /health - "/" dipakai sebagai bukti prosesnya melayani HTTP.
  if curl -fsS -o /dev/null http://127.0.0.1:20128/ 2>/dev/null; then
    log "9Router hidup di http://127.0.0.1:20128"
    break
  fi
  [[ $i -eq 30 ]] && fail "9Router tidak merespons HTTP setelah 60 detik. Cek: $COMPOSE logs --tail=50"
  sleep 2
done

# --- 4. Nginx + SSL (opsional) ----------------------------------------------
if [[ -n "$DOMAIN" ]]; then
  command -v nginx >/dev/null 2>&1 || fail "Nginx belum terpasang. Pasang dulu: apt-get install -y nginx"
  command -v certbot >/dev/null 2>&1 || fail "Certbot belum terpasang. Pasang dulu: apt-get install -y certbot python3-certbot-nginx"

  SITE=/etc/nginx/sites-available/9router
  if [[ -f "$SITE" ]]; then
    log "$SITE sudah ada - dibiarkan apa adanya (config manual Anda tidak ditimpa)."
  else
    sed "s/router\.DOMAIN-ANDA\.com/$DOMAIN/g" nginx-9router.conf > "$SITE"
    ln -sf "$SITE" /etc/nginx/sites-enabled/9router
    log "Config Nginx dipasang untuk $DOMAIN."
  fi

  nginx -t || fail "Config Nginx tidak valid - perbaiki dulu sebelum lanjut."
  systemctl reload nginx

  if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
    log "Sertifikat SSL untuk $DOMAIN sudah ada - certbot dilewati."
  else
    log "Meminta sertifikat SSL Let's Encrypt untuk $DOMAIN..."
    if [[ -n "$EMAIL" ]]; then
      certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
    else
      certbot --nginx -d "$DOMAIN" --redirect
    fi
  fi
  nginx -t && systemctl reload nginx
  BASE_URL="https://$DOMAIN"
else
  BASE_URL="(belum ada - jalankan ulang dengan --domain router.anda.com)"
fi

# --- 5. Langkah berikutnya ---------------------------------------------------
cat <<EOF

======================================================================
9Router sudah jalan.

1. Buka dashboard lewat SSH tunnel dari laptop Anda (JANGAN dibuka ke publik):

     ssh -L 20128:127.0.0.1:20128 $(whoami)@<IP-VPS>

   lalu buka http://127.0.0.1:20128/dashboard
   Password login ada di: $SCRIPT_DIR/.env

2. Di dashboard: Settings -> Providers, pasang akun AI Anda (Claude/GPT/Gemini/GLM/dst).
   Lalu Settings -> API Keys, buat satu API key untuk SahamLens dan salin.

3. Di laptop, uji koneksinya dari checkout SahamLens sebelum menyentuh Vercel:

     NINEROUTER_BASE_URL=$BASE_URL \\
     NINEROUTER_API_KEY=<key-dari-langkah-2> \\
     npm run check:9router

4. Kalau lolos, pasang dua env var itu di Vercel (Settings -> Environment Variables,
   scope Production + Preview, API key ditandai Sensitive), lalu redeploy.

Perintah harian:
  $COMPOSE logs -f          # lihat log
  $COMPOSE restart          # restart
  $COMPOSE pull && $COMPOSE up -d   # update ke versi terbaru
======================================================================
EOF
__9ROUTER_FILE_EOF__

chmod +x install-9router.sh
chmod 644 docker-compose.yml nginx-9router.conf

echo "[bootstrap] Selesai. Tiga file siap di $TARGET:"
ls -la "$TARGET"
cat <<'NEXT'

Langkah berikutnya:

  cd ~/9router
  sudo bash install-9router.sh --domain router.DOMAIN-ANDA.com --email email@anda.com

Pastikan DNS "router.DOMAIN-ANDA.com" sudah menunjuk ke IP VPS ini sebelum menjalankan
perintah di atas, kalau tidak permintaan sertifikat SSL akan gagal.
NEXT
