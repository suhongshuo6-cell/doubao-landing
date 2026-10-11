/**
 * sections/ctaStage.ts — 结尾收束 CTA
 * 全身镜头感 · 章节标签收成细线汇入输入框 · 「现在，说一句给她听。」
 * 回首屏 · GitHub · 烟花 ≤1s 不挡字
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'
import { CHAPTERS } from '../motion/chapters'

export function initCtaStage(): () => void {
  const stage = document.getElementById('ctaStage')
  if (!stage) return () => undefined
  const destroyers: Array<() => void> = []

  // 章节标签条
  let tags = stage.querySelector<HTMLElement>('.cta-chapters')
  if (!tags) {
    tags = document.createElement('div')
    tags.className = 'cta-chapters'
    tags.setAttribute('aria-hidden', 'true')
    tags.innerHTML = CHAPTERS.map(
      (c) => `<span class="cta-chapters__tag" data-cta-tag="${c.id}"><b>${c.no}</b>${c.label}</span>`,
    ).join('') + `<i class="cta-chapters__line"></i>`
    const title = stage.querySelector('.cta-stage__title')
    title?.parentElement?.insertBefore(tags, title)
  }

  if (!motionPrefs.reduced) {
    const tween = gsap.fromTo(
      stage.querySelectorAll('.cta-chapters, .cta-stage__title, .cta-stage__lead, .cta-stage__actions > *'),
      { opacity: 0, y: 40, filter: 'blur(8px)' },
      {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.78,
        stagger: 0.09,
        ease: 'power3.out',
        scrollTrigger: { trigger: stage, start: 'top 72%', once: true },
      },
    )
    destroyers.push(() => {
      tween.scrollTrigger?.kill()
      tween.kill()
    })
  }

  const collapseTags = (): void => {
    if (motionPrefs.reduced) return
    const tagEls = tags?.querySelectorAll<HTMLElement>('.cta-chapters__tag')
    const line = tags?.querySelector<HTMLElement>('.cta-chapters__line')
    if (!tagEls?.length) return
    const tl = gsap.timeline()
    tl.to(tagEls, {
      y: 18,
      scaleX: 0.2,
      scaleY: 0.35,
      opacity: 0.35,
      duration: 0.42,
      stagger: 0.04,
      ease: EASE_IN,
    })
    if (line) {
      tl.fromTo(
        line,
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 0.45, ease: 'power2.out' },
        '-=0.2',
      )
      tl.to(line, { y: 28, opacity: 0.4, duration: 0.35 }, '+=0.05')
    }
  }

  const microFireworks = (): void => {
    const layer = document.createElement('div')
    layer.className = 'cta-sparks'
    layer.setAttribute('aria-hidden', 'true')
    stage.appendChild(layer)
    const colors = ['#FF5A3C', '#FFB020', '#7EB6FF', '#F9A8D4']
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('i')
      const ang = (Math.PI * 2 * i) / 18
      const dist = 40 + Math.random() * 70
      s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`)
      s.style.setProperty('--dy', `${Math.sin(ang) * dist}px`)
      s.style.background = colors[i % colors.length]!
      layer.appendChild(s)
    }
    requestAnimationFrame(() => layer.classList.add('is-on'))
    window.setTimeout(() => layer.remove(), 1000)
  }

  const goHero = (): void => {
    collapseTags()
    microFireworks()
    document.getElementById('hero')?.scrollIntoView({
      behavior: motionPrefs.reduced ? 'auto' : 'smooth',
      block: 'start',
    })
    window.setTimeout(() => {
      const input = document.getElementById('askInput')
      const bar = document.getElementById('askbar')
      if (input instanceof HTMLInputElement) {
        input.focus()
        input.classList.add('is-pulse')
        bar?.classList.add('is-filled')
        window.setTimeout(() => {
          input.classList.remove('is-pulse')
          bar?.classList.remove('is-filled')
        }, 900)
      }
    }, 560)
  }

  const primary = stage.querySelector<HTMLElement>('.cta-stage__btn')
  if (primary) {
    primary.addEventListener('click', goHero)
    destroyers.push(() => primary.removeEventListener('click', goHero))
  }

  // 滚入 CTA 时也轻收一次标签（仅视觉）
  if (!motionPrefs.reduced) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          stage.classList.add('is-cta-live')
        }
      },
      { threshold: 0.35 },
    )
    io.observe(stage)
    destroyers.push(() => io.disconnect())
  }

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
