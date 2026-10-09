"""
分镜取景预览：用 Python 精确复刻 portrait.js 里的取景映射（屏幕 ↔ 原图像素），
把每个分镜实际会看到的画面渲染成 PNG，便于在没有浏览器的环境下核对构图。

取景映射是轴对齐的线性映射，所以「裁剪 + 缩放」与 shader 的结果完全等价。

用法：
  python3 tools/preview-frames.py                 # 1600×900 逐帧 + 拼图
  python3 tools/preview-frames.py --w 390 --h 844 # 手机竖屏
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from framing import BEATS, PORTRAIT, STUDIO, load_portrait, resolve_view, crop_frame  # noqa: E402

ASSETS = os.path.join(ROOT, "assets", "character")
OUT = os.path.join(ROOT, ".preview")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--view", default="front", choices=["front", "side", "back"])
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    img = load_portrait(ASSETS, args.view)
    W, H = args.w, args.h
    A = W / H
    shrink = PORTRAIT["portraitShrink"] if A < 1.05 else 1.0

    tiles = []
    for b in BEATS:
        visible_w = b["frame"]["w"] * shrink
        view = resolve_view(W, H, visible_w, b["frame"]["cy"])
        frame = crop_frame(img, view, PORTRAIT["cx"], W, H)
        path = os.path.join(args.out, f"{b['idx']}-{b['id']}.png")
        frame.save(path)
        head_pct = (100 - 8) / view["visibleH"] * 100
        print(f"{b['idx']} {b['id']:<9} cy={b['frame']['cy']:>4} w={b['frame']['w']:>5} "
              f"→ 可见 {view['visibleW']:.0f}×{view['visibleH']:.0f}px  头部占屏 {head_pct:5.1f}%  {path}")
        tiles.append((f"{b['idx']} {b['name']}", frame.resize((W // 3, H // 3), Image.LANCZOS)))

    # 拼图
    cols, rows = 3, (len(tiles) + 2) // 3
    tw, th = W // 3, H // 3
    label_h = 26
    sheet = Image.new("RGB", (cols * tw, rows * (th + label_h)), (243, 241, 236))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 17, index=0)
    except Exception:
        font = ImageFont.load_default()
    for i, (label, tile) in enumerate(tiles):
        cx_, cy_ = (i % cols) * tw, (i // cols) * (th + label_h)
        d.text((cx_ + 8, cy_ + 4), label, fill=(28, 27, 26), font=font)
        sheet.paste(tile, (cx_, cy_ + label_h))
    sheet_path = os.path.join(args.out, f"_sheet_{args.view}_{W}x{H}.png")
    sheet.save(sheet_path)
    print(f"\n拼图：{sheet_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
