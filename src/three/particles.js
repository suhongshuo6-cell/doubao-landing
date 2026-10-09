/**
 * 粒子系统：一套 shader 三种用法
 *  1) converge —— 7000 颗粒子从球壳飞入、汇聚成人形（开场）
 *  2) dust     —— 空气中缓慢漂浮的星尘
 *  3) burst    —— 蜕变扫光扫过时从人物表面炸开的火花
 */
import * as THREE from 'three';
import { sampleMeshes } from './geometry.js';
import { makeRandom, PALETTE } from '../config.js';

const VERT = /* glsl */`
  attribute vec3 aStart;
  attribute vec3 aTarget;
  attribute vec3 aDir;
  attribute vec3 aColor;
  attribute float aSeed;
  attribute float aSize;

  uniform float uProgress, uTime, uPixelRatio, uSize, uDrift, uBurst, uBurstY, uFade;
  varying vec3 vColor;
  varying float vAlpha;

  mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

  void main() {
    // ── 汇聚 ──
    float t = clamp((uProgress - aSeed * 0.32) / 0.68, 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);
    vec3 p = mix(aStart, aTarget, t);

    // 飞行途中绕轴旋绕 + 湍流
    float spin = (1.0 - t) * 6.2831853 * (aSeed - 0.5) * 2.0;
    p.xz = rot(spin) * p.xz;
    p += aDir * (1.0 - t) * 0.35;
    p += vec3(
      sin(uTime * 0.9 + aSeed * 41.0),
      cos(uTime * 1.1 + aSeed * 27.0),
      sin(uTime * 0.7 + aSeed * 33.0)
    ) * uDrift * (0.4 + (1.0 - t));

    // ── 星尘漂浮 ──
    p += vec3(
      sin(uTime * 0.23 + aSeed * 62.8),
      sin(uTime * 0.17 + aSeed * 31.4),
      cos(uTime * 0.19 + aSeed * 47.1)
    ) * uDrift * 1.4;

    // ── 爆发 ──
    if (uBurst > 0.0) {
      p += aDir * uBurst * (0.30 + aSeed * 0.55);
      p.y += uBurst * 0.22 * aSeed;
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = max(0.05, -mv.z);
    gl_PointSize = aSize * uSize * uPixelRatio / dist;

    float twinkle = 0.55 + 0.45 * sin(uTime * 2.4 + aSeed * 88.0);
    float appear = smoothstep(0.0, 0.18, uProgress) * (1.0 - smoothstep(0.72, 1.0, uProgress));
    float burstFade = uBurst > 0.0 ? (1.0 - uBurst) : 1.0;
    vAlpha = twinkle * uFade * burstFade * mix(1.0, appear, step(0.001, uProgress));
    vColor = aColor;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.02, d);
    a *= a;
    // 中心提亮，像发光的尘埃
    vec3 col = vColor + vec3(0.35) * pow(1.0 - d * 2.0, 3.0);
    gl_FragColor = vec4(col, a * vAlpha);
  }
`;

export function createParticleMaterial(pixelRatio = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uSize: { value: 26 },
      uDrift: { value: 0.01 },
      uBurst: { value: 0 },
      uBurstY: { value: 0 },
      uFade: { value: 1 }
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function buildGeometry(count, rand, { startRadius = 6, targets = null, dust = false, burst = false, spread = 1.6 }) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const start = new Float32Array(count * 3);
  const target = new Float32Array(count * 3);
  const dir = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const size = new Float32Array(count);

  const c1 = new THREE.Color(PALETTE.brand1);
  const c2 = new THREE.Color(PALETTE.brand2);
  const c3 = new THREE.Color(PALETTE.gold);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    // 目标点
    if (targets) {
      target[i3] = targets[i3];
      target[i3 + 1] = targets[i3 + 1];
      target[i3 + 2] = targets[i3 + 2];
    } else if (dust) {
      target[i3] = (rand() - 0.5) * 2.2 * spread;
      target[i3 + 1] = rand() * 2.0 + 0.05;
      target[i3 + 2] = (rand() - 0.5) * 2.0;
    } else {
      target[i3] = (rand() - 0.5) * 1.2;
      target[i3 + 1] = rand() * 1.9;
      target[i3 + 2] = (rand() - 0.5) * 1.2;
    }
    pos[i3] = target[i3]; pos[i3 + 1] = target[i3 + 1]; pos[i3 + 2] = target[i3 + 2];

    // 起点：球壳
    const th = Math.acos(1 - 2 * rand());
    const ph = rand() * Math.PI * 2;
    const r = startRadius * (0.75 + rand() * 0.55);
    start[i3] = r * Math.sin(th) * Math.cos(ph);
    start[i3 + 1] = r * Math.cos(th) * 0.7 + 1.0;
    start[i3 + 2] = r * Math.sin(th) * Math.sin(ph);

    // 方向（爆发 / 湍流）
    const dh = Math.acos(1 - 2 * rand());
    const dp = rand() * Math.PI * 2;
    dir[i3] = Math.sin(dh) * Math.cos(dp);
    dir[i3 + 1] = Math.cos(dh) * 0.6 + 0.35;
    dir[i3 + 2] = Math.sin(dh) * Math.sin(dp);

    const k = rand();
    const col = k > 0.86 ? c3 : k > 0.45 ? c2 : c1;
    color[i3] = col.r; color[i3 + 1] = col.g; color[i3 + 2] = col.b;

    seed[i] = rand();
    size[i] = burst ? 0.6 + rand() * 1.6 : dust ? 0.5 + rand() * 1.4 : 0.8 + rand() * 2.0;
  }

  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  g.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
  g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 12);
  return g;
}

export function buildParticles({ quality, characterGroup, pixelRatio = 1 }) {
  const rand = makeRandom(778899);
  const mat = createParticleMaterial(pixelRatio);
  const group = new THREE.Group();

  // 采样人物表面作为汇聚目标
  characterGroup.updateMatrixWorld(true);
  const meshes = [];
  characterGroup.traverse(o => { if (o.isMesh && o.name !== 'eyeball') meshes.push(o); });
  const targets = sampleMeshes(meshes, quality.particles, rand);

  const convergeGeo = buildGeometry(quality.particles, rand, { targets, startRadius: 7 });
  const converge = new THREE.Points(convergeGeo, mat);
  converge.frustumCulled = false;
  group.add(converge);

  const dustMat = mat.clone();
  dustMat.uniforms.uSize.value = 14;
  const dustGeo = buildGeometry(quality.dust, rand, { dust: true });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  const burstMat = mat.clone();
  burstMat.uniforms.uSize.value = 34;
  const burstGeo = buildGeometry(Math.round(quality.particles * 0.16), rand, { burst: true, spread: 0.5 });
  const burst = new THREE.Points(burstGeo, burstMat);
  burst.frustumCulled = false;
  burst.visible = false;
  group.add(burst);

  return {
    group,
    setPixelRatio(v) { mat.uniforms.uPixelRatio.value = v; dustMat.uniforms.uPixelRatio.value = v; burstMat.uniforms.uPixelRatio.value = v; },
    update(t) {
      mat.uniforms.uTime.value = t;
      dustMat.uniforms.uTime.value = t;
      burstMat.uniforms.uTime.value = t;
      dustMat.uniforms.uDrift.value = 0.016;
    },
    setConverge(p) { mat.uniforms.uProgress.value = p; },
    setConvergeFade(v) { mat.uniforms.uFade.value = v; },
    setDustFade(v) { dustMat.uniforms.uFade.value = v; },
    fireBurst(y) {
      burstMat.uniforms.uBurstY.value = y;
      burstMat.uniforms.uBurst.value = 0.0001;
      burst.visible = true;
    },
    updateBurst(v) {
      burstMat.uniforms.uBurst.value = v;
      if (v >= 1) burst.visible = false;
    }
  };
}
