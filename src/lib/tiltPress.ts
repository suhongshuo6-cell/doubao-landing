/**
 * tiltPress.ts — 指针倾斜 + 按下弹簧（能力卡 / 芯片 / 评价卡）
 */

import gsap from 'gsap'
import { createSpring, SPRING } from './spring'
import { motionPrefs } from './motionPrefs'

type Item = {
  el: HTMLElement
  rx: ReturnType<typeof createSpring>
  ry: ReturnType<typeof createSpring>
  scale: ReturnType<typeof createSpring>
  hovering: boolean
}

export function bindTiltPress(selector: string): () => void {
  if (motionPrefs.reduced || motionPrefs.coarse) return () => undefined

  const items: Item[] = Array.from(document.querySelectorAll<HTMLElement>(selector)).map((el) => {
    el.classList.add('has-tilt')
    return {
      el,
      rx: createSpring({ ...SPRING.ui, value: 0 }),
      ry: createSpring({ ...SPRING.ui, value: 0 }),
      scale: createSpring({ ...SPRING.pinch, value: 1 }),
      hovering: false,
    }
  })
  if (!items.length) return () => undefined

  const cleaners: Array<() => void> = []

  for (const it of items) {
    const onMove = (e: PointerEvent): void => {
      const r = it.el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      it.hovering = true
      it.rx.to(px * 10)
      it.ry.to(-py * 8)
    }
    const onLeave = (): void => {
      it.hovering = false
      it.rx.to(0)
      it.ry.to(0)
      it.scale.to(1)
    }
    const onDown = (): void => it.scale.to(0.96)
    const onUp = (): void => it.scale.to(1.02)
    it.el.addEventListener('pointermove', onMove)
    it.el.addEventListener('pointerleave', onLeave)
    it.el.addEventListener('pointerdown', onDown)
    it.el.addEventListener('pointerup', onUp)
    it.el.addEventListener('pointercancel', onUp)
    cleaners.push(() => {
      it.el.removeEventListener('pointermove', onMove)
      it.el.removeEventListener('pointerleave', onLeave)
      it.el.removeEventListener('pointerdown', onDown)
      it.el.removeEventListener('pointerup', onUp)
      it.el.removeEventListener('pointercancel', onUp)
      it.el.style.transform = ''
      it.el.classList.remove('has-tilt')
    })
  }

  let last = 0
  const tick = (time: number): void => {
    const dt = last === 0 ? 1 / 60 : Math.min(time - last, 0.05)
    last = time
    for (const it of items) {
      const x = it.rx.update(dt)
      const y = it.ry.update(dt)
      const s = it.scale.update(dt)
      if (it.rx.atRest && it.ry.atRest && it.scale.atRest && !it.hovering) {
        if (it.el.style.transform) it.el.style.transform = ''
        continue
      }
      it.el.style.transform = `perspective(800px) rotateX(${y.toFixed(2)}deg) rotateY(${x.toFixed(2)}deg) scale(${s.toFixed(3)})`
    }
  }
  gsap.ticker.add(tick)
  cleaners.push(() => gsap.ticker.remove(tick))

  return () => {
    for (const c of cleaners.reverse()) c()
  }
}
