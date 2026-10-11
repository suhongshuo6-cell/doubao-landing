/**
 * motion/gates.ts — 章节粒子门（滚入章节时爆发一簇）
 */
import gsap from 'gsap'
import { ScrollTrigger } from './lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'

export interface GateHooks {
  burst?(x: number, y: number): void
}

export function initChapterGates(hooks: GateHooks = {}): () => void {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-gate]'))
  if (!sections.length) return () => undefined
  const destroyers: Array<() => void> = []

  for (const section of sections) {
    // 视觉光带
    let band = section.querySelector<HTMLElement>('.chapter-gate')
    if (!band) {
      band = document.createElement('div')
      band.className = 'chapter-gate'
      band.setAttribute('aria-hidden', 'true')
      section.prepend(band)
    }

    if (motionPrefs.reduced) continue

    const st = ScrollTrigger.create({
      trigger: section,
      start: 'top 78%',
      once: true,
      onEnter: () => {
        section.classList.add('is-gate-open')
        const rect = section.getBoundingClientRect()
        const x = rect.left + rect.width * 0.5
        const y = rect.top + Math.min(80, rect.height * 0.15)
        hooks.burst?.(x, y)
        gsap.fromTo(
          band!,
          { scaleX: 0, opacity: 0.9 },
          { scaleX: 1, opacity: 0, duration: 1.1, ease: 'power3.out' },
        )
      },
    })
    destroyers.push(() => st.kill())
  }

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
