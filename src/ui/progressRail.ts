import gsap from 'gsap'
import { FRAMING_NODES } from '../lib/framing'
import type { AnchorMap } from '../motion/transitions'
import type { ScrollController } from '../motion/lenisSetup'
import { EASE_IN } from '../motion/eases'

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

  FRAMING_NODES.forEach((node) => {
    const li = document.createElement('li')
    li.className = `rail__item rail__item--${node.phase}`

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'rail__btn'
    button.textContent = node.label
    button.setAttribute('aria-label', `跳转到：${node.label}`)
    button.addEventListener('click', () => {
      scroll.scrollTo(map.toScroll(node.t), { duration: 1.15 })
    })

    li.appendChild(button)
    list.appendChild(li)
    items.push(li)
    buttons.push(button)
  })

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
      const phase = FRAMING_NODES[index]?.phase ?? 'product'
      indicator.dataset.phase = phase
      gsap.to(indicator, {
        y: indicatorY(index),
        duration: 0.42,
        ease: EASE_IN,
        overwrite: true,
      })
    }
  }

  if (indicator) gsap.set(indicator, { y: indicatorY(0) })
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
