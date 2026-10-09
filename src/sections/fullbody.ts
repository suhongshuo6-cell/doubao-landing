import gsap from 'gsap'
import type { Stage } from '../three/stage'
import { motionPrefs } from '../lib/motionPrefs'

/**
 * 6 / 全身取景区 —— 版式：大留白单侧克制型
 *
 * 规格 7 要求这一段用"scrub: true 绑相机参数"。
 * 相机位置本身已经由全局取景路径驱动（cameraRig），所以这里绑的是**曝光**：
 * 镜头拉到全身时把光打开一点点，像摄影师在取景框里看到她整个人时松了一口气。
 *
 * 为什么不用 scrub 改 fov：cameraRig 的取景换算是按 fov 反解距离的，
 * 中途改 fov 会让取景和文案错位——那种"看起来很酷但说不清哪里不对"的 bug。
 */
export function initFullBody(stage: Stage): () => void {
  const section = document.getElementById('fullbody')
  const caption = document.querySelector<HTMLElement>('.s-full__caption')
  if (!section) return () => undefined

  const base = 1.05
  const state = { exposure: base }

  if (motionPrefs.reduced) {
    stage.setExposure(base)
    return () => stage.setExposure(base)
  }

  const tween = gsap.to(state, {
    exposure: 1.16,
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
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: { trigger: section, start: 'top 55%', once: true },
        },
      )
    : null

  return () => {
    tween.scrollTrigger?.kill()
    tween.kill()
    captionTween?.scrollTrigger?.kill()
    captionTween?.kill()
    state.exposure = base
    stage.setExposure(base)
  }
}
