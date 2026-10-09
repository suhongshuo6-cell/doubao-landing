/**
 * 全屏立绘渲染器。
 *
 * 思路：不做 3D 人体，而是把「三张立绘」当成唯一主角，用一整块全屏四边形 + 自写 shader 完成：
 *   · 取景      —— 屏幕坐标 → 原图像素坐标，滚动只改变取景框（大特写 ↔ 中景 ↔ 全身）
 *   · 转身      —— 横向压缩 + 三视图加权混合，模拟绕人物中轴转动（正面 ↔ 侧面 ↔ 背面）
 *   · 捏脸      —— 在图像空间做高斯收缩形变，并用形变的雅可比行列式反推明暗，
 *                  捏下去是一个"软窝"而不是单纯错位，所以看着有体积感
 *   · 棚拍调子  —— 极慢呼吸补光 + 轻 S 曲线 + 极淡暗角 + 低幅颗粒（8Hz 更新，不闪）
 *
 * 没有 bloom、没有扫描线、没有色相偏移、没有闪光 —— 这些是用户明确否掉的。
 */
import * as THREE from 'three';
import { PORTRAIT, QUALITY, INTRO, clamp, lerp } from '../config.js';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;

  uniform sampler2D uFront, uSide, uBack;
  uniform vec2  uImgSize;
  uniform vec4  uView;        // cx, cy, halfW, halfH —— 原图像素
  uniform float uCx;
  uniform float uSquash;      // 转身横向压缩（1 = 不压缩）
  uniform vec3  uW;           // 三视图权重（已归一化）
  uniform vec2  uPress;
  uniform float uPressAmt, uPressR;
  uniform vec2  uParallax;
  uniform vec2  uTexel;
  uniform vec2  uRes;
  uniform float uTime, uBreath, uBlur, uGrain, uSharp, uExposure, uAspect;

  varying vec2 vUv;
  const float PI = 3.141592653589793;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  vec2 screenToImg(vec2 s) {
    return vec2(
      uView.x + (s.x - 0.5) * 2.0 * uView.z,
      uView.y + (0.5 - s.y) * 2.0 * uView.w
    );
  }
  vec2 imgToTex(vec2 p) { return vec2(p.x / uImgSize.x, 1.0 - p.y / uImgSize.y); }

  vec3 fetchViews(vec2 uv) {
    vec3 c = vec3(0.0);
    if (uW.x > 0.002) c += texture2D(uFront, uv).rgb * uW.x;
    if (uW.y > 0.002) c += texture2D(uSide,  uv).rgb * uW.y;
    if (uW.z > 0.002) c += texture2D(uBack,  uv).rgb * uW.z;
    return c;
  }

  void main() {
    vec2 s = vUv;
    vec2 img = screenToImg(s);

    // 转身：绕人物中轴做横向压缩，视觉上就是"侧过去了"
    img.x = uCx + (img.x - uCx) / max(uSquash, 0.045);
    img += uParallax;

    // 捏脸：向按压点收缩 + 由形变雅可比反推明暗
    vec2 d = img - uPress;
    float r2 = max(uPressR * uPressR, 1.0);
    float g = exp(-dot(d, d) / r2);
    float k = uPressAmt * g;
    img -= d * k;

    float ax  = 1.0 - k + 2.0 * k * d.x * d.x / r2;
    float ay  = 1.0 - k + 2.0 * k * d.y * d.y / r2;
    float axy = 2.0 * k * d.x * d.y / r2;
    float det = ax * ay - axy * axy;
    float shade = 1.0
      - 0.30 * clamp((1.0 - det) * 3.4, 0.0, 1.0)     // 被压进去的地方偏暗
      + 0.11 * clamp((det - 1.0) * 2.6, 0.0, 1.0);    // 周围被拉伸的地方偏亮

    vec2 uv = imgToTex(img);
    vec3 col = fetchViews(uv);

    // 开场对焦：一次廉价四向模糊
    if (uBlur > 0.02) {
      vec2 b = vec2(uBlur / uImgSize.x, uBlur / uImgSize.y);
      vec3 blur = fetchViews(uv + vec2(b.x, 0.0)) + fetchViews(uv - vec2(b.x, 0.0))
                + fetchViews(uv + vec2(0.0, b.y)) + fetchViews(uv - vec2(0.0, b.y));
      col = mix(col, (col + blur) * 0.2, 0.8);
    }

    // 高倍特写时做一次轻反锐化（原图只有 1280 宽，放大后需要补一点边缘）
    if (uSharp > 0.002) {
      vec3 n = fetchViews(uv + vec2(uTexel.x, 0.0)) + fetchViews(uv - vec2(uTexel.x, 0.0))
             + fetchViews(uv + vec2(0.0, uTexel.y)) + fetchViews(uv - vec2(0.0, uTexel.y));
      col += uSharp * (col - n * 0.25);
    }

    col *= shade;
    col *= uExposure;

    // 呼吸补光：极慢、极小，像棚拍灯在呼吸
    col *= 1.0 + uBreath * sin(uTime * 2.0 * PI / 7.2);

    // 轻 S 曲线，肤色更通透
    col = clamp(col, 0.0, 1.0);
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);

    // 极淡暗角
    float vig = 1.0 - 0.075 * pow(length((s - 0.5) * vec2(uAspect, 1.0)) * 1.3, 2.6);
    col *= vig;

    // 颗粒：按 8Hz 更新，避免逐帧抖动
    float gt = floor(uTime * 8.0);
    col += (hash21(s * uRes + gt * 37.0) - 0.5) * uGrain;

    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

/** 缺图时的占位贴图：清楚告诉用户该放什么、放哪 */
function makePlaceholder(label) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#EDEBE6';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(28,27,26,.20)';
  g.lineWidth = 3;
  g.setLineDash([16, 13]);
  g.strokeRect(44, 44, c.width - 88, c.height - 88);
  g.textAlign = 'center';
  g.fillStyle = '#1C1B1A';
  g.font = '600 46px "PingFang SC","HarmonyOS Sans SC",system-ui,sans-serif';
  g.fillText('缺少立绘', c.width / 2, c.height / 2 - 52);
  g.font = '400 28px ui-monospace,Menlo,monospace';
  g.fillStyle = 'rgba(28,27,26,.66)';
  g.fillText(`assets/character/${label}.(webp|png)`, c.width / 2, c.height / 2 + 6);
  g.font = '400 24px "PingFang SC","HarmonyOS Sans SC",system-ui,sans-serif';
  g.fillStyle = 'rgba(28,27,26,.55)';
  g.fillText('把 front / side / back 三张立绘放进 assets/character/', c.width / 2, c.height / 2 + 62);
  g.fillText('然后运行  python3 tools/prepare-portrait.py', c.width / 2, c.height / 2 + 102);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function loadTexture(loader, urls, name) {
  return new Promise(resolve => {
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) { resolve({ tex: makePlaceholder(name), ok: false }); return; }
      const url = urls[i++];
      loader.load(url,
        tex => resolve({ tex, ok: true, url }),
        undefined,
        () => tryNext()
      );
    };
    tryNext();
  });
}

/**
 * 独立可测的材质工厂：离线自检脚本会用假的贴图调用它，
 * 以便核对着色器里声明的每个 uniform 都有 JS 侧的值
 * （three 在 WebGLUniforms.upload 里直接读 v.needsUpdate，缺一个就是渲染时抛异常）。
 */
export function createPortraitMaterial({ front, side, back, texSize, quality }) {
  const Q = quality;
  const uniforms = {
    uFront: { value: front },
    uSide: { value: side },
    uBack: { value: back },
    uImgSize: { value: new THREE.Vector2(PORTRAIT.imgW, PORTRAIT.imgH) },
    uView: { value: new THREE.Vector4(PORTRAIT.cx, 54, 110, 110) },
    uCx: { value: PORTRAIT.cx },
    uSquash: { value: 1 },
    uW: { value: new THREE.Vector3(1, 0, 0) },
    uPress: { value: new THREE.Vector2(PORTRAIT.cx, 54) },
    uPressAmt: { value: 0 },
    uPressR: { value: PORTRAIT.pressRadius },
    uParallax: { value: new THREE.Vector2(0, 0) },
    uTexel: { value: new THREE.Vector2(1 / texSize.x, 1 / texSize.y) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uBreath: { value: INTRO.breathe },
    uBlur: { value: 0 },
    uGrain: { value: Q.grain },
    uSharp: { value: 0 },
    uExposure: { value: 1 },
    uAspect: { value: 1 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false
  });
  return mat;
}

export async function createPortrait({ renderer, quality, onProgress }) {
  const Q = quality;
  const loader = new THREE.TextureLoader();

  const loaded = {};
  let done = 0;
  await Promise.all(PORTRAIT.views.map(async name => {
    const res = await loadTexture(loader,
      [`./assets/character/${name}.webp`, `./assets/character/${name}.png`], name);
    loaded[name] = res;
    done++;
    onProgress?.(done / PORTRAIT.views.length, name, res.ok);
  }));

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const texSize = new THREE.Vector2(1280, 720);
  for (const name of PORTRAIT.views) {
    const t = loaded[name].tex;
    t.colorSpace = THREE.NoColorSpace;      // 直接在显示空间做图像处理，不需要 GPU 解码 sRGB
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = Math.min(Q.anisotropy, maxAniso);
    t.needsUpdate = true;
    if (t.image && t.image.width) texSize.set(t.image.width, t.image.height);
  }

  const mat = createPortraitMaterial({
    front: loaded.front.tex,
    side: loaded.side.tex,
    back: loaded.back.tex,
    texSize,
    quality: Q
  });
  const uniforms = mat.uniforms;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xCFC9C9);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);

  const state = {
    frame: { cy: 54, w: 215 },
    frameCur: { cy: 54, w: 215 },
    turn: 0,
    turnCur: 0,
    press: new THREE.Vector2(0, 0),
    pressAmt: 0,
    pressAmtCur: 0,
    parallax: new THREE.Vector2(0, 0),
    parallaxCur: new THREE.Vector2(0, 0),
    zoom: 1,
    blur: 0,
    missing: PORTRAIT.views.filter(n => !loaded[n].ok)
  };

  /** 依据屏幕宽高比计算最终取景（竖屏时按同一景别收窄，避免人物被裁得太窄） */
  function resolveView(w, h) {
    const A = w / h;
    const portrait = A < 1.05;
    const width = state.frameCur.w * state.zoom * (portrait ? PORTRAIT.portraitShrink : 1);
    const halfW = width * 0.5;
    const halfH = halfW / A;
    return { halfW, halfH, A, visibleH: halfH * 2 };
  }

  function applyTurn() {
    const t = clamp(state.turnCur, 0, 2);
    const seg = Math.min(1, Math.floor(t));
    const f = t - seg;
    // 横向压缩：转到 90° 时几乎缩成一条线，就像真人侧过去了
    const squash = Math.max(Math.abs(Math.cos(f * Math.PI)), 0.045);
    // 交叉淡入淡出（窄窗口，避免重影）
    const wOut = 1 - Math.min(1, Math.max(0, (f - 0.10) / 0.42));
    const wIn = Math.min(1, Math.max(0, (f - 0.48) / 0.42));
    const sum = Math.max(wOut + wIn, 0.0001);
    const a = wOut / sum, b = wIn / sum;
    const w = [0, 0, 0];
    w[seg] = a;
    w[seg + 1] = b;
    uniforms.uW.value.set(w[0], w[1], w[2]);
    uniforms.uSquash.value = squash;
  }

  return {
    scene, camera, quad, uniforms, state, textures: loaded,
    get ready() { return state.missing.length === 0; },

    setFrame(frame) { state.frame = frame; },

    /** 每帧推进：取景阻尼、转身弹簧、按压弹簧、视差 */
    update(dt, time) {
      state.frameCur.cy = lerp(state.frameCur.cy, state.frame.cy, 1 - Math.exp(-7.5 * dt));
      state.frameCur.w = lerp(state.frameCur.w, state.frame.w, 1 - Math.exp(-6.5 * dt));
      state.turnCur = lerp(state.turnCur, state.turn, 1 - Math.exp(-11 * dt));
      state.pressAmtCur = lerp(state.pressAmtCur, state.pressAmt, 1 - Math.exp(-26 * dt));
      state.parallaxCur.x = lerp(state.parallaxCur.x, state.parallax.x, 1 - Math.exp(-4.5 * dt));
      state.parallaxCur.y = lerp(state.parallaxCur.y, state.parallax.y, 1 - Math.exp(-4.5 * dt));

      const v = resolveView(window.innerWidth, window.innerHeight);
      uniforms.uView.value.set(PORTRAIT.cx, state.frameCur.cy, v.halfW, v.halfH);
      uniforms.uAspect.value = v.A;
      uniforms.uPress.value.copy(state.press);
      uniforms.uPressAmt.value = state.pressAmtCur;
      uniforms.uParallax.value.copy(state.parallaxCur);
      uniforms.uTime.value = time;
      // 只有真正放到很大时才锐化，避免全身景别出现锐化伪影
      uniforms.uSharp.value = v.visibleH < 260 ? Q.sharpen * clamp((260 - v.visibleH) / 90) : 0;

      applyTurn();
      return { visibleH: v.visibleH, halfW: v.halfW, halfH: v.halfH, aspect: v.A };
    },

    /** 屏幕像素 → 原图像素（与 shader 里的映射保持一致，交互命中用） */
    screenToImage(clientX, clientY) {
      const s = { x: clientX / window.innerWidth, y: 1 - clientY / window.innerHeight };
      const u = uniforms.uView.value;
      let x = u.x + (s.x - 0.5) * 2 * u.z;
      const y = u.y + (0.5 - s.y) * 2 * u.w;
      const sq = uniforms.uSquash.value;
      x = PORTRAIT.cx + (x - PORTRAIT.cx) * sq;   // 反解压缩
      return { x, y, squeeze: sq };
    },

    setBlur(v) { uniforms.uBlur.value = v; },
    setExposure(v) { uniforms.uExposure.value = v; },
    setPressPoint(x, y) { state.press.set(x, y); },
    setPressAmount(v) { state.pressAmt = v; },
    setParallax(x, y) { state.parallax.set(x, y); },
    get visibleHeight() { return resolveView(window.innerWidth, window.innerHeight).visibleH; }
  };
}
