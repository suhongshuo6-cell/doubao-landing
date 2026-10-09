/**
 * eases.ts — 把 tokens.css 里的两条 cubic-bezier 原样搬进 JS。
 *
 * 为什么不直接用 GSAP 的 'power3.out' 之类的近似缓动：
 * 设计系统里写死的那条曲线是团队的"手感定义"，用近似缓动等于让实现漂移于设计稿。
 *
 * 为什么不用 CustomEase 插件：
 * 我们用到的只有两条**固定**曲线，为此引入一个插件不值当。
 * GSAP 的 `ease` 接受任意 `(p: number) => number`，所以这里直接解三次贝塞尔 ——
 * 结果与 CSS 的 cubic-bezier() 逐点一致，还少了一个依赖面。
 */

/** 求三次贝塞尔在 x 处的参数 t（牛顿迭代 + 二分兜底） */
function solveT(x: number, x1: number, x2: number): number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx

  const sample = (t: number): number => ((ax * t + bx) * t + cx) * t
  const slope = (t: number): number => (3 * ax * t + 2 * bx) * t + cx

  let t = x
  for (let i = 0; i < 8; i++) {
    const err = sample(t) - x
    if (Math.abs(err) < 1e-6) return t
    const d = slope(t)
    if (Math.abs(d) < 1e-6) break
    t -= err / d
  }

  // 牛顿法不收敛时退回二分（这个分支几乎不会被走到，但必须存在）
  let lo = 0
  let hi = 1
  t = x
  for (let i = 0; i < 24; i++) {
    const v = sample(t)
    if (Math.abs(v - x) < 1e-6) return t
    if (v > x) hi = t
    else lo = t
    t = (lo + hi) / 2
  }
  return t
}

export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  return (p: number): number => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    const t = solveT(p, x1, x2)
    return ((ay * t + by) * t + cy) * t
  }
}

/** 进场：cubic-bezier(.22,.61,.36,1) */
export const EASE_IN = cubicBezier(0.22, 0.61, 0.36, 1)

/** 出场：cubic-bezier(.65,0,.35,1) */
export const EASE_OUT = cubicBezier(0.65, 0, 0.35, 1)

/** 时长档位（秒），与 tokens 的 --dur-s/m/l 一一对应 */
export const DUR = { s: 0.18, m: 0.42, l: 0.8 } as const
