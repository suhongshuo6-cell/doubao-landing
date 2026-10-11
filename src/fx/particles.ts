/**
 * fx/particles.ts — 2D 粒子层。
 *
 * 三种原语（都来自 demo，但改成数据驱动 + 调色板收敛到站点自己的色）：
 *   burst  一次爆开的一簇碎片（圆/方/三角/圆环四种形状混着来，比纯圆点耐看）
 *   ring   一圈缓慢扩散的声波椭圆（用在"听你说"和节点切换）
 *   minis  一群迷你小豆包（用在结尾庆祝，是"豆包分身"的具象化）
 *
 * 收敛原则：颜色只从 BRAND_PALETTE 取，且**整体透明度偏低**——
 * 这一层是"回应"，不是"烟花秀"。粒子再多也不能盖过文字。
 */

export type ParticleShape = 'circle' | 'rect' | 'tri' | 'ring'

/** 只用站点自己的颜色：品牌橘红 + 暖琥珀 + 墨色 + 冷白，不引入第二种强调色 */
export const BRAND_PALETTE = ['#FF5A3C', '#FFB020', '#0E0E12', '#EAF0FF'] as const
export const WARM_PALETTE = ['#FF5A3C', '#FFB020', '#FFD9CF'] as const

export interface BurstOptions {
  /** 粒子数 */
  n?: number
  speedMin?: number
  speedMax?: number
  /** 每帧重力，0 = 悬浮 */
  gravity?: number
  /** 初速向上的额外抬升 */
  up?: number
  /** 尺寸基准（px） */
  size?: number
  /** 大粒子（庆祝用） */
  big?: boolean
  colors?: readonly string[]
  /** 生命衰减系数，越小活得越久 */
  decay?: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  life: number
  decay: number
  size: number
  color: string
  shape: ParticleShape
  rot: number
  vr: number
}

interface Ring {
  x: number
  y: number
  r: number
  max: number
  life: number
  color: string
}

interface Mini {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  life: number
  size: number
  color: string
  rot: number
  vr: number
}

export interface FxParticles {
  burst(x: number, y: number, opts?: BurstOptions): void
  ring(x: number, y: number, color?: string): void
  minis(x: number, y: number): void
  update(dt: number): void
  draw(ctx: CanvasRenderingContext2D): void
  /** 清掉瞬时粒子（切节点时"不串场"），rings/minis 可保留 */
  clearTransient(): void
  clearAll(): void
  readonly count: number
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a)
const pick = <T>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0]
const SHAPES: readonly ParticleShape[] = ['circle', 'rect', 'tri', 'ring']

/** 上限：粒子再多也只会让 GPU 白烧，300 已经足够密 */
const MAX_PARTICLES = 320

export function createFxParticles(): FxParticles {
  let parts: Particle[] = []
  let rings: Ring[] = []
  let minisArr: Mini[] = []

  const burst = (x: number, y: number, opts: BurstOptions = {}): void => {
    const n = opts.n ?? 14
    const colors = opts.colors ?? BRAND_PALETTE
    const g = opts.gravity ?? 0.12
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2)
      const sp = rand(opts.speedMin ?? 2, opts.speedMax ?? 8)
      parts.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - (opts.up ?? 0),
        g,
        life: 1,
        decay: opts.decay ?? rand(0.014, 0.028),
        size: rand(4, opts.big ? (opts.size ?? 16) : (opts.size ?? 10)),
        color: pick(colors),
        shape: pick(SHAPES),
        rot: rand(0, 6.3),
        vr: rand(-0.2, 0.2),
      })
    }
    if (parts.length > MAX_PARTICLES) parts = parts.slice(parts.length - MAX_PARTICLES)
  }

  const ring = (x: number, y: number, color: string = BRAND_PALETTE[0]): void => {
    rings.push({ x, y, r: 10, max: rand(150, 260), life: 1, color })
  }

  const minis = (x: number, y: number): void => {
    for (let i = 0; i < 22; i++) {
      const ang = rand(-Math.PI * 0.95, -Math.PI * 0.05)
      const sp = rand(5, 13)
      minisArr.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        g: 0.18,
        life: 1,
        size: rand(6, 14),
        color: pick(WARM_PALETTE),
        rot: rand(0, 6.3),
        vr: rand(-0.25, 0.25),
      })
    }
  }

  /**
   * 时间步长以 60fps 为 1 个单位。
   * dt 来自统一帧循环（秒），这里换算成"帧当量"，让所有速度参数的写法保持一致。
   */
  const update = (dt: number): void => {
    const k = Math.min(dt * 60, 3)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]!
      p.x += p.vx * k
      p.y += p.vy * k
      p.vy += p.g * k
      p.vx *= 0.99
      p.rot += p.vr * k
      p.life -= p.decay * k
      if (p.life <= 0) parts.splice(i, 1)
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]!
      r.r += (r.max - r.r) * 0.05 * k
      r.life -= 0.012 * k
      if (r.life <= 0) rings.splice(i, 1)
    }
    for (let i = minisArr.length - 1; i >= 0; i--) {
      const m = minisArr[i]!
      m.x += m.vx * k
      m.y += m.vy * k
      m.vy += m.g * k
      m.vx *= 0.99
      m.rot += m.vr * k
      m.life -= 0.014 * k
      if (m.life <= 0) minisArr.splice(i, 1)
    }
  }

  const draw = (ctx: CanvasRenderingContext2D): void => {
    for (const p of parts) {
      const a = Math.max(0, Math.min(1, p.life))
      ctx.save()
      ctx.globalAlpha = a
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.strokeStyle = p.color
      switch (p.shape) {
        case 'circle':
          ctx.beginPath()
          ctx.arc(0, 0, p.size * 0.5, 0, 6.3)
          ctx.fill()
          break
        case 'rect':
          ctx.fillRect(-p.size * 0.4, -p.size * 0.4, p.size * 0.8, p.size * 0.8)
          break
        case 'tri':
          ctx.beginPath()
          ctx.moveTo(0, -p.size * 0.6)
          ctx.lineTo(p.size * 0.55, p.size * 0.45)
          ctx.lineTo(-p.size * 0.55, p.size * 0.45)
          ctx.closePath()
          ctx.fill()
          break
        case 'ring':
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(0, 0, p.size * 0.5, 0, 6.3)
          ctx.stroke()
          break
      }
      ctx.restore()
    }

    for (const r of rings) {
      const a = Math.max(0, Math.min(0.7, r.life * 0.6))
      ctx.save()
      ctx.globalAlpha = a
      ctx.strokeStyle = r.color
      ctx.lineWidth = 1.5 + r.life * 2.5
      ctx.beginPath()
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.72, 0, 0, 6.3)
      ctx.stroke()
      ctx.globalAlpha = a * 0.5
      ctx.beginPath()
      ctx.ellipse(r.x, r.y, r.r * 0.7, r.r * 0.5, 0, 0, 6.3)
      ctx.stroke()
      ctx.restore()
    }

    for (const m of minisArr) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, m.life))
      ctx.translate(m.x, m.y)
      ctx.rotate(m.rot)
      ctx.fillStyle = m.color
      ctx.beginPath()
      ctx.ellipse(0, 0, m.size, m.size * 1.1, 0, 0, 6.3)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,.75)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, -m.size * 0.9)
      ctx.lineTo(m.size * 0.25, -m.size * 1.25)
      ctx.stroke()
      ctx.restore()
    }
  }

  return {
    burst,
    ring,
    minis,
    update,
    draw,
    clearTransient() {
      parts = []
    },
    clearAll() {
      parts = []
      rings = []
      minisArr = []
    },
    get count() {
      return parts.length + rings.length + minisArr.length
    },
  }
}
