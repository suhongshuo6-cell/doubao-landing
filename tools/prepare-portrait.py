"""
立绘预处理：把 assets/character/*.png 放大并锐化，输出同名 .webp 供页面使用。

为什么要放大：
  原图 1280×720，而"面部大特写"要把头部（约 92px 高）铺满约 900px 的屏幕高度，
  直接从原图采样是 ~10x 放大，会糊成一片。先用 Lanczos 放大 + 反锐化掩模预处理，
  再交给 GPU 双线性采样，观感会明显更实。
  如果之后换成更高分辨率的立绘，直接替换 PNG 重跑本脚本即可（会自动跳过不必要的放大）。

用法：python3 tools/prepare-portrait.py [--scale 2] [--quality 90]
"""
import argparse
import os
import sys

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "assets", "character")
NAMES = ["front", "side", "back"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=2.0, help="放大倍数（原图不足时生效）")
    ap.add_argument("--quality", type=int, default=90, help="WebP 质量")
    ap.add_argument("--max-width", type=int, default=4096, help="输出最大宽度（避免超过移动端最大纹理尺寸）")
    args = ap.parse_args()

    if not os.path.isdir(SRC_DIR):
        print(f"找不到 {SRC_DIR}", file=sys.stderr)
        return 1

    for name in NAMES:
        src = os.path.join(SRC_DIR, f"{name}.png")
        if not os.path.exists(src):
            print(f"跳过 {name}：没有 {src}")
            continue
        im = Image.open(src).convert("RGB")
        w0, h0 = im.size
        target_w = min(int(round(w0 * args.scale)), args.max_width)
        target_w = max(target_w, w0)  # 不缩小
        if target_w > w0:
            k = target_w / w0
            im = im.resize((target_w, int(round(h0 * k))), Image.LANCZOS)
            # 反锐化掩模：放大后补回边缘锐度（对高倍特写帮助很大）
            im = im.filter(ImageFilter.UnsharpMask(radius=1.6, percent=105, threshold=3))
        out = os.path.join(SRC_DIR, f"{name}.webp")
        im.save(out, "WEBP", quality=args.quality, method=6)
        print(f"{name}: {w0}×{h0} -> {im.size[0]}×{im.size[1]}  "
              f"png {os.path.getsize(src)//1024}KB -> webp {os.path.getsize(out)//1024}KB")

    # 顺便报告一下画面边缘的背景色（页面用它做「消失在背景里」的兜底色）
    try:
        import numpy as np
        for name in NAMES:
            p = os.path.join(SRC_DIR, f"{name}.png")
            if not os.path.exists(p):
                continue
            a = np.asarray(Image.open(p).convert("RGB")).astype(float)
            edge = np.concatenate([a[:, :40].reshape(-1, 3), a[:, -40:].reshape(-1, 3)], 0)
            c = edge.mean(0)
            print(f"{name} 边缘背景色 ≈ rgb({c[0]:.0f},{c[1]:.0f},{c[2]:.0f})  "
                  f"#{int(c[0]):02X}{int(c[1]):02X}{int(c[2]):02X}")
    except ImportError:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
