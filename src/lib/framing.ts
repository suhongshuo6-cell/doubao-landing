/**
 * framing.ts — 取景节点表（五幕：命令舞台 / 轨道 / 工作台 / 时间机 / 收束）
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
    label: '命令',
    phase: 'product',
    t: 0.0,
    viewH: 0.28,
    target: 'face',
    axisFrac: 0.78,
    camBias: [-0.02, 0.06, 0.08],
    lookBias: [0.006, -0.018],
  },
  {
    id: 'neck',
    label: '轨道',
    phase: 'product',
    t: 0.28,
    viewH: 0.58,
    target: 'neck',
    axisFrac: 0.74,
    camBias: [0.03, 0.02, 0.02],
    lookBias: [-0.005, -0.008],
  },
  {
    id: 'arms',
    label: '工作台',
    phase: 'product',
    t: 0.52,
    viewH: 1.05,
    target: 'arms',
    axisFrac: 0.7,
    camBias: [0.06, 0.02, 0.0],
    lookBias: [-0.012, -0.006],
  },
  {
    id: 'waist',
    label: '时间机',
    phase: 'craft',
    t: 0.76,
    viewH: 0.75,
    target: 'waist',
    axisFrac: 0.66,
    camBias: [0.04, 0.03, 0.01],
    lookBias: [-0.008, -0.012],
  },
  {
    id: 'body',
    label: '收束',
    phase: 'craft',
    t: 1.0,
    viewH: 1.9,
    target: 'full',
    axisFrac: 0.38,
    camBias: [0.05, -0.02, 0.08],
    lookBias: [-0.012, 0.02],
  },
] as const
