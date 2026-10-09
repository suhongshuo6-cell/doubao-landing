import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'

/**
 * 2 / 定位区 —— 版式：不对称双栏
 *
 * 右栏刻意留白，让角色"半身入画"。文字栏 720px，视觉栏不参与基线对齐，
 * 制造一点张力；如果做成左右等高，就立刻变成 SaaS 的分栏模板。
 *
 * 这里只负责 dl 里三行事实的错峰浮现（段落本身由全局 reveal 处理）。
 */
export function initPositioning(): () => void {
  const rows = document.querySelectorAll<HTMLElement>('.facts__row')
  if (!rows.length) return () => undefined

  if (motionPrefs.reduced) {
    gsap.set(rows, { opacity: 1, y: 0, clearProps: 'transform' })
    return () => undefined
  }

  const tween = gsap.fromTo(
    rows,
    { opacity: 0, y: 14 },
    {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: EASE_IN,
      stagger: 0.07,
      scrollTrigger: { trigger: '.facts', start: 'top 88%', once: true },
    },
  )

  return () => {
    tween.scrollTrigger?.kill()
    tween.kill()
    ScrollTrigger.refresh()
  }
}
