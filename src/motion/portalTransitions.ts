/**
 * motion/portalTransitions.ts — 非 fade 转场：大字遮罩 / 穿屏 / portal / 景深 / 横向速度
 */
import gsap from 'gsap'
import { ScrollTrigger } from './lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from './eases'
import type { FrameLoop } from '../lib/frameLoop'
import type { ScrollController } from './lenisSetup'

interface PortalDef {
  trigger: string
  kind: 'mask' | 'pierce' | 'portal' | 'depth' | 'velocity'
  word?: string
}

const PORTALS: PortalDef[] = [
  { trigger: '#context-orbit', kind: 'mask', word: '听见' },
  { trigger: '#morph-workbench', kind: 'pierce', word: '理解' },
  { trigger: '#story-time-machine', kind: 'portal', word: '创作' },
  { trigger: '#replay-cta', kind: 'depth', word: '完成' },
]

export function initPortalTransitions(opts: {
  loop: FrameLoop
  scroll: ScrollController
}): () => void {
  if (motionPrefs.reduced) return () => undefined

  const destroyers: Array<() => void> = []
  let veil = document.getElementById('portalVeil')
  if (!veil) {
    veil = document.createElement('div')
    veil.id = 'portalVeil'
    veil.className = 'portal-veil'
    veil.innerHTML = `<span class="portal-veil__word" id="portalWord"></span><i class="portal-veil__iris"></i>`
    document.body.appendChild(veil)
  }
  const wordEl = document.getElementById('portalWord')
  const iris = veil.querySelector<HTMLElement>('.portal-veil__iris')

  const play = (kind: PortalDef['kind'], word?: string): void => {
    if (!veil) return
    veil.dataset.kind = kind
    if (wordEl) wordEl.textContent = word ?? ''
    veil.classList.add('is-on')

    const tl = gsap.timeline({
      onComplete: () => veil?.classList.remove('is-on'),
    })

    if (kind === 'mask') {
      gsap.set(veil, { clipPath: 'inset(0 0 100% 0)', opacity: 1 })
      if (wordEl) gsap.set(wordEl, { scale: 1.4, opacity: 0 })
      tl.to(veil, { clipPath: 'inset(0 0 0% 0)', duration: 0.35, ease: 'power3.in' })
      tl.to(wordEl, { scale: 1, opacity: 1, duration: 0.28, ease: EASE_IN }, 0.12)
      tl.to(veil, { clipPath: 'inset(100% 0 0 0)', duration: 0.4, ease: 'power3.out' }, 0.45)
      tl.to(wordEl, { opacity: 0, duration: 0.2 }, 0.55)
    } else if (kind === 'pierce') {
      gsap.set(veil, { clipPath: 'inset(0 50% 0 50%)', opacity: 1 })
      tl.to(veil, { clipPath: 'inset(0 0% 0 0%)', duration: 0.28, ease: 'power4.in' })
      tl.to(wordEl, { opacity: 1, letterSpacing: '0.4em', duration: 0.25 }, 0.1)
      tl.to(veil, { clipPath: 'inset(0 50% 0 50%)', opacity: 0, duration: 0.35, ease: 'power3.out' }, 0.4)
    } else if (kind === 'portal') {
      gsap.set(iris, { scale: 0.15, opacity: 1 })
      gsap.set(veil, { opacity: 1, clipPath: 'none', background: 'radial-gradient(circle, transparent 0%, #F7F6F3 42%, #FF4D2E22 100%)' })
      tl.to(iris, { scale: 18, duration: 0.7, ease: 'power2.inOut' })
      tl.to(wordEl, { opacity: 1, scale: 1, duration: 0.3, ease: EASE_IN }, 0.15)
      tl.to(veil, { opacity: 0, duration: 0.35 }, 0.55)
    } else if (kind === 'depth') {
      gsap.set(veil, { opacity: 0, filter: 'blur(0px)', clipPath: 'none', background: 'rgba(247,246,243,0.72)' })
      tl.to(veil, { opacity: 1, filter: 'blur(16px)', duration: 0.35, ease: 'power2.in' })
      tl.to(wordEl, { opacity: 1, y: 0, duration: 0.3, ease: EASE_IN }, 0.1)
      tl.to(veil, { opacity: 0, filter: 'blur(0px)', duration: 0.45, ease: EASE_IN }, 0.45)
    } else {
      // velocity smear handled via CSS var in loop
      document.documentElement.classList.add('portal-velocity')
      window.setTimeout(() => document.documentElement.classList.remove('portal-velocity'), 700)
      veil.classList.remove('is-on')
    }
  }

  PORTALS.forEach((p) => {
    const el = document.querySelector(p.trigger)
    if (!el) return
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 72%',
      once: true,
      onEnter: () => play(p.kind, p.word),
    })
    destroyers.push(() => st.kill())
  })

  // 横向速度：根据滚动速度写 CSS 变量
  let lastY = 0
  const stop = opts.loop.add((dt) => {
    const y = window.scrollY
    const v = dt > 0 ? (y - lastY) / dt : 0
    lastY = y
    const smear = Math.max(-40, Math.min(40, v * 0.02))
    document.documentElement.style.setProperty('--portal-smear', `${smear.toFixed(1)}px`)
  })
  destroyers.push(stop)

  void opts.scroll
  return () => destroyers.forEach((d) => d())
}
