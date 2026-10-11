/**
 * sections/alcoves.ts — 3 个 Flip 关卡
 * ① 捏脸实验室 ② 语音室 ③ 多模态桌
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { replyFake } from '../lib/fakeBrain'

type AlcoveId = 'pinch' | 'voice' | 'desk'

export interface AlcovesHooks {
  onPinchMeter?(force: number, expression: number): void
  onVoiceRipple?(active: boolean): void
  onReward?(kind: string): void
}

export function initAlcoves(hooks: AlcovesHooks = {}): () => void {
  const root = document.getElementById('alcoves')
  if (!root) return () => undefined
  const destroyers: Array<() => void> = []
  let openId: AlcoveId | null = null

  const doors = Array.from(root.querySelectorAll<HTMLElement>('.alcove-door'))

  const closeRoom = (): void => {
    if (!openId) return
    const room = root.querySelector<HTMLElement>(`.alcove-room[data-alcove="${openId}"]`)
    const door = root.querySelector<HTMLElement>(`.alcove-door[data-alcove="${openId}"]`)
    openId = null
    root.classList.remove('is-open')
    document.documentElement.classList.remove('alcove-open')
    if (room && !motionPrefs.reduced) {
      room.classList.add('is-flipping-out')
      gsap.to(room, {
        rotateY: 90,
        opacity: 0,
        duration: 0.45,
        ease: 'power2.in',
        onComplete: () => {
          room.hidden = true
          room.classList.remove('is-flipping-out', 'is-open')
          gsap.set(room, { clearProps: 'transform,opacity' })
        },
      })
    } else if (room) {
      room.hidden = true
      room.classList.remove('is-open')
    }
    door?.classList.remove('is-active')
    hooks.onVoiceRipple?.(false)
  }

  const openRoom = (id: AlcoveId): void => {
    if (openId === id) {
      closeRoom()
      return
    }
    if (openId) closeRoom()
    openId = id
    root.classList.add('is-open')
    document.documentElement.classList.add('alcove-open')
    doors.forEach((d) => d.classList.toggle('is-active', d.dataset.alcove === id))
    const room = root.querySelector<HTMLElement>(`.alcove-room[data-alcove="${id}"]`)
    if (!room) return
    room.hidden = false
    room.classList.add('is-open')
    if (!motionPrefs.reduced) {
      gsap.fromTo(
        room,
        { rotateY: -88, opacity: 0, scale: 0.92 },
        { rotateY: 0, opacity: 1, scale: 1, duration: 0.55, ease: 'back.out(1.4)' },
      )
    }
  }

  doors.forEach((door) => {
    const onClick = (): void => openRoom((door.dataset.alcove as AlcoveId) || 'pinch')
    door.addEventListener('click', onClick)
    destroyers.push(() => door.removeEventListener('click', onClick))
  })

  root.querySelectorAll<HTMLElement>('[data-alcove-close]').forEach((btn) => {
    const onClick = (): void => closeRoom()
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  destroyers.push(initPinchLab(root, hooks))
  destroyers.push(initVoiceRoom(root, hooks))
  destroyers.push(initDesk(root, hooks))

  // Esc 关闭
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closeRoom()
  }
  window.addEventListener('keydown', onKey)
  destroyers.push(() => window.removeEventListener('keydown', onKey))

  return () => {
    for (const d of destroyers.reverse()) d()
    document.documentElement.classList.remove('alcove-open')
  }
}

function initPinchLab(root: HTMLElement, hooks: AlcovesHooks): () => void {
  const zone = root.querySelector<HTMLElement>('.alcove-pinch__zone')
  const forceBar = root.querySelector<HTMLElement>('[data-meter-force]')
  const exprBar = root.querySelector<HTMLElement>('[data-meter-expr]')
  const face = root.querySelector<HTMLElement>('.alcove-pinch__face')
  const status = root.querySelector<HTMLElement>('[data-pinch-status]')
  if (!zone || !face) return () => undefined

  let pressing = false
  let force = 0
  let expr = 0
  let raf = 0
  let rewarded = false

  const paint = (): void => {
    if (forceBar) forceBar.style.width = `${(force * 100).toFixed(1)}%`
    if (exprBar) exprBar.style.width = `${(expr * 100).toFixed(1)}%`
    face.style.setProperty('--squash', (force * 0.18).toFixed(3))
    face.style.setProperty('--smile', (expr * 0.12).toFixed(3))
    hooks.onPinchMeter?.(force, expr)
  }

  const tick = (): void => {
    if (pressing) {
      force = Math.min(1, force + 0.045)
      expr = Math.min(1, expr + 0.028 + force * 0.02)
    } else {
      force = Math.max(0, force * 0.86 - 0.01)
      expr = Math.max(0, expr * 0.9 - 0.008)
    }
    paint()
    if (force > 0.02 || expr > 0.02 || pressing) raf = requestAnimationFrame(tick)
    else raf = 0

    if (!rewarded && force > 0.72 && expr > 0.55) {
      rewarded = true
      if (status) status.textContent = '捏到位了！表情锁存 · 已解锁语音室提示'
      zone.classList.add('is-success')
      hooks.onReward?.('alcove-pinch')
      document.dispatchEvent(new CustomEvent('doubao:pinch-reward', { detail: { source: 'alcove' } }))
    }
  }

  const start = (e: PointerEvent): void => {
    e.preventDefault()
    pressing = true
    zone.classList.add('is-pressing')
    if (!raf) raf = requestAnimationFrame(tick)
  }
  const end = (): void => {
    pressing = false
    zone.classList.remove('is-pressing')
  }

  zone.addEventListener('pointerdown', start)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)

  return () => {
    zone.removeEventListener('pointerdown', start)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    if (raf) cancelAnimationFrame(raf)
  }
}

function initVoiceRoom(root: HTMLElement, hooks: AlcovesHooks): () => void {
  const hold = root.querySelector<HTMLElement>('.alcove-voice__hold')
  const wall = root.querySelector<HTMLElement>('.alcove-voice__wall')
  if (!hold || !wall) return () => undefined

  const LINES = [
    '今天杭州适合出门吗？',
    '帮我把开会要点压成三条。',
    '用更轻松的语气再说一遍。',
    '下次提醒我带伞。',
    '把待办按紧急重要排一下。',
  ]
  let holdTimer = 0
  let holding = false

  const pushLine = (text: string): void => {
    const li = document.createElement('li')
    li.textContent = text
    wall.prepend(li)
    while (wall.children.length > 8) wall.lastElementChild?.remove()
    if (!motionPrefs.reduced) {
      gsap.fromTo(li, { opacity: 0, y: 18, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.6)' })
    }
  }

  const onDown = (): void => {
    holding = true
    hold.classList.add('is-holding')
    hold.setAttribute('aria-pressed', 'true')
    document.documentElement.classList.add('voice-ripple')
    hooks.onVoiceRipple?.(true)
    window.clearInterval(holdTimer)
    let i = 0
    holdTimer = window.setInterval(() => {
      if (!holding) return
      pushLine(LINES[i % LINES.length]!)
      i += 1
    }, 700)
  }
  const onUp = (): void => {
    if (!holding) return
    holding = false
    hold.classList.remove('is-holding')
    hold.setAttribute('aria-pressed', 'false')
    document.documentElement.classList.remove('voice-ripple')
    hooks.onVoiceRipple?.(false)
    window.clearInterval(holdTimer)
    pushLine('（松手）已听到，正在整理字幕墙…')
    hooks.onReward?.('alcove-voice')
  }

  hold.addEventListener('pointerdown', onDown)
  hold.addEventListener('pointerup', onUp)
  hold.addEventListener('pointerleave', onUp)
  hold.addEventListener('pointercancel', onUp)

  return () => {
    hold.removeEventListener('pointerdown', onDown)
    hold.removeEventListener('pointerup', onUp)
    hold.removeEventListener('pointerleave', onUp)
    hold.removeEventListener('pointercancel', onUp)
    window.clearInterval(holdTimer)
    document.documentElement.classList.remove('voice-ripple')
  }
}

function initDesk(root: HTMLElement, hooks: AlcovesHooks): () => void {
  const drop = root.querySelector<HTMLElement>('.alcove-desk__drop')
  const result = root.querySelector<HTMLElement>('.alcove-desk__result')
  const chips = root.querySelectorAll<HTMLButtonElement>('[data-desk-file]')
  if (!drop || !result) return () => undefined

  const destroyers: Array<() => void> = []

  const run = (name: string): void => {
    drop.classList.add('is-busy')
    result.hidden = false
    result.textContent = `正在读 ${name}…`
    window.setTimeout(() => {
      const fake = replyFake(`请解读文件 ${name}`)
      result.textContent = fake.text
      drop.classList.remove('is-busy')
      drop.classList.add('is-done')
      hooks.onReward?.('alcove-desk')
      window.setTimeout(() => drop.classList.remove('is-done'), 800)
    }, 700)
  }

  const onDragOver = (e: DragEvent): void => {
    e.preventDefault()
    drop.classList.add('is-over')
  }
  const onDragLeave = (): void => drop.classList.remove('is-over')
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    drop.classList.remove('is-over')
    const f = e.dataTransfer?.files?.[0]
    run(f?.name || '拖入的文件')
  }
  const onClick = (): void => run('示例截图.png')

  drop.addEventListener('dragover', onDragOver)
  drop.addEventListener('dragleave', onDragLeave)
  drop.addEventListener('drop', onDrop)
  drop.addEventListener('click', onClick)
  destroyers.push(() => {
    drop.removeEventListener('dragover', onDragOver)
    drop.removeEventListener('dragleave', onDragLeave)
    drop.removeEventListener('drop', onDrop)
    drop.removeEventListener('click', onClick)
  })

  chips.forEach((btn) => {
    const fn = (): void => run(btn.dataset.deskFile || btn.textContent || '文件')
    btn.addEventListener('click', fn)
    destroyers.push(() => btn.removeEventListener('click', fn))
  })

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
