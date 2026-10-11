import { ScrollTrigger } from '../motion/lenisSetup'
import type { Stage } from '../three/stage'
import type { ScrollController } from '../motion/lenisSetup'
import type { FrameLoop } from '../lib/frameLoop'

import { initHero } from './hero'
import { initPositioning } from './positioning'
import { initCapabilities } from './capabilities'
import { initScenes } from './scenes'
import { initFooter } from './footer'
import { initCompare } from './compare'
import { initCapModal } from '../ui/capModal'
import { initAlcoves } from './alcoves'
import { initDay24 } from './day24'
import { initUniverse } from './universe'
import { initCtaStage } from './ctaStage'
import { initVsClip } from './vsClip'

/**
 * sections/index.ts — Gen3：Hero 双主线 + Alcoves + 产品后半
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
    initCompare(),
    initVsClip(),
    initCapabilities(loop),
    initCapModal(),
    initAlcoves({
      onReward: (kind) => {
        document.dispatchEvent(new CustomEvent('doubao:alcove-reward', { detail: { kind } }))
      },
      onVoiceRipple: (active) => {
        document.documentElement.classList.toggle('voice-ripple', active)
      },
    }),
    initDay24(),
    initUniverse(),
    initCtaStage(),
  ]
  void scroll
  return () => {
    for (const destroy of destroyers.reverse()) destroy()
    ScrollTrigger.refresh()
  }
}

export function initStageSections({ stage }: { stage: Stage }): () => void {
  // fullbody 已删除；页脚仍可能用 stage
  const destroyers: Array<() => void> = [initFooter(stage)]
  return () => {
    for (const destroy of destroyers.reverse()) destroy()
    ScrollTrigger.refresh()
  }
}
