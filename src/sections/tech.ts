/**
 * Live 技术台 —— 折叠 + live 滑杆 + 戏剧化反馈条
 */

function syncMeter(input: HTMLInputElement): void {
  const meter = input.closest('.tech-slider')?.querySelector<HTMLElement>('[data-tech-meter]')
  if (!meter) return
  const min = Number(input.min) || 0
  const max = Number(input.max) || 1
  const value = Number(input.value)
  const pct = ((value - min) / Math.max(0.0001, max - min)) * 100
  meter.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`
}

export function initTech(): () => void {
  const toggle = document.getElementById('techToggle')
  const body = document.getElementById('techBody')
  const destroyers: Array<() => void> = []

  if (toggle && body) {
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
    destroyers.push(() => toggle.removeEventListener('click', onClick))
  }

  const sliders = document.querySelectorAll<HTMLInputElement>('input[data-tech]')
  sliders.forEach((s) => syncMeter(s))

  const onInput = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement
    const name = input.dataset.tech
    if (!name) return
    const value = Number(input.value)
    const valEl = document.querySelector<HTMLElement>(`[data-tech-val="${name}"]`)
    if (valEl) {
      valEl.textContent = value.toFixed(2)
      valEl.animate?.(
        [
          { transform: 'scale(1)', color: 'var(--brand)' },
          { transform: 'scale(1.25)', color: 'var(--accent-cool)' },
          { transform: 'scale(1)', color: 'var(--brand)' },
        ],
        { duration: 220, easing: 'ease-out' },
      )
    }
    const wrap = input.closest('.tech-slider')
    wrap?.classList.add('is-hot')
    window.setTimeout(() => wrap?.classList.remove('is-hot'), 280)
    syncMeter(input)
    window.dispatchEvent(
      new CustomEvent('doubao:tech-param', { detail: { name, value } }),
    )
  }
  sliders.forEach((s) => s.addEventListener('input', onInput))
  destroyers.push(() => sliders.forEach((s) => s.removeEventListener('input', onInput)))

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
