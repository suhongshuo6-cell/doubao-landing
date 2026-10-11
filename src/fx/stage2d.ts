/**
 * fx/stage2d.ts — 2D 特效层（粒子 + 小豆包 + 鼠标柔光）的唯一出口。
 *
 * 为什么单独一层而不是塞进 three：
 *   1. 它**不依赖 three** —— 放在阶段 1 装配，首屏一下就能"回应你"，
 *      不用等 244KB 的 three 下载完；
 *   2. 粒子/小豆包是纯 2D 绘制，走 2D canvas 比做成 three 的 Sprite 便宜得多；
 *   3. 立绘是照片级写实，前景元素用 2D 反而更容易和文字排版对齐。
 *
 * 层级：DOM 顺序放在 #stage 之后、且共用 --z-stage —— 既不盖住文字，也不被角色盖住。
 */

import { motionPrefs } from '../lib/motionPrefs'
import { createFxAudio, type FxAudio } from './audio'
import { createFxParticles, type FxParticles } from './particles'
import { createMascot, type Mascot } from './mascot'

export type ReactKind =
  /** 在空白处点一下 */
  | 'tap'
  /** 点在小豆包身上 */
  | 'mascot'
  /** 键盘 */
  | 'key'
  /** 首屏输入框发送 */
  | 'send'
  /** 结尾放烟花 */
  | 'cheer'
  /** 取景节点切换 */
  | 'node'
  /** 捏脸起始 */
  | 'pinch'

/**
 * 小豆包在每个取景节点停在哪。
 * 唯一的硬约束：**放在立绘中轴的另一侧**（FRAMING_NODES 的 axisFrac 依次是
 * .68/.63/.66/.50/.50/.34），绝不能糊在脸上。
 */
const ANCHORS: ReadonlyArray<{ x: number; y: number; s: number }> = [
  // 右下角是各区块共同的空白区（正文多在左/中，右侧导航条在 x≈0.92 之外），
  // 每个节点只做小幅纵向变化 —— 既不挡字，也不糊在脸上。
  { x: 0.82, y: 0.78, s: 0.9 }, // face
  { x: 0.83, y: 0.72, s: 0.95 }, // neck
  { x: 0.84, y: 0.68, s: 0.9 }, // arms
  { x: 0.82, y: 0.76, s: 0.85 }, // waist
  { x: 0.82, y: 0.7, s: 0.82 }, // legs
  { x: 0.81, y: 0.64, s: 1.0 }, // body
]

/** 移动端：统一收到右下角，避免压中文案 */
const MOBILE_ANCHOR = { x: 0.8, y: 0.84, s: 0.72 }

export interface Stage2d {
  readonly audio: FxAudio
  readonly mascot: Mascot
  readonly particles: FxParticles
  /** 切取景节点：小豆包换边 + 一圈声波 */
  setNode(index: number): void
  react(kind: ReactKind, x?: number, y?: number, power?: number): void
  /** 指针移动：视线 + 柔光 */
  pointer(x: number, y: number): void
  update(dt: number, elapsed: number): void
  draw(): void
  resize(): void
  destroy(): void
}

export function createStage2d(): Stage2d | null {
  const canvas = document.getElementById('fx')
  if (!(canvas instanceof HTMLCanvasElement)) return null
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const glow = document.getElementById('cursorGlow')

  const audio = createFxAudio()
  const particles = createFxParticles()
  const mascot = createMascot()

  let W = 0
  let H = 0
  let node = 0
  let pointerX = window.innerWidth * 0.5
  let pointerY = window.innerHeight * 0.5
  let pointerSeen = false
  let glowX = pointerX
  let glowY = pointerY
  let keyIndex = 0

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    applyAnchor()
  }

  const applyAnchor = (): void => {
    const a = motionPrefs.tier === 'mobile' ? MOBILE_ANCHOR : (ANCHORS[node] ?? ANCHORS[0]!)
    mascot.setAnchor(a.x * W, a.y * H, a.s)
  }

  const setNode = (index: number): void => {
    if (index === node) return
    node = index
    applyAnchor()
    particles.clearTransient() // 换节点清场，粒子不"串场"
    const ax = (ANCHORS[index] ?? ANCHORS[0]!).x * W
    const ay = (ANCHORS[index] ?? ANCHORS[0]!).y * H
    particles.ring(mascot.x || ax, mascot.y || ay, '#FF5A3C')
    audio.note(index, { vol: 0.07 })
  }

  /** 音高：按屏幕横向位置取级数，右边比左边高 —— 页面像一件乐器 */
  const pitchFromX = (x: number): number => Math.round((x / Math.max(1, W)) * 6)

  const react = (kind: ReactKind, x = pointerX, y = pointerY, power = 1): void => {
    const soft = motionPrefs.reduced
    switch (kind) {
      case 'tap': {
        if (!soft) particles.burst(x, y, { n: 10, speedMin: 2, speedMax: 6, gravity: 0.05 })
        audio.note(pitchFromX(x), { vol: 0.06 })
        break
      }
      case 'mascot': {
        mascot.press(power)
        audio.pop()
        if (!soft) {
          particles.burst(mascot.x, mascot.y, {
            n: 18,
            speedMin: 3,
            speedMax: 10,
            big: true,
            colors: ['#FF5A3C', '#FFB020', '#FFD9CF'],
          })
        }
        break
      }
      case 'key': {
        keyIndex += 1
        audio.note(pitchFromX(x) + (keyIndex % 5), { vol: 0.09 })
        if (!soft) {
          particles.burst(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, {
            n: 12,
            speedMin: 2,
            speedMax: 9,
            gravity: 0.04,
            big: true,
          })
        }
        mascot.press(0.5)
        break
      }
      case 'send': {
        audio.cheer()
        mascot.press(0.9)
        particles.ring(mascot.x, mascot.y, '#FF5A3C')
        if (!soft) {
          particles.burst(x, y, { n: 26, speedMin: 3, speedMax: 11, big: true, gravity: 0.04 })
        }
        break
      }
      case 'cheer': {
        audio.cheer()
        mascot.press(1.4)
        const waves = soft ? 1 : 5
        for (let i = 0; i < waves; i++) {
          window.setTimeout(() => {
            particles.burst(
              W * (0.2 + Math.random() * 0.6),
              H * (0.22 + Math.random() * 0.45),
              { n: 26, speedMin: 3, speedMax: 12, gravity: 0.06, big: true },
            )
          }, i * 160)
        }
        if (!soft) particles.minis(mascot.x, mascot.y)
        break
      }
      case 'node': {
        audio.blip(500 + node * 38)
        break
      }
      case 'pinch': {
        audio.blip(360)
        if (!soft) particles.ring(x, y, '#FFB020')
        break
      }
    }
  }

  const pointer = (x: number, y: number): void => {
    pointerX = x
    pointerY = y
    pointerSeen = true
    mascot.setLook((x - mascot.x) / Math.max(1, W), (y - mascot.y) / Math.max(1, H))
  }

  const update = (dt: number, elapsed: number): void => {
    // 没有指针信息时（触屏首帧），让小豆包看向屏幕中心偏下
    if (!pointerSeen) mascot.setLook(0, 0.2)
    mascot.update(dt, elapsed)
    particles.update(dt)

    if (glow) {
      const k = 1 - Math.exp(-9 * dt)
      glowX += (pointerX - glowX) * k
      glowY += (pointerY - glowY) * k
      glow.style.transform = `translate3d(${glowX.toFixed(1)}px, ${glowY.toFixed(1)}px, 0)`
      glow.style.opacity = motionPrefs.coarse ? '0' : '1'
    }
  }

  const draw = (): void => {
    ctx.clearRect(0, 0, W, H)
    particles.draw(ctx)
    mascot.draw(ctx)
  }

  const destroy = (): void => {
    particles.clearAll()
    ctx.clearRect(0, 0, W, H)
  }

  resize()
  return { audio, mascot, particles, setNode, react, pointer, update, draw, resize, destroy }
}
