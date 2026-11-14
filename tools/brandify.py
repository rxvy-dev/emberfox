#!/usr/bin/env python3
"""Emberfox brandify: swap Firefox branding for Emberfox branding.

  brandify.py dir  <branding-dir>    rebrand a branding directory in place
                                     (source tree: browser/branding/emberfox)
  brandify.py omni <install-dir>     rebrand an installed/extracted Firefox
                                     (rewrites browser/omni.ja + window icons)

Images are regenerated from branding/logo.svg at whatever size the original
file had, so this keeps working when Mozilla adds or resizes assets.
Needs: rsvg-convert, ImageMagick (convert/identify), unzip.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(ROOT, "branding")
LOGO = os.path.join(B, "logo.svg")
LOGO_SMALL = os.path.join(B, "logo-small.svg")
WORDMARK = os.path.join(B, "wordmark.svg")
TEXT_FILES = {
    "brand.ftl": os.path.join(B, "brand.ftl"),
    "brand.properties": os.path.join(B, "brand.properties"),
    "aboutDialog.css": os.path.join(B, "aboutDialog.css"),
    "firefox-branding.js": os.path.join(B, "emberfox-branding.js"),
    "configure.sh": os.path.join(B, "configure.sh"),
}


def run(*cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)


def size_of(path):
    out = subprocess.run(["identify", "-format", "%w %h\n", path], capture_output=True, text=True)
    w, h = out.stdout.split("\n")[0].split()
    return int(w), int(h)


def render(svg, w, h, out):
    tmp = out + ".tmp.png"
    if w == h:
        run("rsvg-convert", "-w", str(w), "-h", str(h), svg, "-o", tmp)
    else:  # fit inside, centered on transparent canvas
        side = min(w, h)
        run("rsvg-convert", "-w", str(side), "-h", str(side), svg, "-o", tmp)
        run("convert", tmp, "-background", "none", "-gravity", "center", "-extent", f"{w}x{h}", tmp)
    os.replace(tmp, out)


def render_about(w, h, out):
    """Logo above wordmark (Firefox's about.png composite)."""
    with tempfile.TemporaryDirectory() as t:
        lh = int(h * 0.68)
        run("rsvg-convert", "-w", str(lh), "-h", str(lh), LOGO, "-o", f"{t}/l.png")
        run("rsvg-convert", "-h", str(int(h * 0.26)), WORDMARK, "-o", f"{t}/w.png")
        run("convert", "-size", f"{w}x{h}", "xc:none",
            f"{t}/l.png", "-gravity", "north", "-composite",
            f"{t}/w.png", "-gravity", "south", "-composite", out)


def replace_png(path):
    name = os.path.basename(path).lower()
    w, h = size_of(path)
    if name.startswith("about.png") or name == "about.png":
        render_about(w, h, path)
    elif "wordmark" in name:
        render(WORDMARK, w, h, path)
    else:
        render(LOGO_SMALL if max(w, h) <= 32 else LOGO, w, h, path)


def replace_ico(path):
    with tempfile.TemporaryDirectory() as t:
        pngs = []
        for s in (16, 32, 48, 256):
            p = f"{t}/{s}.png"
            render(LOGO_SMALL if s <= 32 else LOGO, s, s, p)
            pngs.append(p)
        run("convert", *pngs, path)


ICON_PNG = re.compile(r"^(default\d+|icon\d+|about-logo.*|about|mozicon\d*|firefox.*|content-logo.*|pbmode.*|document.*|.*wordmark.*)\.png$", re.I)
LOGO_SVG = re.compile(r"^(about-logo.*|.*logo.*)\.svg$", re.I)
WORDMARK_SVG = re.compile(r"^.*wordmark.*\.svg$", re.I)


def brand_dir(d):
    """Rebrand every recognizable asset under directory d."""
    n = 0
    for base, _dirs, files in os.walk(d):
        for f in files:
            p = os.path.join(base, f)
            if f in TEXT_FILES:
                shutil.copyfile(TEXT_FILES[f], p)
            elif ICON_PNG.match(f):
                replace_png(p)
            elif f.lower().endswith(".ico"):
                replace_ico(p)
            elif WORDMARK_SVG.match(f):
                shutil.copyfile(WORDMARK, p)
            elif LOGO_SVG.match(f):
                shutil.copyfile(LOGO, p)
            else:
                continue
            n += 1
    return n


def rezip(src_dir, out_path):
    tmp = out_path + ".new"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for base, _dirs, files in os.walk(src_dir):
            for f in sorted(files):
                full = os.path.join(base, f)
                arc = os.path.relpath(full, src_dir)
                zi = zipfile.ZipInfo(arc, date_time=(2010, 1, 1, 0, 0, 0))
                zi.compress_type = zipfile.ZIP_DEFLATED
                zi.external_attr = 0o644 << 16
                with open(full, "rb") as fh:
                    z.writestr(zi, fh.read())
    os.replace(tmp, out_path)


def brand_install(inst):
    omni = os.path.join(inst, "browser", "omni.ja")
    if not os.path.isfile(omni):
        sys.exit(f"no browser/omni.ja under {inst}")
    with tempfile.TemporaryDirectory() as t:
        # Mozilla ships "optimized" jars python's zipfile rejects; unzip copes (rc 1/2 = warnings).
        r = subprocess.run(["unzip", "-q", "-o", omni, "-d", t], capture_output=True, text=True)
        if r.returncode not in (0, 1, 2):
            sys.exit(f"unzip failed ({r.returncode}):\n{r.stderr}")
        n = 0
        for rel in ("chrome/browser/content/branding",):
            p = os.path.join(t, rel)
            if os.path.isdir(p):
                n += brand_dir(p)
        # brand strings in every locale shipped
        for base, _d, files in os.walk(t):
            if os.path.basename(base) == "branding":
                for f in files:
                    if f in ("brand.ftl", "brand.properties"):
                        shutil.copyfile(TEXT_FILES[f], os.path.join(base, f)); n += 1
        # baked-in default prefs
        bp = os.path.join(t, "defaults", "preferences", "firefox-branding.js")
        if os.path.isfile(bp):
            shutil.copyfile(TEXT_FILES["firefox-branding.js"], bp); n += 1
        rezip(t, omni)
    # window / taskbar icons
    n += brand_dir(os.path.join(inst, "browser", "chrome", "icons", "default"))
    print(f"brandify: replaced {n} branding files in {inst}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("dir", "omni"):
        sys.exit(__doc__)
    if sys.argv[1] == "dir":
        print(f"brandify: replaced {brand_dir(sys.argv[2])} files in {sys.argv[2]}")
    else:
        brand_install(sys.argv[2])
