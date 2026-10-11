import * as THREE from 'three'
import { createSpring, SPRING } from '../lib/spring'
import { clamp01, motionPrefs } from '../lib/motionPrefs'
import { DEFAULT_METRICS, type CharacterMetrics, type CharacterRig } from './character'
import { FaceExpression } from './faceExpression'
import { createPlateMaterial, createPlateUniforms, type PlateUniforms } from './plateShader'

/**
 * imageRigCharacter.ts — 路径 B：分层立绘（2.5D 伪立体）。
 *
 * ============================ 设计决策 ============================
 * 交付时对你上传的素材做过离线验证（tools/preview_frames.py）：
 * 这 5 张特写是**各自独立的镜头**、尺度差 3~10 倍，整幅交叉淡化 = 双重曝光（实测），
 * 焦点淡化仍有重影，硬切最干净。
 *
 * 所以这里做的是**分镜语言**，而不是假装连续运镜：
 *   · 硬切，但切点落在"焦点虚化的最高点"——两侧一样糊，切就看不见了，
 *     读起来是一次 rack focus，不是幻灯片
 *   · 每镜内部连续推近（1.0 → 1.05），每一镜都是"活的"
 *   · 人像层与背景层摆在不同深度，同一个世界位移在两层的屏幕位移不同
 *     → 真实视差，静态照片因此有了体积
 *   · 全身段用 front/side/back 三视图 + 横向压缩：光标移向屏幕边缘她就转过去，
 *     转轴处压成一条线再换图，所以看不到重影。这是全站唯一真正"三维"的时刻。
 * ==================================================================
 *
 * 所有板都挂在 camera 下 → 天然屏幕对齐，不需要每帧手动同步相机姿态。
 */

const PLATE_ASPECT = 16 / 9
/** 人像板与背景板的深度差 1.4 个单位 → 同一世界位移在两层上差约 1.7 倍屏幕位移 */
const SUBJECT_Z = -2.0
const BACKDROP_Z = -3.4

/**
 * 锚点表：与 tools/preview_frames.py 的 ANCHORS **逐字一致**。
 * 那份 Python 是离线验证过的取景权重，两边必须同步；
 * 只改一边的话，"看图"和"跑浏览器"会对不上。
 */
const ANCHORS: ShotSpec[] = [
  { t: 0.0, plate: 'face' },
  { t: 0.18, plate: 'neck' },
  // 没有"手与手臂"的独立素材。用同一张肩颈板做一次**取景内的推近与下移**：
  // 她本来就只有正面一个视角，与其硬塞一张不匹配的图，不如让相机在同一张板里继续走。
  { t: 0.36, plate: 'neck', zoom: 1.3, panY: 0.2 },
  { t: 0.54, plate: 'waist' },
  { t: 0.74, plate: 'legs' },
  { t: 0.92, plate: 'body' },
]

interface ShotSpec {
  t: number
  plate: string
  /** 在这张板内部再推近多少（1 = 原样铺满） */
  zoom?: number
  /** 取景在板内上下平移（-0.5~0.5），配合 zoom 用来"在同一张图里换构图" */
  panY?: number
}

/** 焦点虚化窗口（占一段的比例）。与 Python 预览的 FADE_WINDOW 对齐 */
const FADE_WINDOW = 0.16

const BODY_VIEWS = ['doubao_front', 'doubao_side', 'doubao_back'] as const

interface Layer {
  mesh: THREE.Mesh
  uniforms: PlateUniforms
  backdrop: boolean
  /** 三视图权重用；其它层为 -1 */
  viewIndex: number
  depth: number
  plate: string
  zoom: number
  panY: number
  /** cover 得到的基准采样范围（视口比例变化时重算），zoom/pan 在它之上叠加 */
  baseScale: THREE.Vector2
  baseOffset: THREE.Vector2
}

interface Shot {
  plate: string
  group: THREE.Group
  layers: Layer[]
}

function smoothstep01(x: number): number {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}

/** 只在段的正中间抬起来的虚焦量：0 → 1 → 0 */
function focusAmount(u: number): number {
  const lo = 0.5 - FADE_WINDOW
  const hi = 0.5 + FADE_WINDOW
  if (u <= lo || u >= hi) return 0
  return Math.sin(((u - lo) / (hi - lo)) * Math.PI)
}

function segment(t: number): { index: number; u: number } {
  const last = ANCHORS.length - 1
  if (t <= ANCHORS[0]!.t) return { index: 0, u: 0 }
  if (t >= ANCHORS[last]!.t) return { index: last - 1, u: 1 }
  for (let i = 0; i < last; i++) {
    const a = ANCHORS[i]!
    const b = ANCHORS[i + 1]!
    if (t >= a.t && t <= b.t) return { index: i, u: (t - a.t) / (b.t - a.t) }
  }
  return { index: last - 1, u: 1 }
}

export interface ImageRigContext {
  camera: THREE.PerspectiveCamera
}

export class ImageRigCharacter implements CharacterRig {
  readonly kind = 'imageRig' as const
  readonly object3d = new THREE.Group()
  readonly metrics: CharacterMetrics = DEFAULT_METRICS
  readonly faceProxy: THREE.Mesh
  ready = false

  private readonly camera: THREE.PerspectiveCamera
  private readonly shots: Shot[] = []
  private readonly textures: THREE.Texture[] = []
  private readonly disposables: Array<{ dispose(): void }> = []
  private readonly pressStrength = createSpring(SPRING.pinch)
  private readonly pointer = new THREE.Vector2(0, 0)
  private framing = 0
  private aspect = 16 / 9
  /** 每张板的主体包围盒（由 tools/make_mattes.py 生成）—— 移动端取景全靠它 */
  private manifest: Record<string, { bbox: number[]; layered: boolean }> = {}
  /** 帧率无关的平滑值，避免速度拖影在掉帧时跳变 */
  private smoothFocus = 0
  /** 首屏脸部特写的表情（眨眼/视线/说话/开心/呼吸） */
  private readonly expr = new FaceExpression()
  private faceLayer: Layer | null = null
  private readonly onFaceClick = (e: MouseEvent): void => {
    if (this.framing > 0.06) return
    const t = e.target as HTMLElement | null
    if (t?.closest('button, a, input, textarea, select, label, [role="button"], .askbar, [data-ripple]')) return
    // 只认点在脸上（屏幕中部那块）
    const x = (e.clientX / window.innerWidth) * 2 - 1
    const y = -(e.clientY / window.innerHeight) * 2 + 1
    if (Math.abs(x) < 0.4 && y > -0.6 && y < 0.9) this.expr.triggerHappy()
  }

  constructor(ctx: ImageRigContext) {
    this.camera = ctx.camera
    this.object3d.name = 'ImageRigCharacter'
    ctx.camera.add(this.object3d)

    // 面部代理球：raycast 只打它。放在脸板所在平面上
    this.faceProxy = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 10),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    this.faceProxy.name = 'faceProxy'
    this.faceProxy.position.set(0, 0, SUBJECT_Z)
    this.object3d.add(this.faceProxy)
    this.disposables.push(this.faceProxy.geometry, this.faceProxy.material as THREE.Material)
  }

  /* ------------------------------------------------------------- 加载 -- */

  private async loadTexture(file: string): Promise<THREE.Texture> {
    const tex = await new THREE.TextureLoader().loadAsync(
      `${import.meta.env.BASE_URL}img/rig/${file}`,
    )
    // 照片按原样采样：自定义 ShaderMaterial 不走 three 的 colorspace_fragment，
    // 这里如果用 SRGBColorSpace，贴图会被线性化但输出不做 sRGB 编码，画面整体发灰。
    tex.colorSpace = THREE.NoColorSpace
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.anisotropy = 4
    this.textures.push(tex)
    return tex
  }

  async load(): Promise<void> {
    // 先拿清单：哪张板有背景层、主体包围盒在哪，都由它说了算
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}img/rig/manifest.json`)
      if (res.ok) this.manifest = await res.json()
    } catch {
      // 没有清单也能跑：layered 默认按 true 处理，只是会多一次 _bg 探测
    }

    const names = new Set<string>()
    for (const a of ANCHORS) {
      if (a.plate === 'body') BODY_VIEWS.forEach((v) => names.add(v))
      else names.add(`doubao_${a.plate}`)
    }

    // 并行取图，8 张串行会明显拖慢首帧
    const subjects = new Map(
      await Promise.all(
        [...names].map(async (n) => [n, await this.loadTexture(`${n}.webp`)] as const),
      ),
    )
    const backdrops = new Map<string, THREE.Texture>()
    for (const [name, tex] of subjects) {
      // 脸部特写人像占满画面、没有背景层（manifest 里 layered=false）。
      // 不探测直接退回原图 —— 否则会发一个注定 404 的请求，
      // 虽然 catch 兜得住，但控制台会留一条红。
      if (this.manifest[name]?.layered === false) {
        backdrops.set(name, tex)
        continue
      }
      try {
        backdrops.set(name, await this.loadTexture(`${name}_bg.webp`))
      } catch {
        backdrops.set(name, tex)
      }
    }

    for (const anchor of ANCHORS) {
      const shot: Shot = { plate: anchor.plate, group: new THREE.Group(), layers: [] }
      this.object3d.add(shot.group)

      const zoom = anchor.zoom ?? 1
      const panY = anchor.panY ?? 0
      if (anchor.plate === 'body') {
        shot.layers.push(this.makeLayer(shot.group, backdrops.get('doubao_front')!, true, -1, 'doubao_front'))
        BODY_VIEWS.forEach((view, i) => {
          shot.layers.push(this.makeLayer(shot.group, subjects.get(view)!, false, i, view))
        })
      } else {
        const name = `doubao_${anchor.plate}`
        const subjectTex = subjects.get(name)!
        const bgTex = backdrops.get(name)!
        // 背景层不跟着推近，它只负责视差 —— 跟着推会让两层同时放大，视差就没了
        if (bgTex !== subjectTex) shot.layers.push(this.makeLayer(shot.group, bgTex, true, -1, name))
        shot.layers.push(this.makeLayer(shot.group, subjectTex, false, -1, name, zoom, panY))
      }

      shot.group.visible = false
      this.shots.push(shot)
    }

    const faceShot = this.shots.find((sh) => sh.plate === 'face')
    this.faceLayer = faceShot?.layers.find((l) => !l.backdrop) ?? null
    if (this.faceLayer) {
      this.expr.bind(this.faceLayer.uniforms)
      window.addEventListener('click', this.onFaceClick)
    }

    this.resize()
    this.ready = true
  }

  private makeLayer(
    parent: THREE.Object3D,
    texture: THREE.Texture,
    backdrop: boolean,
    viewIndex: number,
    plate = '',
    zoom = 1,
    panY = 0,
  ): Layer {
    const uniforms = createPlateUniforms()
    const depth = backdrop ? BACKDROP_Z : SUBJECT_Z
    const { material, geometry } = createPlateMaterial(
      { map: texture, width: 1, height: 1, segments: 1 },
      uniforms,
    )
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(0, 0, depth)
    // 全部 depthTest:false，靠 renderOrder 决定叠加顺序：先背景，再三视图
    mesh.renderOrder = backdrop ? 0 : viewIndex + 1
    mesh.frustumCulled = false
    // 板必须真的挂进场景图 —— 只创建 Mesh 不 add，是"算了但什么都没画"的经典写法
    parent.add(mesh)
    this.disposables.push(material, geometry)
    return {
      mesh, uniforms, backdrop, viewIndex, depth, zoom, panY, plate,
      baseScale: new THREE.Vector2(1, 1),
      baseOffset: new THREE.Vector2(0, 0),
    }
  }

  /* --------------------------------------------------------- 视口尺寸 -- */

  /**
   * 每块板都按"正好铺满相机视锥"定尺寸：板尺寸 = 该深度上的可见宽高。
   * 于是视口比例怎么变，板都无边框铺满，不需要在 shader 里再做 fit/cover 分支。
   */
  private resize(): void {
    const cam = this.camera
    this.aspect = cam.aspect
    const tan = Math.tan((cam.fov * Math.PI) / 360)
    const viewAspect = cam.aspect

    for (const shot of this.shots) {
      for (const layer of shot.layers) {
        const h = 2 * Math.abs(layer.depth) * tan
        layer.mesh.scale.set(h * viewAspect, h, 1)
        layer.mesh.position.set(0, 0, layer.depth)

        // 16:9 的板铺到非 16:9 的视口要裁切 —— 用 cover 的方式采样
        if (viewAspect < PLATE_ASPECT) {
          const sx = viewAspect / PLATE_ASPECT
          layer.baseScale.set(sx, 1)
          layer.baseOffset.set((1 - sx) / 2, 0)
        } else {
          const sy = PLATE_ASPECT / viewAspect
          layer.baseScale.set(1, sy)
          layer.baseOffset.set(0, (1 - sy) / 2)
        }
        this.applyCrop(layer)
        layer.uniforms.uAspect.value = viewAspect
      }
    }
  }

  /**
   * 取景：桌面上是 cover + 该镜的 zoom/pan；
   * 移动端换成"人物按宽度铺满 86%、落在画面下方"（规格第八节）。
   *
   * 为什么移动端不能沿用 cover：这些板是 16:9 的**横图**，竖屏 cover 只取中间 26% 的宽度，
   * 人物被裁得莫名其妙。正确做法是按**主体包围盒**重新框：
   *   1. 先按宽度定标 sx = targetW / bboxW
   *   2. 再按板与屏的长宽比反推 sy，保证不拉伸
   *      （屏幕上 1 单位 texU 与 1 单位 texV 的像素数必须匹配）
   *   3. sy 同时就是"人物占屏高的比例"—— 实测约 0.44，正好落在规格要的 45% 附近
   */
  private applyCrop(layer: Layer): void {
    // 不做分层抠像的板（脸部特写人像占满画面）没有 alpha 边，
    // 按主体重框会越界采样 → ClampToEdge 把最边一行拉成条纹。
    // 这种板在移动端就用 cover：竖屏裁成一条竖幅，本来就是肖像该有的样子。
    const layered = this.manifest[layer.plate]?.layered ?? false
    if (motionPrefs.tier === 'mobile' && layered) {
      const entry = this.manifest[layer.plate]
      const bbox = entry?.bbox ?? [0.14, 0.02, 0.86, 0.98]
      const [x0, y0, x1, y1] = bbox as [number, number, number, number]
      const bw = Math.max(0.05, x1 - x0)
      const targetW = 0.86
      const screenFrac = 0.72          // 人物中轴落在屏幕 72% 处 —— 文案留在上方
      const bcx = (x0 + x1) / 2
      const bcy = (y0 + y1) / 2

      // 采样变换是 texUv = uv · s + o，所以 s 的物理含义是"整屏对应多少贴图跨度"：
      //   人物占屏宽 = bw / sx  →  sx = bw / targetW
      //   （写成 targetW / bw 会把画面放大到只剩一小块 —— 第一版就是这个错）
      const sx = bw / targetW
      // 不拉伸：屏幕每像素对应的贴图像素数在 xy 上必须相等
      //   W/(sx·1280) = H/(sy·720)  →  sy = sx · PLATE_ASPECT / aspect
      // 顺带得到：人物占屏高 = bh / sy，实测约 0.44，正好是规格要的 45%
      const sy = (sx * PLATE_ASPECT) / this.aspect

      // 把人物中心放到 (0.5, screenFrac)。由 uv = (texUv − o)/s 反解 o。
      // texV 自下而上，图片 y 自上而下，所以 v = 1 − y
      layer.uniforms.uUvScale.value.set(sx, sy)
      layer.uniforms.uUvOffset.value.set(
        bcx - 0.5 * sx,
        (1 - bcy) - (1 - screenFrac) * sy,
      )
      return
    }

    const bx = layer.baseScale.x
    const by = layer.baseScale.y
    const sx = bx / layer.zoom
    const sy = by / layer.zoom
    layer.uniforms.uUvScale.value.set(sx, sy)
    layer.uniforms.uUvOffset.value.set(
      layer.baseOffset.x + (bx - sx) * 0.5,
      // panY 为正 = 把取景框往板的下方挪（看到身体更靠下的部位）
      layer.baseOffset.y + (by - sy) * (0.5 + layer.panY),
    )
  }

  /* --------------------------------------------------------- Character -- */

  get pinchStrength(): number {
    return this.pressStrength.value
  }

  pinch(point: THREE.Vector3 | null, strength: number): void {
    this.pressStrength.to(point ? clamp01(strength) : 0)
  }

  setFraming(t: number): void {
    this.framing = t
  }

  setPointer(ndc: THREE.Vector2): void {
    this.pointer.copy(ndc)
    this.expr.setPointer(ndc)
  }

  update(dt: number): void {
    if (!this.ready) return
    if (Math.abs(this.camera.aspect - this.aspect) > 0.001) this.resize()

    const { index, u } = segment(this.framing)
    // 硬切：切点落在 u=0.5，也就是焦点虚化最高点 —— 两侧一样糊，切就看不见
    const activeIndex = Math.min(
      u < 0.5 ? index : index + 1,
      this.shots.length - 1,
    )
    const focusTarget = focusAmount(u)
    this.smoothFocus += (focusTarget - this.smoothFocus) * Math.min(1, dt * 14)

    // 每一镜内部连续推近 5%
    const push = 1 + 0.05 * u
    const tan = Math.tan((this.camera.fov * Math.PI) / 360)
    // 视差：两层共用同一个世界位移，深度不同 → 屏幕位移自然错开
    const parallax = motionPrefs.tier === 'mobile' ? 0 : 1
    const parX = this.pointer.x * 0.02 * parallax
    const parY = this.pointer.y * 0.013 * parallax

    // 转身：光标越靠屏幕边缘，她转得越多。0 = 正面，0.5 = 侧面，1 = 背面。
    // squash 用 |cos(2π·turn)| —— 在 0.25 / 0.75（两次换图的那一刻）压到 0，
    // 所以换图时人物正好是"一条线"，看不到重影。
    const turn = clamp01(Math.abs(this.pointer.x))
    const squash = Math.abs(Math.cos(Math.PI * 2 * turn))
    const u1 = smoothstep01((turn - 0.2) / 0.1)
    const u2 = smoothstep01((turn - 0.7) / 0.1)
    const viewWeights = [1 - u1, u1 * (1 - u2), u2]

    const strength = this.pressStrength.update(dt)

    for (let i = 0; i < this.shots.length; i++) {
      const shot = this.shots[i]!
      const visible = i === activeIndex
      shot.group.visible = visible
      if (!visible) continue

      const isBody = shot.plate === 'body'
      if (this.faceLayer && shot.layers.includes(this.faceLayer)) this.expr.update(dt, this.faceLayer.uniforms)

      for (const layer of shot.layers) {
        const un = layer.uniforms
        // 移动端只用抠像层：底图是一整块棚拍墙的矩形，竖屏下会把文案压得没法读。
        // 这里直接不画（而不是 opacity=0），省一次全屏三角形填充
        if (motionPrefs.tier === 'mobile' && layer.backdrop) {
          un.uOpacity.value = 0
          un.uFocus.value = 0
          un.uSmear.value = 0
          continue
        }
        // 移动端的取景每帧重算：不依赖 resize 的触发时序，避免用到上一档视口的比例
        if (motionPrefs.tier === 'mobile') this.applyCrop(layer)
        un.uOpacity.value =
          isBody && layer.viewIndex >= 0 ? (viewWeights[layer.viewIndex] ?? 0) : 1
        un.uFocus.value = this.smoothFocus
        un.uSquash.value = isBody && layer.viewIndex >= 0 ? squash : 1
        un.uPressStrength.value = strength
        un.uPressSquash.value = 0.08 + strength * 0.12
        // 板是屏幕对齐的，所以指针的 NDC 直接就是它的 UV
        un.uPressUv.value.set(this.pointer.x * 0.5 + 0.5, this.pointer.y * 0.5 + 0.5)
        // 0.22 是"手指大小"在整屏 UV 上的量级：太小看不出形变，太大整张脸都在动
        un.uPressRadius.value = 0.22

        const isFace = layer === this.faceLayer
        const h = 2 * Math.abs(layer.depth) * tan * push * (isFace ? this.expr.breath : 1)
        layer.mesh.scale.set(h * this.camera.aspect, h, 1)
        layer.mesh.position.set(parX, parY + (isFace ? this.expr.breathY * h : 0), layer.depth)
      }
    }
  }

  /** 速度拖影：由 main.ts 把滚动的 --vel 传进来（慢滚恒为 0，完全平静） */
  setSmear(v: number): void {
    for (const shot of this.shots) {
      for (const layer of shot.layers) layer.uniforms.uSmear.value = v
    }
  }

  dispose(): void {
    window.removeEventListener('click', this.onFaceClick)
    this.expr.dispose()
    for (const d of this.disposables) d.dispose()
    for (const t of this.textures) t.dispose()
    this.object3d.clear()
  }
}
