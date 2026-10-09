/**
 * 程序化数字人：头部（单位球变形 + 眼窝挖孔）、眼球、睫毛线、眉、发、
 * 颈 / 躯干 / 手臂 / 手指 / 腿 / 脚趾 / 服装，全部由代码生成，零外部模型。
 *
 * 单位空间约定（头部）：头高 = 2（下巴 y=-1，颅顶 y=+1），脸朝 +Z，x 为左右。
 * 世界空间：脚底 y = 0，头顶 y ≈ 1.785，面朝 +Z。
 */
import * as THREE from 'three';
import { sweep, loft, rings } from './geometry.js';
import {
  makeSkinMaterial, makeEyeMaterial, makeHairMaterial,
  makeFabricMaterial, makeOutlineMaterial
} from './shaders.js';
import { HEAD, PALETTE, makeRandom, sstep, clamp } from '../legacy-config.js';   // 可选模块专用配置（页面默认不加载）

/* ══════════════ 头部单位空间变形 ══════════════ */

// [cx, cy, rx, ry, 位移量, 权重x, 权重y, 权重z]
const FEATURES = [
  [0, 0.06, 0.085, 0.19, 0.032, 1, 1, 1],       // 鼻梁
  [0, -0.19, 0.092, 0.24, 0.072, 1, 1, 1],      // 鼻背
  [0, -0.32, 0.108, 0.080, 0.050, 1, 1, 1],     // 鼻头
  [0.113, -0.343, 0.068, 0.048, 0.030, 1, 1, 1],  // 鼻翼
  [-0.113, -0.343, 0.068, 0.048, 0.030, 1, 1, 1],
  [0, -0.452, 0.040, 0.044, -0.014, 1, 1, 1],   // 人中
  [0, -0.538, 0.152, 0.050, 0.027, 1, 1, 1],    // 上唇
  [0, -0.612, 0.138, 0.058, 0.023, 1, 1, 1],    // 下唇
  [0, -0.575, 0.142, 0.019, -0.011, 1, 1, 1],   // 唇缝
  [0, -0.760, 0.130, 0.105, 0.026, 1, 1, 1],    // 下巴
  [0.36, 0.05, 0.300, 0.105, -0.050, 0.28, 1, 1],  // 左眼窝（横向拉长、纵向收紧 → 杏仁形）
  [-0.36, 0.05, 0.300, 0.105, -0.050, 0.28, 1, 1],  // 右眼窝
  [0.36, 0.112, 0.290, 0.052, 0.055, 1, 1, 1],  // 上眼睑：向前盖住眼球上部 → 决定眼裂上缘
  [-0.36, 0.112, 0.290, 0.052, 0.055, 1, 1, 1],
  [0.36, -0.012, 0.280, 0.050, 0.045, 1, 1, 1], // 下眼睑：决定眼裂下缘
  [-0.36, -0.012, 0.280, 0.050, 0.045, 1, 1, 1],
  [0.36, 0.190, 0.240, 0.046, 0.018, 1, 1, 1],  // 双眼皮褶
  [-0.36, 0.190, 0.240, 0.046, 0.018, 1, 1, 1],
  [0.36, 0.255, 0.275, 0.080, 0.026, 1, 1, 1],  // 眉骨
  [-0.36, 0.255, 0.275, 0.080, 0.026, 1, 1, 1],
  [0.50, -0.15, 0.250, 0.190, 0.026, 1, 1, 1],  // 颧骨
  [-0.50, -0.15, 0.250, 0.190, 0.026, 1, 1, 1],
  [0.30, -0.32, 0.230, 0.180, 0.026, 1, 1, 1],  // 苹果肌
  [-0.30, -0.32, 0.230, 0.180, 0.026, 1, 1, 1],
  [0.52, -0.46, 0.210, 0.190, 0.014, 1, 1, 1],  // 下颌角
  [-0.52, -0.46, 0.210, 0.190, 0.014, 1, 1, 1],
  [0.60, 0.28, 0.190, 0.230, -0.016, 1, 1, 1],  // 太阳穴
  [-0.60, 0.28, 0.190, 0.230, -0.016, 1, 1, 1]
];

const _p = new THREE.Vector3();

/** 单位空间头部变形（nx,ny,nz 为单位球上的点），返回变形后的点 */
export function deformHead(nx, ny, nz, out = new THREE.Vector3()) {
  let x = nx * 0.86;
  let y = ny * 1.0;
  let z = nz * 0.94;

  // 下颌收窄
  const jaw = sstep(0.06, -0.82, y);
  x *= 1 - 0.40 * jaw;
  z *= 1 - 0.12 * jaw;
  // 后脑压扁
  z *= 1 - 0.13 * Math.max(0, -nz);
  // 面部整体压平（球面 → 脸平面）
  const front = clamp(z / 0.94);
  z *= 1 - 0.10 * front * front;
  // 下巴前推
  z += 0.055 * jaw * front;

  // 椭球外法线
  const ex = x / (0.86 * 0.86), ey = y / 1.0, ez = z / (0.94 * 0.94);
  const el = Math.hypot(ex, ey, ez) || 1;
  const nX = ex / el, nY = ey / el, nZ = ez / el;

  // 正面遮罩：所有五官特征只在脸这一侧生效
  const mask = sstep(-0.25, 0.35, nz);

  let dx = 0, dy = 0, dz = 0;
  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i];
    const ddx = (x - f[0]) / f[2];
    const ddy = (y - f[1]) / f[3];
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 > 9) continue;
    const w = Math.exp(-d2) * mask * f[4];
    dx += nX * w * f[5];
    dy += nY * w * f[6];
    dz += nZ * w * f[7];
  }

  return out.set(x + dx, y + dy, z + dz);
}

/** 单位空间 → 世界坐标 */
export function headToWorld(p, out = new THREE.Vector3()) {
  return out.set(
    HEAD.center[0] + p.x * HEAD.scale[0],
    HEAD.center[1] + p.y * HEAD.scale[1],
    HEAD.center[2] + p.z * HEAD.scale[2]
  );
}

/** 给定单位空间正面坐标 (nx, ny) 求脸部表面的世界坐标 */
export function faceSurfacePoint(nx, ny, out = new THREE.Vector3()) {
  const nz = Math.sqrt(Math.max(0.0001, 1 - nx * nx - ny * ny));
  return headToWorld(deformHead(nx, ny, nz, _p), out);
}

/* ══════════════ 眼睛几何参数 ══════════════ */
/**
 * 眼睛参数。眼裂（挖孔）尺寸不是随便定的：
 * 眼球是半径 R 的球，在脸部平面处它的横截面半径只有 sqrt(R²-d²)（d = 球心到脸平面的距离），
 * 挖孔必须小于这个横截面，否则眼眶边缘会漏出脑袋内部。
 * 当前：R=14.5mm、d≈11mm → 脸平面处横截面半径约 9.5mm，孔半宽 10.9mm 仍被完整盖住，
 * 且角膜顶点只比脸面凸出约 3mm（真人约 1~2mm，略夸张但仍在"好看"的范围内）。
 */
export const EYE = {
  nx: 0.36,
  ny: 0.05,
  radius: 0.0145,      // 眼球半径（米），略大于真人，偏二次元审美
  protrude: 0.0075,    // 球心相对眼窝表面的前后偏移
  openW: 0.125,        // 眼裂半宽（单位空间）≈ 10.9mm
  openH: 0.045,        // 眼裂半高（单位空间）≈ 5.3mm
  ipd: 0.064,          // 瞳距（米）
  gaze: new THREE.Vector3(0, 0, 1)
};

/**
 * 眼裂场：<1 在开口内，=1 在边界上。
 * 必须先用 dot(v, g) 排除"眼心背面"的点 —— 否则与眼心对跖的那片后脑勺
 * 切向距离同样接近 0，会被误判成眼裂一起挖掉。
 */
export function eyeField(px, py, pz, ref) {
  const vx = px - ref.p.x, vy = py - ref.p.y, vz = pz - ref.p.z;
  const front = vx * ref.g.x + vy * ref.g.y + vz * ref.g.z;
  if (front < ref.radius * 0.15) return 99;
  const a = vx * ref.t1.x + vy * ref.t1.y + vz * ref.t1.z;
  const b = vx * ref.t2.x + vy * ref.t2.y + vz * ref.t2.z;
  return Math.hypot(a / EYE.openW, b / EYE.openH);
}

/* ══════════════ 主构建函数 ══════════════ */
export function buildCharacter({ quality, shared, lights, res = null }) {
  const rand = makeRandom(20261009);
  const group = new THREE.Group();
  group.name = 'doubao';
  const meshes = [];
  const outlineMeshes = [];
  const Q = quality;

  const matHead = makeSkinMaterial({ shared, lights, pinched: true, anime: 0xf6c6a4, real: 0xf4d0b8, deep: 0xe5705c, gloss: 0.95 });
  matHead.uniforms.uPore.value = 0.55;
  const matBody = makeSkinMaterial({ shared, lights, pinched: false, anime: 0xf3c3a2, real: 0xf2cdb6, deep: 0xe26d5a, gloss: 0.7 });
  matBody.uniforms.uBlush.value = 0.0;
  const matEye = makeEyeMaterial({ lights, gaze: [0, 0, 1] });
  const matHair = makeHairMaterial({ shared, lights });
  const matCloth = makeFabricMaterial({ shared, lights });
  const matOutline = makeOutlineMaterial({ shared, lights, px: 2.1, res });

  function add(geo, mat, { outline = false, name = '', tf = null } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (tf) tf(m);
    group.add(m);
    meshes.push(m);
    if (outline) {
      const o = new THREE.Mesh(geo, matOutline);
      if (tf) tf(o);
      o.name = name + ':outline';
      group.add(o);
      outlineMeshes.push(o);
    }
    return m;
  }

  /* ───────── 头部 ───────── */
  const [hw, hh] = Q.headSegs;
  const headGeo = new THREE.SphereGeometry(1, hw, hh);
  {
    const pos = headGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      deformHead(n.x, n.y, n.z, v);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  }

  // 眼窝参考点（用于挖孔 + 放置眼球）
  const eyeRefUnit = [];
  for (const sign of [1, -1]) {
    const nx = EYE.nx * sign;
    const nz = Math.sqrt(Math.max(0.0001, 1 - nx * nx - EYE.ny * EYE.ny));
    const p = deformHead(nx, EYE.ny, nz, new THREE.Vector3());
    const g = p.clone().normalize();                       // 朝外方向
    const t1 = new THREE.Vector3(0, 1, 0).cross(g).normalize(); // 横向
    const t2 = new THREE.Vector3().crossVectors(g, t1);    // 纵向
    eyeRefUnit.push({ sign, p, g, t1, t2, radius: EYE.radius / HEAD.scale[2] });
  }

  // 挖眼裂：整块落在开口内的三角面删掉，边缘顶点吸附到边界上
  {
    const pos = headGeo.attributes.position;
    const idx = headGeo.index;
    const keep = [];
    const v = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      let inside = false;
      for (const ref of eyeRefUnit) {
        let all = true;
        for (let k = 0; k < 3; k++) {
          v.fromBufferAttribute(pos, idx.getX(t + k));
          if (eyeField(v.x, v.y, v.z, ref) >= 1) { all = false; break; }
        }
        if (all) { inside = true; break; }
      }
      if (!inside) keep.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
    }
    // 边界顶点吸附
    const snap = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      for (const ref of eyeRefUnit) {
        const f = eyeField(v.x, v.y, v.z, ref);
        if (f > 0.82 && f < 1.0) {
          const vx = v.x - ref.p.x, vy = v.y - ref.p.y, vz = v.z - ref.p.z;
          const a = vx * ref.t1.x + vy * ref.t1.y + vz * ref.t1.z;
          const b = vx * ref.t2.x + vy * ref.t2.y + vz * ref.t2.z;
          const g2 = vx * ref.g.x + vy * ref.g.y + vz * ref.g.z;
          const k = 1 / f;
          snap.set(
            ref.p.x + ref.t1.x * a * k + ref.t2.x * b * k + ref.g.x * g2,
            ref.p.y + ref.t1.y * a * k + ref.t2.y * b * k + ref.g.y * g2,
            ref.p.z + ref.t1.z * a * k + ref.t2.z * b * k + ref.g.z * g2
          );
          pos.setXYZ(i, snap.x, snap.y, snap.z);
          v.copy(snap);
        }
      }
    }
    headGeo.setIndex(keep);
    pos.needsUpdate = true;
    headGeo.computeVertexNormals();
    headGeo.computeBoundingSphere();
  }

  const headMesh = add(headGeo, matHead, {
    outline: true,
    name: 'head',
    tf: m => { m.scale.set(...HEAD.scale); m.position.set(...HEAD.center); }
  });

  /* ───────── 眼球 + 眼睑线 ───────── */
  const eyeMeshes = [];
  for (const ref of eyeRefUnit) {
    const surf = headToWorld(ref.p);
    const center = new THREE.Vector3(
      ref.sign * EYE.ipd * 0.5,          // 显式控制瞳距，不受眼窝凹陷牵连
      surf.y,
      surf.z + EYE.protrude - EYE.radius
    );
    EYE.center = center;

    const ball = new THREE.Mesh(new THREE.SphereGeometry(EYE.radius, 40, 28), matEye);
    ball.position.copy(center);
    ball.name = 'eyeball';
    group.add(ball);
    meshes.push(ball);
    eyeMeshes.push(ball);

    // 睫毛线：不按设计椭圆画，而是**数值求解"头表面钻到眼球后面"的真实交线**，
    // 这样睫毛必然压在眼眶边缘上，不会陷进眼球里被挡住。
    const zc = center.z;
    const rimPoint = (a) => {
      const dx = ref.t1.x * Math.cos(a) + ref.t2.x * Math.sin(a);
      const dy = ref.t1.y * Math.cos(a) + ref.t2.y * Math.sin(a);
      const dz = ref.t1.z * Math.cos(a) + ref.t2.z * Math.sin(a);
      const insideAt = (off) => {
        const n = new THREE.Vector3(
          ref.p.x + dx * off, ref.p.y + dy * off, ref.p.z + dz * off
        ).normalize();
        const q = deformHead(n.x, n.y, n.z, new THREE.Vector3());
        const w = headToWorld(q);
        const ux = w.x - center.x, uy = w.y - surf.y;
        const u2 = ux * ux + uy * uy;
        if (u2 >= EYE.radius * EYE.radius) return false;
        return zc + Math.sqrt(EYE.radius * EYE.radius - u2) > w.z;
      };
      let lo = 0, hi = 0.34;
      if (!insideAt(0)) return null;
      for (let i = 0; i < 20; i++) {
        const m = (lo + hi) * 0.5;
        if (insideAt(m)) lo = m; else hi = m;
      }
      const off = lo * 1.04;                      // 落到眼眶外侧的脸面上
      const n = new THREE.Vector3(
        ref.p.x + dx * off, ref.p.y + dy * off, ref.p.z + dz * off
      ).normalize();
      return headToWorld(deformHead(n.x, n.y, n.z, new THREE.Vector3()));
    };

    const lashPts = [], lashR = [];
    const N = 46;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const w = rimPoint(a);
      if (!w) continue;
      lashPts.push([w.x, w.y, w.z]);
      const up = clamp(Math.sin(a) * 0.5 + 0.5);
      const corner = Math.pow(Math.abs(Math.cos(a)), 0.7);
      lashR.push(0.00055 + up * 0.0019 * (1 - corner * 0.5) + 0.00035);
    }
    add(sweep(lashPts, lashR, { seg: 5, round: 0.15 }), matHair, { name: 'eyelash' });
  }

  /* ───────── 眉毛 ───────── */
  for (const sign of [1, -1]) {
    const pts = [], rr = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const nx = sign * (0.19 + t * 0.42);
      const ny = 0.255 + Math.sin(t * Math.PI) * 0.075 - t * t * 0.06;
      const p = faceSurfacePoint(nx, ny).clone();
      p.z += 0.0026;
      p.y += 0.0006;
      pts.push([p.x, p.y, p.z]);
      rr.push(0.0030 * (1 - Math.pow(Math.abs(t - 0.35) * 1.5, 2) * 0.75) + 0.0006);
    }
    add(sweep(pts, rr, { seg: 6, round: 0.5 }), matHair, { name: 'brow' });
  }

  /* ───────── 头发 ───────── */
  const hairGroup = new THREE.Group();
  group.add(hairGroup);
  const hairStrands = [];
  {
    // 发帽：比头略大一圈的壳，挖掉脸的部分
    const capGeo = new THREE.SphereGeometry(1.028, Math.round(hw * 0.7), Math.round(hh * 0.7));
    const pos = capGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      deformHead(n.x, n.y, n.z, v);
      v.multiplyScalar(1.035);
      // 后脑勺往后下方拉一点，形成发量
      v.z -= 0.06 * Math.max(0, -n.z) * (1 - Math.abs(n.y));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    const idx = capGeo.index;
    const keep = [];
    for (let t = 0; t < idx.count; t += 3) {
      let drop = true;
      for (let k = 0; k < 3; k++) {
        const n = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(t + k)).normalize();
        const face = sstep(0.10, 0.62, n.z) * (1 - sstep(0.30, 0.72, n.y)) * (1 - sstep(0.52, 0.86, Math.abs(n.x)));
        if (face < 0.45) { drop = false; break; }
      }
      if (!drop) keep.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
    }
    capGeo.setIndex(keep);
    capGeo.computeVertexNormals();
    const cap = add(capGeo, matHair, {
      outline: false,
      name: 'haircap',
      tf: m => { m.scale.set(...HEAD.scale); m.position.set(...HEAD.center); }
    });
    hairStrands.push(cap);
  }

  // 发丝
  const strandCount = Q.hairStrands;
  const seg = Q.sweepSegs;
  const strandPts = [];
  for (let i = 0; i < strandCount; i++) {
    const isBang = i < Math.round(strandCount * 0.22);
    const isLock = i >= Math.round(strandCount * 0.22) && i < Math.round(strandCount * 0.34);
    const k = i / strandCount;
    let theta, phi, len, r0, r1;

    if (isBang) {
      // 刘海：从发际线往前额铺下来
      theta = 0.42 + rand() * 0.30;
      phi = (k / 0.22 - 0.5) * 2.6 + (rand() - 0.5) * 0.18;
      len = 0.10 + rand() * 0.05;
      r0 = 0.0085; r1 = 0.0022;
    } else if (isLock) {
      // 脸侧两缕
      theta = 0.82 + rand() * 0.22;
      phi = (rand() > 0.5 ? 1 : -1) * (1.02 + rand() * 0.25);
      len = 0.30 + rand() * 0.08;
      r0 = 0.011; r1 = 0.002;
    } else {
      // 长直发
      theta = 0.55 + rand() * 1.25;
      phi = Math.PI + (rand() - 0.5) * 2.5;
      len = 0.52 + rand() * 0.16;
      r0 = 0.0135; r1 = 0.0028;
    }

    const dir = new THREE.Vector3(
      Math.sin(theta) * Math.sin(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.cos(phi)
    );
    const nz = Math.max(0.05, dir.z);
    const root = headToWorld(deformHead(dir.x, dir.y, dir.z, new THREE.Vector3()));
    root.x *= 1.035; root.z = HEAD.center[2] + (root.z - HEAD.center[2]) * 1.035;
    root.y = HEAD.center[1] + (root.y - HEAD.center[1]) * 1.035;

    // 三段控制点：根部 → 中段（外扩下垂）→ 梢部
    const outward = new THREE.Vector3(root.x - HEAD.center[0], 0, root.z - HEAD.center[2]);
    if (outward.lengthSq() < 1e-6) outward.set(0, 0, -1);
    outward.normalize();

    const mid = root.clone()
      .addScaledVector(outward, isBang ? 0.004 : 0.022)
      .add(new THREE.Vector3(0, -len * 0.42, isBang ? 0.006 : -0.004));
    const tip = mid.clone()
      .addScaledVector(outward, isBang ? 0.004 : 0.030)
      .add(new THREE.Vector3(0, -len * 0.58, isBang ? 0.012 : 0.006));
    if (isBang) tip.y = Math.max(tip.y, HEAD.center[1] - 0.02);

    // Catmull-Rom 采样
    const curve = new THREE.CatmullRomCurve3([root, mid, tip], false, 'catmullrom', 0.4);
    const n = seg;
    const pts = [], rr = [];
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const p = curve.getPoint(t);
      pts.push([p.x, p.y, p.z]);
      rr.push(r0 + (r1 - r0) * Math.pow(t, 0.75));
    }
    strandPts.push([pts, rr]);
  }
  for (const [pts, rr] of strandPts) {
    const g = sweep(pts, rr, { seg: 6, round: 0.9 });
    const m = new THREE.Mesh(g, matHair);
    m.name = 'strand';
    hairGroup.add(m);
    meshes.push(m);
    hairStrands.push(m);
  }
  // 发丝不参与描边（数量太多），但发帽参与
  {
    const capGeo2 = hairStrands[0].geometry;
    const o = new THREE.Mesh(capGeo2, matOutline);
    o.scale.set(...HEAD.scale);
    o.position.set(...HEAD.center);
    group.add(o);
    outlineMeshes.push(o);
  }

  /* ───────── 颈 / 躯干 ───────── */
  const neckPts = [
    [0, 1.400, -0.004], [0, 1.450, -0.002], [0, 1.500, 0.000], [0, 1.556, 0.004]
  ];
  add(sweep(neckPts, [0.062, 0.055, 0.052, 0.056], { seg: 20, round: 0.25 }), matBody, { name: 'neck' });

  // 胸型调制（该 loft 的标架 ax=-X, az=-Z，所以正面是 sin(a) = -1）
  const bustShape = (a, i, s) => {
    const lat = Math.cos(a), fr = -Math.sin(a);
    const profile = Math.exp(-Math.pow((s.y - 1.250) / 0.075, 2));
    const g1 = Math.exp(-(((lat - 0.40) ** 2) + ((fr - 0.90) ** 2)) / 0.030);
    const g2 = Math.exp(-(((lat + 0.40) ** 2) + ((fr - 0.90) ** 2)) / 0.030);
    return 1 + 0.19 * (g1 + g2) * profile;
  };
  const torso = [
    { y: 0.830, rx: 0.150, ry: 0.112, cz: 0.004 },
    { y: 0.900, rx: 0.149, ry: 0.106, cz: 0.004 },
    { y: 0.960, rx: 0.135, ry: 0.096, cz: 0.002 },
    { y: 1.012, rx: 0.118, ry: 0.086, cz: 0.000 },
    { y: 1.062, rx: 0.116, ry: 0.085, cz: 0.000 },
    { y: 1.120, rx: 0.126, ry: 0.092, cz: 0.002 },
    { y: 1.180, rx: 0.138, ry: 0.100, cz: 0.004 },
    { y: 1.245, rx: 0.149, ry: 0.110, cz: 0.004 },
    { y: 1.312, rx: 0.150, ry: 0.104, cz: 0.002 },
    { y: 1.372, rx: 0.153, ry: 0.098, cz: 0.000 },
    { y: 1.422, rx: 0.164, ry: 0.093, cz: -0.004 },
    { y: 1.452, rx: 0.150, ry: 0.086, cz: -0.006 },
    { y: 1.474, rx: 0.104, ry: 0.076, cz: -0.004 },
    { y: 1.492, rx: 0.064, ry: 0.060, cz: 0.000 }
  ];
  add(loft(torso, { seg: 40, shape: bustShape }), matBody, { outline: true, name: 'torso' });

  /* ───────── 手臂 + 手 ───────── */
  for (const sign of [1, -1]) {
    const arm = [
      [0.148 * sign, 1.432, 0.000], [0.186 * sign, 1.372, 0.004], [0.206 * sign, 1.292, 0.010],
      [0.216 * sign, 1.216, 0.014], [0.221 * sign, 1.158, 0.018], [0.229 * sign, 1.088, 0.024],
      [0.239 * sign, 1.008, 0.030], [0.247 * sign, 0.944, 0.034]
    ];
    const armR = [[0.057, 0.052], [0.053, 0.049], [0.046, 0.043], [0.041, 0.038],
      [0.039, 0.036], [0.037, 0.034], [0.033, 0.030], [0.028, 0.026]];
    add(sweep(arm, armR, { seg: 14, round: 0.5 }), matBody, { outline: true, name: 'arm' });

    // 手掌（扁椭圆）
    const wrist = new THREE.Vector3(0.247 * sign, 0.944, 0.034);
    const palmEnd = wrist.clone().add(new THREE.Vector3(0.006 * sign, -0.062, 0.004));
    const palmPts = [
      [wrist.x, wrist.y, wrist.z],
      [wrist.x + 0.003 * sign, wrist.y - 0.024, wrist.z + 0.002],
      [palmEnd.x, palmEnd.y, palmEnd.z]
    ];
    add(sweep(palmPts, [[0.030, 0.014], [0.033, 0.015], [0.032, 0.0135]], { seg: 12, round: 0.35 }), matBody, { name: 'palm' });

    // 五指
    const fingers = [
      { dx: -0.030, dz: 0.006, len: 0.058, r: 0.0082, spread: -0.35, curl: 0.30 },
      { dx: -0.016, dz: 0.000, len: 0.074, r: 0.0074, spread: -0.10, curl: 0.20 },
      { dx: -0.001, dz: 0.002, len: 0.080, r: 0.0076, spread: 0.02, curl: 0.18 },
      { dx: 0.014, dz: 0.000, len: 0.073, r: 0.0070, spread: 0.13, curl: 0.20 },
      { dx: 0.028, dz: -0.002, len: 0.058, r: 0.0060, spread: 0.26, curl: 0.26 }
    ];
    for (let fi = 0; fi < fingers.length; fi++) {
      const f = fingers[fi];
      const base = palmEnd.clone().add(new THREE.Vector3(f.dx * sign, -0.004, f.dz));
      const p = [], rr = [];
      const steps = 4;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const curl = f.curl * t * t;
        p.push([
          base.x + f.spread * sign * f.len * t * 0.35,
          base.y - f.len * t * (1 - curl * 0.28),
          base.z + f.len * t * curl * 0.85
        ]);
        rr.push(f.r * (1 - t * 0.32));
      }
      // 拇指偏内前
      if (fi === 0) {
        p.forEach((q, j) => { q[2] += j * 0.0022; q[0] += sign * j * 0.0012; });
      }
      add(sweep(p, rr, { seg: 8, round: 1.0 }), matBody, { name: 'finger' });
    }
  }

  /* ───────── 腿 ───────── */
  for (const sign of [1, -1]) {
    const leg = [
      [0.088 * sign, 0.935, 0.000], [0.086 * sign, 0.820, 0.004], [0.082 * sign, 0.700, 0.008],
      [0.080 * sign, 0.580, 0.006], [0.078 * sign, 0.482, 0.002], [0.078 * sign, 0.432, 0.000],
      [0.078 * sign, 0.372, -0.004], [0.076 * sign, 0.282, -0.004], [0.074 * sign, 0.172, -0.002],
      [0.072 * sign, 0.092, 0.000]
    ];
    const legR = [[0.100, 0.098], [0.093, 0.092], [0.083, 0.082], [0.072, 0.072],
      [0.058, 0.058], [0.054, 0.054], [0.057, 0.058], [0.048, 0.050],
      [0.037, 0.038], [0.030, 0.031]];
    add(sweep(leg, legR, { seg: 16, round: 0.4 }), matBody, { outline: true, name: 'leg' });
  }

  /* ───────── 脚（平底剖面） ───────── */
  for (const sign of [1, -1]) {
    // 平底剖面：下半圈压扁，脚掌自然贴地（y=0 为地面）
    const footSections = [
      { u: -0.052, rx: 0.031, ry: 0.037, cz: 0.0215 },
      { u: -0.014, rx: 0.036, ry: 0.040, cz: 0.0220 },
      { u: 0.026, rx: 0.038, ry: 0.034, cz: 0.0185 },
      { u: 0.066, rx: 0.040, ry: 0.026, cz: 0.0145 },
      { u: 0.100, rx: 0.038, ry: 0.018, cz: 0.0115 },
      { u: 0.122, rx: 0.029, ry: 0.011, cz: 0.0095 }
    ].map(s => ({ ...s, cx: 0.072 * sign }));
    const footGeo = rings(footSections, 18, {
      axis: [0, 0, 1], ax: [-1, 0, 0], az: [0, 1, 0],
      profile: (a) => [Math.cos(a), Math.sin(a) >= 0 ? Math.sin(a) : Math.sin(a) * 0.52]
    });
    add(footGeo, matBody, { name: 'foot' });

    // 脚趾
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = 0.072 * sign + (0.030 - t * 0.058) * sign;
      const y = 0.0142 + Math.sin(t * Math.PI) * 0.0018;
      const z = 0.116 + (1 - Math.abs(t - 0.2) * 0.9) * 0.014;
      const r = 0.0092 - t * 0.0032;
      add(sweep([[x, y, z], [x, y - 0.0004, z + r * 1.5], [x, y - 0.0016, z + r * 2.6]], [r, r * 0.95, r * 0.7], { seg: 8, round: 1.0 }), matBody, { name: 'toe' });
    }
    // 脚跟过渡
    add(sweep([[0.072 * sign, 0.092, -0.006], [0.072 * sign, 0.080, -0.030], [0.072 * sign, 0.070, -0.050]],
      [[0.030, 0.031], [0.032, 0.034], [0.031, 0.033]], { seg: 12, round: 0.8 }), matBody, { name: 'heel' });
  }

  /* ───────── 服装：短款针织上衣 + 高腰短裤 ───────── */
  const topShape = (a, i, s) => bustShape(a, i, { y: s.y });
  const top = [
    { y: 1.238, rx: 0.156, ry: 0.116, cz: 0.004 },
    { y: 1.290, rx: 0.158, ry: 0.112, cz: 0.003 },
    { y: 1.348, rx: 0.160, ry: 0.104, cz: 0.001 },
    { y: 1.404, rx: 0.168, ry: 0.099, cz: -0.002 },
    { y: 1.446, rx: 0.160, ry: 0.093, cz: -0.004 },
    { y: 1.474, rx: 0.116, ry: 0.083, cz: -0.004 },
    { y: 1.494, rx: 0.072, ry: 0.066, cz: 0.000 }
  ];
  add(loft(top, { seg: 40, shape: topShape }), matCloth, { outline: true, name: 'top' });
  // 肩带
  for (const sign of [1, -1]) {
    add(sweep([
      [0.052 * sign, 1.478, 0.030], [0.085 * sign, 1.470, 0.012],
      [0.115 * sign, 1.448, -0.010], [0.140 * sign, 1.424, -0.032]
    ], [0.013, 0.012, 0.012, 0.013], { seg: 8, round: 0.5 }), matCloth, { name: 'strap' });
  }
  // 高腰短裤（两条裤腿在中线重叠，视觉上连成一体）
  for (const sign of [1, -1]) {
    const shorts = [
      { y: 0.786, rx: 0.094, ry: 0.088, cx: 0.078 * sign, cz: 0.002 },
      { y: 0.836, rx: 0.100, ry: 0.094, cx: 0.072 * sign, cz: 0.003 },
      { y: 0.892, rx: 0.106, ry: 0.100, cx: 0.062 * sign, cz: 0.004 },
      { y: 0.946, rx: 0.104, ry: 0.098, cx: 0.054 * sign, cz: 0.003 },
      { y: 0.996, rx: 0.092, ry: 0.088, cx: 0.052 * sign, cz: 0.001 },
      { y: 1.042, rx: 0.076, ry: 0.076, cx: 0.050 * sign, cz: 0.000 }
    ];
    add(loft(shorts, { seg: 26 }), matCloth, { outline: true, name: 'shorts' });
  }

  /* ───────── 汇总 ───────── */
  const api = {
    group,
    meshes,
    outlineMeshes,
    materials: { head: matHead, body: matBody, eye: matEye, hair: matHair, cloth: matCloth, outline: matOutline },
    headMesh,
    eyeMeshes,
    hairStrands,
    /** 每帧更新：时间 / 呼吸 / 摆动 / 视线 */
    update(t, { breath = 0, sway = 0, gaze = null, windAuto = true } = {}) {
      matHead.uniforms.uBreath.value = breath * 0.0009;
      matBody.uniforms.uBreath.value = breath * 0.0016;
      matBody.uniforms.uSway.value = sway;
      matHair.uniforms.uSway.value = sway * 2.2;
      matEye.uniforms.uTime.value = t;
      if (gaze) matEye.uniforms.uGaze.value.copy(gaze).normalize();
    }
  };
  return api;
}
