#!/usr/bin/env python3
"""Render text in a TTF to an SVG <path> (outlined, no font needed at runtime).
usage: text2svg.py FONT.ttf "TEXT" out.svg [fill] [height]"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

font_path, text, out = sys.argv[1:4]
fill = sys.argv[4] if len(sys.argv) > 4 else "#e3121b"
target_h = float(sys.argv[5]) if len(sys.argv) > 5 else 120.0
f = TTFont(font_path)
gs = f.getGlyphSet(); cmap = f.getBestCmap(); hmtx = f["hmtx"]
kern = {}
x = 0; d_parts = []; bp = BoundsPen(gs)
for ch in text:
    g = cmap.get(ord(ch))
    if g is None:
        continue
    pen = SVGPathPen(gs)
    tp = TransformPen(pen, (1, 0, 0, -1, x, 0))   # flip y
    gs[g].draw(tp)
    gs[g].draw(TransformPen(bp, (1, 0, 0, -1, x, 0)))
    d_parts.append(pen.getCommands())
    x += hmtx[g][0]
xmin, ymin, xmax, ymax = bp.bounds
pad = 8
w, h = xmax - xmin, ymax - ymin
scale = target_h / h
W, H = w * scale + pad * 2, target_h + pad * 2
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.1f} {H:.1f}" width="{W:.0f}" height="{H:.0f}">
  <path fill="{fill}" transform="translate({pad - xmin*scale:.2f} {pad - ymin*scale:.2f}) scale({scale:.5f})" d="{' '.join(d_parts)}"/>
</svg>
'''
open(out, "w").write(svg)
print(f"{out}: {W:.0f}x{H:.0f}")
