/**
 * ui/feedback.ts — 指针/触摸反馈：磁吸 · 波纹 · 探索提示 · tilt 补强
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { createSpring, SPRING } from '../lib/spring'
import type { FrameLoop } from '../lib/frameLoop'

export function initFeedback(loop: FrameLoop): () => void {
  const destroyers: Array<() => void> = []
  const root = document.documentElement

  /* ---- 点击波纹（桌面 + 触屏） ---- */
  const onRipple = (e: PointerEvent): void => {
    const target = e.target as HTMLElement | null
    const host = target?.closest<HTMLElement>(
      'button, a.cta-primary, a.cta-ghost, .tpl-chip, .hero__hint, .ask-follow, .cap-op, .demo-chip, .cta-stage__btn, .hero-branch, [data-ripple]',
    )
    if (!host || host.hasAttribute('disabled')) return
    const rect = host.getBoundingClientRect()
    const ripple = document.createElement('span')
    ripple.className = 'fx-ripple'
    const size = Math.max(rect.width, rect.height) * 1.6
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    ripple.style.width = `${size}px`
    ripple.style.height = `${size}px`
    ripple.style.left = `${x}px`
    ripple.style.top = `${y}px`
    const style = getComputedStyle(host)
    if (style.position === 'static') host.style.position = 'relative'
    host.appendChild(ripple)
    requestAnimationFrame(() => ripple.classList.add('is-on'))
    window.setTimeout(() => ripple.remove(), 520)
  }
  document.addEventListener('pointerdown', onRipple, { passive: true })
  destroyers.push(() => document.removeEventListener('pointerdown', onRipple))

  /* ---- 磁吸按钮 ---- */
  if (!motionPrefs.reduced && !motionPrefs.coarse) {
    const magnets = Array.from(
      document.querySelectorAll<HTMLElement>('[data-magnetic], .askbar__send, .cta-stage__btn, .hero__hint, .tpl-chip'),
    )
    type Mag = {
      el: HTMLElement
      sx: ReturnType<typeof createSpring>
      sy: ReturnType<typeof createSpring>
      live: boolean
    }
    const items: Mag[] = magnets.map((el) => ({
      el,
      sx: createSpring({ ...SPRING.ui, value: 0 }),
      sy: createSpring({ ...SPRING.ui, value: 0 }),
      live: false,
    }))

    for (const it of items) {
      const onMove = (e: PointerEvent): void => {
        const r = it.el.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        const dist = Math.hypot(dx, dy)
        const radius = Math.max(r.width, r.height) * 0.9
        if (dist > radius) {
          it.sx.to(0)
          it.sy.to(0)
          it.live = false
          return
        }
        it.live = true
        const pull = 1 - dist / radius
        it.sx.to(dx * 0.28 * pull)
        it.sy.to(dy * 0.28 * pull)
      }
      const onLeave = (): void => {
        it.live = false
        it.sx.to(0)
        it.sy.to(0)
      }
      it.el.addEventListener('pointermove', onMove)
      it.el.addEventListener('pointerleave', onLeave)
      destroyers.push(() => {
        it.el.removeEventListener('pointermove', onMove)
        it.el.removeEventListener('pointerleave', onLeave)
        it.el.style.transform = ''
      })
    }

    const off = loop.add((dt) => {
      for (const it of items) {
        const x = it.sx.update(dt)
        const y = it.sy.update(dt)
        if (it.sx.atRest && it.sy.atRest && !it.live) {
          if (it.el.style.transform) it.el.style.transform = ''
          continue
        }
        it.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
      }
    })
    destroyers.push(off)
  }

  /* ---- 探索提示（完成后消失） ---- */
  const tips = [
    { id: 'gaze', text: '移动视线，角色会跟着看你', event: 'pointermove', once: true },
    { id: 'ask', text: '点快捷问题，或直接输入试试', event: 'doubao:asked', once: true },
    { id: 'scroll', text: '向下滚动，镜头会跟着换景', event: 'wheel', once: true },
  ] as const

  let tipEl = document.getElementById('exploreHint')
  if (!tipEl) {
    tipEl = document.createElement('div')
    tipEl.id = 'exploreHint'
    tipEl.className = 'explore-hint'
    tipEl.setAttribute('aria-live', 'polite')
    document.body.appendChild(tipEl)
  }

  const done = new Set<string>()
  try {
    const raw = sessionStorage.getItem('doubao-explore') || ''
    raw.split(',').filter(Boolean).forEach((k) => done.add(k))
  } catch {
    /* ignore */
  }

  let tipIndex = 0
  let tipTimer = 0

  const persist = (): void => {
    try {
      sessionStorage.setItem('doubao-explore', [...done].join(','))
    } catch {
      /* ignore */
    }
  }

  const showNext = (): void => {
    while (tipIndex < tips.length && done.has(tips[tipIndex]!.id)) tipIndex += 1
    if (tipIndex >= tips.length || !tipEl) {
      tipEl?.classList.remove('is-on')
      tipEl?.setAttribute('hidden', '')
      return
    }
    const tip = tips[tipIndex]!
    tipEl.hidden = false
    tipEl.textContent = tip.text
    tipEl.classList.add('is-on')
    window.clearTimeout(tipTimer)
    tipTimer = window.setTimeout(() => tipEl?.classList.remove('is-on'), 4200)
  }

  const complete = (id: string): void => {
    if (done.has(id)) return
    done.add(id)
    persist()
    tipEl?.classList.remove('is-on')
    tipIndex += 1
    window.setTimeout(showNext, 600)
  }

  // 绑定完成条件
  const onMoveOnce = (): void => complete('gaze')
  window.addEventListener('pointermove', onMoveOnce, { passive: true, once: true })
  destroyers.push(() => window.removeEventListener('pointermove', onMoveOnce))

  const onAsked = (): void => complete('ask')
  document.addEventListener('doubao:asked', onAsked)
  destroyers.push(() => document.removeEventListener('doubao:asked', onAsked))

  const onWheel = (): void => complete('scroll')
  window.addEventListener('wheel', onWheel, { passive: true, once: true })
  window.addEventListener('touchstart', onWheel, { passive: true, once: true })
  destroyers.push(() => {
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('touchstart', onWheel)
  })

  window.setTimeout(showNext, 1800)
  destroyers.push(() => window.clearTimeout(tipTimer))

  /* ---- 触屏等价：卡片按下缩放 ---- */
  if (motionPrefs.coarse) {
    root.classList.add('touch-feedback')
    const onDown = (e: PointerEvent): void => {
      const el = (e.target as HTMLElement)?.closest<HTMLElement>('.cap-card, .tpl-chip, .hero-branch, .alcove-door')
      el?.classList.add('is-press')
    }
    const onUp = (): void => {
      document.querySelectorAll('.is-press').forEach((n) => n.classList.remove('is-press'))
    }
    document.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('pointerup', onUp, { passive: true })
    destroyers.push(() => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
    })
  }

  void gsap
  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
