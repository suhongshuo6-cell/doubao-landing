/**
 * 【可选模块专用配置】程序化数字人（dark 主题时期）
 *
 * 页面默认主角是 assets/character 下的立绘，本文件与
 * character.js / particles.js / geometry.js / shaders.js 一起构成
 * 「程序化数字人」可选模块，默认不会被加载（main.js 不 import 它们），
 * 因此对首屏体积零影响。保留是为了在需要时能一键切回代码生成的角色。
 *
 * 数学工具
 * 所有相机关键帧都是「世界坐标（米）」，角色站立、脚底 y=0、面朝 +Z。
 */

/** 头部基础尺寸（头为单位球变形而来，再把单位空间缩放成米） */
export const HEAD = {
  center: [0, 1.6625, 0],
  scale: [0.0872, 0.1175, 0.1065], // x: 左右宽 / y: 上下高 / z: 前后深
  eyeY: 0.02,   // 单位空间里的眼睛高度
  eyeX: 0.36,   // 单位空间里的眼睛左右偏移
  radius: 0.155 // 用于射线假体的近似半径（米）
};

export const PALETTE = {
  bg0: 0x06060b,
  bg1: 0x0b0b17,
  bg2: 0x14142e,
  brand1: 0x6d5ef8,
  brand2: 0x37c2ff,
  gold: 0xf5e6c8,
  skin: 0xf3cdb4,
  skinDeep: 0xd98f7c,
  skinSSS: 0xff8a72,
  hair: 0x14101c,
  hairHi: 0x8f7bd8,
  cloth: 0xeae4f5,
  eyeWhite: 0xf2f3f8,
  iris: 0x7a5cf0,
  lash: 0x120e18
};

export const QUALITY = {
  high:   { label: 'HIGH',   dpr: 2.0, samples: 4, bloom: true,  bloomStrength: 0.85, bloomRadius: 0.62, bloomThreshold: 0.72, particles: 7000, dust: 1400, hairStrands: 78, sweepSegs: 12, headSegs: [104, 76] },
  medium: { label: 'MEDIUM', dpr: 1.5, samples: 0, bloom: true,  bloomStrength: 0.68, bloomRadius: 0.55, bloomThreshold: 0.78, particles: 4200, dust: 800,  hairStrands: 54, sweepSegs: 10, headSegs: [80, 60] },
  low:    { label: 'LOW',    dpr: 1.0, samples: 0, bloom: false, bloomStrength: 0.40, bloomRadius: 0.45, bloomThreshold: 0.85, particles: 2000, dust: 360,  hairStrands: 34, sweepSegs: 8,  headSegs: [64, 48] }
};

export const LIGHTS = {
  key:  { dir: [0.55, 0.42, 0.72], color: 0xfff0e2, intensity: 1.30 },
  fill: { dir: [-0.72, -0.10, 0.45], color: 0x6d5ef8, intensity: 0.55 },
  rim:  { dir: [-0.35, 0.55, -0.75], color: 0x37c2ff, intensity: 1.65 },
  amb:  { color: 0x2a2440, intensity: 0.42 }
};

/* ───────── 数学工具 ───────── */
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));

/** 支持 a > b 的 smoothstep */
export function sstep(a, b, x) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function gauss(d, r) {
  const k = d / r;
  return Math.exp(-k * k);
}

export const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutQuint = t => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);

/** 帧率无关的阻尼插值 */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** 确定性伪随机（保证每次刷新画面一致） */
export function makeRandom(seed = 20261009) {
  let s = seed >>> 0;
  return function rand() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/** 网页动画常用的值噪声（1D/3D 够用） */
export function hash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}
export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c000 = hash3(ix, iy, iz), c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz), c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1), c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);
  return L(
    L(L(c000, c100, ux), L(c010, c110, ux), uy),
    L(L(c001, c101, ux), L(c011, c111, ux), uy),
    uz
  );
}
