#!/usr/bin/env bash
#
# Watchdog cloudflared - BARU (2026-08-14, insiden: sahamlens.id tidak bisa diakses
# meski aplikasi Node + database sehat. Log cloudflared menunjukkan "stream canceled by
# remote" berulang untuk banyak endpoint selama ~18 menit (19:27-19:45 WIB) sebelum
# di-restart manual - tunnel-nya diam-diam berhenti melayani trafik tanpa proses
# cloudflared benar-benar CRASH/exit, jadi `systemctl status` tetap terlihat "running"
# dan `Restart=on-failure` bawaan systemd TIDAK PERNAH terpicu (proses tidak exit).
#
# Cek ini SENGAJA lewat URL publik (https://sahamlens.id/api/health), bukan cuma
# `cloudflared tunnel info` atau localhost - itu satu-satunya cara memverifikasi jalur
# LENGKAP yang benar-benar dialami pengguna: Cloudflare edge -> tunnel -> nginx -> Next.js
# -> Postgres. /api/health sengaja dipilih karena sudah ada & publik tanpa auth (lihat
# app/api/health/route.ts), dan mengecek database - jadi ini juga menangkap origin yang
# mati, bukan cuma tunnel yang putus.
#
# 2 kegagalan BERTURUT-TURUT (bukan 1) sebelum restart - satu blip jaringan sesaat tidak
# boleh memicu restart, cuma kegagalan yang bertahan sampai pengecekan berikutnya.

set -euo pipefail

HEALTH_URL="https://sahamlens.id/api/health"
STATE_FILE="/var/run/sahamlens-cloudflared-watchdog.failcount"
FAIL_THRESHOLD=2
TIMEOUT_SEC=15

fail_count=0
[ -f "$STATE_FILE" ] && fail_count=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

if curl -sf --max-time "$TIMEOUT_SEC" -o /dev/null "$HEALTH_URL"; then
  if [ "$fail_count" != "0" ]; then
    echo "cloudflared-watchdog: sehat lagi setelah $fail_count kegagalan - reset counter"
  fi
  echo 0 > "$STATE_FILE"
  exit 0
fi

fail_count=$((fail_count + 1))
echo "cloudflared-watchdog: gagal cek $HEALTH_URL (percobaan ke-$fail_count)"

if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
  echo "cloudflared-watchdog: $fail_count kegagalan berturut-turut >= $FAIL_THRESHOLD - restart cloudflared"
  systemctl restart cloudflared
  echo 0 > "$STATE_FILE"
else
  echo "$fail_count" > "$STATE_FILE"
fi
