/**
 * framing.ts — 取景节点表（规格 6.6 的那 6 个节点）。
 *
 * 为什么单独放一个文件、而不是留在 cameraRig.ts 里：
 *   `ui/progressRail.ts` 需要这张表来生成导航条，而它**绝不能**把 three 拖进首屏。
 *   之前它从 cameraRig 里 import，于是 cameraRig 的 `import * as THREE` 顺着
 *   静态图一路把 294KB(gzip) 的 three 挂到了 modulepreload 上 ——
 *   两阶段装配白做了。这张表本身是纯数据，一行 three 都不需要。
 */

/** 身体地标名（与 CharacterMetrics['landmarks'] 同构；这里写成字面量联合，
 *  是为了让本文件**零依赖** —— 一旦 import 了 character.ts，就会顺着类型图把 three 带进来 */
export type LandmarkKey =
  | 'headTop' | 'face' | 'neck' | 'chest' | 'arms' | 'waist' | 'knee' | 'feet' | 'full'

/** 角度转弧度（不引 three 的 MathUtils） */
const deg = (d: number): number => (d * Math.PI) / 180

export interface FramingNode {
  id: string
  /** 右侧进度导航条上的中文标签 */
  label: string
  /** 规格 6.6 给定的取景进度 */
  t: number
  /** 画面可见高度（米）。越小越特写 */
  viewH: number
  /** 取景目标落在地标的哪个部位 */
  target: LandmarkKey
  /** 角色中轴落在画面宽度的百分比位置（0.5 = 正中） */
  axisFrac: number
  /** 相机相对构图点的额外偏移（米）——制造"编辑式取景"而不是证件照 */
  camBias: [number, number, number]
  /** lookAt 目标的额外偏移（米）——与相机偏移反向一点 → 视差 */
  lookBias: [number, number]
}

/** 横向鼠标 → ±10° yaw */
export const YAW_MAX = deg(10)
/** 滚到底后的自动环绕 ±12° */
export const ORBIT_MAX = deg(12)
export const ORBIT_PERIOD = 24
/** 相机滚转上限 */
export const ROLL_MAX = deg(0.6)

export interface FramingNode {
  id: string
  /** 右侧进度导航条上的中文标签 */
  label: string
  /** 规格 6.6 给定的取景进度 */
  t: number
  /** 画面可见高度（米）。越小越特写 */
  viewH: number
  /** 取景目标落在地标的哪个部位 */
  target: LandmarkKey
  /** 角色中轴落在画面宽度的百分比位置（0.5 = 正中） */
  axisFrac: number
  /** 相机相对构图点的额外偏移（米）——制造"编辑式取景"而不是证件照 */
  camBias: [number, number, number]
  /** lookAt 目标的额外偏移（米）——与相机偏移反向一点 → 视差 */
  lookBias: [number, number]
}

export const FRAMING_NODES: readonly FramingNode[] = [
  {
    id: 'face',
    label: '面容',
    t: 0.0,
    viewH: 0.3,
    target: 'face',
    axisFrac: 0.68,
    camBias: [-0.015, -0.035, 0.02], // 略低略偏，像站在她面前说话
    lookBias: [0.004, 0.012],
  },
  {
    id: 'neck',
    label: '肩颈与围巾',
    t: 0.18,
    viewH: 0.54,
    target: 'neck',
    axisFrac: 0.63,
    camBias: [0.025, 0.01, 0.01],
    lookBias: [-0.006, -0.004],
  },
  {
    id: 'arms',
    label: '手与手臂',
    t: 0.36,
    viewH: 1.02,
    target: 'arms',
    axisFrac: 0.66,
    camBias: [0.045, 0.02, 0.0],
    lookBias: [-0.012, -0.006],
  },
  {
    id: 'waist',
    label: '腰线',
    t: 0.54,
    viewH: 0.66,
    target: 'waist',
    axisFrac: 0.5,
    camBias: [0.02, 0.03, 0.0],
    lookBias: [-0.006, -0.012],
  },
  {
    id: 'legs',
    label: '腿与足',
    t: 0.74,
    viewH: 1.0,
    target: 'knee',
    axisFrac: 0.5,
    camBias: [-0.03, 0.06, 0.02], // 机位抬高一点俯看，腿会显得修长而不失礼
    lookBias: [0.008, -0.03],
  },
  {
    id: 'body',
    label: '全身',
    t: 0.92,
    viewH: 2.15,
    // 取景中心必须落在"身高一半"，而不是胸口 —— 用胸口会让脚被切出画面
    target: 'full',
    axisFrac: 0.34, // 全身段：她在画面左侧，右边留给服装/姿态的说明文字
    camBias: [0.04, -0.02, 0.06],
    lookBias: [-0.01, 0.02],
  },
] as const
