/**
 * 7 / 技术说明 —— 版式：规格表型
 *
 * 规格写的是"简洁三栏"，但红线 B 明确禁止"居中大标题 + 副标题 + 3 张等宽卡片"。
 * 两者取红线：这里做成**左对齐标题 + 不等宽三栏 + 每栏顶部一条 hairline + 短横线列表**，
 * 读起来像一张规格表（spec sheet），而不是一排营销卡片。信息量一样，模板感没有了。
 *
 * 折叠动画走 grid-template-rows: 1fr ↔ 0fr，不需要 JS 测高度。
 */
export function initTech(): () => void {
  const toggle = document.getElementById('techToggle')
  const body = document.getElementById('techBody')
  if (!toggle || !body) return () => undefined

  const label = toggle.querySelector<HTMLElement>('[data-toggle-label]')

  const setOpen = (open: boolean): void => {
    toggle.setAttribute('aria-expanded', String(open))
    body.dataset.collapsed = String(!open)
    if (label) label.textContent = open ? '收起' : '展开'
  }

  setOpen(true)

  const onClick = (): void => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true')
  }
  toggle.addEventListener('click', onClick)

  return () => {
    toggle.removeEventListener('click', onClick)
  }
}
