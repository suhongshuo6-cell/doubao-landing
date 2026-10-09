/**
 * 8 / FAQ —— 版式：问题清单型（左侧标题栏 + 右侧手风琴）
 *
 * 高度动画只用 CSS 的 grid-template-rows: 0fr → 1fr（规格第七节明确要求"不要 JS 测高度"）。
 * 因此不用 <details>：浏览器在关闭时会把非 summary 内容直接移出渲染树，
 * 那 0fr→1fr 的过渡就永远看不到。改用 aria-expanded + 面板，
 * 语义和无障碍都不打折，动画还能真的播出来。
 */
export function initFaq(): () => void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.qa__btn'))
  if (!buttons.length) return () => undefined

  const listeners: Array<() => void> = []

  buttons.forEach((button) => {
    const onClick = (): void => {
      const open = button.getAttribute('aria-expanded') === 'true'
      // 手风琴：打开一条就收起其它，避免整页被撑开
      buttons.forEach((other) => {
        if (other !== button) other.setAttribute('aria-expanded', 'false')
      })
      button.setAttribute('aria-expanded', String(!open))
    }
    button.addEventListener('click', onClick)
    listeners.push(() => button.removeEventListener('click', onClick))
  })

  return () => {
    for (const off of listeners) off()
  }
}
