#!/usr/bin/env bash
#
# Pengawas pengumpulan bar intraday - BARU (2026-09-24).
#
# KENAPA INI ADA. Gerbang "hari bursa OOS >= 60" pada Intraday Validation Lab dihitung
# HANYA dari sinyal yang dibuat SETELAH protokol dibekukan (lihat getIntradayCoverage
# dengan freezeTimestamp). Artinya gerbang itu tidak bisa dikejar dengan data lama -
# ia hanya bisa dikejar dengan DATA BARU YANG MASUK TIAP HARI BURSA. Kalau satu hari
# bursa terlewat tanpa alarm, hitungan 60 hari mundur satu hari dan tidak ada yang tahu:
# `sahamlens-intraday-collect.timer` yang gagal TIDAK mengirim apa pun ke siapa pun.
#
# Skrip ini melaporkan apa adanya, dan TIDAK menyentuh kriteria/ambang validasi:
#   1. job `intraday-collect` sudah SUCCESS hari ini? (hari kerja)
#   2. `intraday_signals` punya baris untuk tanggal bursa terakhir?
#      Bursa libur dibedakan dari kegagalan: kalau job pasar lain (screener-scan) juga
#      tidak jalan hari ini, kemungkinan besar libur - dicatat sebagai catatan, bukan masalah.
#   3. Progres gerbang: hari bursa terkumpul SETELAH freeze vs yang diwajibkan.
#
# TIDAK me-restart apa pun dan TIDAK mengubah data. Kalau SAHAMLENS_ALERT_WEBHOOK diisi,
# peringatan dikirim ke sana; kalau tidak, semuanya tetap masuk journal:
# `journalctl -u sahamlens-intraday-watchdog`.

set -uo pipefail

APP_DIR="${SAHAMLENS_APP_DIR:-/opt/sahamlens/app}"
DB_URL="${DATABASE_URL:-}"
WEBHOOK="${SAHAMLENS_ALERT_WEBHOOK:-}"

problems=()
notes=()
problem() { problems+=("$1"); echo "intraday-watchdog: MASALAH - $1" >&2; }
note() { notes+=("$1"); echo "intraday-watchdog: $*"; }

if [ -z "$DB_URL" ]; then
  echo "intraday-watchdog: DATABASE_URL kosong - tidak bisa memeriksa apa pun" >&2
  exit 2
fi

q() { psql "$DB_URL" -tAq -c "$1" 2>/dev/null | tr -d '[:space:]'; }

today="$(TZ=Asia/Jakarta date +%F)"
dow="$(TZ=Asia/Jakarta date +%u)"   # 1=Senin .. 7=Minggu
jam="$(TZ=Asia/Jakarta date +%H)"
# Timer pengawas jalan 18:30 WIB, sesudah collect 17:30 WIB. Pemeriksaan "hari ini" sengaja
# tidak dijalankan sebelum 18:00 supaya pemanggilan manual pagi/siang tidak memunculkan
# alarm palsu untuk job yang memang belum jadwalnya.
after_close=1
[ "$jam" -lt 18 ] && after_close=0

# --- 1. job collect hari ini -----------------------------------------------------------------
if [ "$dow" -le 5 ] && [ "$after_close" = "1" ]; then
  # Timer pengawas jalan 18:30 WIB, sesudah collect 17:30 WIB. Pemeriksaan ini sengaja
  # tidak dijalankan sebelum 18:00 supaya pemanggilan manual pagi/siang tidak memunculkan
  # alarm palsu untuk job yang memang belum jadwalnya.
  collect_ok="$(q "select count(*) from job_run_log where job_name = 'intraday-collect' and status = 'SUCCESS' and (started_at at time zone 'Asia/Jakarta')::date = date '${today}'")"
  if [ "${collect_ok:-0}" = "0" ]; then
    problem "job intraday-collect belum SUCCESS untuk ${today} - bar hari ini tidak terkumpul"
  else
    note "job intraday-collect SUCCESS hari ini (${today})"
  fi
elif [ "$dow" -le 5 ]; then
  note "sebelum 18:00 WIB - pemeriksaan job hari ini dilewati (jadwal collect 17:30)"
fi

# --- 2. baris data untuk tanggal bursa terakhir ----------------------------------------------
last_day="$(q "select coalesce(max(trading_date)::text, 'kosong') from intraday_signals")"
last_day_rows="$(q "select count(*) from intraday_signals where trading_date = (select max(trading_date) from intraday_signals)")"
if [ "$dow" -le 5 ] && [ "$after_close" = "1" ] && [ "$last_day" != "$today" ]; then
  other_ok="$(q "select count(*) from job_run_log where job_name = 'screener-scan' and status = 'SUCCESS' and (started_at at time zone 'Asia/Jakarta')::date = date '${today}'")"
  if [ "${other_ok:-0}" != "0" ]; then
    problem "bursa tampak buka (job pasar lain jalan hari ini) tetapi bar intraday terakhir masih ${last_day}"
  else
    note "bar intraday terakhir ${last_day}; job pasar lain juga belum jalan hari ini - kemungkinan libur bursa, bukan kegagalan"
  fi
else
  note "bar intraday terakhir ${last_day} (${last_day_rows} baris)"
fi

# --- 3. progres gerbang hari OOS -------------------------------------------------------------
progress="$(psql "$DB_URL" -tAq -F'|' -c "
  with p as (
    select freeze_timestamp,
           coalesce((acceptance_criteria ->> 'minOosTradingDays')::int, 0) as required
      from intraday_oos_protocols
     where status = 'FROZEN'
     order by freeze_timestamp desc
     limit 1
  )
  select count(distinct s.trading_date)::text, p.required::text,
         to_char(p.freeze_timestamp at time zone 'Asia/Jakarta', 'YYYY-MM-DD')
    from p
    left join intraday_signals s on s.created_at > p.freeze_timestamp
   group by p.required, p.freeze_timestamp" 2>/dev/null | head -1)"

if [ -n "${progress:-}" ]; then
  have="$(echo "$progress" | cut -d'|' -f1)"
  need="$(echo "$progress" | cut -d'|' -f2)"
  since="$(echo "$progress" | cut -d'|' -f3)"
  if [ -n "$have" ] && [ -n "$need" ] && [ "$need" != "0" ]; then
    sisa=$(( need - have ))
    [ "$sisa" -lt 0 ] && sisa=0
    note "progres gerbang OOS: ${have}/${need} hari bursa sejak freeze ${since} (sisa ${sisa} hari bursa)"
  fi
fi

# --- laporan ----------------------------------------------------------------------------------
if [ "${#problems[@]}" -gt 0 ]; then
  body="Pemantau intraday SahamLens menemukan ${#problems[@]} masalah di ${today}:
$(printf -- '- %s\n' "${problems[@]}")
Catatan pendukung:
$(printf -- '- %s\n' "${notes[@]}")
Periksa: journalctl -u sahamlens-intraday-collect -n 50"
  if [ -n "$WEBHOOK" ]; then
    curl -s --max-time 15 -X POST -H 'Content-Type: application/json' \
      --data "$(printf '{"text":%s}' "$(printf '%s' "$body" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
      "$WEBHOOK" >/dev/null || echo "intraday-watchdog: webhook gagal dikirim" >&2
  fi
  exit 1
fi

echo "intraday-watchdog: OK - tidak ada masalah pada pengumpulan bar intraday"
exit 0