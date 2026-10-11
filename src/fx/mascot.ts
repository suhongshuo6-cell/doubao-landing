/**
 * fx/mascot.ts — 右侧轨道吉祥物：官方 Q 版圆形头像
 *
 * 使用 public/img/doubao-official-chibi.png，圆形裁切 + spring 弹跳。
 * 不再自绘橘色/双马尾 canvas 小人。
 */

const AVATAR_SRC = '/img/doubao-official-chibi.png'

export interface Mascot {
  setAnchor(x: number, y: number, scale: number): void
  setLook(nx: number, ny: number): void
  press(power?: number): void
  bounce(power?: number): void
  update(dt: number, elapsed: number): void
  draw(ctx: CanvasRenderingContext2D): void
  hit(x: number, y: number): boolean
  /** 连点回调（彩蛋用） */
  onRapidTap(fn: (count: number) => void): void
  readonly x: number
  readonly y: number
  readonly r: number
  readonly tapCount: number
}

export function createMascot(): Mascot {
  const BASE_R = 44

  let x = 0
  let y = 0
  let r = BASE_R
  let tx = 0
  let ty = 0
  let tr = BASE_R

  let sx = 1
  let sy = 1
  let svx = 0
  let svy = 0

  let rot = 0
  let targetRot = 0
  let lookX = 0
  let lookY = 0
  let bounceY = 0
  let bounceVy = 0
  let ring = 0
  let elapsedRef = 0
  let tapCount = 0
  let lastTap = 0
  let rapidCb: ((count: number) => void) | null = null

  const img = new Image()
  img.decoding = 'async'
  img.src = AVATAR_SRC
  let imgReady = false
  img.onload = () => {
    imgReady = true
  }

  const press = (power = 1): void => {
    svx -= 0.12 * power
    svy += 0.16 * power
    bounceVy -= 180 * power
    ring = Math.min(1, ring + 0.55 * power)
    const now = performance.now()
    if (now - lastTap < 420) tapCount += 1
    else tapCount = 1
    lastTap = now
    rapidCb?.(tapCount)
  }

  const bounce = (power = 1): void => {
    bounceVy -= 260 * power
    svx -= 0.08 * power
    svy += 0.2 * power
    ring = 1
  }

  const update = (dt: number, _elapsed: number): void => {
    const k = Math.min(dt * 60, 3)
    const follow = 1 - Math.exp(-7 * dt)
    x += (tx - x) * follow
    y += (ty - y) * follow
    r += (tr - r) * (1 - Math.exp(-5.5 * dt))

    // squash / stretch spring
    svx += (1 - sx) * 0.032 * k * 2.4
    sx += svx * 0.22 * k
    svx *= Math.pow(0.84, k)
    svy += (1 - sy) * 0.032 * k * 2.4
    sy += svy * 0.22 * k
    svy *= Math.pow(0.84, k)

    // vertical bounce spring
    bounceVy += -bounceY * 28 * dt * 60
    bounceVy *= Math.pow(0.88, k)
    bounceY += bounceVy * dt
    if (Math.abs(bounceY) < 0.15 && Math.abs(bounceVy) < 8) {
      bounceY = 0
      bounceVy = 0
    }

    rot += (targetRot + Math.sin(elapsedRef * 1.15) * 0.025 - rot) * 0.1 * k
    ring = Math.max(0, ring - 0.9 * dt)
  }

  const drawFallback = (ctx: CanvasRenderingContext2D, radius: number): void => {
    const g = ctx.createRadialGradient(-radius * 0.2, -radius * 0.3, 2, 0, 0, radius)
    g.addColorStop(0, '#FFE8DF')
    g.addColorStop(1, '#FF6B4A')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `600 ${Math.round(radius * 0.55)}px system-ui,sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('豆', 0, 2)
  }

  const draw = (ctx: CanvasRenderingContext2D): void => {
    const t = elapsedRef
    ctx.save()

    // soft shadow
    ctx.save()
    ctx.translate(x, y + r * 1.2 + bounceY * 0.15)
    ctx.scale(1, 0.28)
    const sh = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.15)
    sh.addColorStop(0, 'rgba(40,24,18,.2)')
    sh.addColorStop(1, 'rgba(40,24,18,0)')
    ctx.fillStyle = sh
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // pulse ring on press/send
    if (ring > 0.02) {
      ctx.save()
      ctx.translate(x, y + bounceY)
      ctx.strokeStyle = `rgba(255,77,46,${(ring * 0.55).toFixed(3)})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(0, 0, r * (1.15 + (1 - ring) * 0.55), 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    ctx.translate(x, y + bounceY)
    ctx.rotate(rot)
    const breathe = 1 + Math.sin(t * 1.55) * 0.018
    const lookOffX = lookX * 0.35
    const lookOffY = lookY * 0.3
    ctx.translate(lookOffX, lookOffY)
    ctx.scale(sx * breathe, sy * (2 - breathe))

    // white rim
    ctx.beginPath()
    ctx.arc(0, 0, r + 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,.92)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,77,46,.35)'
    ctx.lineWidth = 2
    ctx.stroke()

    // circular clip + official avatar
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.clip()

    if (imgReady && img.naturalWidth > 0) {
      const size = r * 2.15
      ctx.drawImage(img, -size / 2, -size / 2, size, size)
    } else {
      drawFallback(ctx, r)
    }

    ctx.restore()
  }

  return {
    setAnchor(nx, ny, scale) {
      tx = nx
      ty = ny
      tr = BASE_R * scale
    },
    setLook(nx, ny) {
      lookX = Math.max(-1, Math.min(1, nx)) * 10
      lookY = Math.max(-1, Math.min(1, ny)) * 8
      targetRot = Math.max(-0.2, Math.min(0.2, -nx * 0.4))
    },
    press,
    bounce,
    update(dt, elapsed) {
      elapsedRef = elapsed
      update(dt, elapsed)
    },
    draw,
    hit(hx, hy) {
      return Math.hypot(hx - x, hy - (y + bounceY)) < r * 1.45
    },
    onRapidTap(fn) {
      rapidCb = fn
    },
    get x() {
      return x
    },
    get y() {
      return y + bounceY
    },
    get r() {
      return r
    },
    get tapCount() {
      return tapCount
    },
  }
}
