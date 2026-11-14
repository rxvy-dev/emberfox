#!/usr/bin/env python3
"""Drive the real Ignifox desktop build and check its own features work inside it.

    xvfb-run python3 tools/desktop-features-test.py <ignifox-*.tar.xz> <output dir>

Uses Firefox's built-in automation (Marionette, through Selenium + geckodriver) and a small
local web server for test pages. Saves a screenshot after each step. Needs: selenium, ImageMagick.
"""
import http.server
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import traceback

from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

TARBALL, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
PORT = 8765
results = []

# ------------------------------------------------------------------ test pages
SITE = tempfile.mkdtemp()


def solid_png(rgb, size=16):
    """A plain-colour PNG, built by hand so the test needs no imaging library."""
    import struct
    import zlib
    raw = b"".join(b"\x00" + bytes(rgb) * size for _ in range(size))
    chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


RED_PNG = solid_png((230, 20, 20))
pages = {
    "panel.html": "<!doctype html><title>Panel OK</title><body style='background:#123;color:#fff'><h1>Web panel works</h1>",
    "red.html": "<!doctype html><title>Red site</title><link rel=icon href=red.png><body><h1>A red site</h1>",
    "cookie.html": "<!doctype html><title>Cookie</title><script>document.cookie='igni_test=1; max-age=3600; path=/';"
                   "localStorage.setItem('igni', '1')</script><body>cookie set",
    "feed.xml": "<?xml version='1.0'?><rss><channel><title>Ignifox Test Feed</title>"
                "<item><title>First headline</title><link>https://example.org/1</link><pubDate>Sat, 14 Nov 2026 10:00:00 +0000</pubDate></item>"
                "<item><title>Second headline</title><link>https://example.org/2</link></item></channel></rss>",
    "plain.html": "<!doctype html><title>Plain</title><body><p>Nothing here uses Ctrl+K.</p>",
}
for name, body in pages.items():
    with open(os.path.join(SITE, name), "w") as f:
        f.write(body)
with open(os.path.join(SITE, "red.png"), "wb") as f:
    f.write(RED_PNG)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=SITE, **k)

    def log_message(self, *a):
        pass


threading.Thread(target=http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Quiet).serve_forever, daemon=True).start()
BASE = f"http://localhost:{PORT}"

# ------------------------------------------------------------------ browser
work = tempfile.mkdtemp()
with tarfile.open(TARBALL) as t:
    t.extractall(work, filter="fully_trusted")
opts = Options()
opts.binary_location = os.path.join(work, "ignifox", "firefox")

for k, v in {
    "ignifox.firstrun.done": True,
    "browser.shell.checkDefaultBrowser": False,
    "ignifox.update.check": False,
    "browser.tabs.warnOnClose": False,
    "browser.sessionstore.resume_from_crash": False,
}.items():
    opts.set_preference(k, v)
# Recent Firefox only lets automation run code in the browser itself when the driver asks for it.
drv = webdriver.Firefox(options=opts, service=Service(service_args=["--allow-system-access"]))
drv.set_window_size(1280, 800)
drv.set_window_position(0, 0)

PRE = """
const { IgniFeatures } = ChromeUtils.importESModule("chrome://ignifox/content/features.sys.mjs");
const { IgniBoot } = ChromeUtils.importESModule("chrome://ignifox/content/boot.sys.mjs");
const win = window;
"""


def chrome(js, *args):
    drv.set_context("chrome")
    try:
        return drv.execute_script(PRE + js, *args)
    finally:
        drv.set_context("content")


def chrome_async(js, *args):
    drv.set_context("chrome")
    try:
        return drv.execute_async_script(PRE + "const done = arguments[arguments.length - 1];\n" + js, *args)
    finally:
        drv.set_context("content")


def shot(name):
    time.sleep(0.6)
    subprocess.run(["import", "-window", "root", os.path.join(OUT, f"feature-{name}.png")], check=False)


def wait_for(fn, what, timeout=20):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        try:
            last = fn()
            if last:
                return last
        except Exception as e:  # noqa: BLE001
            last = f"{type(e).__name__}: {getattr(e, 'msg', '') or e}"
        time.sleep(0.3)
    raise AssertionError(f"timed out waiting for {what} (last: {last!r})")


def check(name):
    def wrap(fn):
        try:
            fn()
            results.append((name, True, ""))
            print(f"  ✓ {name}", flush=True)
        except Exception as e:  # noqa: BLE001
            results.append((name, False, str(e)))
            print(f"  ✗ {name}: {e}", flush=True)
            traceback.print_exc()
            shot(f"{name.split()[0].lower()}-failed")
        return fn
    return wrap


def set_prefs(prefs):
    chrome("""
      for (const [k, v] of Object.entries(arguments[0])) {
        if (typeof v == "boolean") Services.prefs.setBoolPref(k, v);
        else if (typeof v == "number") Services.prefs.setIntPref(k, v);
        else Services.prefs.setStringPref(k, v);
      }""", prefs)


print("Ignifox features in the real browser", flush=True)
wait_for(lambda: chrome("return !!win._igniFeatures"), "Ignifox engine to start", 60)
drv.get(f"{BASE}/plain.html")


@check("Command palette opens with Ctrl+K and finds actions")
def _():
    assert chrome("return document.getElementById('key_search')?.getAttribute('disabled')") == "true", \
        "Firefox's own Ctrl+K should be switched off while the palette is on"
    drv.find_element("tag name", "body").click()
    # A real key press from the X server, so it travels the same path as a person's would
    # (WebDriver's own key events stay inside the page and never reach browser shortcuts).
    wid = subprocess.run(["xdotool", "search", "--onlyvisible", "--name", "Plain"], capture_output=True, text=True).stdout.split()
    assert wid, "couldn't find the browser window"
    subprocess.run(["xdotool", "windowfocus", "--sync", wid[-1]], check=False)
    time.sleep(0.5)
    subprocess.run(["xdotool", "key", "--clearmodifiers", "ctrl+k"], check=True)
    wait_for(lambda: chrome("return !!document.getElementById('igni-palette')"), "the palette to open after Ctrl+K", 5)
    chrome("""const i = document.getElementById('igni-palette-input'); i.value = 'dupl';
              i.dispatchEvent(new Event('input'));""")
    first = wait_for(lambda: chrome("return document.querySelector('#igni-palette-list li .lbl')?.textContent"), "results")
    assert "Duplicate" in first, f"first result was {first!r}"
    chrome("""const i = document.getElementById('igni-palette-input'); i.value = 'theme synth';
              i.dispatchEvent(new Event('input'));""")
    shot("palette")
    n = chrome("return document.querySelectorAll('#igni-palette-list li').length")
    assert n > 0, "no results for 'theme synth'"
    chrome("IgniFeatures.closePalette(win)")


@check("Workspaces hide other tabs and paint their own theme")
def _():
    set_prefs({
        "ignifox.workspaces.list": json.dumps([
            {"id": "main", "name": "Main", "icon": "🔥", "theme": ""},
            {"id": "game", "name": "Gaming", "icon": "🎮", "theme": "toxic"}]),
        "ignifox.workspaces.enabled": True,
    })
    chrome(f"gBrowser.addTrustedTab('{BASE}/plain.html?a'); gBrowser.addTrustedTab('{BASE}/plain.html?b');")
    main_visible = chrome("return gBrowser.visibleTabs.length")
    chrome("IgniFeatures.applyWorkspace(win, 'game')")
    wait_for(lambda: chrome("return gBrowser.visibleTabs.length") == 1, "only the new workspace's tab to show")
    bg = chrome("return document.documentElement.style.getPropertyValue('--igni-bg').trim()")
    toxic = chrome("const { THEMES } = ChromeUtils.importESModule('chrome://ignifox/content/prefs.sys.mjs'); return THEMES.toxic.bg")
    assert bg.lower() == toxic.lower(), f"window bg {bg} is not the Toxic theme's {toxic}"
    label = chrome("return document.getElementById('igni-workspaces')?.getAttribute('label')")
    assert label and "Gaming" in label, f"workspace button says {label!r}"
    shot("workspace-gaming")
    chrome("IgniFeatures.applyWorkspace(win, 'main')")
    wait_for(lambda: chrome("return gBrowser.visibleTabs.length") == main_visible, "the main workspace's tabs to come back")
    set_prefs({"ignifox.workspaces.enabled": False})
    total = chrome("return gBrowser.tabs.length")
    wait_for(lambda: chrome("return gBrowser.visibleTabs.length") == total, "all tabs to show with workspaces off")


@check("Web panel loads a site beside the page")
def _():
    set_prefs({"ignifox.panels.list": json.dumps([{"url": f"{BASE}/panel.html", "title": "Test"}]), "ignifox.panels.enabled": True})
    wait_for(lambda: chrome("return document.querySelectorAll('#igni-panel-strip .igni-panel-icon').length") >= 2, "the panel strip")
    chrome(f"IgniFeatures.showPanel(win, '{BASE}/panel.html')")
    title = wait_for(lambda: chrome("return IgniFeatures.currentPanelBrowser(win)?.contentTitle"), "the panel page to load")
    assert title == "Panel OK", f"panel title {title!r}"
    w = chrome("return Math.round(document.getElementById('igni-panel-view').getBoundingClientRect().width)")
    assert w > 200, f"panel is only {w}px wide"
    shot("web-panel")
    chrome("IgniFeatures.showPanel(win, null)")
    set_prefs({"ignifox.panels.enabled": False})


@check("Site tint takes the colour of the site's icon")
def _():
    set_prefs({"ignifox.theme.siteTint": True})
    drv.get(f"{BASE}/red.html")
    wait_for(lambda: chrome("return document.documentElement.hasAttribute('igni-sitetint')"), "the toolbar tint")
    color = chrome("return document.documentElement.style.getPropertyValue('--igni-site').trim()")
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    assert r > 180 and g < 80 and b < 80, f"tint {color} is not red"
    shot("site-tint")
    set_prefs({"ignifox.theme.siteTint": False})


@check("Cookie auto-delete clears a closed site, keep-list protects it")
def _():
    # Its own host: earlier steps leave localhost tabs open, and an open site is never cleaned.
    site = f"http://127.0.0.1:{PORT}"
    set_prefs({"ignifox.privacy.autoDelete": True, "ignifox.privacy.keepSites": ""})
    count = "return Services.cookies.getCookiesFromHost('127.0.0.1', {}).length"
    chrome(f"gBrowser.selectedTab = gBrowser.addTrustedTab('{site}/cookie.html')")
    wait_for(lambda: chrome(count) > 0, "the test cookie")
    chrome("gBrowser.removeTab(gBrowser.selectedTab)")
    wait_for(lambda: chrome(count) == 0, "the cookie to be deleted after the grace period", 40)
    set_prefs({"ignifox.privacy.keepSites": "127.0.0.1"})
    chrome(f"gBrowser.selectedTab = gBrowser.addTrustedTab('{site}/cookie.html')")
    wait_for(lambda: chrome(count) > 0, "the test cookie again")
    chrome("gBrowser.removeTab(gBrowser.selectedTab)")
    time.sleep(20)
    assert chrome(count) > 0, "a kept site's cookie was deleted"
    set_prefs({"ignifox.privacy.autoDelete": False})


@check("Unload other tabs frees background tabs")
def _():
    chrome(f"""const t = gBrowser.addTrustedTab('{BASE}/plain.html?bg');""")
    wait_for(lambda: chrome("return [...gBrowser.tabs].some(t => !t.selected && t.linkedPanel && !t.hasAttribute('pending'))"),
             "a loaded background tab")
    n = chrome("return IgniFeatures.unloadOtherTabs(win)")
    assert n >= 1, "nothing was unloaded"
    still = chrome("return [...gBrowser.tabs].filter(t => !t.selected && t.linkedPanel && !t.hasAttribute('pending')).length")
    assert still == 0, f"{still} background tabs still loaded"


@check("New tab widgets and news feed show on the page")
def _():
    set_prefs({
        "ignifox.newtab.feeds": f"{BASE}/feed.xml", "ignifox.newtab.todo": True,
        "ignifox.newtab.countdown.title": "Release", "ignifox.newtab.countdown.date": "2027-01-01T00:00",
        "ignifox.newtab.wallpaper": "flames",
    })
    items = chrome_async("IgniBoot.refreshFeeds().then(i => done(i.length), e => done(String(e)))")
    assert items == 2, f"feeds.js got {items!r} headlines"
    chrome_async("IgniBoot.writeNewtabConfig().then(() => done(1), e => done(String(e)))")
    url = chrome("return IgniBoot.newtabURL()")
    drv.switch_to.new_window("tab")       # the earlier unload step may have unloaded the old one
    drv.get(url)
    wait_for(lambda: drv.execute_script("return document.querySelectorAll('#feed-list li').length") == 2, "headlines on the page")
    assert drv.execute_script("return !document.getElementById('todo').hidden"), "to-do widget hidden"
    assert "Release" in drv.execute_script("return document.getElementById('cd-title').textContent")
    drv.find_element("id", "todo-in").send_keys("Ship Ignifox" + Keys.ENTER)
    assert drv.execute_script("return document.querySelectorAll('#todo-list li').length") == 1
    shot("newtab-widgets")


failed = [r for r in results if not r[1]]
if failed:
    print("\nIgnifox messages from the browser console:")
    for line in chrome("return Services.console.getMessageArray().map(m => m.message).filter(m => /Ignifox/.test(m)).slice(-40)") or []:
        print("   ", line[:400])
drv.quit()
print(f"\n{len(results) - len(failed)}/{len(results)} feature checks passed")
with open(os.path.join(OUT, "features.json"), "w") as f:
    json.dump([{"check": n, "ok": ok, "error": e} for n, ok, e in results], f, indent=2)
sys.exit(1 if failed else 0)
