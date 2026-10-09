import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motionPrefs } from '../lib/motionPrefs'

gsap.registerPlugin(ScrollTrigger)

/**
 * lenisSetup.ts — 平滑滚动 + GSAP 的唯一集成点。
 *
 * 规格第五节的这段集成顺序不能改：
 *   1) lenis.on('scroll', ScrollTrigger.update) —— 让 ScrollTrigger 跟着 Lenis 的实际位置走
 *   2) gsap.ticker.add(time => lenis.raf(time * 1000)) —— 用 GSAP 的单一 rAF 驱动 Lenis
 *   3) gsap.ticker.lagSmoothing(0) —— 关掉 GSAP 的掉帧补偿，否则和 Lenis 打架 → 抖动
 * 顺序错了或者漏了第 3 步，快速滚动时一定会看到"顿一下再追上来"。
 */

export interface ScrollState {
  /** 归一化滚动进度 0→1 */
  progress: number
  /** 原始滚动速度，px/s（向下为正） */
  velocity: number
  /** 归一化速度 -1→1，约 ±一屏/秒 视为满速 */
  speed: number
  /** 文档可滚动高度（px） */
  scrollable: number
}

export interface ScrollController {
  readonly lenis: Lenis | null
  readonly smooth: boolean
  read(): ScrollState
  /** px 或元素选择器；自动适配 Lenis / 原生两条路径 */
  scrollTo(target: number | string | HTMLElement, opts?: { duration?: number; immediate?: boolean }): void
  destroy(): void
}

export function createScroll(): ScrollController {
  const smooth = !motionPrefs.reduced
  let lenis: Lenis | null = null

  if (smooth) {
    lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // 关键：Lenis 自己不再开 rAF，统一交给 gsap.ticker 驱动
      autoRaf: false,
      // 主内容区里的横向滚动容器自己处理手势，别被 Lenis 抢
      prevent: (node: HTMLElement) => node.dataset?.lenisPrevent === 'true',
    })
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((time: number) => {
      lenis?.raf(time * 1000)
    })
    gsap.ticker.lagSmoothing(0)
  }

  const state: ScrollState = { progress: 0, velocity: 0, speed: 0, scrollable: 1 }

  function read(): ScrollState {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    const y = window.scrollY
    state.scrollable = scrollable
    state.progress = y / scrollable
    state.velocity = lenis ? lenis.velocity : 0
    // 约「一屏/秒」视为满速，再大也截断
    state.speed = gsap.utils.clamp(-1, 1, state.velocity / (window.innerHeight * 1.1))
    return state
  }

  function scrollTo(
    target: number | string | HTMLElement,
    opts: { duration?: number; immediate?: boolean } = {},
  ): void {
    if (lenis) {
      lenis.scrollTo(target, {
        duration: opts.immediate ? 0 : (opts.duration ?? 1.15),
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        lock: true,
      })
      return
    }
    // reduced-motion：原生跳转，不做补间
    if (typeof target === 'number') {
      window.scrollTo(0, target)
    } else {
      const el = typeof target === 'string' ? document.querySelector(target) : target
      el?.scrollIntoView({ block: 'start' })
    }
  }

  if (smooth) {
    // Lenis 接管后要给 ScrollTrigger 一次重算，否则刷新后 pin 的位置是旧的
    requestAnimationFrame(() => ScrollTrigger.refresh())
  }

  return {
    get lenis() {
      return lenis
    },
    get smooth() {
      return smooth
    },
    read,
    scrollTo,
    destroy() {
      lenis?.destroy()
      lenis = null
      gsap.ticker.lagSmoothing(500, 33)
    },
  }
}

export { ScrollTrigger }
