/**
 * motionPrefs.ts — 全站统一的「动效偏好 / 设备档位」开关。
 *
 * 规格里所有"降级"分支只允许从这里读，禁止各模块自己写 matchMedia，
 * 否则 prefers-reduced-motion 一定会漏掉某一处。
 */

export type DeviceTier = 'mobile' | 'tablet' | 'desktop'

const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)')
const mqCoarse = window.matchMedia('(pointer: coarse)')
const mqMobile = window.matchMedia('(max-width: 767px)')
const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1199px)')

type Listener = () => void
const listeners = new Set<Listener>()

function notify(): void {
  for (const fn of listeners) fn()
}

for (const mq of [mqReduce, mqCoarse, mqMobile, mqTablet]) {
  mq.addEventListener('change', notify)
}

export const motionPrefs = {
  /** 用户在系统里要求"减少动态效果" —— 所有循环/编排动画的总开关 */
  get reduced(): boolean {
    return mqReduce.matches
  },
  /** 触摸为主、无精确指针 */
  get coarse(): boolean {
    return mqCoarse.matches
  },
  get tier(): DeviceTier {
    if (mqMobile.matches) return 'mobile'
    if (mqTablet.matches) return 'tablet'
    return 'desktop'
  },
  get isMobile(): boolean {
    return mqMobile.matches
  },
  get isDesktop(): boolean {
    return !mqMobile.matches && !mqTablet.matches
  },
  /** 滚动/运镜速度系数：移动端把相机速度再降 30% */
  get cameraSpeedScale(): number {
    return mqMobile.matches ? 0.7 : 1
  },
  /** 渲染像素比上限：规格要求最高 2 */
  get dprCap(): number {
    if (mqMobile.matches) return Math.min(window.devicePixelRatio || 1, 2)
    return Math.min(window.devicePixelRatio || 1, 2)
  },
}

export function onMotionPrefsChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 数值工具：全站共用，避免每个模块各写一份 */
export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const clamp01 = (v: number): number => clamp(v, 0, 1)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : clamp01((v - a) / (b - a))

/** 三次平滑：用于"段内减速停顿"的电影感插值 */
export const smoothstep = (t: number): number => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/** 五次平滑：更接近真实相机的加减速，一阶二阶导都连续 */
export const smootherstep = (t: number): number => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** 帧率无关的指数逼近（比 lerp 正确，急停更自然） */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt))
