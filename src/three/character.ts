import * as THREE from 'three'

/**
 * character.ts — 角色抽象接口 + 双轨资产自动探测（规格 6.1）。
 *
 * 这是整个项目的核心契约：页面只认这个接口，不认具体实现。
 * 于是"用户之后把 doubao.glb 丢进 public/models/"就能零改动自动升级到真 3D，
 * 而没有模型时 ImageRigCharacter 提供的 2.5D 立绘路径行为完全一致。
 */

export interface Character {
  load(url?: string): Promise<void>
  pinch(point: THREE.Vector3 | null, strength: number): void
  /** t: 0→1 全局取景进度（对应规格 6.6 的 6 个节点） */
  setFraming(t: number): void
  setPointer(ndc: THREE.Vector2): void
  update(dt: number): void
  dispose(): void
}

export type CharacterKind = 'model' | 'imageRig' | 'probe'

/** 身体地标（世界坐标 Y 高度）——相机取景路径由它推导，两条资产路径给出同一套语义 */
export interface CharacterMetrics {
  /** 身高（世界单位，1 单位 = 1 米） */
  height: number
  /** 角色中轴的 X（构图靠右，所以不是 0） */
  centerX: number
  landmarks: {
    headTop: number
    face: number
    neck: number
    chest: number
    arms: number
    waist: number
    knee: number
    feet: number
    /** 全身取景的构图中心（约身高一半）。少了它，全身镜头会把脚切掉 */
    full: number
  }
  /** 面部代理球半径：raycast 只打这个球，不打整个模型 */
  faceRadius: number
}

export interface CharacterRig extends Character {
  readonly kind: CharacterKind
  readonly ready: boolean
  readonly object3d: THREE.Object3D
  readonly metrics: CharacterMetrics
  /** 面部代理体（不可见）。捏脸的 raycast 目标 */
  readonly faceProxy: THREE.Object3D
  /** 当前按压强度 0→1，用来驱动光标环的收缩（由各自的弹簧给出） */
  readonly pinchStrength: number
  /** 速度拖影（只有立绘路径需要；glb 路径靠真实运动模糊的成本太高，不实现） */
  setSmear?(v: number): void
}

/**
 * 统一的角色地标。高度 1.72m，原点在脚底，面朝 +Z，中轴偏右 0.62。
 * 三条资产路径给出同一组数值，于是相机取景参数与捏脸半径在任何一条路径下都成立。
 */
export const DEFAULT_METRICS: CharacterMetrics = {
  height: 1.72,
  centerX: 0.62,
  landmarks: {
    headTop: 1.72,
    face: 1.6,
    neck: 1.47,
    chest: 1.34,
    arms: 1.17,
    waist: 1.03,
    knee: 0.49,
    feet: 0.03,
    full: 0.88,
  },
  faceRadius: 0.12,
}

/* --------------------------------------------------------------------------
   资产探测
   -------------------------------------------------------------------------- */

/**
 * 规格要求用 import.meta.glob 判断 doubao.glb 是否存在。
 * glob 是**构建期**求值：文件不在 → 返回空对象 → 自动走路径 B。
 * 这样部署后不会产生一次 404 请求，也不会在控制台留红。
 */
const modelModules = import.meta.glob('../../public/models/*.glb', {
  query: '?url',
  eager: true,
  import: 'default',
}) as Record<string, string>

export function findModelUrl(): string | null {
  for (const [path, url] of Object.entries(modelModules)) {
    if (path.endsWith('doubao.glb')) return url
  }
  return null
}

export function hasModel(): boolean {
  return findModelUrl() !== null
}

export interface CharacterOptions {
  /** 调试用：强制走某条路径（URL 参数 ?character=probe|imageRig|model） */
  force?: CharacterKind
  /** 路径 A 需要 renderer 来做 KTX2 能力探测 */
  renderer: THREE.WebGLRenderer
  /** 路径 B 的立绘板挂在相机下，需要相机引用 */
  camera: THREE.PerspectiveCamera
  /** 报告降级原因 */
  onFallback?: (reason: string) => void
}

export async function createCharacter(options: CharacterOptions): Promise<CharacterRig> {
  const { force, renderer, camera, onFallback } = options

  if (force !== 'probe' && force !== 'imageRig') {
    const url = findModelUrl()
    if (url) {
      try {
        const { ModelCharacter } = await import('./modelCharacter')
        const rig = new ModelCharacter(renderer)
        await rig.load(url)
        return rig
      } catch (error) {
        onFallback?.(`glb 加载失败，回退 2.5D 立绘：${String(error)}`)
      }
    }
  }

  if (force !== 'probe') {
    try {
      const { ImageRigCharacter } = await import('./imageRigCharacter')
      const rig = new ImageRigCharacter({ camera })
      await rig.load()
      return rig
    } catch (error) {
      onFallback?.(`立绘资源不可用，回退探针：${String(error)}`)
    }
  }

  const { ProbeCharacter } = await import('./probeCharacter')
  const probe = new ProbeCharacter()
  await probe.load()
  return probe
}
