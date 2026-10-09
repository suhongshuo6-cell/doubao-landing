/**
 * 舞台：渲染器 / 相机 / 后处理链 / 星空背景 / 地面
 * 光照不走 three 的灯光系统，而是把方向与颜色作为 uniform 交给自写着色器，
 * 这样动漫态与写实态可以各用一套完全不同的光照模型。
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GradeShader, makeSharedUniforms } from './shaders.js';
import { LIGHTS, PALETTE } from '../config.js';

/* ── 星空 / 辉光背景 ── */
const BACKDROP_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BACKDROP_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uTop, uBottom, uGlow, uGlow2;
  uniform float uTime, uReal;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uBottom, uTop, smoothstep(0.18, 0.92, h));

    // 人物背后的一团品牌辉光
    float g1 = pow(max(0.0, dot(d, normalize(vec3(0.12, 0.10, -1.0)))), 5.0);
    col += uGlow * g1 * 0.85 * mix(0.8, 1.25, 1.0 - uReal);
    float g2 = pow(max(0.0, dot(d, normalize(vec3(-0.75, 0.30, 0.6)))), 7.0);
    col += uGlow2 * g2 * 0.55;

    // 星点：动漫态更密
    vec3 gp = floor(d * 260.0);
    float s = hash(gp);
    float star = smoothstep(0.9975, 1.0, s) * (0.4 + 0.6 * hash(gp + 3.7));
    col += vec3(0.75, 0.85, 1.0) * star * mix(1.4, 0.7, uReal);
    col += vec3(0.9, 0.8, 1.0) * smoothstep(0.9993, 1.0, hash(gp + 11.3)) * 1.6;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── 地面：网格 + 中心光池 + 接触投影 ── */
const FLOOR_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FLOOR_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uBase, uLine, uGlow;
  uniform float uTime, uReal;
  varying vec3 vWorld;

  void main() {
    vec2 xz = vWorld.xz;
    float r = length(xz);

    // 两层网格，线宽随距离自适应（避免依赖导数扩展）
    float w1 = 0.006 + r * 0.004;
    vec2 g1 = abs(fract(xz * 1.0) - 0.5);
    float line1 = smoothstep(w1, 0.0, g1.x) + smoothstep(w1, 0.0, g1.y);
    float w2 = 0.004 + r * 0.0018;
    vec2 g2 = abs(fract(xz * 0.2) - 0.5);
    float line2 = smoothstep(w2, 0.0, g2.x) + smoothstep(w2, 0.0, g2.y);

    float fade = 1.0 - smoothstep(2.2, 13.0, r);
    vec3 col = uBase;
    col += uLine * (line1 * 0.30 + line2 * 0.55) * fade;
    col += uGlow * exp(-r * r * 0.42) * 0.55;

    // 脚下接触阴影
    float sh = exp(-pow(r / 0.30, 2.0)) * 0.85;
    col *= 1.0 - sh;
    // 远处轻微上浮的雾
    col = mix(col, uBase * 0.7, smoothstep(6.0, 14.0, r));

    gl_FragColor = vec4(col, fade);
  }
`;

export function createStage({ canvas, quality }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false
  });
  renderer.setClearColor(new THREE.Color(PALETTE.bg0), 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 120);
  camera.position.set(0, 1.664, 0.46);

  const shared = makeSharedUniforms();

  // 背景穹顶
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.bg2) },
      uBottom: { value: new THREE.Color(PALETTE.bg0) },
      uGlow: { value: new THREE.Color(PALETTE.brand1) },
      uGlow2: { value: new THREE.Color(PALETTE.brand2) },
      uTime: shared.uTime,
      uReal: shared.uReal
    },
    vertexShader: BACKDROP_VERT,
    fragmentShader: BACKDROP_FRAG,
    side: THREE.BackSide,
    depthWrite: false
  });
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(60, 40, 24), backdropMat);
  backdrop.frustumCulled = false;
  scene.add(backdrop);

  // 地面
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(0x08080f) },
      uLine: { value: new THREE.Color(PALETTE.brand2) },
      uGlow: { value: new THREE.Color(PALETTE.brand1) },
      uTime: shared.uTime,
      uReal: shared.uReal
    },
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  scene.add(floor);

  /* 后处理 */
  const composerTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: quality.samples,
    colorSpace: THREE.LinearSRGBColorSpace
  });
  const composer = new EffectComposer(renderer, composerTarget);
  composer.addPass(new RenderPass(scene, camera));

  let bloomPass = null;
  if (quality.bloom) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), quality.bloomStrength, quality.bloomRadius, quality.bloomThreshold);
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());

  const gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);

  const size = { w: 1, h: 1, pr: 1 };

  function resize(w, h, pr) {
    size.w = w; size.h = h; size.pr = pr;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    gradePass.uniforms.uRes.value.set(w * pr, h * pr);
    if (bloomPass) bloomPass.resolution.set(w * pr, h * pr);
  }

  return {
    renderer, scene, camera, composer, shared, gradePass,
    backdrop, floor, size,
    resize,
    render() { composer.render(); }
  };
}
