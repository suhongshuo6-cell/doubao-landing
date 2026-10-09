#!/usr/bin/env python3
"""
make_mattes.py — 把每张立绘切成两层：背景层（bg）+ 人像层（fg, RGBA）。

为什么必须分层：
  这几张板是**独立镜头**、尺度差 3~10 倍，整幅交叉淡化 = 双重曝光（已实测，见
  preview_frames.py）。分层之后：
    · 背景层几乎每张都一样（干净的浅色棚拍墙）→ 淡入淡出看不见接缝
    · 人像层是抠像剪影 → 两张剪影之间是"溶解"，不是"两个矩形叠在一起"
  再叠加真实的三维视差（人像层与背景层摆在不同深度，相机转动时自然错开），
  单张静态照片就有了体积感。

算法（针对"干净浅色棚拍墙"这一特定场景，不用任何 ML）：
  1. 逐行背景估计：取每行左右各 6% 列的中位数 —— 墙是竖向渐变，逐行估最稳
  2. 与背景的感知色差 → soft matte（平滑阈值，不是硬二值）
  3. 形态学闭运算 + 开运算去掉噪点与毛刺
  4. 从画面四边 flood fill 求"外部背景"，剩下的非背景 = 内部空洞 → 填掉
  5. 边缘羽化 1.2px，避免合成时出现一条硬切线
  6. 背景层 = 原图的人像区域用该行背景色填平（浅色墙直接填就是无损 inpainting）

用法：
  python3 tools/make_mattes.py            # 处理全部
  python3 tools/make_mattes.py --only face neck
  python3 tools/make_mattes.py --preview  # 额外输出合成校验图
"""

from __future__ import annotations

import argparse
import json
import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "img")
OUTFG = os.path.join(ROOT, "public", "img", "rig")
OUTBG = os.path.join(ROOT, "public", "img", "rig")
PREVIEW = os.path.join(ROOT, ".preview-out", "matte")

ALL = ["doubao_face", "doubao_neck", "doubao_waist", "doubao_legs", "doubao_toes",
       "doubao_front", "doubao_side", "doubao_back"]

# 逐张微调：阈值（色差到 alpha 的区间）与"是否分层"。
# 脸部特写人像占满画面、没有可用背景，所以不分层 —— 强行抠只会抠坏。
CONFIG: dict[str, dict] = {
    "doubao_face":  {"layered": False},
    "doubao_neck":  {"lo": 10.0, "hi": 26.0},
    "doubao_waist": {"lo": 9.0,  "hi": 24.0},
    "doubao_legs":  {"lo": 9.0,  "hi": 24.0},
    "doubao_toes":  {"lo": 10.0, "hi": 26.0},
    "doubao_front": {"lo": 12.0, "hi": 30.0},
    "doubao_side":  {"lo": 12.0, "hi": 30.0},
    "doubao_back":  {"lo": 12.0, "hi": 30.0},
}

EDGE_FRACTION = 0.06   # 每侧取多少列估计背景
FEATHER = 1.2


def load_rgb(name: str) -> tuple[np.ndarray, Image.Image]:
    for ext in (".webp", ".jpg", ".png"):
        p = os.path.join(SRC, name + ext)
        if os.path.exists(p):
            img = Image.open(p).convert("RGB")
            return np.asarray(img).astype(np.float32), img
    raise FileNotFoundError(f"缺少素材 {name}.*")


def row_background(rgb: np.ndarray) -> np.ndarray:
    """逐行背景估计：每行左右两侧若干列的中位数 → (H, 1, 3)"""
    h, w, _ = rgb.shape
    k = max(6, int(w * EDGE_FRACTION))
    edges = np.concatenate([rgb[:, :k, :], rgb[:, -k:, :]], axis=1)
    return np.median(edges, axis=1, keepdims=True)


def _box_1d(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    """沿单轴做半径为 r 的盒式模糊（前缀和差分，O(n)）"""
    if r < 1:
        return a
    n = a.shape[axis]
    k = 2 * r + 1
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r, r)
    p = np.pad(a, pad, mode="edge")            # 长度 n + 2r
    c = np.cumsum(p, axis=axis)
    zshape = list(a.shape)
    zshape[axis] = 1
    c = np.concatenate([np.zeros(zshape, dtype=c.dtype), c], axis=axis)   # 长度 n + 2r + 1
    hi = np.take(c, np.arange(k, n + k), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / k


def gauss_f(arr: np.ndarray, radius: float) -> np.ndarray:
    """
    对 float 数组做高斯模糊。
    用"三次盒式模糊"近似 —— PIL 的 GaussianBlur 不接受 'F' 模式（直接抛 wrong mode），
    而权重图必须是 float：8bit 量化会让远离人像的 den 归零，归一化卷积当场爆掉。
    """
    if radius < 1:
        return arr
    r = max(1, int(round(radius / 3)))
    out = arr.astype(np.float32)
    for _ in range(3):
        for axis in (0, 1):
            out = _box_1d(out, r, axis)
    return out


def inpaint_background(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    归一化卷积（normalized convolution）补背景。

    为什么不用"逐行取边缘中位数再填平"（第一版的做法）：
    浅色棚拍墙是**竖向 + 横向**双渐变，逐行常数只对得上竖的那一半，
    横向上会比真实的墙略亮或略暗 —— 视差一拉开就是一块看得见的斑。

    正确做法是把"墙面"当成一个从已知区域向外扩散的量：
        bg_est = blur(rgb · w) / blur(w)     其中 w = 1 − 人像
    这样墙面的明暗梯度会被自然延续进人像区域，而不是被一个常数打断。

    最后用一张羽化的 band 做软过渡，避免填补区边界出现硬台阶。
    """
    # 外扩一点，覆盖人像层的羽化边 —— 半透明那圈如果透出原图里的人像就成鬼影了
    mask_d = np.asarray(
        Image.fromarray((mask * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(15))
    ) > 127

    w = (~mask_d).astype(np.float32)
    # 半径必须大到"能跨过整个躯干"：核够不到的地方 den→0，num/den 就退化成黑色块
    # （第一版半径 42 时，人像内部就留下了一个黑乎乎的剪影）。
    RADIUS = 110.0
    num = gauss_f(rgb.astype(np.float32) * w[..., None], RADIUS)
    den = gauss_f(w, RADIUS)[..., None]
    bg_est = num / np.maximum(den, 1e-4)

    # 置信度兜底：极少数 den 仍然过小的深处，退回"逐行背景色"。
    # 墙是竖向渐变，逐行色本来就能对上竖的那一半，只做兜底足够。
    conf = np.clip(den / 0.08, 0.0, 1.0)
    row_bg = row_background(rgb)
    bg_est = bg_est * conf + row_bg * (1 - conf)

    band = np.clip(gauss_f(mask_d.astype(np.float32), 16)[..., None] * 1.6, 0.0, 1.0)
    out = rgb.astype(np.float32) * (1 - band) + bg_est * band
    return np.clip(out, 0, 255).astype(np.uint8)


def close_holes_coarse(mask: np.ndarray, scale: int = 8, k: int = 9) -> np.ndarray:
    """
    大尺度闭运算，用来填掉人像内部与背景同色的"洞"（最典型的是浅色皮肤与浅色墙同色）。

    为什么不从四边 flood fill：PIL 的 ImageDraw.floodfill 在这个 Pillow 版本上
    对 'L' 图静默不生效（实测填充量为 0），而它会让我误以为"没有洞"，
    于是 mask | holes 会把整幅图变成 True（覆盖率 100%）——这种错误看图才发现得了。
    降采样 + MaxFilter/MinFilter 一样能填大洞，而且没有版本依赖：
    1/8 尺度上 size-9 的核 ≈ 全分辨率 72px 的洞。
    """
    h, w = mask.shape
    small = Image.fromarray((mask * 255).astype(np.uint8), "L").resize(
        (max(1, w // scale), max(1, h // scale)), Image.BILINEAR
    )
    small = small.point(lambda v: 255 if v > 100 else 0)
    small = small.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
    big = small.resize((w, h), Image.NEAREST)
    return np.asarray(big) > 127


def build_mask(rgb: np.ndarray, lo: float, hi: float) -> np.ndarray:
    bg = row_background(rgb)
    diff = rgb - bg
    # 感知加权：人眼对绿色最敏感，蓝色最不敏感
    dist = np.sqrt(0.30 * diff[..., 0] ** 2 + 0.59 * diff[..., 1] ** 2 + 0.11 * diff[..., 2] ** 2)

    a = np.clip((dist - lo) / max(1e-6, hi - lo), 0.0, 1.0)
    a = a * a * (3 - 2 * a)                      # smoothstep
    mask = a > 0.5

    m = Image.fromarray((mask * 255).astype(np.uint8), "L")
    m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))   # 闭：补内部小洞
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))   # 开：去孤立噪点
    mask = np.asarray(m) > 127

    # 大尺度闭运算填掉大洞，再开一次去掉闭运算带来的毛刺
    mask = mask | close_holes_coarse(mask)
    m2 = Image.fromarray((mask * 255).astype(np.uint8), "L")
    m2 = m2.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    mask = np.asarray(m2) > 127
    return mask


def subject_bbox(mask: np.ndarray) -> list[float]:
    """人像的归一化包围盒 [x0, y0, x1, y1]（y 自图片顶端向下）"""
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return [0.0, 0.0, 1.0, 1.0]
    h, w = mask.shape
    return [
        round(float(xs.min()) / w, 4),
        round(float(ys.min()) / h, 4),
        round(float(xs.max() + 1) / w, 4),
        round(float(ys.max() + 1) / h, 4),
    ]


def make_one(name: str, preview: bool) -> dict:
    cfg = CONFIG.get(name, {"lo": 10.0, "hi": 26.0})
    rgb, img = load_rgb(name)
    h, w, _ = rgb.shape
    os.makedirs(OUTFG, exist_ok=True)

    if not cfg.get("layered", True):
        # 不分层：原图直接一张，alpha 全 255。
        # 脸部特写人像占满画面，给一个"脸所在的大致范围"作为移动端取景依据。
        img.save(os.path.join(OUTFG, f"{name}.webp"), "WEBP", quality=90, method=6)
        return {
            "name": name, "layered": False, "coverage": 1.0,
            "bbox": [0.20, 0.04, 0.80, 0.98],
            "bytes": os.path.getsize(os.path.join(OUTFG, f"{name}.webp")),
        }

    mask = build_mask(rgb, cfg["lo"], cfg["hi"])

    # 强制一圈透明边。
    # 为什么必须做：移动端竖屏要按主体重新框，采样坐标常常会越出 [0,1]；
    # 贴图是 ClampToEdge，越界会**重复最外一行像素**。
    # 如果最外一行还有头发/皮肤的实心像素，画面上就会出现一片垂直拉丝
    # （第一版就是这样：竖屏首屏整片条纹，看起来像解码坏了）。
    border = 6
    mask[:border, :] = False
    mask[-border:, :] = False
    mask[:, :border] = False
    mask[:, -border:] = False

    coverage = float(mask.mean())

    # 羽化后的 alpha
    alpha = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(FEATHER)
    )

    fg = img.convert("RGBA")
    fg.putalpha(alpha)
    fg_path = os.path.join(OUTFG, f"{name}.webp")
    fg.save(fg_path, "WEBP", quality=88, method=6)

    # 背景层：归一化卷积把墙面明暗延续进人像区域（见 inpaint_background 的说明）
    bg = Image.fromarray(inpaint_background(rgb, mask), "RGB")
    bg_path = os.path.join(OUTBG, f"{name}_bg.webp")
    bg.save(bg_path, "WEBP", quality=88, method=6)

    if preview:
        os.makedirs(PREVIEW, exist_ok=True)
        checker = Image.new("RGB", (w, h), (251, 251, 253))
        d = ImageDraw.Draw(checker)
        step = 24
        for yy in range(0, h, step):
            for xx in range(0, w, step):
                if ((xx // step) + (yy // step)) % 2 == 0:
                    d.rectangle([xx, yy, xx + step - 1, yy + step - 1], fill=(226, 228, 232))
        over = checker.copy()
        over.paste(fg, (0, 0), fg)
        side = Image.new("RGB", (w, h * 2), (255, 255, 255))
        side.paste(bg, (0, 0))
        side.paste(over, (0, h))
        side.resize((w // 2, h)).save(os.path.join(PREVIEW, f"{name}_check.png"))

    return {
        "name": name,
        "layered": True,
        "bbox": subject_bbox(mask),
        "coverage": coverage,
        "fg_bytes": os.path.getsize(fg_path),
        "bg_bytes": os.path.getsize(bg_path),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()

    names = args.only or ALL
    total = 0
    manifest: dict = {}
    print(f"{'素材':>16}  {'分层':>4}  {'人像占比':>8}  {'体积':>10}")
    for name in names:
        r = make_one(name, args.preview)
        manifest[name] = {"bbox": r["bbox"], "layered": r["layered"]}
        if r["layered"]:
            size = r["fg_bytes"] + r["bg_bytes"]
            total += size
            print(f"{name:>16}  {'是':>4}  {r['coverage']*100:>7.1f}%  {size/1024:>8.1f} KB")
        else:
            total += r["bytes"]
            print(f"{name:>16}  {'否':>4}  {'—':>8}  {r['bytes']/1024:>8.1f} KB")
    with open(os.path.join(OUTFG, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1, sort_keys=True)
    print(f"\n合计 {total/1024:.1f} KB  →  public/img/rig/")
    print("主体包围盒清单 → public/img/rig/manifest.json")
    for k, v in sorted(manifest.items()):
        print(f"  {k:>16}  bbox={v['bbox']}")


if __name__ == "__main__":
    main()
