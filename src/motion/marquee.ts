/**
 * motion/marquee.ts — 滚动速度联动的无限 marquee
 */
import { motionPrefs } from '../lib/motionPrefs'
import type { FrameLoop } from '../lib/frameLoop'
import type { ScrollController } from './lenisSetup'

export function initVelocityMarquee(scroll: ScrollController, loop: FrameLoop): () => void {
  const tracks = Array.from(document.querySelectorAll<HTMLElement>('[data-marquee]'))
  if (!tracks.length) return () => undefined

  type Track = { el: HTMLElement; offset: number; base: number; dir: number }
  const list: Track[] = tracks.map((el) => {
    const base = Number(el.dataset.marqueeSpeed || 28)
    const dir = el.dataset.marqueeDir === 'rtl' ? -1 : 1
    // 复制子节点做无缝循环
    if (!el.dataset.marqueeReady) {
      const kids = Array.from(el.children)
      for (const k of kids) el.appendChild(k.cloneNode(true))
      el.dataset.marqueeReady = '1'
    }
    return { el, offset: 0, base, dir }
  })

  if (motionPrefs.reduced) {
    for (const t of list) t.el.style.transform = ''
    return () => undefined
  }

  const remove = loop.add((dt) => {
    const vel = Math.abs(scroll.read().velocity)
    const boost = 1 + Math.min(3.5, vel * 0.045)
    for (const t of list) {
      t.offset += t.base * t.dir * boost * dt
      const half = t.el.scrollWidth / 2
      if (half > 0) {
        if (t.offset > half) t.offset -= half
        if (t.offset < -half) t.offset += half
      }
      t.el.style.transform = `translate3d(${(-t.offset).toFixed(2)}px, 0, 0)`
    }
  })

  return () => {
    remove()
    for (const t of list) t.el.style.transform = ''
  }
}
