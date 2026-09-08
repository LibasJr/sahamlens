#!/usr/bin/env bash
# Regression test: card renderer must produce a real PNG without Telegram/network.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASE_DIR="$(mktemp -d)"
trap 'rm -rf "$CASE_DIR"' EXIT

bash -n "$ROOT/install.sh"
/usr/bin/python3 -m py_compile "$ROOT/ops-telegram-bot.py"
/usr/bin/python3 "$ROOT/ops-telegram-bot.py" render-test "$CASE_DIR/card.png"
[[ -s "$CASE_DIR/card.png" ]]
[[ "$(od -An -tx1 -N8 "$CASE_DIR/card.png" | tr -d ' \n')" == "89504e470d0a1a0a" ]]
/usr/bin/python3 - "$CASE_DIR/card.png" <<'PY'
import sys
from PIL import Image
image = Image.open(sys.argv[1])
assert image.format == 'PNG'
assert image.size == (1440, 900)
PY

echo 'ops-telegram-bot visual renderer test: PASS'
