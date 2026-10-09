import gsap from 'gsap'
import { motionPrefs, invLerp, smoothstep, smootherstep } from '../lib/motionPrefs'
import { createSpring, SPRING } from '../lib/spring'
import type { FrameLoop } from '../lib/frameLoop'
import type { ScrollController } from './lenisSetup'

/* ==========================================================================
   1. 滚动进度 ↔ 取景进度 的锚点映射
   --------------------------------------------------------------------------
   规格 6.6 把取景分成 6 个固定节点（0.00 / 0.18 / 0.36 / 0.54 / 0.74 / 0.92）。
   但"滚动到哪一段"是由文案长度决定的，写死像素迟早会和文案对不上。

   所以取景节点的 t 值是**曲线参数**（决定镜头语言），
   而"滚动进度 → t"这条映射由各区块在文档里的真实位置推出来。
   改文案、换断点，取景和文字都不会错位；同时节点 t 值仍严格是规格给的那 6 个数。
   ========================================================================== */

export interface Anchor {
  /** 区块元素 */
  el: Element
  /** 该区块对应的取景进度 t */
  t: number
}

export interface AnchorMap {
  /** 滚动进度 p(0→1) → 取景进度 t(0→1)，段内五次平滑，制造"减速停顿" */
  toFraming(p: number): number
  /** 取景进度 t → 应该滚到的像素位置 */
  toScroll(t: number): number
  /** 重新测量（resize / 内容变化后调用） */
  refresh(): void
}

export function createAnchorMap(anchors: Anchor[]): AnchorMap {
  let points: { p: number; t: number }[] = []

  /**
   * 用 offsetTop 链求"布局位置"，而不是 getBoundingClientRect()。
   * 原因：ScrollTrigger 的 pin 会给被固定的元素加 transform，
   * 这时候 rect.top 是**固定住的位置**，量出来的锚点会随滚动位置漂移。
   * offsetTop 是布局值，不受 transform 影响，刷新多少次都稳定。
   */
  function layoutTop(el: Element): number {
    let y = 0
    let node = el as HTMLElement | null
    while (node) {
      y += node.offsetTop
      node = node.offsetParent as HTMLElement | null
    }
    return y
  }

  const measure = (): void => {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    const viewport = window.innerHeight
    points = anchors
      .map(({ el, t }) => {
        const html = el as HTMLElement
        // 锚点取"区块中心与视口中心重合"的那一刻：滚到这里，这一屏讲的就是这一段
        const center = layoutTop(html) + html.offsetHeight / 2 - viewport / 2
        const p = gsap.utils.clamp(0, 1, center / scrollable)
        return { p, t }
      })
      // p 必须单调递增，否则插值会来回跳
      .sort((a, b) => a.p - b.p)
  }

  measure()

  const toFraming = (p: number): number => {
    if (points.length === 0) return 0
    const first = points[0]!
    const last = points[points.length - 1]!
    if (p <= first.p) return first.t
    if (p >= last.p) return last.t
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      if (p >= a.p && p <= b.p) {
        const local = invLerp(a.p, b.p, p)
        return a.t + (b.t - a.t) * smootherstep(local)
      }
    }
    return last.t
  }

  const toScroll = (t: number): number => {
    if (points.length === 0) return 0
    const first = points[0]!
    const last = points[points.length - 1]!
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    if (t <= first.t) return first.p * scrollable
    if (t >= last.t) return last.p * scrollable
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      if (t >= a.t && t <= b.t) {
        const span = b.t - a.t
        const local = span === 0 ? 0 : (t - a.t) / span
        // 反解 smootherstep：二分 20 次足够精确，且只在点击导航时算一次
        let lo = 0
        let hi = 1
        for (let k = 0; k < 20; k++) {
          const mid = (lo + hi) / 2
          if (smootherstep(mid) < local) lo = mid
          else hi = mid
        }
        const eased = (lo + hi) / 2
        return (a.p + (b.p - a.p) * eased) * scrollable
      }
    }
    return last.p * scrollable
  }

  return { toFraming, toScroll, refresh: measure }
}

/* ==========================================================================
   2. 速度驱动的形变（规格第五节第 2 条，"必须实现"）
   --------------------------------------------------------------------------
   慢滚时完全平静，快滚时才有响应 —— Apple / Stripe 手感好的核心秘密。

   实现要点：不逐元素写 transform，而是把速度写进一个 CSS 变量 --vel，
   由 CSS 用 calc() 组合到各元素自己的 transform 上。
   好处：每帧只有 2 次 style 写入；映射关系留在 CSS 里（设计值归设计系统管），
   JS 只负责"把速度变成信号"。
   ========================================================================== */

export interface VelocityWarpOptions {
  /** 死区：低于这个速度完全不动（慢滚 = 平静的关键） */
  deadzone?: number
  /** 达到这个速度即视为满幅 */
  fullScale?: number
}

export function initVelocityWarp(
  scroll: ScrollController,
  loop: FrameLoop,
  options: VelocityWarpOptions = {},
): () => void {
  const root = document.documentElement

  if (motionPrefs.reduced) {
    root.style.setProperty('--vel', '0')
    root.style.setProperty('--vel-abs', '0')
    return () => undefined
  }

  const deadzone = options.deadzone ?? 0.055
  const fullScale = options.fullScale ?? 0.85
  const spring = createSpring(SPRING.warp)
  spring.set(0)

  root.style.setProperty('--vel', '0')
  root.style.setProperty('--vel-abs', '0')

  const unsubscribe = loop.add((dt) => {
    const { speed } = scroll.read()
    const magnitude = Math.abs(speed)
    // 死区内输出恒为 0，出了死区用 smoothstep 软起，避免"一过阈值就跳"
    const shaped = smoothstep(invLerp(deadzone, fullScale, magnitude))
    spring.to(Math.sign(speed) * shaped)
    const v = spring.update(dt)
    root.style.setProperty('--vel', v.toFixed(4))
    root.style.setProperty('--vel-abs', Math.abs(v).toFixed(4))
  })

  return () => {
    unsubscribe()
    root.style.setProperty('--vel', '0')
    root.style.setProperty('--vel-abs', '0')
  }
}
