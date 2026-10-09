#!/usr/bin/env python3
"""
preview_frames.py — 离线渲染 6 个取景节点的构图（Phase 2 的校验工具）。

为什么要有这个工具：
  角色层真正的成像是 WebGL 里跑的一层屏幕对齐 billboard，
  要在浏览器里逐帧调"哪张板在哪个 t 上占多少权重"非常低效。
  这里用 **和 shader 完全相同的取景权重数学**，把节点构图离线渲染成 PNG，
  改完权重直接看图，不用起浏览器。

它回答的是一个具体问题：
  「你现在这 5 张身体部位特写 + 3 张全身图，串起来到底像不像
    同一个人的一段连续运镜？」

用法：
  python3 tools/preview_frames.py                # 6 个节点 + 接触表
  python3 tools/preview_frames.py --w 1600 --h 900
  python3 tools/preview_frames.py --strip        # 只出 12 帧接触表
输出到 .preview-out/imgrig/
"""

from __future__ import annotations

import argparse
import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "public", "img")
OUT = os.path.join(ROOT, ".preview-out", "imgrig")

# --------------------------------------------------------------------------
# 取景权重表：t → 哪张板占多少
# 这是 Phase 2 里 ImageRigCharacter 的唯一真相，shader/JS 会读同一组锚点。
# 锚点的选择逻辑：按"身体从上到下"的顺序排列每个部位特写，
# 最后一张是全身（front，配合 side/back 做 yaw 转身）。
# --------------------------------------------------------------------------
ANCHORS: list[tuple[float, str]] = [
    (0.00, "doubao_face"),
    (0.18, "doubao_neck"),
    # 0.36「手与手臂」没有独立素材：JS 侧用同一张肩颈板做取景内推近（zoom/pan）。
    # 这里只做权重可视化，不模拟 zoom，所以它看起来和 0.18 同图 —— 这是预期的。
    (0.36, "doubao_neck"),
    (0.54, "doubao_waist"),
    (0.74, "doubao_legs"),
    (0.92, "doubao_front"),
]

# 规格 6.6 规定的 6 个取景节点
NODES: list[tuple[str, float]] = [
    ("01-face", 0.00),
    ("02-neck", 0.18),
    ("03-arms", 0.36),
    ("04-waist", 0.54),
    ("05-legs", 0.74),
    ("06-body", 0.92),
]


def cover(img: Image.Image, w: int, h: int) -> Image.Image:
    """按短边铺满裁切（等价于 CSS 的 object-fit: cover）"""
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    nw, nh = int(round(sw * scale)), int(round(sh * scale))
    resized = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return resized.crop((left, top, left + w, top + h))


def smoothstep(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def weights(t: float) -> dict[str, float]:
    """与 shader 同一套：找 t 落在哪两个锚点之间，段内 smoothstep 交叉淡化"""
    if t <= ANCHORS[0][0]:
        return {ANCHORS[0][1]: 1.0}
    if t >= ANCHORS[-1][0]:
        return {ANCHORS[-1][1]: 1.0}
    for i in range(len(ANCHORS) - 1):
        t0, n0 = ANCHORS[i]
        t1, n1 = ANCHORS[i + 1]
        if t0 <= t <= t1:
            u = smoothstep((t - t0) / (t1 - t0))
            # 相邻两个锚点可能是同一张板（0.18 与 0.36 都用肩颈板）：
            # 这时 dict 的键会互相覆盖，u≈0 时权重直接归零 → compose 拿不到任何层。
            if n0 == n1:
                return {n0: 1.0}
            return {n0: 1.0 - u, n1: u}
    return {ANCHORS[-1][1]: 1.0}


# 交叉淡化的窗口宽度（占一个段的比例）。0.5 = 整段都在淡，0.0 = 瞬间硬切。
# 关键结论写在这里：这几张板的**尺度差**是 3~10 倍，线性淡入淡出会变成"双重曝光"，
# 所以必须把淡化压到一个很窄的窗口里、并在窗口中心把两张都虚焦（焦点切换 / rack focus）。
FADE_WINDOW = 0.16
# 虚焦半径以 1440 宽为基准，按输出宽度等比缩放。
# 不缩放的话，接触表那种 1/3 尺寸的预览会把同样像素数的模糊放大 3 倍，
# 看图时会把"过渡"误判成"整段都在糊"。
FOCUS_BLUR_PX = 16.0
BLUR_REFERENCE_W = 1440.0


def segment(t: float) -> tuple[str, str, float]:
    """返回 (当前板, 下一张板, 段内局部进度 u)"""
    if t <= ANCHORS[0][0]:
        return ANCHORS[0][1], ANCHORS[0][1], 0.0
    if t >= ANCHORS[-1][0]:
        return ANCHORS[-1][1], ANCHORS[-1][1], 1.0
    for i in range(len(ANCHORS) - 1):
        t0, n0 = ANCHORS[i]
        t1, n1 = ANCHORS[i + 1]
        if t0 <= t <= t1:
            return n0, n1, (t - t0) / (t1 - t0)
    return ANCHORS[-1][1], ANCHORS[-1][1], 1.0


def focus_amount(u: float) -> float:
    """
    焦点切换的"虚焦量"：0 在段两端，1 在段正中。
    只在 FADE_WINDOW 指定的窄窗口内抬起来，所以出画/入画附近都是实焦的。
    """
    lo = 0.5 - FADE_WINDOW
    hi = 0.5 + FADE_WINDOW
    if u <= lo or u >= hi:
        return 0.0
    x = (u - lo) / (hi - lo)
    return math.sin(x * math.pi)


def load(name: str) -> Image.Image:
    for ext in (".webp", ".jpg", ".png"):
        path = os.path.join(IMG, name + ext)
        if os.path.exists(path):
            return Image.open(path).convert("RGB")
    raise FileNotFoundError(f"缺少素材 {name}.*（应该在 {IMG}）")


def blurred(img: Image.Image, radius: float) -> Image.Image:
    return img if radius < 0.2 else img.filter(ImageFilter.GaussianBlur(radius))


def compose(t: float, w: int, h: int, cache: dict, mode: str = "focus") -> Image.Image:
    """
    把某张（或某两张）板合成为最终画面。

    mode="linear"：整段线性交叉淡化 —— 用来暴露"双重曝光"问题，留作对照。
    mode="focus" ：淡化压到窄窗口，且窗口中心两张都虚焦 —— 读起来是一次焦点切换。
    mode="cut"   ：段中点硬切，完全不重叠 —— 一张都不叠，永远不会重影。
    """
    if mode == "linear":
        pairs = [(name, weight, 0.0) for name, weight in weights(t).items()]
    elif mode == "cut":
        a, b, u = segment(t)
        pairs = [(a if u < 0.5 else b, 1.0, 0.0)]
    else:
        a, b, u = segment(t)
        blur = focus_amount(u) * FOCUS_BLUR_PX * (w / BLUR_REFERENCE_W)
        blend = smoothstep((u - (0.5 - FADE_WINDOW)) / (2 * FADE_WINDOW))
        if a == b:
            pairs = [(a, 1.0, 0.0)]
        else:
            pairs = [(a, 1.0 - blend, blur), (b, blend, blur)]

    acc = None
    total = 0.0
    for name, weight, radius in pairs:
        if weight <= 0.001:
            continue
        key = (name, w, h, round(radius, 1))
        if key not in cache:
            cache[key] = blurred(cover(load(name), w, h), radius)
        layer = cache[key]
        # 归一化权重后再混合，避免直接拿原始权重当 alpha 造成整体压暗
        acc = layer if acc is None else Image.blend(acc, layer, weight / (total + weight))
        total += weight
    assert acc is not None
    return acc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--strip", action="store_true", help="只输出接触表")
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    cache: dict = {}

    # ---- 1. 6 个节点（实焦，focus 模式在节点处虚焦量为 0，与 linear 结果一致）----
    if not args.strip:
        for name, t in NODES:
            frame = compose(t, args.w, args.h, cache, "focus")
            frame.save(os.path.join(OUT, f"{name}.png"))
            ws = ", ".join(f"{k.replace('doubao_', '')}={v:.2f}" for k, v in weights(t).items())
            print(f"  {name}  t={t:.2f}  →  {ws}")

    # ---- 2. 两种过渡模式的接触表：并排看，差异一目了然 ----
    ts = [i / 11 for i in range(12)]
    cols, rows = 4, 3
    tw, th = args.w // 3, args.h // 3
    for mode in ("linear", "focus", "cut"):
        sheet = Image.new("RGB", (tw * cols, th * rows), (251, 251, 253))
        draw = ImageDraw.Draw(sheet)
        for i, t in enumerate(ts):
            frame = compose(t, tw, th, cache, mode)
            x, y = (i % cols) * tw, (i // cols) * th
            sheet.paste(frame, (x, y))
            draw.text((x + 10, y + 8), f"t={t:.2f}", fill=(14, 14, 18))
            draw.rectangle([x, y, x + tw - 1, y + th - 1], outline=(200, 200, 205))
        path = os.path.join(OUT, f"_strip_{mode}.png")
        sheet.save(path)
        print(f"\n{mode:>6} 接触表：{path}")

    print(
        '\n对照着看：linear 那张里每一格过渡都是「两张照片叠在一起」（双重曝光）；\n'
        'focus 那张把淡化压进窄窗口、窗口中心两张一起虚焦，读起来是一次焦点切换。'
    )


if __name__ == "__main__":
    main()
