import type { FrameLoop } from '../lib/frameLoop'
import type { ScrollController } from '../motion/lenisSetup'

/**
 * nav.ts — 顶部导航的显隐。
 *
 * 规格：滚动超过一屏后从透明渐显。
 * 用滚动进度判断而不是 IntersectionObserver，是因为 hero 恰好是 100svh，
 * 用"滚过一屏"这条语义直接算最不容易在移动端浏览器地址栏收起时误判。
 */
export function initNav(scroll: ScrollController, loop: FrameLoop): () => void {
  const root = document.documentElement
  let past = false

  return loop.add(() => {
    const { progress, scrollable } = scroll.read()
    const next = progress * scrollable > window.innerHeight * 0.9
    if (next !== past) {
      past = next
      root.classList.toggle('past-hero', past)
    }
  })
}
