/**
 * fx/mascot.ts — 小豆包（品牌吉祥物 / 情绪指示器）。
 *
 * 它和立绘的关系不是"两个角色并排"，而是**同一个角色的两种尺度**：
 * 立绘承担"大"（沉浸、运镜、捏脸），小豆包承担"活"（随时随地的即时回应）。
 * 所以任何一次输入都会同时打到两层：立绘微反应 + 小豆包明确反应。
 *
 * 颜色刻意用站点自己的品牌橘红而不是 demo 的蓝 —— 一来不引入第二种强调色，
 * 二来"豆沙包"本来就是红的，语义上更贴。
 *
 * 动作清单（全部是廉价的纯 Canvas 绘制，不占 GPU）：
 *   呼吸缩放 / 果冻蠕动轮廓 / 挤压拉伸弹簧 / 眨眼 / 视线跟随鼠标 / 张嘴 / 头顶小芽摇摆
 */

const BODY_HI = '#FF9A7A'
const BODY = '#FF5A3C'
const BODY_LO = '#D93A1C'
const SPROUT = '#3FAE7E'
const SPROUT_LEAF = '#34D399'
const INK = '#231A18'

export interface Mascot {
  /** 目标锚点（CSS 像素） */
  setAnchor(x: number, y: number, scale: number): void
  /** 视线方向，-1..1 */
  setLook(nx: number, ny: number): void
  /** 被按一下：挤压 + 张嘴 */
  press(power?: number): void
  update(dt: number, elapsed: number): void
  draw(ctx: CanvasRenderingContext2D): void
  /** 命中测试（判断这一下点击是不是点在它身上） */
  hit(x: number, y: number): boolean
  readonly x: number
  readonly y: number
  readonly r: number
}

export function createMascot(): Mascot {
  const BASE_R = 38

  let x = 0
  let y = 0
  let r = BASE_R
  let tx = 0
  let ty = 0
  let tr = BASE_R

  // 挤压拉伸：欠阻尼弹簧，所以按下会有可见的余振（"Q 弹"的来源）
  let sx = 1
  let sy = 1
  let svx = 0
  let svy = 0

  let rot = 0
  let targetRot = 0
  let lookX = 0
  let lookY = 0
  let mouth = 0
  /** draw() 需要 elapsed 但不想每帧传参，用闭包变量接住 */
  let elapsedRef = 0
  let blink = 1
  let blinkT = 0
  let nextBlink = 2 + Math.random() * 3

  const press = (power = 1): void => {
    svx -= 0.16 * power
    svy += 0.2 * power
    mouth = 1
  }

  const update = (dt: number, elapsed: number): void => {
    const k = Math.min(dt * 60, 3)

    // 锚点阻尼跟随（比直接赋值多一层"跟过来"的手感）
    const follow = 1 - Math.exp(-6 * dt)
    x += (tx - x) * follow
    y += (ty - y) * follow
    r += (tr - r) * (1 - Math.exp(-5 * dt))

    // 挤压弹簧
    svx += (1 - sx) * 0.028 * k * 2.2
    sx += svx * 0.2 * k
    svx *= Math.pow(0.86, k)
    svy += (1 - sy) * 0.028 * k * 2.2
    sy += svy * 0.2 * k
    svy *= Math.pow(0.86, k)

    // 朝向鼠标（轻微倾斜，不要晃得厉害）
    rot += (targetRot + Math.sin(elapsed * 1.1) * 0.02 - rot) * 0.08 * k

    // 眨眼
    nextBlink -= dt
    if (nextBlink <= 0) {
      blinkT = 0.18
      nextBlink = 1.8 + Math.random() * 3.4
    }
    if (blinkT > 0) {
      blinkT -= dt
      const p = Math.max(0, blinkT / 0.18)
      blink = 0.12 + 0.88 * Math.abs(Math.sin((1 - p) * Math.PI))
    } else {
      blink += (1 - blink) * 0.2 * k
    }

    mouth = Math.max(0, mouth - 0.05 * k)
  }

  const draw = (ctx: CanvasRenderingContext2D): void => {
    const t = elapsedRef
    ctx.save()

    // 软投影
    ctx.save()
    ctx.translate(x, y + r * 1.02)
    ctx.scale(1, 0.22)
    const sh = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.05)
    sh.addColorStop(0, 'rgba(60,30,20,.20)')
    sh.addColorStop(1, 'rgba(60,30,20,0)')
    ctx.fillStyle = sh
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.05, 0, 6.3)
    ctx.fill()
    ctx.restore()

    ctx.translate(x, y)
    ctx.rotate(rot)

    // 呼吸叠在挤压之上
    const breathe = 1 + Math.sin(t * 1.5) * 0.018
    ctx.scale(sx * breathe, sy * (2 - breathe))

    // 头顶小芽（先画，被身体压住一半）
    const sway = Math.sin(t * 1.7) * 0.18 + rot * 0.6
    ctx.save()
    ctx.rotate(sway)
    ctx.strokeStyle = SPROUT
    ctx.lineWidth = r * 0.075
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(r * 0.06, -r * 0.92)
    ctx.quadraticCurveTo(r * 0.2, -r * 1.28, r * 0.42, -r * 1.34)
    ctx.stroke()
    ctx.fillStyle = SPROUT_LEAF
    ctx.save()
    ctx.translate(r * 0.46, -r * 1.36)
    ctx.rotate(0.5 + sway * 0.4)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 0.2, r * 0.1, 0, 0, 6.3)
    ctx.fill()
    ctx.restore()
    ctx.restore()

    // 身体：果冻蠕动轮廓
    ctx.beginPath()
    const N = 40
    const wobble = (a: number): number =>
      1 + Math.sin(a * 3 + t * 2.1) * 0.018 + Math.sin(a * 5 - t * 1.6) * 0.012
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2
      const rr = r * wobble(a)
      const px = Math.cos(a) * rr * 0.92
      const py = Math.sin(a) * rr * 0.96 - r * 0.03
      if (i === 0) {
        ctx.moveTo(px, py)
      } else {
        const pa = ((i - 1) / N) * Math.PI * 2
        const pr = r * wobble(pa)
        const ppx = Math.cos(pa) * pr * 0.92
        const ppy = Math.sin(pa) * pr * 0.96 - r * 0.03
        ctx.quadraticCurveTo(ppx, ppy, (ppx + px) / 2, (ppy + py) / 2)
      }
    }
    ctx.closePath()
    const g = ctx.createRadialGradient(-r * 0.32, -r * 0.4, r * 0.1, 0, r * 0.05, r * 1.25)
    g.addColorStop(0, BODY_HI)
    g.addColorStop(0.45, BODY)
    g.addColorStop(1, BODY_LO)
    ctx.fillStyle = g
    ctx.fill()

    // 肚皮浅色
    ctx.save()
    ctx.globalAlpha = 0.22
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.ellipse(0, r * 0.34, r * 0.56, r * 0.4, 0, 0, 6.3)
    ctx.fill()
    ctx.restore()

    // 高光
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.ellipse(-r * 0.36, -r * 0.46, r * 0.2, r * 0.13, -0.6, 0, 6.3)
    ctx.fill()
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(-r * 0.42, -r * 0.52, r * 0.05, 0, 6.3)
    ctx.fill()
    ctx.restore()

    // 腮红
    ctx.save()
    ctx.globalAlpha = 0.42
    ctx.fillStyle = '#FF7A5C'
    ctx.beginPath()
    ctx.ellipse(-r * 0.42, r * 0.18, r * 0.13, r * 0.08, 0, 0, 6.3)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(r * 0.42, r * 0.18, r * 0.13, r * 0.08, 0, 0, 6.3)
    ctx.fill()
    ctx.restore()

    // 眼睛（视线跟随）
    const ey = r * 0.02
    for (const ex of [-r * 0.31, r * 0.31]) {
      ctx.save()
      ctx.translate(ex, ey)
      ctx.scale(1, blink)
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 0.2, r * 0.23, 0, 0, 6.3)
      ctx.fill()
      const px = Math.max(-r * 0.1, Math.min(r * 0.1, lookX)) * 0.8
      const py = Math.max(-r * 0.1, Math.min(r * 0.1, lookY)) * 0.8
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(px, py, r * 0.105, 0, 6.3)
      ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(px - r * 0.035, py - r * 0.04, r * 0.035, 0, 6.3)
      ctx.fill()
      ctx.restore()
    }

    // 嘴：平时微笑，被按到时张开
    ctx.save()
    ctx.strokeStyle = INK
    ctx.lineWidth = r * 0.045
    ctx.lineCap = 'round'
    if (mouth > 0.35) {
      ctx.fillStyle = '#8C2A1E'
      ctx.beginPath()
      ctx.ellipse(0, r * 0.34, r * 0.1, r * (0.06 + 0.1 * mouth), 0, 0, 6.3)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(0, r * 0.24, r * 0.16, 0.25 * Math.PI, 0.75 * Math.PI)
      ctx.stroke()
    }
    ctx.restore()

    ctx.restore()
  }

  return {
    setAnchor(nx, ny, scale) {
      tx = nx
      ty = ny
      tr = BASE_R * scale
    },
    setLook(nx, ny) {
      lookX = nx * 6
      lookY = ny * 6
      targetRot = Math.max(-0.22, Math.min(0.22, -nx * 0.45))
    },
    press,
    update(dt, elapsed) {
      elapsedRef = elapsed
      update(dt, elapsed)
    },
    draw,
    hit(hx, hy) {
      return Math.hypot(hx - x, hy - y) < r * 1.45
    },
    get x() {
      return x
    },
    get y() {
      return y
    },
    get r() {
      return r
    },
  }
}
