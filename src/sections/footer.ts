import gsap from 'gsap'
import type { Stage } from '../three/stage'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'

/**
 * 9 / Footer —— 版式：通栏收束型
 *
 * 规格：页脚区做"最后一个 scrub 收束"。
 * 具体做两件事：
 *   1. 把全身段打开的那点曝光收回来，画面回到基准亮度，像镜头关机前的最后一下呼吸；
 *   2. 免责声明与链接逐条浮现（不是整块淡入），收尾要稳。
 *
 * 角色在这里依然是在场的（全身取景 + 极慢自动环绕），只是被页脚的浅色渐变压到后面。
 */
export function initFooter(stage: Stage): () => void {
  const legal = document.querySelector<HTMLElement>('.s-foot__legal')
  const footer = document.getElementById('footer')
  if (!footer) return () => undefined

  const base = 1.05
  const state = { exposure: 1.16 }

  if (motionPrefs.reduced) {
    stage.setExposure(base)
    gsap.set('.s-foot__legal, .s-foot__links, .s-foot__copy', { opacity: 1, y: 0 })
    return () => stage.setExposure(base)
  }

  const exposureTween = gsap.to(state, {
    exposure: base,
    ease: 'none',
    onUpdate: () => stage.setExposure(state.exposure),
    scrollTrigger: {
      trigger: footer,
      start: 'top 85%',
      end: 'bottom bottom',
      scrub: true,
    },
  })

  const revealTween = gsap.fromTo(
    [legal, document.querySelector('.s-foot__links'), document.querySelector('.s-foot__copy')],
    { opacity: 0, y: 12 },
    {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: EASE_IN,
      stagger: 0.09,
      scrollTrigger: { trigger: footer, start: 'top 85%', once: true },
    },
  )

  return () => {
    exposureTween.scrollTrigger?.kill()
    exposureTween.kill()
    revealTween.scrollTrigger?.kill()
    revealTween.kill()
    stage.setExposure(base)
  }
}
