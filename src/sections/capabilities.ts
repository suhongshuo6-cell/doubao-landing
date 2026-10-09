import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'
import type { FrameLoop } from '../lib/frameLoop'
import { initCapabilityDemos } from './capabilityDemos'

/**
 * 3 / 四大能力 —— 版式：横向滚动型（pin 一屏 + 卡片横向推移）
 *
 * 卡片刻意做窄而矮，并且整块 track 竖直居中偏下：
 * 于是屏幕上方永远留出角色的头部与肩线，横向推移时她不会被整帧盖住
 * ——这是红线 C「角色必须始终在场」在这一段的具体做法。
 *
 * 卡片宽 480px、间距 32px，不是三张等宽列。
 * 卡内的四段微交互演示在 capabilityDemos.ts。
 */
export function initCapabilities(loop: FrameLoop): () => void {
  const section = document.getElementById('capabilities')
  const track = document.getElementById('capTrack')
  if (!section || !track) return () => undefined

  const stopDemos = initCapabilityDemos({ loop })

  // reduced-motion：不做 pin、不做横向推移，直接换成可以换行阅读的静态列表
  if (motionPrefs.reduced) {
    section.classList.add('is-static')
    return () => {
      section.classList.remove('is-static')
      stopDemos()
    }
  }

  const distance = (): number => {
    const gutter = parseFloat(getComputedStyle(track).paddingLeft) || 0
    return Math.max(0, track.scrollWidth - window.innerWidth + gutter)
  }

  const tween = gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => `+=${distance()}`,
      pin: true,
      // scrub 带 1s 追赶：卡片是"被惯性推着走"，不是硬贴在滚动条上
      scrub: 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  })

  return () => {
    tween.scrollTrigger?.kill()
    tween.kill()
    gsap.set(track, { clearProps: 'transform' })
    stopDemos()
    ScrollTrigger.refresh()
  }
}
