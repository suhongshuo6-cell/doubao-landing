"""把 src/config.js 的取景参数与 portrait.js 的取景数学搬到 Python，供预览脚本复刻。"""
import json
import os
import re

from PIL import Image

STUDIO = (207, 201, 201)


def _read_config():
    """从 src/config.js 里读回取景参数，避免两处手写不一致"""
    src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "config.js"),
               encoding="utf-8").read()

    def num(pattern, default):
        m = re.search(pattern, src)
        return float(m.group(1)) if m else default

    portrait = {
        "imgW": int(num(r"imgW:\s*([\d.]+)", 1280)),
        "imgH": int(num(r"imgH:\s*([\d.]+)", 720)),
        "cx": num(r"cx:\s*([\d.]+)", 645),
        "portraitShrink": num(r"portraitShrink:\s*([\d.]+)", 0.42),
    }
    beats = []
    for m in re.finditer(
            r"\{\s*id:\s*'(\w+)',\s*idx:\s*'(\d+)',\s*name:\s*'([^']+)',\s*en:\s*'[^']*',\s*"
            r"frame:\s*\{\s*cy:\s*([\d.]+),\s*w:\s*([\d.]+)\s*\}\s*\}", src):
        beats.append({"id": m.group(1), "idx": m.group(2), "name": m.group(3),
                      "frame": {"cy": float(m.group(4)), "w": float(m.group(5))}})
    return portrait, beats


PORTRAIT, BEATS = _read_config()


def load_portrait(assets_dir, view="front"):
    for ext in (".webp", ".png"):
        p = os.path.join(assets_dir, f"{view}{ext}")
        if os.path.exists(p):
            return Image.open(p).convert("RGB")
    im = Image.new("RGB", (PORTRAIT["imgW"], PORTRAIT["imgH"]), STUDIO)
    return im


def resolve_view(W, H, visible_w, cy):
    """与 portrait.js 的 resolveView 完全一致"""
    A = W / H
    halfW = visible_w / 2
    halfH = halfW / A
    return {"cx": PORTRAIT["cx"], "cy": cy, "halfW": halfW, "halfH": halfH,
            "visibleW": visible_w, "visibleH": halfH * 2, "A": A}


def crop_frame(img, view, pivot_x, W, H):
    """把取景框采样成 W×H 的图。

    取景坐标以 PORTRAIT["imgW"]×["imgH"] 为基准；如果实际载入的贴图分辨率更高
    （预处理会放大 2 倍），这里按比例换算 —— shader 里走的是归一化 UV，与分辨率无关。
    超出原图的部分用边缘像素延展，等价于 ClampToEdge。
    """
    iw, ih = img.size
    k = iw / PORTRAIT["imgW"]
    view = {**view, "cx": view["cx"] * k, "cy": view["cy"] * k,
            "halfW": view["halfW"] * k, "halfH": view["halfH"] * k}
    x0 = view["cx"] - view["halfW"]
    y0 = view["cy"] - view["halfH"]
    x1 = view["cx"] + view["halfW"]
    y1 = view["cy"] + view["halfH"]

    pad = max(0, int(max(-x0, -y0, x1 - iw, y1 - ih)) + 4)
    if pad:
        big = Image.new("RGB", (iw + pad * 2, ih + pad * 2), STUDIO)
        big.paste(img, (pad, pad))
        # 用边缘像素延展，模拟 ClampToEdge
        left = img.crop((0, 0, 1, ih)).resize((pad, ih))
        right = img.crop((iw - 1, 0, iw, ih)).resize((pad, ih))
        top = big.crop((pad, pad, pad + iw, pad + 1)).resize((iw, pad))
        bot = big.crop((pad, pad + ih - 1, pad + iw, pad + ih)).resize((iw, pad))
        big.paste(left, (0, pad)); big.paste(right, (pad + iw, pad))
        big.paste(top, (pad, 0)); big.paste(bot, (pad, pad + ih))
        img = big
        x0 += pad; x1 += pad; y0 += pad; y1 += pad

    box = (int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1)))
    return img.crop(box).resize((W, H), Image.LANCZOS)
