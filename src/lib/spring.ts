/**
 * spring.ts — 临界/欠阻尼弹簧。
 *
 * 规格第五节第 1 条：所有跟随鼠标/滚动的元素都用这个，而不是简单 lerp。
 * 「廉价 vs 高级」的分界线就在这里：lerp 永远追不上、永远不过冲、永远没有"重量"。
 *
 * 实现用半隐式欧拉 + 子步长积分，保证不同帧率下的手感一致（掉帧时不会炸）。
 */

export interface SpringOptions {
  /** 劲度系数 k。越大越"硬"，回位越快 */
  stiffness?: number
  /** 阻尼系数 c。ζ = c / (2·√(k·m))；ζ<1 欠阻尼（会过冲），ζ=1 临界阻尼 */
  damping?: number
  /** 质量 m。越大越"沉"，起步越慢 */
  mass?: number
  /** 初值 */
  value?: number
}

export interface Spring {
  readonly value: number
  readonly velocity: number
  readonly target: number
  readonly dampingRatio: number
  /** 是否已经静止（速度与偏差都小于阈值）——用来跳过无意义的写入 */
  readonly atRest: boolean
  /** 直接落位，不产生运动（初始化用） */
  set(value: number): void
  /** 设定目标；不改变当前值，让弹簧自己走过去 */
  to(target: number): void
  /** 推进 dt 秒，返回新值 */
  update(dt: number): number
}

/** 单个子步长上限：1/120s。掉帧成 30fps 时自动跑 4 个子步，手感不变 */
const MAX_SUBSTEP = 1 / 120
/** 单帧最多推进 50ms，超过就认为页面刚从后台回来，直接丢弃 */
const MAX_FRAME = 1 / 20

export function createSpring(options: SpringOptions = {}): Spring {
  const k = options.stiffness ?? 210
  const c = options.damping ?? 26
  const m = options.mass ?? 1
  const dampingRatio = c / (2 * Math.sqrt(k * m))

  let value = options.value ?? 0
  let velocity = 0
  let target = value

  const atRest = (): boolean =>
    Math.abs(velocity) < 0.0001 && Math.abs(target - value) < 0.0001

  return {
    get value() {
      return value
    },
    get velocity() {
      return velocity
    },
    get target() {
      return target
    },
    get dampingRatio() {
      return dampingRatio
    },
    get atRest() {
      return atRest()
    },
    set(next: number) {
      value = next
      target = next
      velocity = 0
    },
    to(next: number) {
      target = next
    },
    update(dt: number): number {
      const frame = dt > MAX_FRAME ? MAX_FRAME : dt < 0 ? 0 : dt
      let remaining = frame
      while (remaining > 0) {
        const step = remaining > MAX_SUBSTEP ? MAX_SUBSTEP : remaining
        remaining -= step
        // 半隐式欧拉：先算加速度 → 更新速度 → 用新速度更新位置。
        // 顺序反过来会在高刚度下发散。
        const accel = (-k * (value - target) - c * velocity) / m
        velocity += accel * step
        value += velocity * step
      }
      if (atRest()) {
        value = target
        velocity = 0
      }
      return value
    },
  }
}

/**
 * 常用手感预设。数值都按"以秒为单位的时候手感"调过。
 * 在浏览器里可直接对比：ζ 越接近 1 越"仪器感"，越小于 1 越"有弹性"。
 */
export const SPRING = {
  /** 跟随光标/指针：几乎不过冲，绝不拖泥带水 */
  pointer: { stiffness: 260, damping: 30, mass: 1 },        // ζ ≈ 0.93
  /** 相机跟随滚动：重、慢、有惯性，像轨道上的摄影机 */
  camera: { stiffness: 42, damping: 15, mass: 1.35 },       // ζ ≈ 0.99 临界阻尼
  /** 相机视差（yaw / 微位移）：比相机更快一点，但要明显落后于鼠标 */
  cameraLook: { stiffness: 68, damping: 17, mass: 1.1 },
  /** 卡片随滚动速度的倾斜：明显欠阻尼，松手有余振 */
  warp: { stiffness: 46, damping: 11, mass: 1 },            // ζ ≈ 0.81
  /** 捏脸：松手回弹约 8% 过冲（规格 6.5） */
  pinch: { stiffness: 330, damping: 22.5, mass: 1 },        // ζ ≈ 0.62
  /** UI 元素（圆环、指示线）：干净利落 */
  ui: { stiffness: 320, damping: 34, mass: 1 },             // ζ ≈ 0.95
} as const satisfies Record<string, SpringOptions>
