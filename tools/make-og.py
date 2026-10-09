"""
生成社交分享图 assets/og.png（1200×630）与 assets/favicon.png。
用法：python3 tools/make-og.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
W, H = 1200, 630

CJK_FONTS = [
    ("/System/Library/Fonts/PingFang.ttc", 0),
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
    ("/System/Library/Fonts/STHeiti Medium.ttc", 0),
    ("/System/Library/Fonts/Supplemental/Songti.ttc", 0),
]


def load_font(size):
    """优先加载带中文字形的字体"""
    for path, idx in CJK_FONTS:
        if os.path.exists(path):
            try:
                f = ImageFont.truetype(path, size, index=idx)
                # 用"豆"字测一下是否真的有字形
                if f.getmask("豆").getbbox():
                    return f
            except Exception:
                continue
    return ImageFont.load_default()


def gradient(w, h, c0, c1):
    img = Image.new("RGB", (w, h), c0)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = (y / h) ** 1.2
        d.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(c0, c1)))
    return img


def radial_glow(w, h, cx, cy, rx, ry, color, peak):
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)
    steps = 60
    for i in range(steps, 0, -1):
        t = i / steps
        d.ellipse([cx - rx * t, cy - ry * t, cx + rx * t, cy + ry * t],
                  fill=int(255 * peak * (1 - t) ** 1.6))
    layer = layer.filter(ImageFilter.GaussianBlur(28))
    tint = Image.new("RGB", (w, h), color)
    return tint, layer


def main():
    os.makedirs(ASSETS, exist_ok=True)
    img = gradient(W, H, (6, 6, 11), (16, 16, 38))

    # 品牌辉光（在人物位置后方）
    for color, cx, cy, rx, ry, peak in [
        ((109, 94, 248), W * 0.5, H * 0.72, 380, 230, 0.85),
        ((55, 194, 255), W * 0.18, H * 0.30, 260, 200, 0.35),
    ]:
        tint, mask = radial_glow(W, H, cx, cy, rx, ry, color, peak)
        img = Image.composite(tint, img, mask.point(lambda v: int(v * 0.55)))

    d = ImageDraw.Draw(img)

    f_title = load_font(120)
    f_sub = load_font(38)
    f_small = load_font(26)

    # 渐变标题
    title = "豆包 Doubao"
    bbox = d.textbbox((0, 0), title, font=f_title)
    tx, ty = (W - (bbox[2] - bbox[0])) // 2 - bbox[0], 160 - bbox[1]
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).text((tx, ty), title, font=f_title, fill=255)

    grad = Image.new("RGB", (W, H))
    gp = grad.load()
    for y in range(H):
        for x in range(W):
            t = min(1.0, max(0.0, (x / W) * 0.75 + (y / H) * 0.35))
            gp[x, y] = (int(160 - 60 * t), int(170 - 40 * t), 255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    for text, font, y, color in [
        ("她在这里，等你开口", f_sub, 350, (237, 237, 242)),
        ("会听 · 会说 · 会看 · 会记", f_small, 424, (168, 168, 200)),
        ("WEBGL · 程序化生成 · 单页无跳转 · 捏脸交互", f_small, 470, (120, 120, 158)),
    ]:
        b = d.textbbox((0, 0), text, font=font)
        d.text(((W - (b[2] - b[0])) // 2 - b[0], y - b[1]), text, font=font, fill=color)

    d.rectangle([36, 36, W - 36, H - 36], outline=(58, 58, 104), width=2)
    img.save(os.path.join(ASSETS, "og.png"), optimize=True)
    print("wrote assets/og.png", img.size)

    # 同款方图，给一些平台做缩略图
    sq = img.crop((int(W / 2 - H / 2), 0, int(W / 2 + H / 2), H)).resize((512, 512), Image.LANCZOS)
    sq.save(os.path.join(ASSETS, "og-square.png"), optimize=True)
    print("wrote assets/og-square.png", sq.size)


if __name__ == "__main__":
    main()
