import gsap from 'gsap'
import { EASE_IN } from '../motion/eases'
import { motionPrefs } from '../lib/motionPrefs'
import { observeVisibility } from '../lib/visibility'
import type { FrameLoop } from '../lib/frameLoop'

/**
 * capabilityDemos.ts — 四大能力卡里的微交互演示（规格第七节第 3 条）。
 *
 * 全部纯前端，不调用任何外部 API。四条演示对应四个不同的"炫"：
 *   对话卡：打字机逐字输入 + 三个缓慢呼吸的思考圆点
 *   文件卡：纸片落入（一次带回弹的落位）+ 匀速一次性解析进度条
 *   图像卡：网格点阵用 blur 插值从模糊到清晰
 *   语音卡：GSAP 逐帧生成的平滑振幅波形（正弦叠加的伪噪声，不是真随机）
 *
 * 红线 A 的自我约束：
 *   · 前三条都是**一次性**编排，播完就停，绝不循环
 *   · 语音卡的波形是唯一持续运行的，所以三条定量红线全部按最坏情况标定：
 *     最快分量周期 6.0s ≥ 4s；只用 transform: scaleY（不碰 color / opacity /
 *     box-shadow / filter）；振幅用指数缓动逼近目标，不会逐帧跳变
 *   · 卡片滚出视口立刻暂停（规格第八节）
 */

export interface CapabilityDemoOptions {
  loop: FrameLoop
}

interface DemoHandle {
  start(): void
}

/* ------------------------------------------------------------------ 工具 -- */

function buildFrames(root: ParentNode): void {
  const pixels = root.querySelector<HTMLElement>('[data-pixels]')
  if (pixels && pixels.childElementCount === 0) {
    const frag = document.createDocumentFragment()
    for (let i = 0; i < 40; i++) {
      const cell = document.createElement('i')
      // 确定性的"像一张图"的明暗分布：中间密、四周疏。不用 Math.random，
      // 否则每次刷新画面都不一样，评审时没法比对。
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

/** 统一的"第一次进视口才播"触发器 */
function onceVisible(el: Element, run: () => void): void {
  let fired = false
  observeVisibility(
    el,
    (visible) => {
      if (!visible || fired) return
      fired = true
      run()
    },
    '-10% 0px -10% 0px',
  )
}

/* -------------------------------------------------------------- 对话卡 -- */

function dialogDemo(card: HTMLElement): DemoHandle {
  const typed = card.querySelector<HTMLElement>('[data-typewriter]')
  const thinking = card.querySelector<HTMLElement>('.demo-thinking')
  const full = typed?.textContent ?? ''

  gsap.set(thinking, { opacity: 0 })
  if (typed) typed.textContent = ''

  const state = { i: 0 }

  return {
    start() {
      if (!typed) {
        gsap.set(thinking, { opacity: 1 })
        return
      }
      gsap
        .timeline()
        // 逐字输入：线性的，打字机不能有缓动
        .to(state, {
          i: full.length,
          duration: full.length * 0.052,
          ease: 'none',
          onUpdate: () => {
            typed.textContent = full.slice(0, Math.round(state.i))
          },
        })
        // 打完之后思考点才出现，而不是一开始就在那儿呼吸
        .to(thinking, { opacity: 1, duration: 0.45, ease: EASE_IN }, '+=0.15')
    },
  }
}

/* -------------------------------------------------------------- 文件卡 -- */

function fileDemo(card: HTMLElement): DemoHandle {
  const sheet = card.querySelector<HTMLElement>('[data-sheet]')
  const bar = card.querySelector<HTMLElement>('[data-progress]')
  const label = card.querySelector<HTMLElement>('[data-progress-label]')

  // 初始态：纸片在画面上方、还没落下来；进度条为空
  gsap.set(sheet, { y: -46, opacity: 0, rotate: -5 })
  gsap.set(bar, { width: '0%' })
  if (label) label.textContent = '待解析'

  const counter = { v: 0 }

  return {
    start() {
      const tl = gsap.timeline()
      // 纸片落入：一次带回弹的落位（不是循环的浮动）
      tl.to(sheet, { y: 0, opacity: 1, rotate: 0, duration: 0.72, ease: 'back.out(1.5)' })
      if (label) {
        tl.set(label, { textContent: '解析中' }, '-=0.2')
      }
      tl.to(
        counter,
        {
          v: 100,
          duration: 1.6,
          ease: 'none', // 规格：匀速推进，一次性
          onUpdate: () => {
            if (label) label.textContent = `解析中 ${Math.round(counter.v)}%`
          },
        },
        '-=0.15',
      )
        .to(bar, { width: '100%', duration: 1.6, ease: 'none' }, '<')
        .add(() => {
          if (label) label.textContent = '解析完成'
        })
    },
  }
}

/* -------------------------------------------------------------- 图像卡 -- */

function imageDemo(card: HTMLElement): DemoHandle {
  const cells = Array.from(card.querySelectorAll<HTMLElement>('[data-pixels] i'))
  const label = card.querySelector<HTMLElement>('[data-pixels-label]')

  gsap.set(cells, { filter: 'blur(3.4px)' })
  if (label) label.textContent = '等待生成'

  return {
    start() {
      if (label) label.textContent = '生成中'
      gsap
        .timeline()
        // 规格明确：从模糊到清晰用 blur 插值，不是闪烁
        .to(cells, {
          filter: 'blur(0px)',
          duration: 1.05,
          ease: EASE_IN,
          stagger: { amount: 0.65, from: 'center', grid: [4, 10] },
        })
        .add(() => {
          if (label) label.textContent = '生成完成'
        }, '-=0.25')
    },
  }
}

/* -------------------------------------------------------------- 语音卡 -- */

function voiceDemo(card: HTMLElement, loop: FrameLoop): () => void {
  const bars = Array.from(card.querySelectorAll<HTMLElement>('[data-wave] i'))
  if (!bars.length) return () => undefined
  const label = card.querySelector<HTMLElement>('.demo-wave__label')

  // 三个正弦叠加成平滑的伪噪声。频率刻意压到最低分量周期 6.0s（≥ 红线 A 的 4s）。
  const FREQ = [0.52, 1.05, 0.31]
  const PHASE = bars.map((_, i) => (i / bars.length) * Math.PI * 3.2)
  const amps = new Array<number>(bars.length).fill(0.1)

  let visible = false
  const handle = observeVisibility(card, (v) => {
    visible = v
  })

  const off = loop.add((dt, elapsed) => {
    if (!visible) return
    // 波形真的在动的时候，标签也要跟着改 —— 否则"等待语音输入"和跳动的波形自相矛盾
    if (label && label.textContent !== '语音输入中') label.textContent = '语音输入中'
    for (let i = 0; i < bars.length; i++) {
      const p = PHASE[i]!
      const noise =
        Math.sin(elapsed * FREQ[0]! + p) * 0.5 +
        Math.sin(elapsed * FREQ[1]! + p * 1.7) * 0.3 +
        Math.sin(elapsed * FREQ[2]! + p * 0.4) * 0.2
      // 两端收窄，让波形像人声包络而不是一根根柱子乱蹦
      const envelope = 0.45 + 0.55 * Math.sin((i / (bars.length - 1)) * Math.PI)
      const target = 0.09 + Math.abs(noise) * 0.72 * envelope
      // 帧率无关的指数缓动 —— 这是"平滑"而不是"噪音"的关键
      amps[i] = amps[i]! + (target - amps[i]!) * Math.min(1, dt * 5.5)
      bars[i]!.style.transform = `scaleY(${amps[i]!.toFixed(3)})`
    }
  })

  return () => {
    handle.destroy()
    off()
  }
}

/* --------------------------------------------------------------- 装配 -- */

export function initCapabilityDemos({ loop }: CapabilityDemoOptions): () => void {
  const cards = document.querySelectorAll<HTMLElement>('.cap-card')
  if (!cards.length) return () => undefined

  buildFrames(document)

  // reduced-motion：全部直接呈现终态，不做任何编排
  if (motionPrefs.reduced) {
    gsap.set('[data-sheet]', { y: 0, opacity: 1, rotate: 0 })
    gsap.set('[data-progress]', { width: '100%' })
    gsap.set('[data-pixels] i', { filter: 'blur(0px)' })
    document.querySelectorAll<HTMLElement>('[data-progress-label]').forEach((el) => {
      el.textContent = '解析完成'
    })
    document.querySelectorAll<HTMLElement>('[data-pixels-label]').forEach((el) => {
      el.textContent = '生成完成'
    })
    document.querySelectorAll<HTMLElement>('.demo-wave__label').forEach((el) => {
      el.textContent = '语音输入中'
    })
    gsap.set('.demo-thinking', { opacity: 1 })
    return () => undefined
  }

  const dialog = cards[0] ? dialogDemo(cards[0]) : null
  const file = cards[1] ? fileDemo(cards[1]) : null
  const image = cards[2] ? imageDemo(cards[2]) : null
  const stopVoice = cards[3] ? voiceDemo(cards[3], loop) : () => undefined

  cards.forEach((card, index) => {
    const handle = [dialog, file, image][index]
    if (!handle) return
    onceVisible(card, () => handle.start())
  })

  return () => stopVoice()
}
