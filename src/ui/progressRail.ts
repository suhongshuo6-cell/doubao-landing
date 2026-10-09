import gsap from 'gsap'
import { FRAMING_NODES } from '../lib/framing'
import type { AnchorMap } from '../motion/transitions'
import type { ScrollController } from '../motion/lenisSetup'
import { EASE_IN } from '../motion/eases'

/**
 * progressRail.ts — 右侧取景导航条。
 *
 * 规格 6.6：竖排 6 个圆点 + 中文标签；当前项用 --brand 实心圆点、标签透明度 40% → 100%；
 * 激活指示是一条 1px 竖线在圆点之间滑动（GSAP 补间），不做弹跳、不做发光。
 *
 * 节点表直接复用 cameraRig 的 FRAMING_NODES —— 只有一份真相，
 * 以后调取景节点，导航条自动跟着变。
 */

export interface ProgressRail {
  setActive(index: number): void
  destroy(): void
}

export function initProgressRail(
  scroll: ScrollController,
  map: AnchorMap,
  indicator: HTMLElement | null,
  list: HTMLElement | null,
): ProgressRail {
  if (!list) {
    return { setActive: () => undefined, destroy: () => undefined }
  }

  const items: HTMLElement[] = []
  const buttons: HTMLButtonElement[] = []
  let active = -1

  FRAMING_NODES.forEach((node, index) => {
    const li = document.createElement('li')
    li.className = 'rail__item'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'rail__btn'
    button.textContent = node.label
    button.setAttribute('aria-label', `跳转到取景：${node.label}`)
    button.addEventListener('click', () => {
      scroll.scrollTo(map.toScroll(node.t), { duration: 1.15 })
    })

    li.appendChild(button)
    list.appendChild(li)
    items.push(li)
    buttons.push(button)
    void index
  })

  /** 指示线要落在"圆点中心"，而不是 li 顶部 */
  function indicatorY(index: number): number {
    const item = items[index]
    if (!item) return 0
    const height = indicator?.offsetHeight ?? 22
    return item.offsetTop + item.offsetHeight / 2 - height / 2
  }

  function setActive(index: number): void {
    if (index === active) return
    active = index
    items.forEach((item, i) => item.classList.toggle('is-active', i === index))
    buttons.forEach((btn, i) => btn.setAttribute('aria-current', i === index ? 'true' : 'false'))
    if (indicator) {
      gsap.to(indicator, {
        y: indicatorY(index),
        duration: 0.42,
        ease: EASE_IN,
        overwrite: true,
      })
    }
  }

  // 首帧先把指示线放到位（不要从 0 滑过来）
  if (indicator) {
    gsap.set(indicator, { y: indicatorY(0) })
  }
  setActive(0)

  const onResize = (): void => {
    if (indicator && active >= 0) gsap.set(indicator, { y: indicatorY(active) })
  }
  window.addEventListener('resize', onResize)

  return {
    setActive,
    destroy() {
      window.removeEventListener('resize', onResize)
      list.textContent = ''
    },
  }
}
