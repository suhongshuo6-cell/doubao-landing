import { ScrollTrigger } from '../motion/lenisSetup'
import type { Stage } from '../three/stage'
import type { ScrollController } from '../motion/lenisSetup'
import type { FrameLoop } from '../lib/frameLoop'

import { initHero } from './hero'
import { initPositioning } from './positioning'
import { initCapabilities } from './capabilities'
import { initScenes } from './scenes'
import { initNumbers } from './numbers'
import { initFullBody } from './fullbody'
import { initTech } from './tech'
import { initFaq } from './faq'
import { initFooter } from './footer'

/**
 * sections/index.ts — 九个区块的装配。
 *
 * 分成两批，是为了让首屏绘制**不必等 three**：
 *   · initContentSections：只有 DOM 与 GSAP/Lenis，文档一可用就能跑
 *   · initStageSections  ：用到 renderer（曝光 scrub），必须等 3D 层就位
 * 3D 层是动态 import 的，244KB(gzip) 的 three 因此不进首屏关键路径。
 */

export interface ContentContext {
  scroll: ScrollController
  loop: FrameLoop
}

export function initContentSections({ scroll, loop }: ContentContext): () => void {
  const destroyers: Array<() => void> = [
    initHero(),
    initPositioning(),
    initScenes(),
    initNumbers(),
    initTech(),
    initFaq(),
    // pin 的建立最晚，避免前面区块的布局变化让它的 start/end 算错
    initCapabilities(loop),
  ]
  void scroll
  return () => {
    for (const destroy of destroyers.reverse()) destroy()
    ScrollTrigger.refresh()
  }
}

export function initStageSections({ stage }: { stage: Stage }): () => void {
  const destroyers: Array<() => void> = [initFullBody(stage), initFooter(stage)]
  return () => {
    for (const destroy of destroyers.reverse()) destroy()
    ScrollTrigger.refresh()
  }
}
