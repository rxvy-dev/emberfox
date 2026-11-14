#!/usr/bin/env bash
# Serve Ember Studio with mocked Firefox APIs, for design work in any browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/build/preview"
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r "$ROOT/ember/content/." "$OUT/"
cp "$ROOT/tools/preview/mock.js" "$OUT/"
sed -i 's#chrome://ember/content/#./#g' "$OUT/studio.css" "$OUT/studio.js"
python3 - "$OUT" <<'PY'
import re, sys
d = sys.argv[1]
s = open(f"{d}/studio.html").read()
s = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', s, flags=re.S)
s = s.replace("chrome://ember/content/", "./").replace('<script type="module"', '<script src="./mock.js"></script>\n  <script type="module"')
open(f"{d}/index.html", "w").write(s)
PY
echo "Ember Studio preview: http://127.0.0.1:8765  (Ctrl+C to stop)"
cd "$OUT" && exec python3 -m http.server 8765 --bind 127.0.0.1
