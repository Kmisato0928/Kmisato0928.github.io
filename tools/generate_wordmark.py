#!/usr/bin/env python3
"""将 KAMISATO.txt 的字形转换为 SVG 路径，浏览器不再依赖字体。"""

import argparse
import math
from pathlib import Path
from xml.etree import ElementTree as ET

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parent.parent


def number(value):
    return f"{value:.3f}".rstrip("0").rstrip(".")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font", type=Path, default=Path("/System/Library/Fonts/Menlo.ttc"))
    parser.add_argument("--font-number", type=int, default=0)
    args = parser.parse_args()
    lines = [line.rstrip() for line in (ROOT / "KAMISATO.txt").read_text(encoding="utf-8").splitlines()]
    while lines and not lines[-1]:
        lines.pop()
    if not any(lines):
        raise SystemExit("艺术字文件为空，未生成图形。")

    font = TTFont(args.font, fontNumber=args.font_number)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = 26 / font["head"].unitsPerEm
    path_pen = SVGPathPen(glyphs, ntos=number)
    bounds_pen = BoundsPen(glyphs)

    for row, line in enumerate(lines):
        x = 0
        for character in line:
            if ord(character) not in cmap:
                raise SystemExit(f"指定字体缺少字形：{character!r}，未修改图形。")
            glyph = glyphs[cmap[ord(character)]]
            transform = (scale, 0, 0, -scale, x * scale, row * 26 * 1.03)
            glyph.draw(TransformPen(path_pen, transform))
            glyph.draw(TransformPen(bounds_pen, transform))
            x += glyph.width

    if bounds_pen.bounds is None:
        raise SystemExit("艺术字没有可绘制的轮廓，未修改图形。")
    x_min, y_min, x_max, y_max = bounds_pen.bounds
    # 向外取整，避免字形边缘被图像边界裁切。
    x_min, y_min = math.floor(x_min), math.floor(y_min)
    width, height = math.ceil(x_max) - x_min, math.ceil(y_max) - y_min
    svg = ET.Element("svg", {
        "xmlns": "http://www.w3.org/2000/svg",
        "viewBox": f"{x_min} {y_min} {width} {height}",
        "width": str(width), "height": str(height),
    })
    ET.SubElement(svg, "title").text = "KAMISATO"
    ET.SubElement(svg, "path", {"fill": "#e8edea", "d": path_pen.getCommands()})
    output = ROOT / "assets" / "kamisato-wordmark.svg"
    output.parent.mkdir(exist_ok=True)
    output.write_text(ET.tostring(svg, encoding="unicode") + "\n", encoding="utf-8")
    print(f"已生成 {output.relative_to(ROOT)}（{width} × {height}），无文本或字体依赖。")


if __name__ == "__main__":
    main()
