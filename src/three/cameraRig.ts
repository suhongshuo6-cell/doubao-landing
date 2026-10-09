import * as THREE from 'three'
import { createSpring, SPRING } from '../lib/spring'
import { clamp01, motionPrefs } from '../lib/motionPrefs'
import {
  FRAMING_NODES,
  ORBIT_MAX,
  ORBIT_PERIOD,
  ROLL_MAX,
  YAW_MAX,
  type FramingNode,
} from '../lib/framing'
import type { CharacterMetrics } from './character'
import type { Stage } from './stage'

// 向后兼容：历史上这张表住在 cameraRig 里
export { FRAMING_NODES, type FramingNode }

/**
 * cameraRig.ts — 取景路径（曲线 + 阻尼）。
 *
 * 规格 6.6 的核心要求：这条运镜必须是"摄影机在轨道上滑行"，
 * 不是"滚动条被拖着跑"。所以：
 *   · 相机位置与 lookAt 目标各走一条 CatmullRomCurve3（两条曲线略有偏差 → 天然视差）
 *   · 全局取景进度 t 先过一遍**临界阻尼弹簧**，出弹簧的值才允许写进相机
 *   · 相机永远不等于滚动值 —— 这一条是"高级/廉价"的分水岭
 *
 * 每个节点还带一点构图私心（axisFrac / camBias）：
 * 镜头在下移的过程中同时在画框里横向平移，从"脸在右侧"移到"全身在左侧"，
 * 于是文字栏可以自然地换边。这不是装饰，是版式节奏的一部分。
 */



/** 绕 Y 轴旋转的轴（避免每帧 new 一个） */
const UP = new THREE.Vector3(0, 1, 0)

export interface CameraRigOptions {
  stage: Stage
  metrics: CharacterMetrics
}

export interface CameraRig {
  /** 设定目标取景进度（0→1），内部走弹簧 */
  setProgress(t: number): void
  /** 指针 NDC（-1→1），驱动 ±10° yaw */
  setPointer(ndc: THREE.Vector2): void
  /** 开场推近：1 = 已到位，0 = 还在远处 */
  setIntro(amount: number): void
  /** 角色数据变化（换资产 / 换设备档位）后重建路径 */
  updateMetrics(metrics: CharacterMetrics): void
  resize(): void
  update(dt: number): void
  /** 已阻尼过的实际取景进度（渲染角色时用这个，不是目标值） */
  readonly framing: number
  readonly yaw: number
  readonly nodeIndex: number
  dispose(): void
}

export function createCameraRig({ stage, metrics }: CameraRigOptions): CameraRig {
  let m = metrics
  const camera = stage.camera

  // 目标值 vs 实际值：弹簧只作用在"实际值"上
  const progressSpring = createSpring(SPRING.camera)
  const yawSpring = createSpring(SPRING.cameraLook)
  const rollSpring = createSpring(SPRING.cameraLook)
  progressSpring.set(FRAMING_NODES[0]!.t)

  const pointer = new THREE.Vector2(0, 0)
  let intro = 1
  let elapsed = 0
  let nodeIndex = 0
  let disposeOrbit = false

  const posCurve = new THREE.CatmullRomCurve3([], false, 'catmullrom', 0.5)
  const lookCurve = new THREE.CatmullRomCurve3([], false, 'catmullrom', 0.5)
  const posPoints: THREE.Vector3[] = []
  const lookPoints: THREE.Vector3[] = []

  const samplePos = new THREE.Vector3()
  const sampleLook = new THREE.Vector3()
  const orbitPos = new THREE.Vector3()
  const orbitLook = new THREE.Vector3()

  /** 一台相机到目标平面的距离：让垂直可见高度正好等于 viewH */
  function distanceFor(viewH: number): number {
    return viewH / 2 / Math.tan((camera.fov * Math.PI) / 360)
  }

  function rebuild(): void {
    posPoints.length = 0
    lookPoints.length = 0
    const aspect = camera.aspect
    const mobile = motionPrefs.tier === 'mobile'

    for (const node of FRAMING_NODES) {
      const targetY = m.landmarks[node.target]

      // 移动端：角色退到画面下方、占高约 45%，文案在上方全宽
      const viewH = mobile ? node.viewH / 0.45 : node.viewH
      const axisFrac = mobile ? 0.5 : node.axisFrac
      const lookY = mobile ? targetY + 0.225 * viewH : targetY
      const viewW = viewH * aspect
      // 让角色中轴落在画面宽度的 axisFrac 处：
      //   屏幕上 x 的比例 s = 0.5 + (worldX - lookX) / viewW
      //   令 worldX = centerX、s = axisFrac 解出 lookX。
      //   符号很容易写反 —— 反了的话"全身段她在左边"会变成"她在右边"，构图整个镜像。
      const lookX = m.centerX - (axisFrac - 0.5) * viewW

      const d = distanceFor(viewH)
      posPoints.push(
        new THREE.Vector3(lookX + node.camBias[0], lookY + node.camBias[1], d + node.camBias[2]),
      )
      lookPoints.push(
        new THREE.Vector3(lookX + node.lookBias[0], lookY + node.lookBias[1], 0),
      )
    }

    posCurve.points = posPoints
    lookCurve.points = lookPoints
    posCurve.updateArcLengths()
    lookCurve.updateArcLengths()
  }

  /** t(0→1，按节点定义的进度) → 曲线参数 u。节点进度不是均匀的，必须分段映射 */
  function framingToU(t: number): number {
    const nodes = FRAMING_NODES
    const last = nodes.length - 1
    if (t <= nodes[0]!.t) return 0
    if (t >= nodes[last]!.t) return 1
    for (let i = 0; i < last; i++) {
      const a = nodes[i]!
      const b = nodes[i + 1]!
      if (t >= a.t && t <= b.t) {
        const local = (t - a.t) / (b.t - a.t)
        return (i + local) / last
      }
    }
    return 1
  }

  rebuild()

  return {
    get framing() {
      return progressSpring.value
    },
    get yaw() {
      return yawSpring.value
    },
    get nodeIndex() {
      return nodeIndex
    },
    setProgress(t: number) {
      progressSpring.to(clamp01(t))
    },
    setPointer(ndc: THREE.Vector2) {
      pointer.set(ndc.x, ndc.y)
    },
    setIntro(amount: number) {
      intro = clamp01(amount)
    },
    updateMetrics(next: CharacterMetrics) {
      m = next
      rebuild()
    },
    resize() {
      rebuild()
    },
    update(dt: number) {
      elapsed += dt
      const framing = progressSpring.update(dt)

      // ---- yaw：鼠标位置 + 滚到底后的自动环绕 ----------------------------
      let yawTarget = pointer.x * YAW_MAX * (motionPrefs.reduced ? 0 : 1)
      if (!motionPrefs.reduced && !disposeOrbit) {
        // 只在接近全身段时才进入极慢的自动环绕
        const orbitWeight = clamp01((framing - 0.82) / 0.16)
        if (orbitWeight > 0.001) {
          yawTarget +=
            Math.sin((elapsed / ORBIT_PERIOD) * Math.PI * 2) * ORBIT_MAX * orbitWeight
        }
      }
      yawSpring.to(yawTarget)
      const yaw = yawSpring.update(dt)

      // yaw 带一点点滚转：真实手持机不会完全水平，这一点点就让画面"活"了
      rollSpring.to(-Math.sin(yaw) * ROLL_MAX * 1.6)
      const roll = rollSpring.update(dt)

      // ---- 采样两条曲线 ---------------------------------------------------
      const u = framingToU(framing)
      posCurve.getPoint(u, samplePos)
      lookCurve.getPoint(u, sampleLook)

      // ---- 开场推近（dolly in + 轻微 dolly up）---------------------------
      if (intro < 1) {
        const back = 1 + 0.42 * (1 - intro)
        samplePos.sub(sampleLook).multiplyScalar(back).add(sampleLook)
        samplePos.y += 0.05 * (1 - intro)
      }

      // ---- 绕角色中轴 yaw 旋转（相机与 lookAt 一起转）---------------------
      // 不是"转角色"，是"摄影机绕轨道走"：角色的朝向始终是 +Z，变的是观察方位角。
      const cx = m.centerX
      orbitPos.set(samplePos.x - cx, samplePos.y, samplePos.z).applyAxisAngle(UP, yaw)
      orbitLook.set(sampleLook.x - cx, sampleLook.y, sampleLook.z).applyAxisAngle(UP, yaw)

      camera.position.set(orbitPos.x + cx, orbitPos.y, orbitPos.z)
      camera.lookAt(orbitLook.x + cx, orbitLook.y, orbitLook.z)
      if (roll !== 0) camera.rotateZ(roll)

      // ---- 最近节点（供进度导航条高亮）-----------------------------------
      let nearest = 0
      let best = Infinity
      for (let i = 0; i < FRAMING_NODES.length; i++) {
        const d = Math.abs(FRAMING_NODES[i]!.t - framing)
        if (d < best) {
          best = d
          nearest = i
        }
      }
      nodeIndex = nearest
    },
    dispose() {
      disposeOrbit = true
      posPoints.length = 0
      lookPoints.length = 0
      posCurve.points = []
      lookCurve.points = []
    },
  }
}

/** 用锚点映射把「滚动进度」翻译成「取景进度」，再驱动相机 */
export function bindProgress(
  rig: CameraRig,
  map: { toFraming(p: number): number },
  getScrollProgress: () => number,
): void {
  rig.setProgress(map.toFraming(getScrollProgress()))
}
