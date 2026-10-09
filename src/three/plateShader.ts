import * as THREE from 'three'

/**
 * plateShader.ts — 立绘板材质（路径 B 的角色层）。
 *
 * 为什么不用 MeshPhysicalMaterial：
 *   这些是**照片**，光已经烘在像素里了。再用 PBR 打一遍光等于把照片照两遍，
 *   浅色棚拍会立刻过曝成塑料。所以角色层是 unlit 的，只做三件事：
 *     1. 屏幕空间的捏脸形变（UV 位移，不是顶点位移 —— 见下）
 *     2. 焦点虚化 + 速度拖影（规格 6.6 的"焦点切换"与速度驱动形变）
 *     3. 分层透明度
 *
 * 为什么捏脸用 UV 而不是顶点：
 *   路径 A（真 3D）用顶点形变是有意义的——法线一压，体积就变了。
 *   但立绘板的法线就是 (0,0,1)，沿法线位移只是把整块板往前推，画面完全不变。
 *   对一张平面照片，正确的做法是**位移采样坐标**：像素向压点收拢、压点周围扩散，
 *   再按衰减的导数给边缘压一点暗，读起来就是一个软窝。
 *   两条路径的"交互行为"一致（同样的弹簧、同样的强度曲线、同样"约 8% 过冲"），
 *   但底层机制各按各的物理来 —— 这一点在 README 里写明了。
 */

export interface PlateUniforms {
  uMap: { value: THREE.Texture | null }
  uOpacity: { value: number }
  /** 焦点虚化 0→1 */
  uFocus: { value: number }
  /** 速度拖影 -1→1（用绝对值当强度，符号当方向） */
  uSmear: { value: number }
  /** 采样坐标的缩放/偏移：把 16:9 的板按 cover 铺满任意视口比例 */
  uUvScale: { value: THREE.Vector2 }
  uUvOffset: { value: THREE.Vector2 }
  /** 压点在屏幕 UV 空间的位置 */
  uPressUv: { value: THREE.Vector2 }
  uPressRadius: { value: number }
  uPressStrength: { value: number }
  uPressSquash: { value: number }
  /** 视口宽高比，用来让按压作用域在屏幕上保持正圆 */
  uAspect: { value: number }
  /** 转身时的横向压缩（|cos|）：转到两个视图之间时压成一条线，视图就在那一刻换掉 */
  uSquash: { value: number }
}

export function createPlateUniforms(): PlateUniforms {
  return {
    uMap: { value: null },
    uOpacity: { value: 1 },
    uFocus: { value: 0 },
    uSmear: { value: 0 },
    uUvScale: { value: new THREE.Vector2(1, 1) },
    uUvOffset: { value: new THREE.Vector2(0, 0) },
    uPressUv: { value: new THREE.Vector2(0.5, 0.5) },
    uPressRadius: { value: 0.16 },
    uPressStrength: { value: 0 },
    uPressSquash: { value: 0.05 },
    uAspect: { value: 16 / 9 },
    uSquash: { value: 1 },
  }
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uFocus;
  uniform float uSmear;
  uniform vec2 uUvScale;
  uniform vec2 uUvOffset;
  uniform vec2 uPressUv;
  uniform float uPressRadius;
  uniform float uPressStrength;
  uniform float uPressSquash;
  uniform float uAspect;
  uniform float uSquash;
  varying vec2 vUv;

  // 九抽样：中心 + 四正 + 四斜，权重和为 1
  vec4 blur9(vec2 uv, float r) {
    vec4 c = texture2D(uMap, uv) * 0.25;
    c += texture2D(uMap, uv + vec2( r, 0.0)) * 0.125;
    c += texture2D(uMap, uv + vec2(-r, 0.0)) * 0.125;
    c += texture2D(uMap, uv + vec2(0.0,  r)) * 0.125;
    c += texture2D(uMap, uv + vec2(0.0, -r)) * 0.125;
    vec2 d = vec2(r, r) * 0.7071;
    c += texture2D(uMap, uv + vec2( d.x,  d.y)) * 0.0625;
    c += texture2D(uMap, uv + vec2(-d.x,  d.y)) * 0.0625;
    c += texture2D(uMap, uv + vec2( d.x, -d.y)) * 0.0625;
    c += texture2D(uMap, uv + vec2(-d.x, -d.y)) * 0.0625;
    return c;
  }

  void main() {
    // ---- 1. 捏脸：先在**屏幕 UV 空间**做位移，再映射到贴图坐标 -------------
    vec2 uv = vUv;
    float dent = 0.0;
    if (uPressStrength > 0.0005) {
      vec2 rel = uv - uPressUv;
      rel.x *= uAspect;                       // 让作用域在屏幕上保持正圆
      float d = length(rel);
      float f = 1.0 - smoothstep(0.0, uPressRadius, d);
      f = f * f;                              // 平方衰减，边缘更软

      // 像素向压点收拢 —— 视觉上就是"按进去"
      uv -= (uv - uPressUv) * f * uPressStrength * 0.78;

      // 压点周围横向扩散、纵向轻微压扁
      vec2 spread = uv - uPressUv;
      spread.x *= 1.0 + f * uPressSquash;
      spread.y *= 1.0 - f * uPressSquash * 0.6;
      uv = uPressUv + spread;

      // 用衰减函数导数的形状给"坑沿"压一点暗，读起来才有凹陷而不只是拉伸
      dent = f * (1.0 - f) * 4.0;
    }

    // ---- 2. 转身压缩：绕画面中轴横向收缩 --------------------------------
    // 转到两个视图"中间"时压成一条线（squash→0），两视图就在这一刻换掉，
    // 所以看不到重影 —— 观感就是她真的转过去了。
    if (uSquash < 0.999) {
      uv.x = 0.5 + (uv.x - 0.5) / max(uSquash, 0.05);
    }

    // ---- 3. cover：把 16:9 的板铺满当前视口比例 --------------------------
    vec2 texUv = clamp(uv, vec2(0.0), vec2(1.0)) * uUvScale + uUvOffset;

    // ---- 4. 焦点虚化 + 速度拖影 ------------------------------------------
    vec2 texel = vec2(1.0 / 1280.0, 1.0 / 720.0) * uUvScale;
    float focusR = uFocus * 0.045;
    // 两圈不同半径叠加：单个 9 抽核在 65px 半径下会留下一圈圈可见的"回声"，
    // 观感像重影而不是虚焦。两圈加起来 18 抽，成本可以忽略，但过渡平滑得多。
    vec4 color = focusR < 0.0005
      ? texture2D(uMap, texUv)
      : (blur9(texUv, focusR) + blur9(texUv, focusR * 0.45)) * 0.5;

    if (abs(uSmear) > 0.02) {
      // 沿滚动方向拉一次方向性拖影：只在快速滚动时出现，慢滚完全平静
      float k = abs(uSmear) * 0.02;
      vec2 dir = vec2(0.0, sign(uSmear)) * texel.y;
      vec4 s = color * 0.5;
      s += texture2D(uMap, clamp(texUv + dir * k * 6.0, vec2(0.0), vec2(1.0))) * 0.25;
      s += texture2D(uMap, clamp(texUv - dir * k * 6.0, vec2(0.0), vec2(1.0))) * 0.25;
      color = mix(color, s, clamp(abs(uSmear) * 1.6, 0.0, 1.0));
    }

    // 坑沿压暗：克制到 12%，只负责"这是软的"这一层信息
    color.rgb *= 1.0 - 0.18 * dent * uPressStrength;

    gl_FragColor = vec4(color.rgb, color.a * uOpacity);
  }
`

export interface PlateMaterialOptions {
  map: THREE.Texture
  /** 板在物体空间的宽度/高度（世界单位）——决定它在世界里占多大 */
  width: number
  height: number
  segments?: number
  depthTest?: boolean
}

export function createPlateMaterial(
  options: PlateMaterialOptions,
  uniforms: PlateUniforms = createPlateUniforms(),
): { material: THREE.ShaderMaterial; uniforms: PlateUniforms; geometry: THREE.PlaneGeometry } {
  uniforms.uMap.value = options.map
  if (options.map) {
    // 照片就是照片：贴图按原样采样，不做 sRGB 解码。
    // 自定义 ShaderMaterial 不走 three 的 colorspace_fragment，
    // 所以这里必须用 NoColorSpace，否则画面会整体发灰。
    options.map.colorSpace = THREE.NoColorSpace
    options.map.minFilter = THREE.LinearMipmapLinearFilter
    options.map.magFilter = THREE.LinearFilter
    options.map.generateMipmaps = true
    options.map.anisotropy = 4
  }

  const geometry = new THREE.PlaneGeometry(
    options.width,
    options.height,
    options.segments ?? 1,
    options.segments ?? 1,
  )

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: options.depthTest ?? false,
    depthWrite: false,
    side: THREE.FrontSide,
    // 照片是 sRGB 值直接送进画布，不参与场景的色调映射
    toneMapped: false,
  })

  return { material, uniforms, geometry }
}
