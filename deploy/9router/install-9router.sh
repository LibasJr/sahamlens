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
