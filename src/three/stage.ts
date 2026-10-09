import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { motionPrefs } from '../lib/motionPrefs'

/**
 * stage.ts — 渲染器 / 场景 / 相机 / 灯光 / 环境。
 *
 * 这一节决定"皮肤是不是通透可信"。规格说得很清楚：白皙剔透靠的是这套光，
 * 不是后期滤镜。所以这里没有任何 bloom / LUT / 调色，只有：
 *   · ACES Filmic 色调映射（高光不会死白，肤色不会偏橙）
 *   · 三点布光：大面积 Key + 冷白 Fill + 背后 Rim
 *   · 用 PMREMGenerator 从一个自建的明亮渐变场景烘焙环境贴图（不下载 HDR 文件）
 *
 * 浅色背景下没有 Rim，角色会直接融进背景 —— 这是最容易漏、也最致命的一盏灯。
 */

export interface Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly canvas: HTMLCanvasElement
  /** 距离相机 d（沿视线）处的可见高度（世界单位）—— 取景换算全靠它 */
  viewHeightAt(distance: number): number
  /** 距离相机 d 处的可见宽度 */
  viewWidthAt(distance: number): number
  setExposure(v: number): void
  /** 渲染分辨率系数（1 = 全分辨率）。开场虚化和自适应降档都用它 */
  setRenderScale(scale: number): void
  readonly renderScale: number
  resize(): void
  render(): void
  dispose(): void
}

const CAMERA_FOV = 30 // 长焦人像头，压缩空间、身形自然，等效全幅约 85mm

function buildEnvironmentTexture(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene()

  // 1) 一个内表面包住相机的竖向渐变球：顶部亮白 → 中部暖白 → 底部浅灰。
  const gradient = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      // 亮度是反复试出来的：环境一热，黑色织物就会发灰（近黑的 albedo 被高光和环境反射拉起来）。
      // 明亮棚拍的正确做法是"光很亮但动态范围收敛"，不是把所有东西都推到高光。
      uTop: { value: new THREE.Color(0xffffff).multiplyScalar(1.25) },
      uMid: { value: new THREE.Color(0xfff6f0).multiplyScalar(0.95) },
      uBottom: { value: new THREE.Color(0xe9ecf0).multiplyScalar(0.8) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBottom;
      varying vec3 vWorldPos;
      void main() {
        float h = clamp(normalize(vWorldPos).y * 0.5 + 0.5, 0.0, 1.0);
        // 上下两段做 smoothstep，避免出现可见的色带边界
        vec3 lower = mix(uBottom, uMid, smoothstep(0.0, 0.52, h));
        vec3 upper = mix(lower, uTop, smoothstep(0.48, 1.0, h));
        gl_FragColor = vec4(upper, 1.0);
      }
    `,
  })
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 24), gradient))

  // 2) 一块"模拟窗户"的长方形亮斑：这是皮肤上那条柔和长高光的来源。
  const windowPane = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.0) }),
  )
  windowPane.position.set(-16, 10, 14)
  windowPane.lookAt(0, 4, 0)
  envScene.add(windowPane)

  // 3) 地面：极浅灰，给暗部一点点反弹光，避免下颌/颈部死黑。
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe3e8).multiplyScalar(0.8) }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -12
  envScene.add(floor)

  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const target = pmrem.fromScene(envScene, 0.03)
  pmrem.dispose()
  gradient.dispose()
  windowPane.geometry.dispose()
  ;(windowPane.material as THREE.Material).dispose()
  floor.geometry.dispose()
  ;(floor.material as THREE.Material).dispose()
  return target.texture
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  RectAreaLightUniformsLib.init()

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true, // 画布透明：CSS 那层极淡的 --ai-wash 微渐变能透上来
    powerPreference: 'high-performance',
    stencil: false,
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearAlpha(0)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.1, 120)
  camera.position.set(0, 0, 6)

  const envTexture = buildEnvironmentTexture(renderer)
  scene.environment = envTexture
  // 注意：不设 scene.background —— 画布必须是透明的，背景交给 CSS

  /* ---- 三点布光 ---------------------------------------------------------- */

  // Key：正面偏上 35°，大面积矩形光。大面积 = 高光过渡柔和，不会有一条硬边。
  const key = new THREE.RectAreaLight(0xfff2e8, 2.2, 6.5, 5.2)
  key.position.set(2.1, 3.4, 4.6)
  key.lookAt(0.6, 1.5, 0)
  scene.add(key)

  // Fill：另一侧的大面积冷白，只负责把暗部提起来，制造通透感。
  const fill = new THREE.RectAreaLight(0xeaf0ff, 0.9, 7, 6)
  fill.position.set(-3.4, 1.6, 3.8)
  fill.lookAt(0.4, 1.4, 0)
  scene.add(fill)

  // Rim：背后偏上。浅色背景下这一盏负责把轮廓"切"出来。
  const rim = new THREE.DirectionalLight(0xffffff, 1.5)
  rim.position.set(-1.8, 3.6, -4.2)
  rim.target.position.set(0.4, 1.5, 0)
  scene.add(rim)
  scene.add(rim.target)

  // 极弱的环境底光：只为了防止背光侧完全失去信息，强度必须小。
  const ambient = new THREE.HemisphereLight(0xffffff, 0xdfe3e8, 0.22)
  scene.add(ambient)

  let renderScale = 1

  function viewHeightAt(distance: number): number {
    return 2 * distance * Math.tan((CAMERA_FOV * Math.PI) / 360)
  }

  function resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    // DPR 上限 2（规格第八节），再乘一个可降的渲染系数
    const dpr = Math.min(motionPrefs.dprCap, 2) * renderScale
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  resize()

  // 上下文丢失（切换显卡 / 系统休眠）时不要让页面永久黑屏
  const onLost = (e: Event): void => {
    e.preventDefault()
  }
  canvas.addEventListener('webglcontextlost', onLost, false)

  return {
    renderer,
    scene,
    camera,
    canvas,
    viewHeightAt,
    viewWidthAt: (d: number) => viewHeightAt(d) * camera.aspect,
    setExposure: (v: number) => {
      renderer.toneMappingExposure = v
    },
    get renderScale() {
      return renderScale
    },
    setRenderScale(scale: number) {
      const next = Math.max(0.5, Math.min(2, scale))
      if (Math.abs(next - renderScale) < 0.001) return
      renderScale = next
      resize()
    },
    resize,
    render: () => renderer.render(scene, camera),
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost)
      envTexture.dispose()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
    },
  }
}
