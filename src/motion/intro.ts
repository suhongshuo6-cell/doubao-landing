/**
 * motion/intro.ts — 电影式首屏开场 800–1200ms
 * 柔焦 → 标题逐字 → 输入框弹簧入 → 视线微动 → 「正在连接豆包」
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from './eases'

export function runHeroIntro(): () => void {
  const root = document.documentElement
  const hero = document.getElementById('hero')
  const claim = hero?.querySelector<HTMLElement>('.hero__claim')
  const ask = document.getElementById('heroAsk')
  const hints = document.getElementById('askHints')
  const status = document.getElementById('connectStatus')
  const wash = hero?.querySelector<HTMLElement>('.s-hero__wash')

  if (!hero || motionPrefs.reduced) {
    root.classList.add('intro-done')
    status?.removeAttribute('hidden')
    if (status) status.textContent = '已连接'
    claim?.classList.add('is-split')
    ask?.classList.add('is-in')
    hints?.classList.add('is-in')
    return () => undefined
  }

  root.classList.add('intro-playing')
  const destroyers: Array<() => void> = []

  // 拆字
  if (claim && !claim.dataset.split) {
    const text = claim.textContent ?? ''
    claim.dataset.split = '1'
    claim.textContent = ''
    const frag = document.createDocumentFragment()
    Array.from(text).forEach((ch) => {
      const span = document.createElement('span')
      span.className = 'hero-char'
      span.textContent = ch === ' ' ? '\u00a0' : ch
      frag.appendChild(span)
    })
    claim.appendChild(frag)
    claim.classList.add('is-split')
  }

  const chars = claim?.querySelectorAll<HTMLElement>('.hero-char') ?? []
  gsap.set(chars, { opacity: 0, y: 18, filter: 'blur(8px)' })
  gsap.set(ask, { opacity: 0, y: 36, scale: 0.92 })
  gsap.set(hints, { opacity: 0, y: 16 })
  if (wash) gsap.set(wash, { filter: 'blur(14px)', opacity: 0.85 })
  if (status) {
    status.hidden = false
    status.textContent = '正在连接豆包…'
    status.classList.add('is-connecting')
  }

  const tl = gsap.timeline({
    defaults: { ease: EASE_IN },
    onComplete: () => {
      root.classList.remove('intro-playing')
      root.classList.add('intro-done')
      if (status) {
        status.textContent = '已连接'
        status.classList.remove('is-connecting')
        status.classList.add('is-connected')
        window.setTimeout(() => status.classList.add('is-fade'), 1600)
      }
    },
  })

  // 柔焦消散 ~280ms
  if (wash) {
    tl.to(wash, { filter: 'blur(0px)', opacity: 1, duration: 0.32 }, 0)
  } else {
    tl.to({}, { duration: 0.12 }, 0)
  }

  // 标题逐字 420ms
  if (chars.length) {
    tl.to(
      chars,
      {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.42,
        stagger: 0.028,
        ease: 'power3.out',
      },
      0.18,
    )
  }

  // 输入框弹簧入
  tl.to(
    ask,
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.55,
      ease: 'back.out(1.7)',
      onStart: () => ask?.classList.add('is-in'),
    },
    0.48,
  )

  // 快捷问题
  tl.to(
    hints,
    {
      opacity: 1,
      y: 0,
      duration: 0.4,
      ease: 'power2.out',
      onStart: () => hints?.classList.add('is-in'),
    },
    0.72,
  )

  // 视线微动（驱动 CSS 变量，角色层可读取）
  const gaze = { x: 0, y: 0 }
  tl.to(
    gaze,
    {
      x: 0.035,
      y: -0.018,
      duration: 0.55,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: 1,
      onUpdate: () => {
        root.style.setProperty('--gaze-x', gaze.x.toFixed(4))
        root.style.setProperty('--gaze-y', gaze.y.toFixed(4))
      },
    },
    0.55,
  )

  // 连接状态收束
  if (status) {
    tl.to({}, { duration: 0.15 }, 0.95)
  }

  destroyers.push(() => tl.kill())

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
