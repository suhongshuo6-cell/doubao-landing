import { ScrollTrigger } from '../motion/lenisSetup'
import type { Stage } from '../three/stage'
import type { ScrollController } from '../motion/lenisSetup'
import type { FrameLoop } from '../lib/frameLoop'
import type { ExperienceDirector } from '../experience/experienceDirector'

import { initCommandStage } from './commandStage'
import { initContextOrbit } from './contextOrbit'
import { initMorphWorkbench } from './morphWorkbench'
import { initStoryTimeMachine } from './storyTimeMachine'
import { initFooter } from './footer'

/**
 * sections/index.ts — 五幕体验骨架
 * command-stage → context-orbit → morph-workbench → story-time-machine → replay-cta
 */

export interface ContentContext {
  scroll: ScrollController
  loop: FrameLoop
  director: ExperienceDirector
  onBurst?(x: number, y: number): void
}

export function initContentSections({ scroll, loop, director, onBurst }: ContentContext): () => void {
  const destroyers: Array<() => void> = [
    initCommandStage({ director, onBurst }),
    initContextOrbit({ director, loop }),
    initMorphWorkbench({ director, loop }),
    initStoryTimeMachine({ director, scroll }),
  ]
  return () => {
    for (const destroy of destroyers.reverse()) destroy()
    ScrollTrigger.refresh()
  }
}

export function initStageSections({ stage }: { stage: Stage }): () => void {
  const destroyers: Array<() => void> = [initFooter(stage)]
  return () => {
    for (const destroy of destroyers.reverse()) destroy()
    ScrollTrigger.refresh()
  }
}
