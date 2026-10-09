import gsap from 'gsap'

/**
 * frameLoop.ts — 全站唯一的每帧回调入口。
 *
 * 为什么不让各模块自己 requestAnimationFrame：
 *  1. 页面不可见时必须停 RAF（规格第八节），分散写一定会漏；
 *  2. dt 必须统一，否则弹簧在不同模块里因为 dt 不同而手感不一致；
 *  3. 只有一个 rAF，浏览器合成器只被唤醒一次。
 */
export type FrameCallback = (dt: number, elapsed: number) => void

export interface FrameLoop {
  add(cb: FrameCallback): () => void
  readonly running: boolean
}

export function createFrameLoop(): FrameLoop {
  const callbacks = new Set<FrameCallback>()
  let running = true
  let last = 0
  let elapsed = 0

  const tick = (time: number): void => {
    if (!running) {
      last = time
      return
    }
    // gsap.ticker 传的是秒
    const dt = last === 0 ? 1 / 60 : Math.min(time - last, 0.05)
    last = time
    elapsed += dt
    for (const cb of callbacks) cb(dt, elapsed)
  }

  gsap.ticker.add(tick)

  const onVisibility = (): void => {
    running = !document.hidden
    // 从后台回来时丢弃这一帧的巨大 dt，避免弹簧被"甩飞"
    last = 0
  }
  document.addEventListener('visibilitychange', onVisibility)
  onVisibility()

  return {
    get running() {
      return running
    },
    add(cb: FrameCallback) {
      callbacks.add(cb)
      return () => callbacks.delete(cb)
    },
  }
}
