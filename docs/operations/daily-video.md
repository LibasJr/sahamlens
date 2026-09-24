# SahamLens Daily Video Generator + Telegram

Builds a vertical 1080×1920 MP4 recap every weekday at 06:00 Asia/Jakarta, then
sends it to a configured Telegram chat. The operator uploads the file to TikTok
manually — this system does **not** use the TikTok API.

## Design decisions

- **Data source**: the production SahamLens Next.js app's public HTTP endpoints
  (`/api/market-summary` and `/api/daily-picks`), not Yahoo directly. No financial
  facts are synthesized.
- **Fail-closed**: if the endpoints are unreachable, return zero candidates, or
  return stale data, the pipeline aborts *before* building a video. Nothing
  fabricated ever leaves this system.
- **Deterministic**: the same JSON payload → the same MP4 (frame content depends
  only on the payload dict, not wall-clock time or ambient state).
- **Telegram transport**: plain `curl` to `sendVideo`. No SDK dependency. Token is
  never logged or printed.
- **Dependencies**: Pillow (already in the Hermes agent venv) + ffmpeg (system).
  No pip install required; no production lockfile changes.

## Layout

```
scripts/tiktok/
├── main.py                       # CLI entry (render/send/dry-run)
├── video_renderer.py             # Pillow frame renderer
├── data_adapter.py               # API fetch + payload normalization
├── fixtures/                     # JSON fixtures for tests
│   ├── payload_full.json
│   ├── payload_zero_candidates.json
│   └── payload_one_candidate_bearish.json
└── tests/
    ├── test_renderer_and_adapter.py
    ├── test_main_pipeline.py
    ├── test_e2e_fail_closed.py
    └── dry_run_fixture.sh        # manual dry-run probe script
deploy/systemd/
├── sahamlens-daily-video.service
├── sahamlens-daily-video.timer
└── install-daily-video.sh
docs/operations/daily-video.md    # operational runbook
```

## Secret contract

| Variable | Required for | Source |
|----------|--------------|--------|
| `TELEGRAM_BOT_TOKEN` | `send` action only | Environment |
| `TELEGRAM_CHAT_ID` | `send` action only | Environment |

When either is missing, the `send` action exits with code 2 and refuses to run.
`render` and `dry-run` do not need them.

## Manual dry-run

```bash
# Uses fixture data (no live API, no Telegram):
SAHAMLENS_VIDEO_QUEUE=/tmp/sahamlens-dryrun \
  python3 scripts/tiktok/main.py render \
  --out /tmp/sahamlens_fixture.mp4 \
  --payload-file scripts/tiktok/fixtures/payload_full.json

# Probe result:
ffprobe -v quiet -print_format json -show_streams -show_format /tmp/sahamlens_fixture.mp4

# Expected output:
#   codec_name: h264
#   width: 1080
#   height: 1920
#   duration: ~10s
```

## Timer activation (operator decision only)

The systemd units live in `deploy/systemd/`. To activate:

```bash
sudo bash deploy/systemd/install-daily-video.sh
sudo systemctl enable --now sahamlens-daily-video.timer
sudo systemctl status sahamlens-daily-video.timer
```

The timer runs Mon–Fri at 06:00 Asia/Jakarta with `RandomizedDelaySec=120`.
`Persistent=true` catches up missed runs after downtime.

## Output retention

MP4s accumulate in `/var/lib/sahamlens/daily-video` (configurable via
`SAHAMLENS_VIDEO_QUEUE`). The pipeline prunes to the most recent 14 files.
At ~150 KB/minute of video, 14 files ≈ 2 MB — negligible disk footprint.

## Rollback / disable

```bash
sudo systemctl disable --now sahamlens-daily-video.timer
sudo systemctl stop sahamlens-daily-video.service
# Optionally remove the unit files:
sudo rm /etc/systemd/system/sahamlens-daily-video.{service,timer}
sudo systemctl daemon-reload
```

## Logging

All output goes to stdout/stderr, captured by the systemd journal:

```bash
journalctl -u sahamlens-daily-video.service --since "1 hour ago"
```

Secrets are never written to logs. The pipeline logs sanitized metadata
(candidate count, codec info, duration) only.
