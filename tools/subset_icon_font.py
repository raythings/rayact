#!/usr/bin/env python3
"""Subset a Material Symbols icon font to only the glyphs an app uses.

The full MaterialSymbolsRounded.ttf is ~15 MB; an app typically uses a few dozen
icons. This produces a tiny subset (tens of KB) for bundling. Platform-agnostic —
desktop/android/web builds can all use it to avoid shipping the full catalog.

Usage:
  subset_icon_font.py <font.ttf> <icon_manifest.txt> <codepoint_map.js> <out.ttf>

  icon_manifest.txt : newline-delimited icon names (e.g. raym3 web-icons.txt; '#' comments)
  codepoint_map.js  : material_icons.js with `"name": 0xXXXX` entries (rayact-shared)

Requires `pyftsubset` (fonttools) on PATH. If unavailable, copies the full font so
the build still works (just larger).
"""
import re
import shutil
import subprocess
import sys


def main() -> int:
    if len(sys.argv) != 5:
        sys.stderr.write(__doc__)
        return 2
    font, manifest, cpmap, out = sys.argv[1:5]

    names = [
        l.strip()
        for l in open(manifest, encoding="utf-8")
        if l.strip() and not l.startswith("#")
    ]
    js = open(cpmap, encoding="utf-8").read()
    codepoints = dict(re.findall(r'"([A-Za-z0-9_]+)"\s*:\s*(0x[0-9a-fA-F]+)', js))

    unicodes, missing = [], []
    for n in names:
        cp = codepoints.get(n)
        (unicodes.append(cp) if cp else missing.append(n))
    if missing:
        sys.stderr.write(f"subset_icon_font: no codepoint for: {', '.join(missing)}\n")

    pyft = shutil.which("pyftsubset")
    if not pyft or not unicodes:
        sys.stderr.write("subset_icon_font: pyftsubset/glyphs unavailable; copying full font\n")
        shutil.copyfile(font, out)
        return 0

    uarg = ",".join("U+%04X" % int(c, 16) for c in unicodes)
    subprocess.check_call([pyft, font, f"--unicodes={uarg}", f"--output-file={out}"])
    sys.stderr.write(f"subset_icon_font: {len(unicodes)} glyphs -> {out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
