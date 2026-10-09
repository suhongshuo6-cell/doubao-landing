/**
 * visibility.ts — IntersectionObserver 包装。
 *
 * 规格第八节要求"IntersectionObserver 暂停离屏渲染"。角色画布是 fixed 全屏的，
 * 不存在离屏；真正需要暂停的是各区块里的微交互演示（打字机、波形、点阵…），
 * 它们滚出视口后不该继续烧 CPU。
 */

export interface VisibilityHandle {
  /** 元素当前是否在（放宽过的）视口内 */
  readonly visible: boolean
  destroy(): void
}

export function observeVisibility(
  el: Element,
  onChange: (visible: boolean) => void,
  rootMargin = '20% 0px 20% 0px',
): VisibilityHandle {
  let visible = false
  const io = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      const next = entry.isIntersecting
      if (next === visible) return
      visible = next
      onChange(next)
    },
    { rootMargin, threshold: 0 },
  )
  io.observe(el)

  return {
    get visible() {
      return visible
    },
    destroy() {
      io.disconnect()
    },
  }
}
