/**
 * motion/spectacle.ts — 换代 Motion 系统层
 *
 * 1) 鼠标跟随光斑增强 + 磁性按钮
 * 2) 滚动段落错落入场（强 spring / 可过冲）
 * 3) 章节切换光带 / 粒子汇聚
 * 4) 产品向数字计数器滚动
 */

import gsap from 'gsap'
import { ScrollTrigger } from './lenisSetup'
import { createSpring, SPRING } from '../lib/spring'
import { motionPrefs } from '../lib/motionPrefs'
import type { FrameLoop } from '../lib/frameLoop'

export interface SpectacleOpts {
  loop: FrameLoop
}

export function initSpectacle({ loop }: SpectacleOpts): () => void {
  const destroyers: Array<() => void> = []

  if (!motionPrefs.reduced) {
    destroyers.push(initMagneticButtons(loop))
    destroyers.push(initStaggerReveal())
    destroyers.push(initSectionBands())
  }
  destroyers.push(initProductCounters())
  destroyers.push(enhanceCursorGlow(loop))

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}

/* ─── 磁性按钮 ─── */
function initMagneticButtons(loop: FrameLoop): () => void {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-magnetic], .cta-primary, .cta-ghost, .hero-branch, .askbar__send, .demo-chip, .hl-tab, .cap-op, .tpl-chip, .day-tab',
    ),
  )
  if (!nodes.length || motionPrefs.coarse) return () => undefined

  type Mag = {
    el: HTMLElement
    sx: ReturnType<typeof createSpring>
    sy: ReturnType<typeof createSpring>
    hovering: boolean
  }
  const mags: Mag[] = nodes.map((el) => ({
    el,
    sx: createSpring({ ...SPRING.ui, value: 0 }),
    sy: createSpring({ ...SPRING.ui, value: 0 }),
    hovering: false,
  }))

  const onMove = (event: PointerEvent): void => {
    const { clientX: mx, clientY: my } = event
    for (const m of mags) {
      const rect = m.el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = mx - cx
      const dy = my - cy
      const dist = Math.hypot(dx, dy)
      const radius = Math.max(rect.width, rect.height) * 1.35
      if (dist < radius) {
        m.hovering = true
        const pull = 1 - dist / radius
        m.sx.to(dx * 0.22 * pull)
        m.sy.to(dy * 0.22 * pull)
      } else if (m.hovering) {
        m.hovering = false
        m.sx.to(0)
        m.sy.to(0)
      }
    }
  }

  window.addEventListener('pointermove', onMove, { passive: true })

  const removeTick = loop.add((dt) => {
    for (const m of mags) {
      const x = m.sx.update(dt)
      const y = m.sy.update(dt)
      if (m.sx.atRest && m.sy.atRest && !m.hovering) {
        if (m.el.style.transform) m.el.style.transform = ''
        continue
      }
      m.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
    }
  })

  return () => {
    window.removeEventListener('pointermove', onMove)
    removeTick()
    for (const m of mags) m.el.style.transform = ''
  }
}

/* ─── 错落入场（强 spring） ─── */
function initStaggerReveal(): () => void {
  const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-stagger]'))
  const tweens: gsap.core.Tween[] = []

  groups.forEach((group) => {
    const kids = Array.from(group.children) as HTMLElement[]
    if (!kids.length) return
    gsap.set(kids, { opacity: 0, y: 56, rotateX: 8, transformPerspective: 800 })
    tweens.push(
      gsap.to(kids, {
        opacity: 1,
        y: 0,
        rotateX: 0,
        duration: 0.95,
        stagger: 0.09,
        ease: 'elastic.out(1, 0.55)',
        scrollTrigger: { trigger: group, start: 'top 82%', once: true },
      }),
    )
  })

  document.querySelectorAll<HTMLElement>('[data-spectacle]').forEach((el) => {
    const fromY = Number(el.dataset.spectacleY || 64)
    tweens.push(
      gsap.fromTo(
        el,
        { opacity: 0, y: fromY, scale: 0.94, filter: 'blur(10px)' },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 1.05,
          ease: 'elastic.out(1, 0.62)',
          scrollTrigger: { trigger: el, start: 'top 86%', once: true },
        },
      ),
    )
  })

  return () => {
    for (const t of tweens) {
      t.scrollTrigger?.kill()
      t.kill()
    }
  }
}

/* ─── 章节光带 ─── */
function initSectionBands(): () => void {
  const band = document.createElement('div')
  band.className = 'spectacle-band'
  band.setAttribute('aria-hidden', 'true')
  document.body.appendChild(band)

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>('main > section[id], #footer'),
  )
  let lastId = ''
  let cooldown = 0

  const triggers = sections.map((sec) =>
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 55%',
      end: 'bottom 45%',
      onEnter: () => fire(sec.id || 'sec'),
      onEnterBack: () => fire(sec.id || 'sec'),
    }),
  )

  function fire(id: string): void {
    const now = performance.now()
    if (id === lastId || now < cooldown) return
    lastId = id
    cooldown = now + 680
    band.classList.remove('is-fire')
    void band.offsetWidth
    band.classList.add('is-fire')
    spawnGather(band)
  }

  return () => {
    for (const t of triggers) t.kill()
    band.remove()
  }
}

function spawnGather(host: HTMLElement): void {
  if (motionPrefs.reduced) return
  const n = 10
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i')
    p.className = 'spectacle-band__dot'
    const angle = (i / n) * Math.PI * 2
    const dist = 40 + Math.random() * 70
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    p.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.35}px`)
    p.style.animationDelay = `${i * 18}ms`
    host.appendChild(p)
    window.setTimeout(() => p.remove(), 900)
  }
}

/* ─── 产品向计数器 ─── */
function initProductCounters(): () => void {
  const values = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'))
  if (!values.length) return () => undefined

  if (motionPrefs.reduced) {
    values.forEach((el) => {
      el.textContent = el.dataset.count ?? el.textContent
    })
    return () => undefined
  }

  const tweens: gsap.core.Tween[] = []
  values.forEach((el) => {
    const target = Number(el.dataset.count ?? '0')
    if (!Number.isFinite(target)) return
    const suffix = el.dataset.countSuffix ?? ''
    const prefix = el.dataset.countPrefix ?? ''
    const proxy = { value: 0 }
    el.textContent = `${prefix}0${suffix}`
    tweens.push(
      gsap.to(proxy, {
        value: target,
        duration: 1.55,
        ease: 'power3.out',
        snap: { value: target % 1 === 0 ? 1 : 0.1 },
        onUpdate: () => {
          const v = target % 1 === 0 ? Math.round(proxy.value) : Number(proxy.value).toFixed(1)
          el.textContent = `${prefix}${v}${suffix}`
        },
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      }),
    )
  })

  return () => {
    for (const t of tweens) {
      t.scrollTrigger?.kill()
      t.kill()
    }
  }
}

/* ─── 光斑增强 ─── */
function enhanceCursorGlow(loop: FrameLoop): () => void {
  const glow = document.getElementById('cursorGlow')
  if (!glow || motionPrefs.coarse) return () => undefined

  glow.classList.add('cursor-glow--spectacle')
  const sx = createSpring({ ...SPRING.pointer, value: window.innerWidth / 2 })
  const sy = createSpring({ ...SPRING.pointer, value: window.innerHeight / 2 })
  let active = false

  const onMove = (e: PointerEvent): void => {
    sx.to(e.clientX)
    sy.to(e.clientY)
    active = true
    glow.classList.add('is-live')
  }
  window.addEventListener('pointermove', onMove, { passive: true })

  const removeTick = loop.add((dt) => {
    if (!active) return
    const x = sx.update(dt)
    const y = sy.update(dt)
    glow.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
  })

  return () => {
    window.removeEventListener('pointermove', onMove)
    removeTick()
    glow.classList.remove('cursor-glow--spectacle', 'is-live')
  }
}
