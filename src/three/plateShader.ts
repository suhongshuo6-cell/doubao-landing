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
  /* ---- 表情（只有脸部特写板 uExpr=1；其余板全部走原路径） ---- */
  uExpr: { value: number }
  uEyeLTop: { value: THREE.Vector3 }
  uEyeLBot: { value: THREE.Vector3 }
  uEyeRTop: { value: THREE.Vector3 }
  uEyeRBot: { value: THREE.Vector3 }
  /** x0, x1, 上睑皮肤高度 px, 下睑皮肤高度 px */
  uEyeLRange: { value: THREE.Vector4 }
  uEyeRRange: { value: THREE.Vector4 }
  uMouthQ: { value: THREE.Vector3 }
  uMouthRange: { value: THREE.Vector2 }
  /** 左眼闭合, 右眼闭合, 下睑上推 px, 未用 */
  uLids: { value: THREE.Vector4 }
  uGaze: { value: THREE.Vector2 }
  uMouthOpen: { value: number }
  /** 微笑强度 0→1：嘴角上扬 + 上齿细条 */
  uSmile: { value: number }
  uBlush: { value: number }
  uCheekL: { value: THREE.Vector4 }
  uCheekR: { value: THREE.Vector4 }
  /** 眼皮肤色（眼裂 x0 端 / x1 端），从原图取样 */
  uLidL0: { value: THREE.Vector3 }
  uLidL1: { value: THREE.Vector3 }
  uLidR0: { value: THREE.Vector3 }
  uLidR1: { value: THREE.Vector3 }
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
    uExpr: { value: 0 },
    uEyeLTop: { value: new THREE.Vector3() },
    uEyeLBot: { value: new THREE.Vector3() },
    uEyeRTop: { value: new THREE.Vector3() },
    uEyeRBot: { value: new THREE.Vector3() },
    uEyeLRange: { value: new THREE.Vector4() },
    uEyeRRange: { value: new THREE.Vector4() },
    uMouthQ: { value: new THREE.Vector3() },
    uMouthRange: { value: new THREE.Vector2() },
    uLids: { value: new THREE.Vector4() },
    uGaze: { value: new THREE.Vector2() },
    uMouthOpen: { value: 0 },
    uSmile: { value: 0 },
    uBlush: { value: 0 },
    uCheekL: { value: new THREE.Vector4(0, 0, 1, 1) },
    uCheekR: { value: new THREE.Vector4(0, 0, 1, 1) },
    uLidL0: { value: new THREE.Vector3() },
    uLidL1: { value: new THREE.Vector3() },
    uLidR0: { value: new THREE.Vector3() },
    uLidR1: { value: new THREE.Vector3() },
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
  uniform float uExpr;
  uniform vec3 uEyeLTop;
  uniform vec3 uEyeLBot;
  uniform vec3 uEyeRTop;
  uniform vec3 uEyeRBot;
  uniform vec4 uEyeLRange;
  uniform vec4 uEyeRRange;
  uniform vec3 uMouthQ;
  uniform vec2 uMouthRange;
  uniform vec4 uLids;
  uniform vec2 uGaze;
  uniform float uMouthOpen;
  uniform float uSmile;
  uniform float uBlush;
  uniform vec4 uCheekL;
  uniform vec4 uCheekR;
  uniform vec3 uLidL0;
  uniform vec3 uLidL1;
  uniform vec3 uLidR0;
  uniform vec3 uLidR1;
  varying vec2 vUv;

  // ================= 表情：全部是"采样坐标重映射"，像素永远来自原图本身 =================
  float quadAt(vec3 c, float x) { return (c.x * x + c.y) * x + c.z; }

  // 眨眼 = 把眼裂上方那条上睑皮肤（含睫毛线）向下拉伸盖住眼裂；
  // 眯眼 = 下睑皮肤向上推；视线 = 只在眼裂内部平移采样，边缘软衰减到 0。
  // 眨眼的三层：
  //   ① 睫毛根那条深色眼睑缘（BAND px）整体刚性下移到闭合线 —— 不拉伸
  //   ② 其上的眼皮皮肤被拉长填补，同时混入低频（模糊）版本，长睫毛不会被拉成条纹
  //   ③ 闭合线以下按"变暗"混合一份上下镜像的睫毛 = 闭眼时下垂的睫毛，不产生皮肤重影
  vec2 eyeWarp(vec2 p, vec3 T, vec3 B, vec4 R, float close, float raise,
               vec3 cA, vec3 cB,
               inout float shade, inout float blurAmt, inout vec3 lash, inout vec4 lid) {
    if (p.x <= R.x || p.x >= R.y) return p;
    float mid = (R.x + R.y) * 0.5;
    float hw = (R.y - R.x) * 0.5;
    float u = (p.x - mid) / hw;
    float w = clamp(1.0 - u * u, 0.0, 1.0);
    float top = quadAt(T, p.x);
    float bot = quadAt(B, p.x);
    float h = max(bot - top, 0.0);
    float skin = R.z * (0.35 + 0.65 * w);
    const float BAND = 7.0;
    float lr = raise * w;
    // 全闭时多盖 2px，把下缘那一丝眼白也压住
    float drop = min(close * (h + 3.0 * w), max(h + 3.0 * w - lr, 0.0));
    float lidY = top + drop;
    vec2 s = p;
    // ① 睫毛带：刚性下移，不拉伸
    // ② 其上闭合区：只从"干净眼皮条带" [top-skin, top-BAND] 采样铺满，
    //    绝不把睫毛拉长；再用眼皮固有色 + 横向模糊盖掉残余
    if (close > 0.001 && p.y > top - skin && p.y < lidY - BAND) {
      float destH = max(skin - BAND + drop, 0.001);
      float t = (p.y - (top - skin)) / destH;
      float srcH = max(skin - BAND, 1.0);
      // 源条带上半部（更干净）权重大一点，减少睫毛根被拖进来
      float srcT = mix(0.08, 0.78, t * t);  // 更偏上半干净眼皮，少拖睫毛
      s.y = (top - skin) + srcT * srcH;
      float stretch = drop / srcH;
      float k = smoothstep(0.15, 0.85, stretch) * smoothstep(0.05, 0.7, t) * smoothstep(0.0, 0.45, w);
      blurAmt = max(blurAmt, smoothstep(0.08, 0.75, stretch) * 0.95);
      lid = vec4(mix(cA, cB, clamp(u * 0.5 + 0.5, 0.0, 1.0)) * (1.0 - 0.03 * t), k * mix(0.62, 0.98, close));
      shade = max(shade, t * close * sqrt(w) * 0.7);
    } else if (close > 0.001 && p.y >= lidY - BAND && p.y < lidY) {
      s.y = p.y - drop;
      shade = max(shade, close * sqrt(w));
    } else if (lr > 0.01 && p.y >= bot - lr && p.y < bot + R.w) {
      float t = (p.y - (bot - lr)) / (R.w + lr);
      s.y = bot + t * R.w;
    } else if (p.y >= lidY && p.y < bot + 2.0) {
      float m = smoothstep(0.0, 5.0, p.y - top) * smoothstep(0.0, 4.0, bot - p.y) * smoothstep(0.0, 0.4, w);
      s -= uGaze * m;
    }
    // ③ 下垂睫毛：闭合线下方 0~18px，镜像取上睑睫毛（top 以上），按闭合度淡入
    if (close > 0.35 && p.y >= lidY && p.y < lidY + 18.0) {
      float d = p.y - lidY;
      lash = vec3(p.x, top - BAND - d * 0.85, smoothstep(0.4, 0.95, close) * (1.0 - d / 16.0) * w * 0.85);
    }
    return s;
  }

  // 说话 / 微笑 = 沿唇缝把下唇向下推、上唇微微上提；微笑时嘴角上扬并露柔和上齿细条。
  vec2 mouthWarp(vec2 p, inout vec4 inner, inout float lipShade) {
    float smile = clamp(uSmile, 0.0, 1.0);
    float openPx = uMouthOpen + smile * 5.2; // 开心时轻微分唇
    if (openPx < 0.04 || p.x <= uMouthRange.x || p.x >= uMouthRange.y) return p;
    float mid = (uMouthRange.x + uMouthRange.y) * 0.5;
    float hw = (uMouthRange.y - uMouthRange.x) * 0.5;
    float u = (p.x - mid) / hw;
    float w = clamp(1.0 - u * u, 0.0, 1.0);
    // 开口两头收尖：中间最大，嘴角几乎不动；微笑略加宽中段
    float g = openPx * pow(w, mix(1.7, 1.35, smile));
    float up = g * mix(0.45, 0.55, smile);
    float seam = quadAt(uMouthQ, p.x);
    // 微笑：嘴角上扬（图像 y 向下，|u| 大处 seam 减小）
    seam -= smile * 7.5 * pow(abs(u), 1.55);
    const float RD = 70.0;   // 下唇 + 下巴参与形变的高度
    const float RU = 40.0;   // 上唇参与形变的高度
    vec2 s = p;
    if (p.y > seam - RU && p.y < seam - up) {
      float t = (p.y - (seam - RU)) / max(RU - up, 0.001);
      s.y = seam - RU + t * RU;
      lipShade = max(lipShade, smoothstep(seam - up - 4.0, seam - up, p.y) * smoothstep(1.0, 5.0, g));
    } else if (p.y >= seam - up && p.y < seam + g) {
      float span = g + up;
      float tg = (p.y - (seam - up)) / max(span, 0.001);
      vec3 dark = vec3(0.17, 0.05, 0.06);
      vec3 warm = vec3(0.42, 0.16, 0.16);
      // 口腔：上下缘偏暖（唇内侧），中间最深
      vec3 col = mix(warm, dark, smoothstep(0.0, 0.5, tg) * smoothstep(1.0, 0.55, tg));
      // 上齿：柔和偏白细条（非卡通），微笑 / 轻说话即可露出
      vec3 teeth = vec3(0.93, 0.91, 0.88);
      float teethBand = (1.0 - smoothstep(0.0, mix(0.28, 0.38, smile), tg));
      float teethOpen = smoothstep(mix(3.2, 2.0, smile), mix(6.5, 4.5, smile), span);
      float teethW = smoothstep(0.18, 0.72, w);
      float teethAmt = teethBand * teethOpen * teethW * mix(0.55, 0.82, smile);
      // 轻说话（无微笑）也留一丝上齿
      teethAmt = max(teethAmt, teethBand * smoothstep(3.8, 7.0, span) * teethW * 0.45);
      col = mix(col, teeth, clamp(teethAmt, 0.0, 0.85));
      float e = min(p.y - (seam - up), seam + g - p.y);
      float edge = smoothstep(-0.3, 1.6, e);
      inner = vec4(col, edge * smoothstep(0.0, 0.25, w) * smoothstep(0.4, 2.0, span));
      s.y = seam;
    } else if (p.y >= seam + g && p.y < seam + RD) {
      float t = (p.y - (seam + g)) / max(RD - g, 0.001);
      s.y = seam + t * RD;
      lipShade = max(lipShade, (1.0 - smoothstep(seam + g, seam + g + 4.0, p.y)) * smoothstep(1.0, 5.0, g));
    }
    return s;
  }

  float cheek(vec2 p, vec4 c) {
    vec2 d = (p - c.xy) / c.zw;
    return exp(-dot(d, d) * 1.6);
  }

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

    // ---- 3.5 表情：在贴图像素坐标里重映射（原图 1:1 采样，不引入任何新像素） ----
    float lidShade = 0.0;
    float blurAmt = 0.0;
    vec3 lash = vec3(0.0);
    vec4 lidCol = vec4(0.0);
    float lipShade = 0.0;
    vec4 inner = vec4(0.0);
    float blush = 0.0;
    if (uExpr > 0.5) {
      vec2 p = vec2(texUv.x * 1280.0, (1.0 - texUv.y) * 720.0);
      p = eyeWarp(p, uEyeLTop, uEyeLBot, uEyeLRange, uLids.x, uLids.z, uLidL0, uLidL1, lidShade, blurAmt, lash, lidCol);
      p = eyeWarp(p, uEyeRTop, uEyeRBot, uEyeRRange, uLids.y, uLids.z, uLidR0, uLidR1, lidShade, blurAmt, lash, lidCol);
      p = mouthWarp(p, inner, lipShade);
      if (uBlush > 0.001) blush = uBlush * (cheek(p, uCheekL) + cheek(p, uCheekR));
      texUv = vec2(p.x / 1280.0, 1.0 - p.y / 720.0);
    }

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

    if (uExpr > 0.5) {
      if (blurAmt > 0.001) {
        vec2 r = vec2(8.0 / 1280.0, 0.0);
        // 被拉长的睫毛是竖条纹 → 主要靠横向模糊抹掉
        vec4 bh = vec4(0.0);
        for (int i = -5; i <= 5; i++) bh += texture2D(uMap, texUv + vec2(float(i) * 4.0 / 1280.0, 0.0));
        bh /= 11.0;
        vec4 bl = mix(blur9(texUv, r.x), bh, 0.6);
        color = mix(color, bl, blurAmt);
      }
      color.rgb = mix(color.rgb, lidCol.rgb, lidCol.a);
      if (lash.z > 0.001) {
        vec3 lc = texture2D(uMap, vec2(lash.x / 1280.0, 1.0 - lash.y / 720.0)).rgb;
        color.rgb = mix(color.rgb, min(color.rgb, lc), lash.z);
      }
      color.rgb *= 1.0 - 0.07 * lidShade;
      color.rgb *= 1.0 - 0.22 * lipShade;
      color.rgb = mix(color.rgb, inner.rgb, inner.a);
      color.rgb = mix(color.rgb, color.rgb * vec3(1.02, 0.84, 0.86), clamp(blush, 0.0, 1.0) * 0.72);
    }

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
