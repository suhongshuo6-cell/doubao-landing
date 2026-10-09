/**
 * 全部自写着色器。
 *
 * 皮肤：同一份 fragment 里同时算「动漫 cel」与「写实 PBR 近似」两套光照，
 *       再用 uReal（全局蜕变进度）× 扫光高度决定每个像素混合比例 —— 所以蜕变
 *       不是两张贴图淡入淡出，而是逐像素的材质状态切换。
 * 捏脸：顶点着色器里对 4 个捏点做高斯衰减位移；fragment 里复算一次做泛红高光。
 * 眼球：程序化虹膜（放射纤维 + 瞳孔 + 角膜镜像高光），不依赖任何贴图。
 * 头发：Kajiya-Kay 各向异性高光（双叶），动漫态是硬边高光带。
 */
import * as THREE from 'three';

/* ───────────────────────── 公共 GLSL ───────────────────────── */
const COMMON = /* glsl */`
  precision highp float;
  const float PI = 3.141592653589793;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  // 单倍频值噪声（够用且便宜）
  float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z);
  }

`;

/**
 * 捏脸 vertex shader 片段。独立于 COMMON：three 在渲染时对
 * "着色器声明了、但 material.uniforms 里没有"的 active uniform **没有空值保护**
 * （WebGLUniforms.upload 直接读 v.needsUpdate），所以没用到它的着色器绝不能带上这段声明。
 */
const PINCH = /* glsl */`
  uniform vec4 uPinch[4];

  // 捏点高斯场：返回该点被"按"的带符号强度（正 = 向内压）。
  // 直接读全局 uPinch，避免把数组作为函数形参传递。
  float pinchWeight(vec3 p, float radius) {
    float acc = 0.0;
    for (int i = 0; i < 4; i++) {
      float s = uPinch[i].w;
      if (abs(s) < 0.00005) continue;
      vec3 d = p - uPinch[i].xyz;
      acc += exp(-dot(d, d) / (radius * radius)) * s;
    }
    return acc;
  }
`;

/* ───────────────────────── 皮肤 ───────────────────────── */
const SKIN_VERT = /* glsl */`
  ${COMMON}
  ${PINCH}
  uniform float uTime, uBreath, uPinchR, uPinchOn, uSway;

  varying vec3 vN, vView, vWorld, vObj;
  varying vec2 vUv;

  void main() {
    vec3 pos = position;
    vec3 nrm = normalize(normal);

    // 呼吸：整体低频起伏 + 沿法线的微位移（数值由 CPU 按分镜给）
    float br = sin(uTime * 1.05 + position.y * 2.4) * 0.5 + 0.5;
    pos += nrm * (uBreath * (0.25 + 0.75 * br));

    // 轻微重心摆动（腰肢分镜会加大）
    pos.x += sin(uTime * 0.62) * uSway * smoothstep(0.75, 1.35, position.y);
    pos.z += cos(uTime * 0.48) * uSway * 0.5;

    // 捏脸：沿法线的 4 点高斯位移（正强度 = 向内按出凹陷）
    if (uPinchOn > 0.5) {
      pos -= nrm * pinchWeight(position, uPinchR);
    }

    vUv = uv;
    vObj = position;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vView = mv.xyz;
    vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
    vN = normalize(normalMatrix * nrm);
    gl_Position = projectionMatrix * mv;
  }
`;

const SKIN_FRAG = /* glsl */`
  ${COMMON}
  ${PINCH}
  uniform vec3 uColAnime, uColReal, uColDeep, uColRim, uColKey, uColFill, uColAmb;
  uniform vec3 uKeyDir, uFillDir, uRimDir;
  uniform float uKeyInt, uFillInt, uRimInt;
  uniform float uTime, uReal, uSweepY, uSweepW, uSweepGlow;
  uniform float uPore, uBlush, uPinchOn, uPinchR, uOpacity, uEmissive, uGloss, uFade;

  varying vec3 vN, vView, vWorld, vObj;
  varying vec2 vUv;

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(-vView);

    // ── 动漫态：三段色阶 + 硬边高光 ──
    float kdl = dot(N, normalize(uKeyDir));
    float band = smoothstep(0.14, 0.20, kdl) * 0.60 + smoothstep(0.50, 0.56, kdl) * 0.40;
    float hardSpec = smoothstep(0.84, 0.90, dot(N, normalize(uKeyDir + V)));
    vec3 anime = uColAnime * (0.40 + 0.90 * band);
    anime += vec3(1.0) * hardSpec * 0.22;
    anime += uColRim * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.30;

    // ── 写实态：wrap diffuse + 次表面透光 + 双叶高光 + 菲涅尔边缘光 ──
    float ndl = dot(N, normalize(uKeyDir));
    float wrap = clamp((ndl + 0.42) / 1.42, 0.0, 1.0);
    float term = smoothstep(-0.28, 0.32, ndl) * (1.0 - smoothstep(0.18, 0.88, ndl));
    float fdl = dot(N, normalize(uFillDir)) * 0.5 + 0.5;
    float rdl = dot(N, normalize(uRimDir)) * 0.5 + 0.5;

    vec3 diff = uColKey * uKeyInt * wrap;
    diff += uColFill * uFillInt * (0.30 + 0.70 * fdl);
    diff += uColAmb * 0.75;
    diff += uColDeep * term * 0.62;          // 次表面：明暗交界处的血色透光
    diff += uColRim * uRimInt * pow(rdl, 2.2) * 0.55;

    vec3 H = normalize(normalize(uKeyDir) + V);
    float nh = max(dot(N, H), 0.0);
    float spec = pow(nh, 46.0) * uGloss + pow(nh, 9.0) * 0.05;
    spec *= mix(0.72, 1.28, noise3(vObj * 190.0));   // 毛孔扰动：让高光有颗粒感

    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.7);
    vec3 real = uColReal * diff + uColKey * spec * uKeyInt + uColRim * uRimInt * rim * 0.9;
    real += uColDeep * uPore * noise3(vObj * 320.0) * 0.25;   // 极细微的肤色不均

    // 颊部血色（仅头部开启）
    if (uBlush > 0.0) {
      float c1 = exp(-dot(vObj.xy - vec2( 0.34, -0.30), vObj.xy - vec2( 0.34, -0.30)) / 0.085);
      float c2 = exp(-dot(vObj.xy - vec2(-0.34, -0.30), vObj.xy - vec2(-0.34, -0.30)) / 0.085);
      float front = smoothstep(-0.05, 0.45, vObj.z);
      real += vec3(0.85, 0.22, 0.26) * (c1 + c2) * front * uBlush * 0.55;
    }

    // ── 逐像素混合：全局蜕变进度 × 扫光高度 ──
    // 扫光线以下 = 已蜕变为写实，以上 = 仍是动漫
    float realMask = 1.0 - smoothstep(uSweepY - uSweepW, uSweepY + uSweepW, vWorld.y);
    float m = clamp(uReal * realMask, 0.0, 1.0);
    vec3 col = mix(anime, real, m);

    // 蜕变亮线（自下而上扫过时的发光边缘）
    float line = exp(-pow((vWorld.y - uSweepY) / max(uSweepW * 1.5, 0.0001), 2.0));
    col += mix(uColRim, vec3(1.0), 0.55) * line * uSweepGlow * 2.6;

    // 被捏到的地方泛红发光
    if (uPinchOn > 0.5) {
      float hit = clamp(abs(pinchWeight(vObj, uPinchR)) * 14.0, 0.0, 1.0);
      col += vec3(1.0, 0.42, 0.40) * hit * 0.46;
    }

    col += uColRim * uEmissive;

    gl_FragColor = vec4(col * uFade, uOpacity);
  }
`;

/* ───────────────────────── 眼球 ───────────────────────── */
const EYE_VERT = /* glsl */`
  varying vec3 vN, vView, vLocal;
  void main() {
    vLocal = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const EYE_FRAG = /* glsl */`
  ${COMMON}
  uniform vec3 uGaze;         // 注视方向（模型空间）
  uniform vec3 uIris, uIrisDeep, uSclera, uKeyDir, uColRim;
  uniform float uTime, uReal, uPupil, uOpacity, uFade;
  varying vec3 vN, vView, vLocal;

  void main() {
    vec3 d = normalize(vLocal);
    vec3 g = normalize(uGaze);
    vec3 t1 = normalize(cross(g, vec3(0.0, 1.0, 0.0)));
    vec3 t2 = normalize(cross(g, t1));
    vec2 p = vec2(dot(d, t1), dot(d, t2)) / 0.52;   // 归一化到虹膜半径
    float r = length(p);
    float th = atan(p.y, p.x);

    // 巩膜：微蓝白 + 血丝 + 上眼睑投影
    vec3 col = uSclera;
    col *= mix(1.0, 0.72, smoothstep(-0.2, 0.55, d.y));
    col += vec3(0.55, 0.14, 0.12) * smoothstep(0.55, 0.95, noise3(vec3(p * 7.0, 1.7))) * 0.18;

    if (r < 1.06) {
      // 虹膜：径向渐变 + 放射纤维 + 瞳孔缘暗环
      float fib = noise3(vec3(cos(th) * 9.0, sin(th) * 9.0, r * 2.2));
      vec3 iris = mix(uIrisDeep, uIris, smoothstep(0.12, 0.95, r));
      iris *= 0.72 + 0.55 * fib;
      iris += uIris * pow(1.0 - r, 2.5) * 0.55;
      float limbal = smoothstep(0.72, 1.02, r);
      iris = mix(iris, uIrisDeep * 0.22, limbal * 0.85);

      // 瞳孔
      float pupil = 1.0 - smoothstep(uPupil - 0.06, uPupil + 0.03, r);
      iris = mix(iris, vec3(0.012), pupil);

      float edge = smoothstep(1.06, 0.98, r);
      col = mix(col, iris, edge);
    }

    // 角膜高光（两点：主光 + 补光），眼睛有神的关键
    float c1 = smoothstep(0.30, 0.02, length(p - vec2(-0.34, 0.40)));
    float c2 = smoothstep(0.16, 0.01, length(p - vec2(0.38, -0.34)));
    col += vec3(1.0) * (c1 * 0.95 + c2 * 0.35) * mix(0.55, 1.0, uReal);

    // 湿润边缘 + 受光
    float ndl = dot(normalize(vN), normalize(uKeyDir)) * 0.5 + 0.5;
    col *= mix(0.68, 1.12, ndl);
    col += uColRim * pow(1.0 - max(dot(normalize(vN), normalize(-vView)), 0.0), 3.0) * 0.35;

    gl_FragColor = vec4(col * uFade, uOpacity);
  }
`;

/* ───────────────────────── 头发（Kajiya-Kay） ───────────────────────── */
const HAIR_VERT = /* glsl */`
  ${COMMON}
  attribute vec3 aTangent;
  uniform float uTime, uSway, uReal;
  uniform vec3 uWind;
  varying vec3 vN, vView, vWorld, vTan, vObj;
  varying vec2 vUv;

  void main() {
    vec3 pos = position;
    // 发丝飘动：越靠发梢越明显
    float tip = smoothstep(0.15, 1.0, uv.y);
    float w = sin(uTime * 1.35 + uv.x * 6.2831 * 2.0 + uv.y * 3.0);
    pos += uWind * (w * tip * 0.5 + 0.5 * w * uSway) * (0.006 + tip * 0.012);
    pos.x += sin(uTime * 0.7 + uv.y * 4.0) * tip * 0.004;

    vUv = uv;
    vObj = position;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vView = mv.xyz;
    vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
    vN = normalize(normalMatrix * normalize(normal));
    vTan = normalize(normalMatrix * aTangent);
    gl_Position = projectionMatrix * mv;
  }
`;

const HAIR_FRAG = /* glsl */`
  ${COMMON}
  uniform vec3 uColA, uColB, uHiAnime, uHiReal, uColKey, uColRim, uKeyDir, uRimDir;
  uniform float uKeyInt, uRimInt, uReal, uSweepY, uSweepW, uSweepGlow, uOpacity, uFade;
  varying vec3 vN, vView, vWorld, vTan, vObj;
  varying vec2 vUv;

  // Kajiya-Kay 各向异性高光
  float strandSpec(vec3 T, vec3 L, vec3 V, float power) {
    float tl = dot(T, L);
    float tv = dot(T, V);
    float s = sqrt(max(0.0, 1.0 - tl * tl)) * sqrt(max(0.0, 1.0 - tv * tv));
    return pow(max(s, 0.0), power);
  }

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(-vView);
    vec3 T = normalize(vTan);
    vec3 L = normalize(uKeyDir);
    vec3 R = normalize(uRimDir);

    // 动漫态：平坦底色 + 一道硬边高光带
    float animeBand = smoothstep(0.42, 0.62, strandSpec(T, L, V, 3.0));
    vec3 anime = uColA * (0.55 + 0.35 * (dot(N, L) * 0.5 + 0.5));
    anime += uHiAnime * animeBand * 1.15;

    // 写实态：深色基底 + 双叶各向异性 + 边缘光
    vec3 T2 = normalize(T + N * 0.16);
    float s1 = strandSpec(T, L, V, 62.0);
    float s2 = strandSpec(T2, L, V, 18.0);
    vec3 real = uColB * (0.32 + 0.9 * clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0));
    real += uHiReal * s1 * 1.5;
    real += uHiReal * s2 * 0.30;
    real += uColRim * pow(1.0 - max(dot(N, V), 0.0), 2.4) * uRimInt * 1.25;
    real += uColRim * pow(max(dot(N, R) * 0.5 + 0.5, 0.0), 2.0) * 0.4;
    real *= 0.9 + 0.25 * noise3(vObj * 160.0);   // 发丝细节
    // 发梢透光
    real += uColRim * smoothstep(0.5, 1.0, vUv.y) * 0.18;

    // 扫光线以下 = 已蜕变为写实，以上 = 仍是动漫
    float realMask = 1.0 - smoothstep(uSweepY - uSweepW, uSweepY + uSweepW, vWorld.y);
    float m = clamp(uReal * realMask, 0.0, 1.0);
    vec3 col = mix(anime, real, m);

    float line = exp(-pow((vWorld.y - uSweepY) / max(uSweepW * 1.5, 0.0001), 2.0));
    col += mix(uHiReal, vec3(1.0), 0.5) * line * uSweepGlow * 2.2;

    gl_FragColor = vec4(col * uFade, uOpacity);
  }
`;

/* ───────────────────────── 布料 ───────────────────────── */
const FABRIC_FRAG = /* glsl */`
  ${COMMON}
  uniform vec3 uColA, uColB, uColRim, uColKey, uKeyDir;
  uniform float uKeyInt, uReal, uSweepY, uSweepW, uSweepGlow, uOpacity, uEmissive, uFade;
  varying vec3 vN, vView, vWorld, vObj;
  varying vec2 vUv;

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(-vView);
    vec3 L = normalize(uKeyDir);
    float ndl = dot(N, L);

    // 针织纹理：沿 uv 的细密织纹
    float weave = noise3(vObj * 420.0) * 0.6 + 0.4 * sin(vUv.x * 900.0) * sin(vUv.y * 700.0);
    weave = weave * 0.5 + 0.5;

    float band = smoothstep(0.10, 0.18, ndl) * 0.6 + smoothstep(0.48, 0.55, ndl) * 0.4;
    vec3 anime = uColA * (0.45 + 0.85 * band);

    float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
    vec3 real = uColB * (uColKey * uKeyInt * wrap * 0.9 + 0.12);
    real *= 0.82 + 0.30 * weave;
    real += uColRim * pow(1.0 - max(dot(N, V), 0.0), 2.6) * 0.55;

    // 扫光线以下 = 已蜕变为写实，以上 = 仍是动漫
    float realMask = 1.0 - smoothstep(uSweepY - uSweepW, uSweepY + uSweepW, vWorld.y);
    float m = clamp(uReal * realMask, 0.0, 1.0);
    vec3 col = mix(anime, real, m);

    float line = exp(-pow((vWorld.y - uSweepY) / max(uSweepW * 1.5, 0.0001), 2.0));
    col += mix(uColRim, vec3(1.0), 0.5) * line * uSweepGlow * 2.0;
    col += uColRim * uEmissive;

    gl_FragColor = vec4(col * uFade, uOpacity);
  }
`;

/* ───────────────────────── 描边（动漫态专用，屏幕空间外扩） ───────────────────────── */
const OUTLINE_VERT = /* glsl */`
  uniform float uOutlinePx, uReal, uSweepY, uSweepW, uFade;
  uniform vec2 uResolution;
  uniform vec3 uColRim;
  varying float vFade;
  varying vec3 vWorld;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normalize(normal));
    vec4 clip = projectionMatrix * mv;
    // 屏幕空间等宽外扩：始终 uOutlinePx 像素，不随距离变粗变细
    vec2 dir = n.xy;
    float len = length(dir);
    dir = len > 1e-5 ? dir / len : vec2(0.0, 1.0);
    clip.xy += dir * (uOutlinePx * 2.0 / uResolution) * clip.w;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    // 扫光线以下 = 已蜕变为写实，以上 = 仍是动漫
    float realMask = 1.0 - smoothstep(uSweepY - uSweepW, uSweepY + uSweepW, vWorld.y);
    vFade = 1.0 - clamp(uReal * realMask, 0.0, 1.0);
    gl_Position = clip;
  }
`;
const OUTLINE_FRAG = /* glsl */`
  uniform vec3 uColRim;
  varying float vFade;
  varying vec3 vWorld;
  void main() {
    if (vFade < 0.02) discard;
    gl_FragColor = vec4(vec3(0.012, 0.010, 0.030) + uColRim * 0.05, vFade * 0.92 * uFade);
  }
`;

/* ───────────────────────── 最终调色 pass ───────────────────────── */
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uAberration: { value: 1.0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 0.055 },
    uScan: { value: 0.035 },
    uFlash: { value: 0.0 },
    uExposure: { value: 1.0 },
    uSaturation: { value: 1.06 },
    uReal: { value: 0.0 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uVignette, uGrain, uScan, uFlash, uExposure, uSaturation, uReal;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // 径向色差：越靠边缘越明显（动漫态更强）
      float ab = (0.0016 + 0.0042 * r2) * uAberration * mix(1.35, 0.55, uReal);
      vec2 dir = c * (1.0 + r2 * 0.06);
      vec3 col;
      col.r = texture2D(tDiffuse, uv - dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + dir * ab).b;

      // 曝光 / 饱和度 / 柔和 S 曲线（此 pass 在 OutputPass 之后，属于显示空间调色）
      col = clamp(col * uExposure, 0.0, 1.6);
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, uSaturation);
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.32);

      // 暗角
      float vig = smoothstep(1.05, 0.18, length(c) * 1.32);
      col *= mix(1.0, vig, uVignette);

      // 扫描线 + 颗粒
      float scan = sin(uv.y * uRes.y * 1.15 + uTime * 2.0) * 0.5 + 0.5;
      col *= 1.0 - uScan * scan * 0.55;
      float g = hash(uv * uRes + fract(uTime) * 137.0);
      col += (g - 0.5) * uGrain;

      // 蜕变 / 捏脸时的白闪
      col += vec3(0.85, 0.92, 1.0) * uFlash;

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

/* ───────────────────────── 材质工厂 ───────────────────────── */
export function lightUniforms(L) {
  return {
    uKeyDir: { value: new THREE.Vector3(...L.key.dir).normalize() },
    uFillDir: { value: new THREE.Vector3(...L.fill.dir).normalize() },
    uRimDir: { value: new THREE.Vector3(...L.rim.dir).normalize() },
    uColKey: { value: new THREE.Color(L.key.color) },
    uColFill: { value: new THREE.Color(L.fill.color) },
    uColRim: { value: new THREE.Color(L.rim.color) },
    uColAmb: { value: new THREE.Color(L.amb.color) },
    uKeyInt: { value: L.key.intensity },
    uFillInt: { value: L.fill.intensity },
    uRimInt: { value: L.rim.intensity }
  };
}

/** 共享的「蜕变进度」uniform 池：所有材质引用同一批对象，改一处全体生效 */
export function makeSharedUniforms() {
  return {
    uTime: { value: 0 },
    uReal: { value: 0 },
    uSweepY: { value: 0 },
    uSweepW: { value: 0.05 },
    uSweepGlow: { value: 0 },
    uFade: { value: 1 }
  };
}

export function makeSkinMaterial({ shared, lights, pinched = false, anime = 0xf7c9a8, real = 0xf3cdb4, deep = 0xe0705f, gloss = 0.85 }) {
  const u = {
    ...lightUniforms(lights),
    uColAnime: { value: new THREE.Color(anime) },
    uColReal: { value: new THREE.Color(real) },
    uColDeep: { value: new THREE.Color(deep) },
    uTime: shared.uTime,
    uReal: shared.uReal,
    uSweepY: shared.uSweepY,
    uSweepW: shared.uSweepW,
    uSweepGlow: shared.uSweepGlow,
    uFade: shared.uFade,
    uBreath: { value: 0 },
    uSway: { value: 0 },
    uPore: { value: 0.5 },
    uBlush: { value: pinched ? 0.9 : 0.0 },
    uGloss: { value: gloss },
    uOpacity: { value: 1 },
    uEmissive: { value: 0 },
    uPinchOn: { value: pinched ? 1 : 0 },
    uPinchR: { value: 0.115 },
    uPinch: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }
  };
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: SKIN_VERT,
    fragmentShader: SKIN_FRAG,
    side: THREE.FrontSide
  });
}

export function makeEyeMaterial({ lights, gaze = [0, 0, 1], iris = 0x6f5cf0, irisDeep = 0x241a52, sclera = 0xeef0f8, pupil = 0.34 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uGaze: { value: new THREE.Vector3(...gaze).normalize() },
      uIris: { value: new THREE.Color(iris) },
      uIrisDeep: { value: new THREE.Color(irisDeep) },
      uSclera: { value: new THREE.Color(sclera) },
      uKeyDir: { value: new THREE.Vector3(...lights.key.dir).normalize() },
      uColRim: { value: new THREE.Color(lights.rim.color) },
      uTime: { value: 0 },
      uReal: { value: 0 },
      uPupil: { value: pupil },
      uOpacity: { value: 1 },
      uFade: { value: 1 }
    },
    vertexShader: EYE_VERT,
    fragmentShader: EYE_FRAG
  });
}

export function makeHairMaterial({ shared, lights, colA = 0x3b2f6b, colB = 0x14101c, hiAnime = 0xbba6ff, hiReal = 0xffe6d0 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColA: { value: new THREE.Color(colA) },
      uColB: { value: new THREE.Color(colB) },
      uHiAnime: { value: new THREE.Color(hiAnime) },
      uHiReal: { value: new THREE.Color(hiReal) },
      uColKey: { value: new THREE.Color(lights.key.color) },
      uColRim: { value: new THREE.Color(lights.rim.color) },
      uKeyDir: { value: new THREE.Vector3(...lights.key.dir).normalize() },
      uRimDir: { value: new THREE.Vector3(...lights.rim.dir).normalize() },
      uKeyInt: { value: lights.key.intensity },
      uRimInt: { value: lights.rim.intensity },
      uTime: shared.uTime,
      uReal: shared.uReal,
      uSweepY: shared.uSweepY,
      uSweepW: shared.uSweepW,
      uSweepGlow: shared.uSweepGlow,
      uFade: shared.uFade,
      uSway: { value: 0 },
      uWind: { value: new THREE.Vector3(0.4, 0.1, 0.9) },
      uOpacity: { value: 1 }
    },
    vertexShader: HAIR_VERT,
    fragmentShader: HAIR_FRAG,
    side: THREE.DoubleSide
  });
}

export function makeFabricMaterial({ shared, lights, anime = 0xf2ecff, real = 0xe8e2f2 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...lightUniforms(lights),
      uColA: { value: new THREE.Color(anime) },
      uColB: { value: new THREE.Color(real) },
      uTime: shared.uTime,
      uReal: shared.uReal,
      uSweepY: shared.uSweepY,
      uSweepW: shared.uSweepW,
      uSweepGlow: shared.uSweepGlow,
      uFade: shared.uFade,
      uBreath: { value: 0 },
      uSway: { value: 0 },
      uPinchOn: { value: 0 },
      uPinchR: { value: 0.11 },
      uPinch: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uOpacity: { value: 1 },
      uEmissive: { value: 0 }
    },
    vertexShader: SKIN_VERT,
    fragmentShader: FABRIC_FRAG,
    side: THREE.DoubleSide
  });
}

export function makeOutlineMaterial({ shared, lights, px = 2.6, res = null }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOutlinePx: { value: px },
      uResolution: { value: res ?? new THREE.Vector2(1920, 1080) },
      uColRim: { value: new THREE.Color(lights.rim.color) },
      uReal: shared.uReal,
      uSweepY: shared.uSweepY,
      uSweepW: shared.uSweepW,
      uFade: shared.uFade
    },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false
  });
}
