import * as THREE from 'three'

/**
 * pinchShader.ts — 捏脸的顶点形变 + 次表面散射（wrap lighting）注入。
 *
 * 为什么用 onBeforeCompile 注入、而不是自己写一份 ShaderMaterial：
 * 只有注入才能保住 MeshPhysicalMaterial 的 PBR / 环境贴图 / sheen / clearcoat，
 * 换成手写材质等于把"通透的皮肤"换成"塑料"。
 *
 * 注入点一共两处，都做了 include 存在性检查（three 改 chunk 文本时不至于静默失败）：
 *   · 顶点：#include <begin_vertex> 之后沿法线压入 + 压点周围的横向扩散
 *   · 片元：#include <lights_fragment_begin> 里的 NdotL 换成 wrap 版本
 */

export interface PinchUniforms {
  uPressPos: { value: THREE.Vector3 }
  uPressRadius: { value: number }
  uPressStrength: { value: number }
  uPressSquash: { value: number }
}

export function createPinchUniforms(): PinchUniforms {
  return {
    uPressPos: { value: new THREE.Vector3(0, 1.62, 0.1) },
    uPressRadius: { value: 0.13 },
    uPressStrength: { value: 0 },
    uPressSquash: { value: 0.05 },
  }
}

/** wrap 系数：0 = 标准兰伯特（明暗交界生硬），0.35 左右最像皮肤的次表面散射 */
export const WRAP_SKIN = 0.35
export const WRAP_CLOTH = 0.12

/**
 * 顶点形变。
 * 注意：规格里给的写法是 transformed.xz *= 1.0 + f * uSquash，
 * 那是把整个模型绕原点缩放（原点在脚底，脸会被甩到画面外）。
 * 必须先把坐标搬到压点局部空间、缩放、再搬回去，才是"脸颊被挤开"。
 *
 * 这段 GLSL 同时被两条资产路径使用：
 *   · 路径 A（glb）：onBeforeCompile 注入进 MeshPhysicalMaterial
 *   · 路径 B（立绘）：直接写进 plateShader 的自定义材质
 * 共用同一份字符串，才能保证"两条路径的 pinch 行为完全一致"（规格 6.1）。
 */
export const VERTEX_DECL = /* glsl */ `
  uniform vec3 uPressPos;
  uniform float uPressRadius;
  uniform float uPressStrength;
  uniform float uPressSquash;
`

export const VERTEX_BODY = /* glsl */ `
  {
    vec3 pinchRel = transformed - uPressPos;
    float pinchD = length(pinchRel);
    float pinchF = 1.0 - smoothstep(0.0, uPressRadius, pinchD);
    pinchF = pinchF * pinchF;                                  // 平方衰减，边缘更软
    transformed -= objectNormal * (uPressStrength * pinchF);    // 沿法线压入
    pinchRel = transformed - uPressPos;
    pinchRel.xz *= 1.0 + pinchF * uPressSquash;                 // 压点周围横向扩散
    pinchRel.y *= 1.0 - pinchF * uPressSquash * 0.6;
    transformed = uPressPos + pinchRel;
  }
`

const WRAP_DECL = 'uniform float uWrap;\n'

/**
 * wrap lighting 的注入点。
 *
 * three r186 的 `lights_fragment_begin` 里**已经不再内联计算 dotNL**，
 * 它把光照委托给 `RE_Direct_Physical()`（在 `lights_physical_pars_fragment` 里）。
 * 所以注入点必须是那个 pars chunk，而且 `uniform float uWrap;` 必须声明在
 * 这个 chunk **之前**（GLSL 里函数定义前要先看到变量）。
 *
 * 如果 three 以后又改了这段文本，下面的 includes 检查会明确报出来，
 * 而不是静默降级成一个"看起来有点塑料"的皮肤。
 */
const PARS_INCLUDE = '#include <lights_physical_pars_fragment>'
const NDOTL_PLAIN = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );'
const NDOTL_WRAP =
  'float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + uWrap ) / ( 1.0 + uWrap ) );'

export interface InjectionResult {
  vertex: boolean
  wrap: boolean
}

/** 给一个 MeshPhysicalMaterial 注入捏脸形变（+ 可选 wrap lighting） */
export function injectPinch(
  material: THREE.MeshPhysicalMaterial,
  uniforms: PinchUniforms,
  options: { wrapLighting?: boolean; wrap?: number; onWarn?: (msg: string) => void } = {},
): InjectionResult {
  const result: InjectionResult = { vertex: false, wrap: false }
  const wrapLighting = options.wrapLighting ?? true
  // 每种材质持有自己的 wrap 系数：皮肤要柔，织物要保留布料的明暗交界
  const uWrap = { value: options.wrap ?? WRAP_SKIN }

  // 形变是逐帧变化的：必须把材质的 program 缓存键打散，
  // 否则同一份材质在不同 mesh 上会共用已编译程序而拿不到 uniform。
  material.customProgramCacheKey = () =>
    `pinch-${wrapLighting ? `w${uWrap.value.toFixed(2)}` : 'n'}`

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    if (wrapLighting) shader.uniforms.uWrap = uWrap

    // ---- 顶点：形变 ------------------------------------------------------
    const beginVertex = '#include <begin_vertex>'
    if (shader.vertexShader.includes(beginVertex)) {
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${VERTEX_DECL}\nvoid main() {`)
        .replace(beginVertex, `${beginVertex}\n${VERTEX_BODY}`)
      result.vertex = true
    } else {
      options.onWarn?.('未找到 #include <begin_vertex>，捏脸形变注入失败')
    }

    // ---- 片元：wrap lighting（柔和明暗交界，模拟次表面散射）------------
    if (!wrapLighting) return
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment as string | undefined
    if (!chunk || !shader.fragmentShader.includes(PARS_INCLUDE)) {
      options.onWarn?.('未找到 #include <lights_physical_pars_fragment>，wrap lighting 注入失败')
      return
    }
    if (!chunk.includes(NDOTL_PLAIN)) {
      options.onWarn?.('lights_physical_pars_fragment 的 dotNL 写法已变化，wrap lighting 跳过')
      return
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      PARS_INCLUDE,
      `${WRAP_DECL}${chunk.replace(NDOTL_PLAIN, NDOTL_WRAP)}`,
    )
    result.wrap = true
  }

  // 已经编译过的话要让它重新编译
  material.needsUpdate = true
  return result
}

/* --------------------------------------------------------------------------
   blendshape 同步：模型若带 faceSqueeze / cheekPuff 之类的形变目标，
   一起驱动，和顶点形变叠加出更自然的脸颊
   -------------------------------------------------------------------------- */

export const FACE_MORPH_CANDIDATES = {
  squeeze: ['faceSqueeze', 'cheekSqueeze', 'squint', 'mouthPress'],
  puff: ['cheekPuff', 'cheekPuffLeft', 'cheekPuffRight', 'noseSquish'],
} as const

export function applyFaceMorphs(
  mesh: THREE.Mesh,
  strength: number,
  names: { squeeze: string[]; puff: string[] },
): boolean {
  const dict = mesh.morphTargetDictionary
  const influences = mesh.morphTargetInfluences
  if (!dict || !influences) return false

  let touched = false
  const drive = (candidates: readonly string[], amount: number): void => {
    for (const name of candidates) {
      const index = dict[name]
      if (index === undefined) continue
      influences[index] = amount
      touched = true
    }
  }
  drive(names.squeeze, strength)
  drive(names.puff, strength * 0.5)
  return touched
}

/** 收集一个节点下所有带动画目标的 mesh */
export function collectMorphMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && mesh.morphTargetDictionary) out.push(mesh)
  })
  return out
}
