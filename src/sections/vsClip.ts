/**
 * sections/vsClip.ts — Vs 普通聊天分屏 clip 拖拽
 */
export function initVsClip(): () => void {
  const clip = document.getElementById('vsClip')
  const handle = document.getElementById('vsHandle')
  if (!clip || !handle) return () => undefined

  let dragging = false
  const setP = (clientX: number): void => {
    const rect = clip.getBoundingClientRect()
    const p = Math.max(0.12, Math.min(0.88, (clientX - rect.left) / rect.width))
    clip.style.setProperty('--vs', `${(p * 100).toFixed(2)}%`)
  }

  const onDown = (e: PointerEvent): void => {
    dragging = true
    handle.setPointerCapture(e.pointerId)
    setP(e.clientX)
  }
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return
    setP(e.clientX)
  }
  const onUp = (): void => {
    dragging = false
  }

  handle.addEventListener('pointerdown', onDown)
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
  clip.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.vs-clip__handle')) return
    setP(e.clientX)
  })

  return () => {
    handle.removeEventListener('pointerdown', onDown)
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onUp)
  }
}
