import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN, EASE_OUT } from '../motion/eases'

/**
 * 1 / Hero —— 版式：特写型
 *
 * 规格 6.4 要求：底部中央一个滚动提示（1px 细线 + 小箭头），
 * 做一次呼吸后消失，**不要循环**。所以这里是一条只播一遍的时间轴，
 * 并且用户一开始滚动就立刻收掉——提示的职责已经完成，留着就是噪音。
 */
export function initHero(): () => void {
  const hint = document.getElementById('scrollHint')
  if (!hint) return () => undefined

  if (motionPrefs.reduced) {
    hint.style.display = 'none'
    return () => undefined
  }

  const line = hint.querySelector<HTMLElement>('.hero__scroll-line')

  const tl = gsap.timeline({ delay: 1.1 })
  tl.fromTo(hint, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7, ease: EASE_IN })
  if (line) {
    tl.to(line, { scaleY: 0.5, duration: 0.95, ease: 'sine.inOut' }, '-=0.25').to(line, {
      scaleY: 1,
      duration: 0.95,
      ease: 'sine.inOut',
    })
  }
  tl.to(hint, { opacity: 0, duration: 0.6, ease: EASE_OUT, delay: 0.4 }).set(hint, {
    display: 'none',
  })

  const dismiss = (): void => {
    tl.kill()
    gsap.set(hint, { display: 'none' })
  }
  window.addEventListener('wheel', dismiss, { passive: true, once: true })
  window.addEventListener('touchstart', dismiss, { passive: true, once: true })
  window.addEventListener('keydown', dismiss, { once: true })

  return () => {
    tl.kill()
    window.removeEventListener('wheel', dismiss)
    window.removeEventListener('touchstart', dismiss)
    window.removeEventListener('keydown', dismiss)
  }
}
