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
#
# YANG DIHITUNG GAGAL: hanya kegagalan TRANSPORT - tidak ada jawaban HTTP sama sekali
# (tunnel putus, origin mati, timeout). Kode status HTTP APA PUN - termasuk 503 -
# dihitung SEHAT untuk keperluan watchdog ini, dan itu bukan kelonggaran: kode status
# yang sampai ke sini MEMBUKTIKAN seluruh jalur Cloudflare edge -> tunnel -> nginx ->
# Next.js bekerja, yaitu tepat satu-satunya hal yang bisa diperbaiki dengan me-restart
# cloudflared. Sejak `/api/health` ikut menilai Redis (2026-08-25), `curl -sf` yang lama
# akan membaca "Redis mati" sebagai "tunnel putus" dan me-restart cloudflared berulang
# untuk masalah yang tidak bisa disentuhnya sama sekali.
#
# Degradasi di level aplikasi (503) BUKAN urusan skrip ini - itu tugas
# deploy/uptime-monitor/, yang memberi peringatan alih-alih me-restart.

set -euo pipefail

HEALTH_URL="https://sahamlens.id/api/health"
STATE_FILE="/var/run/sahamlens-cloudflared-watchdog.failcount"
FAIL_THRESHOLD=2
TIMEOUT_SEC=15

fail_count=0
[ -f "$STATE_FILE" ] && fail_count=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

http_code="$(curl -s --max-time "$TIMEOUT_SEC" -o /dev/null -w '%{http_code}' "$HEALTH_URL" || echo 000)"

# 000 = curl tidak pernah mendapat jawaban HTTP (DNS/TLS/timeout/koneksi ditolak).
if [ "$http_code" != "000" ]; then
  if [ "$fail_count" != "0" ]; then
    echo "cloudflared-watchdog: jalur pulih (HTTP $http_code) setelah $fail_count kegagalan - reset counter"
  fi
  echo 0 > "$STATE_FILE"
  exit 0
fi

fail_count=$((fail_count + 1))
echo "cloudflared-watchdog: tidak ada jawaban HTTP dari $HEALTH_URL (percobaan ke-$fail_count)"

if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
  echo "cloudflared-watchdog: $fail_count kegagalan berturut-turut >= $FAIL_THRESHOLD - restart cloudflared"
  systemctl restart cloudflared
  echo 0 > "$STATE_FILE"
else
  echo "$fail_count" > "$STATE_FILE"
fi
