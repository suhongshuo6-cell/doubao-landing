import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { createSpring, SPRING } from '../lib/spring'
import { clamp01 } from '../lib/motionPrefs'
import type { CharacterMetrics, CharacterRig } from './character'
import {
  createPinchUniforms,
  injectPinch,
  applyFaceMorphs,
  collectMorphMeshes,
  FACE_MORPH_CANDIDATES,
  WRAP_CLOTH,
  WRAP_SKIN,
  type PinchUniforms,
} from './pinchShader'

/**
 * modelCharacter.ts — 路径 A：真 3D glb。
 *
 * 规格 6.2 约定模型是 Y-up、原点在双脚脚底中心、面朝 +Z、身高接近真人尺度。
 * 但"约定"不等于"事实"——用户从 Tripo / Meshy 导出时很容易差一个 100 倍缩放
 * 或者原点跑到肚子上。所以这里一律**重新归一化**：
 *   量出包围盒 → 缩放到 1.72m → 脚底对齐 y=0 → 水平居中。
 * 归一化之后，取景地标（0.93H 是眼睛、0.60H 是腰…）对所有模型都成立，
 * 相机那套参数不需要因为换模型而重调。
 */

const TARGET_HEIGHT = 1.72

/** 按人体比例给地标。H = 身高 */
function landmarksFor(height: number): CharacterMetrics['landmarks'] {
  return {
    headTop: height,
    face: height * 0.93,
    neck: height * 0.855,
    chest: height * 0.78,
    arms: height * 0.68,
    waist: height * 0.6,
    knee: height * 0.285,
    feet: height * 0.02,
    full: height * 0.5,
  }
}

const SKIN_RE = /skin|face|head|cheek|neck|body|arm|hand|leg|foot|feet/i

interface PinchEntry {
  mesh: THREE.Mesh
  uniforms: PinchUniforms
}

export class ModelCharacter implements CharacterRig {
  readonly kind = 'model' as const
  readonly object3d = new THREE.Group()
  readonly faceProxy: THREE.Mesh
  ready = false

  private readonly renderer: THREE.WebGLRenderer
  private readonly root = new THREE.Group()
  private readonly entries: PinchEntry[] = []
  private readonly morphMeshes: THREE.Mesh[] = []
  private readonly disposables: Array<{ dispose(): void }> = []
  private readonly pressWorld = new THREE.Vector3()
  private readonly pressX = createSpring(SPRING.pinch)
  private readonly pressY = createSpring(SPRING.pinch)
  private readonly pressZ = createSpring(SPRING.pinch)
  private readonly pressStrength = createSpring(SPRING.pinch)
  private readonly temp = new THREE.Vector3()
  private pointer = new THREE.Vector2()
  private metricsValue: CharacterMetrics

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
    const landmarks = landmarksFor(TARGET_HEIGHT)
    this.metricsValue = {
      height: TARGET_HEIGHT,
      centerX: 0.62,
      landmarks,
      faceRadius: 0.12,
    }

    this.object3d.name = 'ModelCharacter'
    this.object3d.add(this.root)

    this.faceProxy = new THREE.Mesh(
      new THREE.SphereGeometry(this.metricsValue.faceRadius, 16, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    this.faceProxy.name = 'faceProxy'
    this.faceProxy.position.set(0, landmarks.face, 0.02)
    this.root.add(this.faceProxy)
    this.disposables.push(this.faceProxy.geometry, this.faceProxy.material as THREE.Material)

    this.pressX.set(this.faceProxy.position.x)
    this.pressY.set(this.faceProxy.position.y)
    this.pressZ.set(this.faceProxy.position.z)
  }

  get metrics(): CharacterMetrics {
    return this.metricsValue
  }

  get pinchStrength(): number {
    return this.pressStrength.value
  }

  async load(url?: string): Promise<void> {
    if (!url) throw new Error('ModelCharacter.load 需要一个 glb 地址')

    // 解码器不配置外部地址：three r186 的 DRACOLoader / KTX2Loader 已经用
    // `new URL('../libs/...', import.meta.url)` 把 draco / basis 转码器
    // 交给打包器处理，产物里就是自托管的，**不依赖任何 CDN**。
    // 只有真的加载带 Draco / KTX2 的模型时，这些文件才会被请求。
    const draco = new DRACOLoader()
    const ktx2 = new KTX2Loader().detectSupport(this.renderer)
    const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2)

    let gltf: Awaited<ReturnType<GLTFLoader['loadAsync']>>
    try {
      gltf = await loader.loadAsync(url)
    } finally {
      draco.dispose()
      ktx2.dispose()
    }

    const scene = gltf.scene

    /* ---- 1. 归一化：缩放到 1.72m、脚底落地、水平居中 -------------------- */
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) {
      throw new Error('模型包围盒异常，无法归一化')
    }
    const scale = TARGET_HEIGHT / size.y
    scene.scale.setScalar(scale)
    scene.updateMatrixWorld(true)

    const box2 = new THREE.Box3().setFromObject(scene)
    scene.position.x -= (box2.min.x + box2.max.x) / 2
    scene.position.z -= (box2.min.z + box2.max.z) / 2
    scene.position.y -= box2.min.y

    /* ---- 2. 材质升级 + 捏脸注入 ---------------------------------------- */
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = true

      const source = mesh.material
      const list = Array.isArray(source) ? source : [source]
      const upgraded = list.map((mat) => this.upgradeMaterial(mat as THREE.Material))
      mesh.material = Array.isArray(source) ? upgraded : upgraded[0]!

      for (const mat of upgraded) {
        const isSkin = SKIN_RE.test(mat.name)
        const uniforms = createPinchUniforms()
        injectPinch(mat, uniforms, {
          wrapLighting: true,
          wrap: isSkin ? WRAP_SKIN : WRAP_CLOTH,
          onWarn: (msg) => console.warn('[model]', msg),
        })
        this.entries.push({ mesh, uniforms })
        this.disposables.push(mat)
      }
    })

    this.morphMeshes.push(...collectMorphMeshes(scene))

    this.root.add(scene)
    this.root.position.x = this.metricsValue.centerX

    // KTX2 纹理是异步解码的，等一帧让首帧不至于糊着出现
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    this.ready = true
  }

  /** glb 里常见的是 MeshStandardMaterial；升级到 Physical 才能吃到 sheen / clearcoat */
  private upgradeMaterial(source: THREE.Material): THREE.MeshPhysicalMaterial {
    if (source instanceof THREE.MeshPhysicalMaterial) {
      source.envMapIntensity = 1.15
      return source
    }
    const std = source as THREE.MeshStandardMaterial
    const physical = new THREE.MeshPhysicalMaterial({
      name: std.name,
      color: std.color?.clone() ?? new THREE.Color(0xffffff),
      map: std.map ?? null,
      normalMap: std.normalMap ?? null,
      normalScale: std.normalScale?.clone() ?? new THREE.Vector2(1, 1),
      roughnessMap: std.roughnessMap ?? null,
      metalnessMap: std.metalnessMap ?? null,
      aoMap: std.aoMap ?? null,
      emissiveMap: std.emissiveMap ?? null,
      alphaMap: std.alphaMap ?? null,
      emissive: std.emissive?.clone() ?? new THREE.Color(0x000000),
      roughness: std.roughness ?? 0.5,
      metalness: std.metalness ?? 0,
      transparent: std.transparent,
      opacity: std.opacity,
      side: std.side,
      depthWrite: std.depthWrite,
      // 皮肤的关键三件套（规格 6.3）
      clearcoat: 0.06,
      clearcoatRoughness: 0.35,
      sheen: 0.35,
      sheenColor: new THREE.Color(0xffd9c4),
      sheenRoughness: 0.6,
      envMapIntensity: 1.15,
    })
    // 颜色贴图必须声明为 sRGB，否则肤色会整体偏灰
    if (physical.map) physical.map.colorSpace = THREE.SRGBColorSpace
    source.dispose()
    return physical
  }

  pinch(point: THREE.Vector3 | null, strength: number): void {
    if (point) {
      this.pressWorld.copy(point)
      this.pressStrength.to(clamp01(strength))
    } else {
      this.pressStrength.to(0)
    }
  }

  setFraming(t: number): void {
    // 真 3D 路径下取景也完全由相机负责。
    // 这里只做一件锦上添花的事：特写时呼吸幅度更小，避免大特写下位移被放大。
    void t
  }

  setPointer(ndc: THREE.Vector2): void {
    this.pointer.copy(ndc)
  }

  update(dt: number): void {
    const x = this.pressX.update(dt)
    const y = this.pressY.update(dt)
    const z = this.pressZ.update(dt)
    const strength = this.pressStrength.update(dt)

    // 世界坐标的按压点 → 各 mesh 自己的物体空间（形变 shader 在物体空间里算）
    for (const entry of this.entries) {
      this.temp.set(x, y, z)
      entry.mesh.worldToLocal(this.temp)
      entry.uniforms.uPressPos.value.copy(this.temp)
      entry.uniforms.uPressStrength.value = strength
      entry.uniforms.uPressSquash.value = 0.06 + strength * 0.05
    }

    for (const mesh of this.morphMeshes) {
      applyFaceMorphs(mesh, strength, {
        squeeze: [...FACE_MORPH_CANDIDATES.squeeze],
        puff: [...FACE_MORPH_CANDIDATES.puff],
      })
    }

    // 指针微视差：呼吸感来自这里，而不是任何循环动画
    this.root.rotation.y = this.pointer.x * 0.014
    this.root.position.y = this.pointer.y * -0.005
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.object3d.clear()
  }
}
