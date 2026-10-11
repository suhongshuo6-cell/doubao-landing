/**
 * sections/commandStage.ts — 全屏命令舞台 + Command Deck 开场
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'
import { COMMAND_SCRIPTS } from '../experience/experienceState'
import type { ExperienceDirector } from '../experience/experienceDirector'

export interface CommandStageHooks {
  director: ExperienceDirector
  onIntroDone?(): void
  onBurst?(x: number, y: number): void
}

export function initCommandStage(hooks: CommandStageHooks): () => void {
  const section = document.getElementById('command-stage')
  const claim = document.getElementById('commandClaim')
  const deck = document.getElementById('commandDeck')
  const input = document.getElementById('askInput')
  const trail = document.getElementById('orangeTrail')
  const orbits = section?.querySelectorAll<HTMLElement>('[data-orbit]')
  const destroyers: Array<() => void> = []
  if (!section || !deck) return () => undefined

  const TITLE = '把想法，说给豆包听。'

  /* ---- 开场 800–1200ms：逐字 + 橙轨迹汇入输入框 ---- */
  const runIntro = (): void => {
    document.documentElement.classList.add('intro-playing')
    if (claim) {
      claim.innerHTML = ''
      const chars = [...TITLE]
      chars.forEach((ch) => {
        const span = document.createElement('span')
        span.className = 'hero-char'
        span.textContent = ch === ' ' ? '\u00a0' : ch
        span.style.opacity = '0'
        claim.appendChild(span)
      })
    }
    const chars = claim?.querySelectorAll<HTMLElement>('.hero-char') ?? []
    const dur = motionPrefs.reduced ? 0.2 : 1.05
    const tl = gsap.timeline({
      onComplete: () => {
        document.documentElement.classList.remove('intro-playing')
        document.documentElement.classList.add('intro-done')
        hooks.onIntroDone?.()
        hooks.director.listen()
      },
    })

    if (motionPrefs.reduced) {
      gsap.set(chars, { opacity: 1 })
      gsap.set(deck, { opacity: 1, y: 0, scale: 1 })
      orbits?.forEach((el) => gsap.set(el, { opacity: 1 }))
      document.documentElement.classList.remove('intro-playing')
      document.documentElement.classList.add('intro-done')
      hooks.onIntroDone?.()
      hooks.director.listen()
      return
    }

    tl.fromTo(
      section.querySelector('.s-cmd__wash'),
      { opacity: 0.2, filter: 'blur(18px)' },
      { opacity: 1, filter: 'blur(0px)', duration: 0.9, ease: EASE_IN },
      0,
    )
    tl.fromTo(
      deck,
      { opacity: 0, y: 36, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1, duration: 0.85, ease: EASE_IN },
      0.12,
    )
    chars.forEach((el, i) => {
      tl.fromTo(
        el,
        { opacity: 0, y: 18, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.38, ease: EASE_IN },
        0.18 + i * 0.028,
      )
    })
    if (orbits) {
      orbits.forEach((el, i) => {
        tl.fromTo(
          el,
          { opacity: 0, scale: 0.7 },
          { opacity: 1, scale: 1, duration: 0.6, ease: EASE_IN },
          0.35 + i * 0.08,
        )
      })
    }
    // 橙轨迹：从标题末字飞向输入框
    if (trail && input) {
      tl.call(() => {
        const last = chars[chars.length - 1]
        const from = last?.getBoundingClientRect()
        const to = input.getBoundingClientRect()
        if (!from) return
        trail.classList.add('is-on')
        const x0 = from.left + from.width / 2
        const y0 = from.top + from.height / 2
        const x1 = to.left + to.width * 0.35
        const y1 = to.top + to.height / 2
        gsap.fromTo(
          trail,
          { left: x0, top: y0, opacity: 1, scale: 1 },
          {
            left: x1,
            top: y1,
            opacity: 0,
            scale: 0.4,
            duration: 0.55,
            ease: 'power2.inOut',
            onComplete: () => {
              trail.classList.remove('is-on')
              deck.classList.add('is-pulse')
              window.setTimeout(() => deck.classList.remove('is-pulse'), 600)
            },
          },
        )
      }, [], dur * 0.72)
    }
    void dur
  }

  /* ---- 种子命令 ---- */
  section.querySelectorAll<HTMLButtonElement>('[data-cmd-seed]').forEach((btn) => {
    const onClick = (): void => {
      const id = btn.dataset.cmdSeed
      const script = COMMAND_SCRIPTS.find((s) => s.id === id)
      const text = script?.seed ?? btn.textContent ?? ''
      if (input instanceof HTMLInputElement) input.value = text
      const r = btn.getBoundingClientRect()
      hooks.director.submit(text, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
      hooks.onBurst?.(r.left + r.width / 2, r.top + r.height / 2)
      btn.classList.add('is-fired')
      window.setTimeout(() => btn.classList.remove('is-fired'), 500)
    }
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  /* 发送桥接：仅监听 askbar 的 doubao:ask-send，避免与 Enter 双触发 */

  // 监听 askbar 自定义发送
  const onAskSend = (e: Event): void => {
    const d = (e as CustomEvent<{ text: string; x: number; y: number }>).detail
    if (d?.text) hooks.director.submit(d.text, { x: d.x, y: d.y })
  }
  document.addEventListener('doubao:ask-send', onAskSend)
  destroyers.push(() => document.removeEventListener('doubao:ask-send', onAskSend))

  /* ---- 轨道缓慢漂移 ---- */
  let raf = 0
  if (!motionPrefs.reduced && orbits) {
    const start = performance.now()
    const tick = (now: number): void => {
      const t = (now - start) / 1000
      orbits.forEach((el, i) => {
        const a = t * (0.15 + i * 0.04) + i
        const x = Math.sin(a) * (8 + i * 3)
        const y = Math.cos(a * 0.85) * (6 + i * 2)
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    destroyers.push(() => cancelAnimationFrame(raf))
  }

  window.setTimeout(runIntro, 40)

  return () => {
    destroyers.forEach((d) => d())
    cancelAnimationFrame(raf)
  }
}
