import * as THREE from 'three'
import { createSpring, SPRING } from '../lib/spring'
import { clamp01 } from '../lib/motionPrefs'
import type { CharacterMetrics, CharacterRig } from './character'
import { createPinchUniforms, injectPinch, FACE_MORPH_CANDIDATES } from './pinchShader'

/**
 * probeCharacter.ts — 探针角色（骨架阶段的占位）。
 *
 * 它存在的唯一目的：**把整条管线先跑通**。
 *   · 同一套 Character 接口（load / pinch / setFraming / setPointer / update / dispose）
 *   · 同一套捏脸 shader 注入（pinchShader.ts）
 *   · 同一套世界尺度与地标（1 单位 = 1 米，原点在脚底，面朝 +Z）
 * 所以等真资产接进来时，相机、捏脸、灯光一行都不用改，只是换了个人。
 *
 * 尺寸刻意按参考立绘的比例来（身高 1.72m、头高 0.24m），
 * 这样相机取景参数在换成真资产后依然成立。
 */

const HEIGHT = 1.72

function metrics(): CharacterMetrics {
  return {
    height: HEIGHT,
    centerX: 0.62, // 角色中轴偏右：左边留给文字栏
    landmarks: {
      headTop: 1.72,
      face: 1.6,
      neck: 1.47,
      chest: 1.3,
      arms: 1.15,
      waist: 1.02,
      knee: 0.46,
      feet: 0.03,
      full: 0.88,
    },
    faceRadius: 0.115,
  }
}

function skinMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xf2d3c0),
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.06,
    clearcoatRoughness: 0.4,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xffd9c4),
    sheenRoughness: 0.6,
    envMapIntensity: 1.15,
  })
}

function clothMaterial(color: number, roughness = 0.78): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness: 0,
    sheen: 0.2,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.85,
    envMapIntensity: 0.9,
  })
}

/** 用 canvas 画一张径向渐变的接触阴影贴图（不额外下载任何文件） */
function contactShadowTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(14,14,18,0.30)')
    g.addColorStop(0.45, 'rgba(14,14,18,0.13)')
    g.addColorStop(1, 'rgba(14,14,18,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class ProbeCharacter implements CharacterRig {
  readonly kind = 'probe' as const
  readonly object3d = new THREE.Group()
  readonly faceProxy: THREE.Mesh
  readonly metrics = metrics()
  ready = false

  private readonly disposables: Array<{ dispose(): void }> = []
  private readonly pinchUniforms = createPinchUniforms()
  private readonly headMesh: THREE.Mesh
  private readonly pressSpring = createSpring(SPRING.pinch)
  private readonly pressPointSpring = createSpring(SPRING.pointer)
  private readonly pressPointY = createSpring(SPRING.pointer)
  private readonly pressPointZ = createSpring(SPRING.pointer)
  private framing = 0
  private pointer = new THREE.Vector2()

  constructor() {
    const m = this.metrics
    this.object3d.name = 'ProbeCharacter'

    // 腿：两条细胶囊。分开画是为了让"腿与足"那一档取景有可读性 ——
    // 一根圆柱在特写下完全看不出是什么。
    const legGeo = new THREE.CapsuleGeometry(0.062, 0.72, 8, 16)
    const legMat = clothMaterial(0x15151a)
    this.disposables.push(legGeo, legMat)
    for (const dx of [-0.075, 0.075]) {
      const leg = new THREE.Mesh(legGeo, legMat)
      leg.position.set(dx, 0.46, 0)
      this.object3d.add(leg)
    }

    // 上衣（黑色短上衣）—— 下缘略低一点，和腿有一点重叠，避免腰上出现一条缝
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.155, 0.36, 8, 24),
      clothMaterial(0x121216),
    )
    torso.position.set(0, 1.2, 0)
    this.object3d.add(torso)

    // 腰腹（露出的一小段皮肤）
    const midriff = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.125, 0.1, 6, 20),
      skinMaterial(),
    )
    midriff.position.set(0, 1.03, 0)
    this.object3d.add(midriff)

    // 红色围巾：验证"品牌色出现面积 ≤3%"时它在画面里的分量
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 12, 32), clothMaterial(0xc8202f, 0.9))
    scarf.position.set(0, 1.41, 0.01)
    scarf.rotation.x = Math.PI / 2.1
    this.object3d.add(scarf)

    // 头
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.108, 32, 24), skinMaterial())
    head.position.set(0, m.landmarks.face, 0)
    head.scale.set(0.92, 1.12, 1)
    this.headMesh = head
    injectPinch(head.material as THREE.MeshPhysicalMaterial, this.pinchUniforms, {
      wrapLighting: true,
      onWarn: (msg) => console.warn('[probe]', msg),
    })
    this.disposables.push(head.geometry, head.material as THREE.Material)
    this.object3d.add(head)

    // 头发：只做"顶部 + 后脑"的球冠，并且往后挪一点。
    // 不做整球 —— 整球会把脸也罩住，取景就分不出正反面了。
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.126, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.62),
      clothMaterial(0x1a1a20, 0.62),
    )
    hair.position.set(0, m.landmarks.face + 0.016, -0.032)
    hair.scale.set(1.0, 1.06, 1.04)
    this.disposables.push(hair.geometry, hair.material as THREE.Material)
    this.object3d.add(hair)

    // 两只眼睛：探针也需要能一眼看出"正面朝哪边"，否则没法判断运镜对不对
    const eyeGeo = new THREE.SphereGeometry(0.0135, 12, 10)
    const eyeMat = clothMaterial(0x101014, 0.35)
    this.disposables.push(eyeGeo, eyeMat)
    for (const dx of [-0.038, 0.038]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat)
      eye.position.set(dx, m.landmarks.face + 0.012, 0.095)
      this.object3d.add(eye)
    }

    // 面部代理球：raycast 只打它。不可见，但必须留在场景里参与射线检测
    this.faceProxy = new THREE.Mesh(
      new THREE.SphereGeometry(m.faceRadius, 16, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    this.faceProxy.name = 'faceProxy'
    this.faceProxy.position.copy(head.position)
    this.object3d.add(this.faceProxy)

    // 接触阴影
    const shadowTex = contactShadowTexture()
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(0, 0.002, 0)
    this.object3d.add(shadow)
    this.disposables.push(shadow.geometry, shadow.material as THREE.Material, shadowTex)

    this.object3d.position.x = m.centerX
  }

  async load(): Promise<void> {
    this.ready = true
  }

  get pinchStrength(): number {
    return this.pressSpring.value
  }

  /** point 为世界坐标；null 表示松手 */
  pinch(point: THREE.Vector3 | null, strength: number): void {
    if (point) {
      // 世界坐标 → 头部局部坐标（形变 shader 在物体空间里算）
      const local = this.headMesh.worldToLocal(point.clone())
      this.pressPointSpring.to(local.x)
      this.pressPointY.to(local.y)
      this.pressPointZ.to(local.z)
      this.pressSpring.to(clamp01(strength))
    } else {
      this.pressSpring.to(0)
    }
  }

  setFraming(t: number): void {
    // 探针不需要自己变——取景完全由相机负责。保留接口以证明两条资产路径行为一致。
    this.framing = t
  }

  setPointer(ndc: THREE.Vector2): void {
    this.pointer.copy(ndc)
  }

  update(dt: number): void {
    const x = this.pressPointSpring.update(dt)
    const y = this.pressPointY.update(dt)
    const z = this.pressPointZ.update(dt)
    const strength = this.pressSpring.update(dt)

    this.pinchUniforms.uPressPos.value.set(x, y, z)
    this.pinchUniforms.uPressStrength.value = strength
    // 压得越深，周边扩散越明显；半径不变，保持"手指大小"的物理感
    this.pinchUniforms.uPressSquash.value = 0.06 + strength * 0.05

    // 指针视差：让静止的角色也有一点点"活着"的感觉（幅度极小）
    this.object3d.rotation.y = this.pointer.x * 0.012
    this.object3d.position.y = this.pointer.y * -0.004
    void this.framing
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.object3d.clear()
  }
}

/** 探针是否带有可驱动的 blendshape（真模型才可能有） */
export const PROBE_MORPH_NAMES = FACE_MORPH_CANDIDATES
