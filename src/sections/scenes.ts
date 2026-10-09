import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'

/**
 * 4 / 场景区 —— 版式：通栏叙事型
 *
 * 全站文字密度最高的一段，用来建立"这是个正经产品"的可信度。
 * 气泡逐条浮现（stagger 0.08），每段独立触发：
 * 三段同时播会显得吵，而且用户根本看不完。
 */
export function initScenes(): () => void {
  const scenes = document.querySelectorAll<HTMLElement>('.scene')
  if (!scenes.length) return () => undefined

  if (motionPrefs.reduced) {
    gsap.set('.bubble', { opacity: 1, y: 0, clearProps: 'transform' })
    return () => undefined
  }

  const tweens: gsap.core.Tween[] = []

  scenes.forEach((scene) => {
    const bubbles = scene.querySelectorAll<HTMLElement>('.bubble')
    if (!bubbles.length) return
    tweens.push(
      gsap.fromTo(
        bubbles,
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: 0.62,
          ease: EASE_IN,
          // 规格：stagger 0.08
          stagger: 0.08,
          scrollTrigger: { trigger: scene, start: 'top 76%', once: true },
        },
      ),
    )
  })

  return () => {
    for (const tween of tweens) {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }
}
