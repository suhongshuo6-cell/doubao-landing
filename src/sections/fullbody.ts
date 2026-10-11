import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import type { Stage } from '../three/stage'
import { motionPrefs } from '../lib/motionPrefs'

/**
 * 6 / 全身取景区 —— Gen2：引导更吵、步骤逐步点亮
 */
export function initFullBody(stage: Stage): () => void {
  const section = document.getElementById('fullbody')
  const caption = document.querySelector<HTMLElement>('.s-full__caption')
  const guideItems = Array.from(document.querySelectorAll<HTMLElement>('[data-guide-step]'))
  const hint = document.getElementById('fullHint')
  if (!section) return () => undefined

  const base = 1.05
  const state = { exposure: base }

  if (motionPrefs.reduced) {
    stage.setExposure(base)
    guideItems.forEach((el) => el.classList.add('is-live'))
    return () => stage.setExposure(base)
  }

  const tween = gsap.to(state, {
    exposure: 1.22,
    ease: 'none',
    onUpdate: () => stage.setExposure(state.exposure),
    scrollTrigger: {
      trigger: section,
      start: 'top 70%',
      end: 'bottom bottom',
      scrub: true,
    },
  })

  const captionTween = caption
    ? gsap.fromTo(
        caption,
        { opacity: 0, y: 36, scale: 0.96, filter: 'blur(8px)' },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 0.95,
          ease: 'back.out(1.4)',
          scrollTrigger: { trigger: section, start: 'top 55%', once: true },
        },
      )
    : null

  const guideTrigger =
    guideItems.length > 0
      ? ScrollTrigger.create({
          trigger: section,
          start: 'top 60%',
          end: 'bottom 40%',
          scrub: 0.6,
          onUpdate: (self) => {
            const p = self.progress
            guideItems.forEach((el, i) => {
              const threshold = i / Math.max(1, guideItems.length)
              el.classList.toggle('is-live', p >= threshold)
            })
            if (hint) {
              if (p > 0.75) hint.textContent = '关卡进度拉满 · 继续滚看技术台'
              else if (p > 0.35) hint.textContent = '捏脸光环已加大 · 试着按住面部'
              else hint.textContent = '滚入本段：捏脸光环加大 · HUD 进入关卡模式'
            }
          },
        })
      : null

  return () => {
    tween.scrollTrigger?.kill()
    tween.kill()
    captionTween?.scrollTrigger?.kill()
    captionTween?.kill()
    guideTrigger?.kill()
    state.exposure = base
    stage.setExposure(base)
  }
}
