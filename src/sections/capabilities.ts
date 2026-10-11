import { motionPrefs } from '../lib/motionPrefs'
import type { FrameLoop } from '../lib/frameLoop'
import { createSpring, SPRING } from '../lib/spring'
import { initCapabilityDemos } from './capabilityDemos'
import { bindTiltPress } from '../lib/tiltPress'

/**
 * 能力区「四件事」—— 横向轨道（非竖滚 pin）
 *
 * · overflow-x 原生横滑 + 底部可见进度拖柄 + 左右箭头
 * · 滚轮默认不强制横移（页面照常竖滚）
 * · 指针拖拽带惯性；用户可停在任一卡玩沙盒
 */
export function initCapabilities(loop: FrameLoop): () => void {
  const section = document.getElementById('capabilities')
  const viewport = document.getElementById('capViewport')
  const track = document.getElementById('capTrack')
  if (!section || !viewport || !track) return () => undefined

  const stopDemos = initCapabilityDemos({ loop })
  const stopTilt = bindTiltPress('#capabilities .cap-card')
  ensureControls(section, viewport)

  const rail = section.querySelector<HTMLElement>('.cap-rail')
  const thumb = section.querySelector<HTMLElement>('.cap-rail__thumb')
  const btnPrev = section.querySelector<HTMLButtonElement>('[data-cap-prev]')
  const btnNext = section.querySelector<HTMLButtonElement>('[data-cap-next]')

  if (motionPrefs.reduced) {
    section.classList.add('is-static')
    return () => {
      section.classList.remove('is-static')
      stopTilt()
      stopDemos()
    }
  }

  section.classList.add('is-hscroll')
  const destroyers: Array<() => void> = []

  const maxScroll = (): number => Math.max(0, viewport.scrollWidth - viewport.clientWidth)

  const syncUi = (): void => {
    const max = maxScroll()
    const x = viewport.scrollLeft
    const ratio = max > 0 ? x / max : 0
    if (rail) rail.style.setProperty('--cap-progress', String(ratio))
    if (thumb && rail) {
      const trackW = rail.clientWidth
      const thumbW = Math.max(48, (viewport.clientWidth / Math.max(viewport.scrollWidth, 1)) * trackW)
      const travel = Math.max(0, trackW - thumbW)
      thumb.style.width = `${thumbW}px`
      thumb.style.transform = `translate3d(${(ratio * travel).toFixed(2)}px, 0, 0)`
    }
    if (btnPrev) btnPrev.disabled = x <= 2
    if (btnNext) btnNext.disabled = x >= max - 2
  }

  // 惯性滚动目标（spring）
  const scrollSpring = createSpring({ ...SPRING.warp, value: 0, mass: 1.15 })
  scrollSpring.set(viewport.scrollLeft)
  let dragging = false
  let railDragging = false
  let lastPointerX = 0
  let lastPointerT = 0
  let velocity = 0
  let animating = false

  const removeTick = loop.add((dt) => {
    if (dragging || railDragging) return
    if (!animating && scrollSpring.atRest) return
    const v = scrollSpring.update(dt)
    viewport.scrollLeft = v
    animating = !scrollSpring.atRest
    syncUi()
  })
  destroyers.push(removeTick)

  const onScroll = (): void => {
    if (!dragging && !railDragging && !animating) {
      scrollSpring.set(viewport.scrollLeft)
    }
    syncUi()
  }
  viewport.addEventListener('scroll', onScroll, { passive: true })
  destroyers.push(() => viewport.removeEventListener('scroll', onScroll))

  const snapToNearest = (): void => {
    const cards = Array.from(track.querySelectorAll<HTMLElement>('.cap-card'))
    if (!cards.length) return
    const left = viewport.scrollLeft
    let best = left
    let bestDist = Infinity
    for (const card of cards) {
      const target = card.offsetLeft - (parseFloat(getComputedStyle(track).paddingLeft) || 0)
      const d = Math.abs(target - left)
      if (d < bestDist) {
        bestDist = d
        best = target
      }
    }
    scrollSpring.set(viewport.scrollLeft)
    scrollSpring.to(Math.max(0, Math.min(maxScroll(), best)))
    animating = true
  }

  const stepBy = (dir: -1 | 1): void => {
    const card = track.querySelector<HTMLElement>('.cap-card')
    const step = card ? card.offsetWidth + 32 : viewport.clientWidth * 0.8
    const next = Math.max(0, Math.min(maxScroll(), viewport.scrollLeft + dir * step))
    scrollSpring.set(viewport.scrollLeft)
    scrollSpring.to(next)
    animating = true
  }

  btnPrev?.addEventListener('click', () => stepBy(-1))
  btnNext?.addEventListener('click', () => stepBy(1))
  destroyers.push(() => {
    btnPrev?.replaceWith(btnPrev.cloneNode(true))
    btnNext?.replaceWith(btnNext.cloneNode(true))
  })

  // 指针拖拽轨道（惯性）
  const onPointerDown = (e: PointerEvent): void => {
    const t = e.target as HTMLElement
    if (t.closest('button, a, input, textarea, [data-hold-speak], [data-file-drop]')) return
    dragging = true
    animating = false
    lastPointerX = e.clientX
    lastPointerT = performance.now()
    velocity = 0
    scrollSpring.set(viewport.scrollLeft)
    viewport.setPointerCapture?.(e.pointerId)
    viewport.classList.add('is-dragging')
  }
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return
    const now = performance.now()
    const dx = e.clientX - lastPointerX
    const dt = Math.max(1, now - lastPointerT)
    viewport.scrollLeft -= dx
    velocity = (-dx / dt) * 1000
    lastPointerX = e.clientX
    lastPointerT = now
    scrollSpring.set(viewport.scrollLeft)
    syncUi()
  }
  const onPointerUp = (): void => {
    if (!dragging) return
    dragging = false
    viewport.classList.remove('is-dragging')
    const max = maxScroll()
    let target = viewport.scrollLeft + velocity * 0.28
    target = Math.max(0, Math.min(max, target))
    // 轻吸附最近卡
    const cards = Array.from(track.querySelectorAll<HTMLElement>('.cap-card'))
    let snap = target
    let best = Infinity
    for (const card of cards) {
      const x = card.offsetLeft - (parseFloat(getComputedStyle(track).paddingLeft) || 0)
      const d = Math.abs(x - target)
      if (d < best && d < card.offsetWidth * 0.45) {
        best = d
        snap = x
      }
    }
    scrollSpring.set(viewport.scrollLeft)
    scrollSpring.to(Math.max(0, Math.min(max, snap)))
    animating = true
  }

  viewport.addEventListener('pointerdown', onPointerDown)
  viewport.addEventListener('pointermove', onPointerMove)
  viewport.addEventListener('pointerup', onPointerUp)
  viewport.addEventListener('pointercancel', onPointerUp)
  destroyers.push(() => {
    viewport.removeEventListener('pointerdown', onPointerDown)
    viewport.removeEventListener('pointermove', onPointerMove)
    viewport.removeEventListener('pointerup', onPointerUp)
    viewport.removeEventListener('pointercancel', onPointerUp)
  })

  // 底部进度拖柄
  if (rail && thumb) {
    const railDown = (e: PointerEvent): void => {
      railDragging = true
      animating = false
      thumb.setPointerCapture?.(e.pointerId)
      moveThumb(e.clientX)
    }
    const railMove = (e: PointerEvent): void => {
      if (!railDragging) return
      moveThumb(e.clientX)
    }
    const railUp = (): void => {
      if (!railDragging) return
      railDragging = false
      snapToNearest()
    }
    const moveThumb = (clientX: number): void => {
      const rect = rail.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      viewport.scrollLeft = ratio * maxScroll()
      scrollSpring.set(viewport.scrollLeft)
      syncUi()
    }
    rail.addEventListener('pointerdown', railDown)
    rail.addEventListener('pointermove', railMove)
    rail.addEventListener('pointerup', railUp)
    rail.addEventListener('pointercancel', railUp)
    destroyers.push(() => {
      rail.removeEventListener('pointerdown', railDown)
      rail.removeEventListener('pointermove', railMove)
      rail.removeEventListener('pointerup', railUp)
      rail.removeEventListener('pointercancel', railUp)
    })
  }

  const onResize = (): void => syncUi()
  window.addEventListener('resize', onResize)
  destroyers.push(() => window.removeEventListener('resize', onResize))
  syncUi()

  destroyers.push(stopTilt)

  return () => {
    section.classList.remove('is-hscroll', 'is-static')
    for (const d of destroyers.reverse()) d()
    stopDemos()
  }
}

function ensureControls(section: HTMLElement, viewport: HTMLElement): void {
  if (section.querySelector('.cap-controls')) return
  const controls = document.createElement('div')
  controls.className = 'cap-controls wrap'
  controls.innerHTML = `
    <button type="button" class="cap-arrow" data-cap-prev aria-label="上一张能力卡">‹</button>
    <div class="cap-rail" role="slider" aria-label="能力卡横向进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="cap-rail__track"></div>
      <div class="cap-rail__thumb"></div>
    </div>
    <button type="button" class="cap-arrow" data-cap-next aria-label="下一张能力卡">›</button>
  `
  viewport.insertAdjacentElement('afterend', controls)
}
