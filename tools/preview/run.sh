#!/usr/bin/env bash
# Serve Ignifox Studio with mocked Firefox APIs, for design work in any browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/build/preview"
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r "$ROOT/studio/content/." "$OUT/"
cp "$ROOT/tools/preview/mock.js" "$OUT/"
sed -i 's#chrome://ignifox/content/#./#g' "$OUT/studio.css" "$OUT/studio.js"
python3 - "$OUT" <<'PY'
import re, sys
d = sys.argv[1]
s = open(f"{d}/studio.html").read()
s = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', s, flags=re.S)
s = s.replace("chrome://ignifox/content/", "./").replace('<script type="module"', '<script src="./mock.js"></script>\n  <script type="module"')
open(f"{d}/index.html", "w").write(s)
PY
# sample new tab config so newtab/index.html renders on its own
cat > "$OUT/newtab/config.js" <<'CFG'
window.IGNI_NEWTAB = {"palette":{"bg":"#0b0607","bg2":"#170b0c","bg3":"#24110f","fg":"#f3e6e4","fgDim":"#a08c89","accent":"#ff3b1f","accent2":"#ffb02e","dark":true},
"radius":8,"layout":"center","wallpaper":"embers","dim":20,"blur":0,"clock":true,"clock24":false,"seconds":false,"date":true,"greeting":true,"name":"rxvy",
"search":true,"engineSwitcher":true,"engine":{"name":"DuckDuckGo","alias":"@ddg","url":"https://duckduckgo.com/?q={searchTerms}"},
"engines":[{"name":"DuckDuckGo","alias":"@ddg","url":"https://duckduckgo.com/?q={searchTerms}"},{"name":"Startpage","alias":"@sp","url":"https://www.startpage.com/sp/search?query={searchTerms}"},{"name":"YouTube","alias":"@yt","url":"https://www.youtube.com/results?search_query={searchTerms}"}],
"links":[{"title":"GitHub","url":"https://github.com"},{"title":"YouTube","url":"https://www.youtube.com"},{"title":"Reddit","url":"https://www.reddit.com"},{"title":"Wikipedia","url":"https://en.wikipedia.org"},{"title":"Arch Wiki","url":"https://wiki.archlinux.org"},{"title":"Hacker News","url":"https://news.ycombinator.com"}],
"columns":6,"tileStyle":"rounded","favicons":false,"notes":false,"noAutofocus":true};
CFG
echo "Ignifox Studio preview: http://127.0.0.1:8765  (Ctrl+C to stop)"
cd "$OUT" && exec python3 -m http.server 8765 --bind 127.0.0.1
