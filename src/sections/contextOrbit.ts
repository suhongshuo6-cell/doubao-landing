/**
 * sections/contextOrbit.ts — 上下文轨道（听见→理解）
 * 嵌入对照 / 模板 / 数字，不再作独立主章
 */
import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'
import { EXP, emit } from '../experience/events'
import type { ExperienceDirector } from '../experience/experienceDirector'
import type { FrameLoop } from '../lib/frameLoop'

export function initContextOrbit(opts: {
  director: ExperienceDirector
  loop: FrameLoop
}): () => void {
  const section = document.getElementById('context-orbit')
  if (!section) return () => undefined
  const destroyers: Array<() => void> = []
  const cards = Array.from(section.querySelectorAll<HTMLElement>('[data-orbit-card]'))
  const title = section.querySelector<HTMLElement>('[data-act-title]')

  // 模板灌入
  section.querySelectorAll<HTMLButtonElement>('[data-tpl]').forEach((btn) => {
    const onClick = (): void => {
      const text = btn.dataset.tpl ?? ''
      const input = document.getElementById('askInput')
      if (input instanceof HTMLInputElement) {
        input.value = text
        input.focus()
      }
      const r = btn.getBoundingClientRect()
      opts.director.submit(text, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
      btn.classList.add('is-fired')
      window.setTimeout(() => btn.classList.remove('is-fired'), 450)
    }
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  // 数字滚动
  const counters = Array.from(section.querySelectorAll<HTMLElement>('[data-count]'))
  const st = ScrollTrigger.create({
    trigger: section,
    start: 'top 65%',
    once: true,
    onEnter: () => {
      counters.forEach((el) => {
        const target = Number(el.dataset.count || 0)
        const suffix = el.dataset.countSuffix || ''
        if (motionPrefs.reduced) {
          el.textContent = `${target}${suffix}`
          return
        }
        const state = { v: 0 }
        gsap.to(state, {
          v: target,
          duration: 1.1,
          ease: EASE_IN,
          onUpdate: () => {
            el.textContent = `${Math.round(state.v)}${suffix}`
          },
        })
      })
      opts.director.completeScene()
      emit(EXP.CHAPTER, { id: 'understand' })
    },
  })
  destroyers.push(() => st.kill())

  // 卡片环绕偏移动效
  if (!motionPrefs.reduced) {
    const st2 = ScrollTrigger.create({
      trigger: section,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const p = self.progress
        cards.forEach((card, i) => {
          const ang = (i / Math.max(1, cards.length)) * Math.PI * 2 + p * Math.PI
          const r = 12 + i * 4
          card.style.setProperty('--ox', `${(Math.cos(ang) * r).toFixed(1)}px`)
          card.style.setProperty('--oy', `${(Math.sin(ang) * r * 0.6).toFixed(1)}px`)
        })
        if (title) title.style.setProperty('--tp', p.toFixed(3))
      },
    })
    destroyers.push(() => st2.kill())
  }

  void opts.loop
  return () => destroyers.forEach((d) => d())
}
