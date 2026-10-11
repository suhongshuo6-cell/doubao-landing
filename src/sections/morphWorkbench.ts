/**
 * sections/morphWorkbench.ts — 单一可变形工作台（FLIP，非 display:none）
 * 五模式：对话改写 / 写作排版 / 文件扫描 / 图像 before-after / 语音波形
 */
import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'
import { EXP, on } from '../experience/events'
import type { ExperienceDirector } from '../experience/experienceDirector'
import type { FrameLoop } from '../lib/frameLoop'

type Mode = 'dialog' | 'write' | 'file' | 'image' | 'voice'

const MODES: { id: Mode; label: string }[] = [
  { id: 'dialog', label: '对话改写' },
  { id: 'write', label: '写作排版' },
  { id: 'file', label: '文件扫描' },
  { id: 'image', label: '图像对比' },
  { id: 'voice', label: '语音波形' },
]

const WRITE: Record<string, string> = {
  base: '本周完成自助排查上线，客诉环比下降 12%。下周重点锁双十一仓位。',
  detail:
    '本周完成「自助排查」上线（覆盖 3 条高频客诉路径），客诉量环比下降 12%。风险：供应链可能拖双十一备货。',
  short: '自助排查已上线，客诉 -12%。下周锁仓并补投。',
  soft: '这周把自助排查推上线了，客诉大概少了一成二。接下来要盯住双十一的仓和投放。',
}

export function initMorphWorkbench(opts: {
  director: ExperienceDirector
  loop: FrameLoop
}): () => void {
  const section = document.getElementById('morph-workbench')
  const stage = document.getElementById('morphStage')
  const tabs = document.getElementById('morphTabs')
  if (!section || !stage || !tabs) return () => undefined

  const destroyers: Array<() => void> = []
  let mode: Mode = 'dialog'
  let flipping = false

  const panels = Array.from(stage.querySelectorAll<HTMLElement>('[data-morph]'))

  const layoutFor = (id: Mode): void => {
    panels.forEach((p) => {
      const on = p.dataset.morph === id
      p.classList.toggle('is-active', on)
      p.setAttribute('aria-hidden', on ? 'false' : 'true')
      // 非 display:none：用 grid 叠层 + 缩放透明度
      if (on) {
        p.style.visibility = 'visible'
        p.style.pointerEvents = 'auto'
      } else {
        p.style.pointerEvents = 'none'
      }
    })
    tabs.querySelectorAll<HTMLButtonElement>('[data-morph-tab]').forEach((btn) => {
      const on = btn.dataset.morphTab === id
      btn.classList.toggle('is-active', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    section.dataset.mode = id
  }

  const flipTo = (next: Mode): void => {
    if (next === mode || flipping) return
    const from = stage.querySelector<HTMLElement>(`[data-morph="${mode}"]`)
    const to = stage.querySelector<HTMLElement>(`[data-morph="${next}"]`)
    if (!from || !to) {
      mode = next
      layoutFor(next)
      return
    }
    if (motionPrefs.reduced) {
      mode = next
      layoutFor(next)
      return
    }
    flipping = true
    const first = from.getBoundingClientRect()
    mode = next
    layoutFor(next)
    const last = to.getBoundingClientRect()
    const dx = first.left - last.left
    const dy = first.top - last.top
    const sx = first.width / Math.max(1, last.width)
    const sy = first.height / Math.max(1, last.height)

    gsap.fromTo(
      to,
      {
        x: dx,
        y: dy,
        scaleX: sx,
        scaleY: sy,
        opacity: 0.55,
        filter: 'blur(4px)',
      },
      {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        filter: 'blur(0px)',
        duration: 0.55,
        ease: EASE_IN,
        onComplete: () => {
          flipping = false
        },
      },
    )
    gsap.to(from, { opacity: 0, scale: 0.96, duration: 0.35, ease: 'power2.in' })
  }

  // tabs
  MODES.forEach((m) => {
    const btn = tabs.querySelector<HTMLButtonElement>(`[data-morph-tab="${m.id}"]`)
    if (!btn) return
    const onClick = (): void => {
      flipTo(m.id)
      btn.classList.add('is-fired')
      window.setTimeout(() => btn.classList.remove('is-fired'), 400)
    }
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  layoutFor('dialog')

  // 解锁联动
  destroyers.push(
    on<{ mode: string }>(EXP.MODE_UNLOCK, (d) => {
      const m = d?.mode as Mode | undefined
      if (m && MODES.some((x) => x.id === m)) flipTo(m)
    }),
  )

  /* ---- 各模式可操作 ---- */
  // dialog chips
  stage.querySelectorAll<HTMLButtonElement>('[data-dialog-chip]').forEach((btn) => {
    const onClick = (): void => {
      const chat = stage.querySelector('[data-morph="dialog"] .morph-chat')
      if (!chat) return
      const line = document.createElement('div')
      line.className = 'morph-line morph-line--user'
      line.textContent = btn.dataset.dialogChip || btn.textContent || ''
      chat.appendChild(line)
      const ai = document.createElement('div')
      ai.className = 'morph-line morph-line--ai'
      ai.textContent = '好，已按你的条件改了一版。'
      chat.appendChild(ai)
      btn.classList.add('is-fired')
      window.setTimeout(() => btn.classList.remove('is-fired'), 400)
    }
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  // write ops
  stage.querySelectorAll<HTMLButtonElement>('[data-write-op]').forEach((btn) => {
    const onClick = (): void => {
      const draft = stage.querySelector<HTMLElement>('[data-write-draft]')
      const key = btn.dataset.writeOp || 'base'
      if (draft) {
        if (motionPrefs.reduced) draft.textContent = WRITE[key] ?? WRITE.base!
        else {
          gsap.to(draft, {
            opacity: 0,
            y: 8,
            duration: 0.15,
            onComplete: () => {
              draft.textContent = WRITE[key] ?? WRITE.base!
              gsap.to(draft, { opacity: 1, y: 0, duration: 0.35, ease: EASE_IN })
            },
          })
        }
      }
      btn.classList.add('is-fired')
      window.setTimeout(() => btn.classList.remove('is-fired'), 400)
    }
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  // file scan
  const fileZone = stage.querySelector<HTMLElement>('[data-file-zone]')
  const runScan = (name: string): void => {
    const bar = stage.querySelector<HTMLElement>('[data-file-bar]')
    const label = stage.querySelector<HTMLElement>('[data-file-label]')
    const sheet = stage.querySelector<HTMLElement>('[data-file-name]')
    if (sheet) sheet.textContent = name
    if (label) label.textContent = '扫描中…'
    if (bar) {
      gsap.fromTo(bar, { width: '0%' }, { width: '100%', duration: motionPrefs.reduced ? 0.2 : 1.0, ease: EASE_IN, onComplete: () => {
        if (label) label.textContent = '已提取 12 个要点'
      }})
    }
  }
  fileZone?.addEventListener('click', () => runScan('季度复盘.pdf'))
  stage.querySelectorAll<HTMLButtonElement>('[data-file-pick]').forEach((btn) => {
    const onClick = (): void => runScan(btn.dataset.filePick || '文件.pdf')
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  // image BA
  const range = stage.querySelector<HTMLInputElement>('[data-ba-range]')
  const after = stage.querySelector<HTMLElement>('[data-ba-after]')
  const onRange = (): void => {
    if (!range || !after) return
    after.style.width = `${range.value}%`
  }
  range?.addEventListener('input', onRange)
  destroyers.push(() => range?.removeEventListener('input', onRange))

  // voice wave
  const hold = stage.querySelector<HTMLButtonElement>('[data-voice-hold]')
  let waveTimer = 0
  const setWave = (on: boolean): void => {
    const wave = stage.querySelector<HTMLElement>('[data-voice-wave]')
    const result = stage.querySelector<HTMLElement>('[data-voice-result]')
    hold?.setAttribute('aria-pressed', String(on))
    wave?.classList.toggle('is-live', on)
    if (on) {
      if (result) result.hidden = true
    } else {
      if (result) {
        result.hidden = false
        result.textContent = '已听到：帮我查一下今天杭州天气。'
      }
    }
  }
  const down = (): void => {
    setWave(true)
    window.clearTimeout(waveTimer)
  }
  const up = (): void => {
    setWave(false)
  }
  hold?.addEventListener('pointerdown', down)
  hold?.addEventListener('pointerup', up)
  hold?.addEventListener('pointerleave', up)
  destroyers.push(() => {
    hold?.removeEventListener('pointerdown', down)
    hold?.removeEventListener('pointerup', up)
    hold?.removeEventListener('pointerleave', up)
    window.clearTimeout(waveTimer)
  })

  // 进入章节
  const st = ScrollTrigger.create({
    trigger: section,
    start: 'top 60%',
    once: true,
    onEnter: () => opts.director.completeScene(),
  })
  destroyers.push(() => st.kill())

  // 波形动画
  if (!motionPrefs.reduced) {
    const stop = opts.loop.add((_dt, elapsed) => {
      const wave = stage.querySelector<HTMLElement>('[data-voice-wave]')
      if (!wave?.classList.contains('is-live')) return
      wave.querySelectorAll<HTMLElement>('i').forEach((bar, i) => {
        const h = 8 + Math.abs(Math.sin(elapsed * 6 + i)) * 22
        bar.style.height = `${h.toFixed(1)}px`
      })
    })
    destroyers.push(stop)
  }

  return () => destroyers.forEach((d) => d())
}
