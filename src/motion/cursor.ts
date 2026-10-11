/**
 * motion/cursor.ts — 自定义多态光标
 * 光标环延迟弹性 · 磁吸态 · 点击波纹
 */
import { createSpring, SPRING } from '../lib/spring'
import { motionPrefs } from '../lib/motionPrefs'
import type { FrameLoop } from '../lib/frameLoop'

export type CursorMode = 'default' | 'pinch' | 'voice' | 'drag' | 'cta' | 'magnet'

const LABELS: Record<CursorMode, string> = {
  default: '',
  pinch: '捏',
  voice: '说',
  drag: '拖',
  cta: '→',
  magnet: '',
}

export function initPolymorphCursor(loop: FrameLoop): () => void {
  if (motionPrefs.reduced || motionPrefs.coarse) return () => undefined

  const el = document.createElement('div')
  el.className = 'poly-cursor'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = `<i class="poly-cursor__ring"></i><b class="poly-cursor__dot"></b><span class="poly-cursor__label"></span>`
  document.body.appendChild(el)
  document.documentElement.classList.add('has-poly-cursor')

  const labelEl = el.querySelector<HTMLElement>('.poly-cursor__label')
  // 点：更快；环：更慢更弹 → 延迟弹性感
  const dx = createSpring({ ...SPRING.pointer, value: window.innerWidth / 2, stiffness: 380, damping: 36 })
  const dy = createSpring({ ...SPRING.pointer, value: window.innerHeight / 2, stiffness: 380, damping: 36 })
  const rx = createSpring({ ...SPRING.ui, value: window.innerWidth / 2, stiffness: 140, damping: 18, mass: 1.15 })
  const ry = createSpring({ ...SPRING.ui, value: window.innerHeight / 2, stiffness: 140, damping: 18, mass: 1.15 })
  const ss = createSpring({ ...SPRING.ui, value: 1 })
  let mode: CursorMode = 'default'
  let visible = false
  let ptrX = window.innerWidth / 2
  let ptrY = window.innerHeight / 2

  const setMode = (next: CursorMode): void => {
    if (mode === next) return
    mode = next
    el.dataset.mode = next
    if (labelEl) labelEl.textContent = LABELS[next]
    ss.to(next === 'default' ? 1 : next === 'cta' ? 1.35 : next === 'magnet' ? 1.25 : 1.2)
  }

  const resolveMode = (target: Element | null): CursorMode => {
    if (!target) return 'default'
    if (target.closest('[data-cursor="pinch"], .pinch-zone, html.pinch-active')) return 'pinch'
    if (target.closest('[data-cursor="voice"], [data-hold-speak], .askbar__voice, .alcove-voice__hold'))
      return 'voice'
    if (target.closest('[data-cursor="drag"], [data-file-drop], .alcove-desk__drop')) return 'drag'
    if (target.closest('[data-cursor="cta"], .cta-fire, .cta-stage__btn, .cta-primary')) return 'cta'
    if (target.closest('[data-magnetic], .tpl-chip, .universe-card, .alcove-door, .wb-tab, .hero__hint'))
      return 'magnet'
    if (document.documentElement.classList.contains('pinch-active')) return 'pinch'
    return 'default'
  }

  const onMove = (e: PointerEvent): void => {
    visible = true
    el.classList.add('is-on')
    ptrX = e.clientX
    ptrY = e.clientY
    dx.to(e.clientX)
    dy.to(e.clientY)
    rx.to(e.clientX)
    ry.to(e.clientY)
    setMode(resolveMode(e.target as Element | null))
  }
  const onDown = (e: PointerEvent): void => {
    el.classList.add('is-down')
    ss.to(0.82)
    // 环上短波纹
    const pulse = document.createElement('i')
    pulse.className = 'poly-cursor__pulse'
    el.appendChild(pulse)
    requestAnimationFrame(() => pulse.classList.add('is-on'))
    window.setTimeout(() => pulse.remove(), 420)
    void e
  }
  const onUp = (): void => {
    el.classList.remove('is-down')
    ss.to(mode === 'default' ? 1 : mode === 'magnet' ? 1.25 : 1.2)
  }
  const onLeave = (): void => {
    visible = false
    el.classList.remove('is-on')
  }

  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })
  document.addEventListener('mouseleave', onLeave)

  const ring = el.querySelector<HTMLElement>('.poly-cursor__ring')
  const dot = el.querySelector<HTMLElement>('.poly-cursor__dot')

  const removeTick = loop.add((dt) => {
    if (!visible && !el.classList.contains('is-on')) return
    const x = dx.update(dt)
    const y = dy.update(dt)
    const rxi = rx.update(dt)
    const ryi = ry.update(dt)
    const s = ss.update(dt)
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    if (dot) dot.style.transform = 'translate(-50%, -50%)'
    if (ring) {
      const ox = rxi - x
      const oy = ryi - y
      ring.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px) scale(${s.toFixed(3)})`
    }
    void ptrX
    void ptrY
  })

  return () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointerup', onUp)
    document.removeEventListener('mouseleave', onLeave)
    removeTick()
    el.remove()
    document.documentElement.classList.remove('has-poly-cursor')
  }
}
