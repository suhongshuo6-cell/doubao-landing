import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import { EASE_IN } from '../motion/eases'

void ScrollTrigger
import { motionPrefs } from '../lib/motionPrefs'
import { observeVisibility } from '../lib/visibility'
import type { FrameLoop } from '../lib/frameLoop'

/**
 * 四大能力沙盒 —— 每卡 ≥2 种操作，反馈更爽（终端风）
 */

export interface CapabilityDemoOptions {
  loop: FrameLoop
}

function buildFrames(root: ParentNode): void {
  const pixels = root.querySelector<HTMLElement>('[data-pixels]')
  if (pixels && pixels.childElementCount === 0) {
    const frag = document.createDocumentFragment()
    for (let i = 0; i < 40; i++) {
      const cell = document.createElement('i')
      const row = Math.floor(i / 10)
      const col = i % 10
      const edge = Math.min(row, 9 - row, col, 9 - col) / 4.5
      cell.style.opacity = String(0.28 + edge * 0.58)
      frag.appendChild(cell)
    }
    pixels.appendChild(frag)
  }

  const wave = root.querySelector<HTMLElement>('[data-wave]')
  if (wave && wave.childElementCount === 0) {
    const frag = document.createDocumentFragment()
    for (let i = 0; i < 32; i++) {
      const bar = document.createElement('i')
      bar.style.transform = 'scaleY(0.1)'
      frag.appendChild(bar)
    }
    wave.appendChild(frag)
  }
}

function punchCard(card: HTMLElement): void {
  card.classList.add('is-punch')
  window.setTimeout(() => card.classList.remove('is-punch'), 520)
  if (motionPrefs.reduced) return
  gsap.fromTo(
    card,
    { scale: 1, rotate: 0 },
    {
      scale: 1.035,
      rotate: -0.4,
      duration: 0.2,
      yoyo: true,
      repeat: 1,
      ease: 'back.out(2)',
    },
  )
}

const CHIP_REPLIES: Record<string, string> = {
  '再细一点，按渠道拆': '好。按自然流量 / 付费 / 活动三路拆：目标增量分别是 4% / 6% / 3%。',
  '加一个风险假设': '补了一条：若转化漏斗掉 1.5pt，需要额外投放约 8%。',
  '换成老板能看的版本': '已压成三句话结论 + 一张数字表，语气更克制。',
}

function dialogDemo(card: HTMLElement): () => void {
  const typed = card.querySelector<HTMLElement>('[data-typewriter]')
  const thinking = card.querySelector<HTMLElement>('.demo-thinking')
  const chat = card.querySelector<HTMLElement>('[data-dialog-chat]')
  const chips = card.querySelectorAll<HTMLButtonElement>('[data-chip]')
  const ops = card.querySelectorAll<HTMLButtonElement>('[data-dialog-op]')
  const full = typed?.textContent ?? ''
  if (typed) typed.textContent = ''
  gsap.set(thinking, { opacity: 0 })

  let started = false
  let lastConclusion = '可以。先定一个总增长 13%，再按渠道拆开。'

  const startTypewriter = (): void => {
    if (started || !typed) return
    started = true
    const state = { i: 0 }
    gsap
      .timeline()
      .to(state, {
        i: full.length,
        duration: Math.max(0.55, full.length * 0.04),
        ease: 'none',
        onUpdate: () => {
          typed.textContent = full.slice(0, Math.round(state.i))
        },
      })
      .to(thinking, { opacity: 1, duration: 0.35, ease: EASE_IN }, '+=0.1')
      .to(thinking, { opacity: 0, duration: 0.3, delay: 0.7 })
      .add(() => {
        if (!chat) return
        const reply = document.createElement('div')
        reply.className = 'demo-reply'
        reply.textContent = lastConclusion
        chat.appendChild(reply)
        gsap.fromTo(
          reply,
          { opacity: 0, y: 12, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(1.6)' },
        )
        punchCard(card)
      })
  }

  const onChip = (event: Event): void => {
    const btn = event.currentTarget as HTMLButtonElement
    const key = btn.dataset.chip ?? ''
    const text = CHIP_REPLIES[key] ?? '好，我记下了。'
    lastConclusion = text
    if (!chat) return
    const user = document.createElement('div')
    user.className = 'demo-ask'
    user.textContent = key || btn.textContent || ''
    chat.appendChild(user)
    gsap.fromTo(user, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28 })
    const reply = document.createElement('div')
    reply.className = 'demo-reply'
    reply.textContent = text
    chat.appendChild(reply)
    gsap.fromTo(
      reply,
      { opacity: 0, y: 10, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.42, delay: 0.12, ease: 'back.out(1.5)' },
    )
    btn.disabled = true
    chat.scrollTop = chat.scrollHeight
    punchCard(card)
  }

  const onOp = (event: Event): void => {
    const btn = event.currentTarget as HTMLButtonElement
    const op = btn.dataset.dialogOp
    if (op === 'reset' && chat && typed) {
      chat.querySelectorAll('.demo-ask, .demo-reply').forEach((n) => n.remove())
      typed.textContent = ''
      started = false
      chips.forEach((c) => {
        c.disabled = false
      })
      lastConclusion = '可以。先定一个总增长 13%，再按渠道拆开。'
      startTypewriter()
      punchCard(card)
    }
    if (op === 'copy') {
      btn.classList.add('is-hot')
      btn.textContent = '已复制'
      void navigator.clipboard?.writeText(lastConclusion).catch(() => undefined)
      window.setTimeout(() => {
        btn.classList.remove('is-hot')
        btn.textContent = '复制结论'
      }, 1200)
      punchCard(card)
    }
  }

  chips.forEach((c) => c.addEventListener('click', onChip))
  ops.forEach((o) => o.addEventListener('click', onOp))

  let fired = false
  observeVisibility(card, (v) => {
    if (v && !fired) {
      fired = true
      startTypewriter()
    }
  }, '-10% 0px -10% 0px')

  return () => {
    chips.forEach((c) => c.removeEventListener('click', onChip))
    ops.forEach((o) => o.removeEventListener('click', onOp))
  }
}

function fileDemo(card: HTMLElement): () => void {
  const drop = card.querySelector<HTMLElement>('[data-file-drop]') ?? card.querySelector('.cap-demo')
  const sheet = card.querySelector<HTMLElement>('[data-sheet]')
  const nameEl = card.querySelector<HTMLElement>('[data-sheet-name]')
  const bar = card.querySelector<HTMLElement>('[data-progress]')
  const label = card.querySelector<HTMLElement>('[data-progress-label]')
  const ops = card.querySelectorAll<HTMLButtonElement>('[data-file-op]')
  gsap.set(sheet, { y: -20, opacity: 0.55, rotate: -4 })
  gsap.set(bar, { width: '0%' })
  let running = false
  let fileName = '季度复盘.pdf'

  const run = (doneLabel = '解析完成'): void => {
    if (running) return
    running = true
    const counter = { v: 0 }
    if (label) {
      label.textContent = '解析中'
      label.classList.remove('is-done')
    }
    if (nameEl) nameEl.textContent = fileName
    gsap
      .timeline()
      .to(sheet, { y: 0, opacity: 1, rotate: 0, duration: 0.5, ease: 'back.out(1.8)' })
      .to(
        counter,
        {
          v: 100,
          duration: 1.1,
          ease: 'power2.inOut',
          onUpdate: () => {
            if (label) label.textContent = `解析中 ${Math.round(counter.v)}%`
          },
        },
        '-=0.08',
      )
      .to(bar, { width: '100%', duration: 1.1, ease: 'power2.inOut' }, '<')
      .add(() => {
        if (label) {
          label.textContent = doneLabel
          label.classList.add('is-done')
        }
        running = false
        punchCard(card)
      })
  }

  const onClick = (): void => run()
  const onDragOver = (e: DragEvent): void => {
    e.preventDefault()
    drop?.classList.add('is-drag')
  }
  const onDragLeave = (): void => drop?.classList.remove('is-drag')
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    drop?.classList.remove('is-drag')
    run()
  }

  const onOp = (event: Event): void => {
    const btn = event.currentTarget as HTMLButtonElement
    const op = btn.dataset.fileOp
    ops.forEach((o) => o.classList.remove('is-hot'))
    btn.classList.add('is-hot')
    if (op === 'pdf') {
      fileName = '季度复盘.pdf'
      gsap.set(bar, { width: '0%' })
      run('PDF 解析完成')
    } else if (op === 'xlsx') {
      fileName = '增长漏斗.xlsx'
      gsap.set(bar, { width: '0%' })
      run('表格解析完成')
    } else if (op === 'summary') {
      if (label) {
        label.textContent = '摘要：增长 13% · 风险 2 条'
        label.classList.add('is-done')
      }
      punchCard(card)
    }
  }

  drop?.addEventListener('click', onClick)
  drop?.addEventListener('dragover', onDragOver)
  drop?.addEventListener('dragleave', onDragLeave)
  drop?.addEventListener('drop', onDrop)
  ops.forEach((o) => o.addEventListener('click', onOp))

  return () => {
    drop?.removeEventListener('click', onClick)
    drop?.removeEventListener('dragover', onDragOver)
    drop?.removeEventListener('dragleave', onDragLeave)
    drop?.removeEventListener('drop', onDrop)
    ops.forEach((o) => o.removeEventListener('click', onOp))
  }
}

function imageDemo(card: HTMLElement): () => void {
  const cells = Array.from(card.querySelectorAll<HTMLElement>('[data-pixels] i'))
  const label = card.querySelector<HTMLElement>('[data-pixels-label]')
  const btns = card.querySelectorAll<HTMLButtonElement>('[data-image-action]')
  const ops = card.querySelectorAll<HTMLButtonElement>('[data-image-op]')
  const snapshot = cells.map((c) => ({
    opacity: c.style.opacity,
    filter: c.style.filter,
    background: c.style.backgroundColor,
  }))
  gsap.set(cells, { filter: 'blur(2.2px)' })
  let busy = false

  const run = (mode: string): void => {
    if (busy) return
    busy = true
    const titles: Record<string, string> = {
      bg: '换背景中…',
      paint: '像素重组中…',
      expand: '扩画幅中…',
    }
    if (label) {
      label.textContent = titles[mode] ?? '处理中…'
      label.classList.remove('is-done')
    }
    const tl = gsap.timeline({
      onComplete: () => {
        if (label) {
          label.textContent = '完成'
          label.classList.add('is-done')
        }
        busy = false
        punchCard(card)
      },
    })
    if (mode === 'bg') {
      tl.to(cells, {
        opacity: () => 0.2 + Math.random() * 0.75,
        backgroundColor: () => `hsl(${200 + Math.random() * 50} 60% ${58 + Math.random() * 22}%)`,
        duration: 0.5,
        stagger: { amount: 0.4, from: 'random' },
        ease: EASE_IN,
      }).to(cells, { filter: 'blur(0px)', duration: 0.45, ease: EASE_IN }, '-=0.18')
    } else if (mode === 'expand') {
      tl.to(cells, {
        scale: () => 0.7 + Math.random() * 0.2,
        filter: 'blur(0px)',
        duration: 0.45,
        stagger: { amount: 0.35, from: 'edges', grid: [4, 10] },
      })
        .to(cells, { scale: 1.08, duration: 0.35, ease: 'back.out(1.6)' })
        .to(cells, { scale: 1, duration: 0.25 })
    } else {
      tl.to(cells, {
        filter: 'blur(0px)',
        scale: () => 0.82 + Math.random() * 0.4,
        duration: 0.65,
        stagger: { amount: 0.5, from: 'center', grid: [4, 10] },
        ease: EASE_IN,
      }).to(cells, { scale: 1, duration: 0.32 }, '-=0.12')
    }
  }

  const onClick = (e: Event): void => {
    const btn = e.currentTarget as HTMLButtonElement
    run(btn.dataset.imageAction ?? 'bg')
  }
  const onOp = (): void => {
    cells.forEach((c, i) => {
      const s = snapshot[i]
      if (!s) return
      c.style.opacity = s.opacity
      c.style.filter = 'blur(2.2px)'
      c.style.backgroundColor = s.background
    })
    if (label) {
      label.textContent = '已回到处理前'
      label.classList.remove('is-done')
    }
    punchCard(card)
  }

  btns.forEach((b) => b.addEventListener('click', onClick))
  ops.forEach((o) => o.addEventListener('click', onOp))
  return () => {
    btns.forEach((b) => b.removeEventListener('click', onClick))
    ops.forEach((o) => o.removeEventListener('click', onOp))
  }
}

function voiceDemo(card: HTMLElement, loop: FrameLoop): () => void {
  const bars = Array.from(card.querySelectorAll<HTMLElement>('[data-wave] i'))
  const hold = card.querySelector<HTMLButtonElement>('[data-hold-speak]')
  const label = card.querySelector<HTMLElement>('[data-voice-label]')
  const result = card.querySelector<HTMLElement>('[data-voice-result]')
  const ops = card.querySelectorAll<HTMLButtonElement>('[data-voice-op]')
  if (!bars.length) return () => undefined

  const FREQ = [0.9, 1.7, 0.55]
  const PHASE = bars.map((_, i) => (i / bars.length) * Math.PI * 3.2)
  const amps = new Array<number>(bars.length).fill(0.08)
  let holding = false
  let tempo = 1

  const off = loop.add((dt, elapsed) => {
    if (!holding) {
      for (let i = 0; i < bars.length; i++) {
        amps[i] = amps[i]! + (0.08 - amps[i]!) * Math.min(1, dt * 6)
        bars[i]!.style.transform = `scaleY(${amps[i]!.toFixed(3)})`
      }
      return
    }
    for (let i = 0; i < bars.length; i++) {
      const p = PHASE[i]!
      const t = elapsed * tempo
      const noise =
        Math.sin(t * FREQ[0]! + p) * 0.5 +
        Math.sin(t * FREQ[1]! + p * 1.7) * 0.3 +
        Math.sin(t * FREQ[2]! + p * 0.4) * 0.2
      const envelope = 0.45 + 0.55 * Math.sin((i / (bars.length - 1)) * Math.PI)
      const target = 0.12 + Math.abs(noise) * 0.9 * envelope
      amps[i] = amps[i]! + (target - amps[i]!) * Math.min(1, dt * 10)
      bars[i]!.style.transform = `scaleY(${amps[i]!.toFixed(3)})`
    }
  })

  const startHold = (e: Event): void => {
    e.preventDefault()
    holding = true
    hold?.setAttribute('aria-pressed', 'true')
    hold?.classList.add('is-hot')
    if (label) label.textContent = '聆听中…'
    if (result) result.hidden = true
  }
  const endHold = (): void => {
    if (!holding) return
    holding = false
    hold?.setAttribute('aria-pressed', 'false')
    hold?.classList.remove('is-hot')
    if (label) label.textContent = '识别完成'
    if (result) {
      result.hidden = false
      result.textContent = '已听到：帮我查一下今天杭州天气。'
      gsap.fromTo(
        result,
        { opacity: 0, y: 10, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.5)' },
      )
    }
    punchCard(card)
  }

  const onOp = (event: Event): void => {
    const btn = event.currentTarget as HTMLButtonElement
    const op = btn.dataset.voiceOp
    ops.forEach((o) => o.classList.remove('is-hot'))
    btn.classList.add('is-hot')
    if (op === 'search') {
      if (result) {
        result.hidden = false
        result.textContent = '联网结果：杭州 24° · 多云 · 空气优'
        gsap.fromTo(result, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35 })
      }
      if (label) label.textContent = '已联网'
      punchCard(card)
    }
    if (op === 'tempo') {
      tempo = tempo > 1.2 ? 1 : 1.4
      btn.textContent = tempo > 1.2 ? '语速 ×1.0' : '语速 ×1.4'
      if (label) label.textContent = `波形加速 ×${tempo.toFixed(1)}`
      punchCard(card)
    }
  }

  hold?.addEventListener('pointerdown', startHold)
  window.addEventListener('pointerup', endHold)
  hold?.addEventListener('pointerleave', endHold)
  ops.forEach((o) => o.addEventListener('click', onOp))

  return () => {
    off()
    hold?.removeEventListener('pointerdown', startHold)
    window.removeEventListener('pointerup', endHold)
    hold?.removeEventListener('pointerleave', endHold)
    ops.forEach((o) => o.removeEventListener('click', onOp))
  }
}

function springCards(): () => void {
  if (motionPrefs.reduced) return () => undefined
  const cards = document.querySelectorAll<HTMLElement>('.cap-card')
  const tweens: gsap.core.Tween[] = []
  cards.forEach((card, i) => {
    tweens.push(
      gsap.fromTo(
        card,
        { opacity: 0, y: 48, rotate: i % 2 === 0 ? -2.5 : 2.5, scale: 0.94 },
        {
          opacity: 1,
          y: 0,
          rotate: 0,
          scale: 1,
          duration: 0.85,
          ease: 'back.out(1.55)',
          scrollTrigger: { trigger: card, start: 'top 88%', once: true },
        },
      ),
    )
  })
  return () => tweens.forEach((t) => {
    t.scrollTrigger?.kill()
    t.kill()
  })
}

export function initCapabilityDemos({ loop }: CapabilityDemoOptions): () => void {
  const cards = document.querySelectorAll<HTMLElement>('.cap-card')
  if (!cards.length) return () => undefined

  buildFrames(document)
  const stopSpring = springCards()

  if (motionPrefs.reduced) {
    gsap.set('[data-sheet]', { y: 0, opacity: 1, rotate: 0 })
    gsap.set('[data-progress]', { width: '100%' })
    gsap.set('[data-pixels] i', { filter: 'blur(0px)' })
    document.querySelectorAll<HTMLElement>('[data-progress-label]').forEach((el) => {
      el.textContent = '解析完成'
    })
    document.querySelectorAll<HTMLElement>('[data-pixels-label]').forEach((el) => {
      el.textContent = '完成'
    })
    return () => stopSpring()
  }

  const byCap = (id: string): HTMLElement | undefined =>
    Array.from(cards).find((c) => c.dataset.cap === id)

  const stops = [
    byCap('dialog') ? dialogDemo(byCap('dialog')!) : () => undefined,
    byCap('file') ? fileDemo(byCap('file')!) : () => undefined,
    byCap('image') ? imageDemo(byCap('image')!) : () => undefined,
    byCap('voice') ? voiceDemo(byCap('voice')!, loop) : () => undefined,
  ]

  return () => {
    stopSpring()
    stops.forEach((s) => s())
  }
}
