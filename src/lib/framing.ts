/**
 * framing.ts — 取景节点表（Gen3：Hero 脸完整可捏 + Alcoves / 产品后半）
 */

export type LandmarkKey =
  | 'headTop' | 'face' | 'neck' | 'chest' | 'arms' | 'waist' | 'knee' | 'feet' | 'full'

const deg = (d: number): number => (d * Math.PI) / 180

export type FramingPhase = 'product' | 'craft'

export interface FramingNode {
  id: string
  label: string
  phase: FramingPhase
  t: number
  viewH: number
  target: LandmarkKey
  axisFrac: number
  camBias: [number, number, number]
  lookBias: [number, number]
}

export const YAW_MAX = deg(12)
export const ORBIT_MAX = deg(14)
export const ORBIT_PERIOD = 22
export const ROLL_MAX = deg(0.8)

export const FRAMING_NODES: readonly FramingNode[] = [
  {
    id: 'face',
    label: '开场',
    phase: 'product',
    t: 0.0,
    // 更大脸：首屏完整可捏
    viewH: 0.3,
    target: 'face',
    axisFrac: 0.82,
    camBias: [-0.01, 0.05, 0.05],
    lookBias: [0.004, -0.015],
  },
  {
    id: 'neck',
    label: '定位',
    phase: 'product',
    t: 0.16,
    viewH: 0.56,
    target: 'neck',
    axisFrac: 0.76,
    camBias: [0.02, 0.02, 0.015],
    lookBias: [-0.004, -0.006],
  },
  {
    id: 'arms',
    label: '能力',
    phase: 'product',
    t: 0.32,
    viewH: 1.05,
    target: 'arms',
    axisFrac: 0.72,
    camBias: [0.05, 0.02, 0.0],
    lookBias: [-0.01, -0.006],
  },
  {
    id: 'waist',
    label: '场景',
    phase: 'product',
    t: 0.48,
    viewH: 0.7,
    target: 'waist',
    axisFrac: 0.7,
    camBias: [0.03, 0.03, 0.0],
    lookBias: [-0.008, -0.01],
  },
  {
    id: 'legs',
    label: '关卡',
    phase: 'craft',
    t: 0.66,
    viewH: 0.85,
    target: 'face',
    axisFrac: 0.62,
    camBias: [-0.02, 0.04, 0.03],
    lookBias: [0.006, -0.02],
  },
  {
    id: 'body',
    label: '收束',
    phase: 'craft',
    t: 0.9,
    viewH: 2.0,
    target: 'full',
    axisFrac: 0.36,
    camBias: [0.05, -0.02, 0.07],
    lookBias: [-0.012, 0.02],
  },
] as const
