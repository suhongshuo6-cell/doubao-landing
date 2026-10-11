import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'

/**
 * 2 / 定位区 —— 浅色清晰卡片 + 事实行错峰浮现
 */
export function initPositioning(): () => void {
  const copy = document.querySelector<HTMLElement>('.s-pos__copy')
  const rows = document.querySelectorAll<HTMLElement>('.facts__row')
  if (!rows.length) return () => undefined

  if (motionPrefs.reduced) {
    gsap.set(rows, { opacity: 1, y: 0, clearProps: 'transform' })
    return () => undefined
  }

  const tweens: gsap.core.Tween[] = []

  if (copy) {
    tweens.push(
      gsap.fromTo(
        copy,
        { opacity: 0, y: 36, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: copy, start: 'top 88%', once: true },
        },
      ),
    )
  }

  tweens.push(
    gsap.fromTo(
      rows,
      { opacity: 0, y: 26, x: -12 },
      {
        opacity: 1,
        y: 0,
        x: 0,
        duration: 0.78,
        ease: 'back.out(1.55)',
        stagger: 0.1,
        scrollTrigger: { trigger: '.facts', start: 'top 88%', once: true },
      },
    ),
  )

  rows.forEach((row) => {
    const onEnter = (): void => {
      row.classList.add('is-hot')
      gsap.to(row, { x: 6, duration: 0.25, overwrite: 'auto' })
    }
    const onLeave = (): void => {
      row.classList.remove('is-hot')
      gsap.to(row, { x: 0, duration: 0.3, overwrite: 'auto' })
    }
    row.addEventListener('pointerenter', onEnter)
    row.addEventListener('pointerleave', onLeave)
  })

  return () => {
    for (const tween of tweens) {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
    ScrollTrigger.refresh()
  }
}
