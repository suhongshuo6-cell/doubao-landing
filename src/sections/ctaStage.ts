/**
 * sections/ctaStage.ts — 大 CTA 舞台
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'

export function initCtaStage(): () => void {
  const stage = document.getElementById('ctaStage')
  if (!stage) return () => undefined
  const destroyers: Array<() => void> = []

  if (!motionPrefs.reduced) {
    const tween = gsap.fromTo(
      stage.querySelectorAll('.cta-stage__title, .cta-stage__lead, .cta-stage__actions > *'),
      { opacity: 0, y: 48, filter: 'blur(10px)' },
      {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.8,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: stage, start: 'top 75%', once: true },
      },
    )
    destroyers.push(() => {
      tween.scrollTrigger?.kill()
      tween.kill()
    })
  }

  const primary = stage.querySelector<HTMLElement>('.cta-stage__btn')
  if (primary) {
    const onClick = (): void => {
      document.getElementById('hero')?.scrollIntoView({
        behavior: motionPrefs.reduced ? 'auto' : 'smooth',
        block: 'start',
      })
      window.setTimeout(() => {
        const input = document.getElementById('askInput')
        if (input instanceof HTMLInputElement) {
          input.focus()
          input.classList.add('is-pulse')
          window.setTimeout(() => input.classList.remove('is-pulse'), 900)
        }
      }, 500)
    }
    primary.addEventListener('click', onClick)
    destroyers.push(() => primary.removeEventListener('click', onClick))
  }

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
