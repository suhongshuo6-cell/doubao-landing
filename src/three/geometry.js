/**
 * 程序化几何工具：把「折线 + 半径」扫成管（sweep），或把「横截面」串成放样体（loft）。
 * 角色的四肢、手指、发丝、眉毛全部由此生成 —— 不依赖任何外部模型文件。
 *
 * 约定：环的局部基 ax / az 满足  ax × az = -t（t 为前进方向），
 * 这样按固定的三角形绕序生成的面永远朝外（外法线 = 径向）。
 */
import * as THREE from 'three';

/** 把一串环缝合成 BufferGeometry */
function stitch(rings, seg, withTangent = true) {
  const n = rings.length;
  const pos = new Float32Array(n * seg * 3);
  const uv = new Float32Array(n * seg * 2);
  const tan = withTangent ? new Float32Array(n * seg * 3) : null;
  const idx = [];

  let p = 0, q = 0, r = 0;
  for (let i = 0; i < n; i++) {
    const ring = rings[i];
    const [cx, cy, cz] = ring.c;
    const [axx, axy, axz] = ring.ax;
    const [azx, azy, azz] = ring.az;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const ca = Math.cos(a) * ring.rx;
      const sa = Math.sin(a) * ring.ry;
      pos[p++] = cx + axx * ca + azx * sa;
      pos[p++] = cy + axy * ca + azy * sa;
      pos[p++] = cz + axz * ca + azz * sa;
      uv[q++] = j / seg;
      uv[q++] = n > 1 ? i / (n - 1) : 0;
      if (tan) { tan[r++] = ring.t[0]; tan[r++] = ring.t[1]; tan[r++] = ring.t[2]; }
    }
  }

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + ((j + 1) % seg);
      const d = (i + 1) * seg + j;
      idx.push(a, d, b, b, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (tan) g.setAttribute('aTangent', new THREE.BufferAttribute(tan, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * 沿折线扫出管体。
 * @param {Array<[number,number,number]>} points 折线点
 * @param {Array<number>|Array<[number,number]>} radii 每点的半径（数值或 [rx, ry]）
 * @param {object} opts { seg 圆周分段, round 末端是否收成尖/圆头, tension 平滑 }
 */
export function sweep(points, radii, opts = {}) {
  const seg = opts.seg ?? 10;
  const round = opts.round ?? 0.6;
  const pts = points.map(p => new THREE.Vector3(p[0], p[1], p[2]));

  // 半径数组（支持椭圆柱）
  const rr = radii.map(r => (Array.isArray(r) ? r : [r, r]));

  // 首尾加两个收口环，让管线自然闭合（避免平面盖）
  const P = [], R = [];
  const d0 = pts[1].clone().sub(pts[0]);
  const dN = pts[pts.length - 1].clone().sub(pts[pts.length - 2]);
  const tipA = pts[0].clone().addScaledVector(d0.clone().normalize(), -rr[0][0] * round * 1.6);
  const tipB = pts[pts.length - 1].clone().addScaledVector(dN.clone().normalize(), rr[rr.length - 1][0] * round * 1.6);
  P.push(tipA, ...pts, tipB);
  const zero = [0.0006, 0.0006];
  R.push(zero, ...rr, zero);

  // 切线
  const tangents = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(P.length - 1, i + 1)];
    tangents.push(b.clone().sub(a).normalize());
  }

  // 平行传输标架（避免扭转）
  const rings = [];
  let ax = new THREE.Vector3();
  const ref = Math.abs(tangents[0].y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  ax.crossVectors(ref, tangents[0]).normalize();
  for (let i = 0; i < P.length; i++) {
    if (i > 0) {
      const q = new THREE.Quaternion().setFromUnitVectors(tangents[i - 1], tangents[i]);
      ax.applyQuaternion(q);
      ax.addScaledVector(tangents[i], -ax.dot(tangents[i])).normalize();
    }
    const az = new THREE.Vector3().crossVectors(ax, tangents[i]);
    rings.push({
      c: [P[i].x, P[i].y, P[i].z],
      ax: [ax.x, ax.y, ax.z],
      az: [az.x, az.y, az.z],
      t: [tangents[i].x, tangents[i].y, tangents[i].z],
      rx: R[i][0],
      ry: R[i][1]
    });
  }
  return stitch(rings, seg, true);
}

/**
 * 沿一条轴把横截面串起来（躯干、脚掌、衣服都用它）。
 * 坐标：center = t*u + ax*cx + az*cz，其中 u = s.u ?? s.y。
 * 必须满足 ax × az = -t，才能保证绕序朝外。
 * @param {Array<{u?:number, y?:number, rx:number, ry?:number, cx?:number, cz?:number}>} sections 沿轴由负到正
 * @param {object} opts { seg, axis, ax, az, shape(a,i,sec)=>number, profile(a,i,sec)=>[u,v] }
 */
export function loft(sections, opts = {}) {
  const seg = opts.seg ?? 32;
  const t = new THREE.Vector3(...(opts.axis ?? [0, 1, 0])).normalize();
  let ax, az;
  if (opts.ax && opts.az) {
    ax = new THREE.Vector3(...opts.ax).normalize();
    az = new THREE.Vector3(...opts.az).normalize();
  } else {
    const ref = Math.abs(t.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    ax = new THREE.Vector3().crossVectors(ref, t).normalize();
    az = new THREE.Vector3().crossVectors(ax, t);
  }
  const { shape, profile } = opts;

  const n = sections.length;
  const pos = new Float32Array(n * seg * 3);
  const uvs = new Float32Array(n * seg * 2);
  const tans = new Float32Array(n * seg * 3);
  const idx = [];
  let p = 0, q = 0, r = 0;

  for (let i = 0; i < n; i++) {
    const s = sections[i];
    const u = s.u ?? s.y ?? 0;
    const cx = s.cx ?? 0;
    const cz = s.cz ?? 0;
    const baseX = t.x * u + ax.x * cx + az.x * cz;
    const baseY = t.y * u + ax.y * cx + az.y * cz;
    const baseZ = t.z * u + ax.z * cx + az.z * cz;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      let pu = Math.cos(a), pv = Math.sin(a);
      if (profile) {
        const pr = profile(a, i, s);
        if (pr) { pu = pr[0]; pv = pr[1]; }
      }
      const m = shape ? (shape(a, i, s) ?? 1) : 1;
      const ca = pu * s.rx * m;
      const sa = pv * (s.ry ?? s.rx) * m;
      pos[p++] = baseX + ax.x * ca + az.x * sa;
      pos[p++] = baseY + ax.y * ca + az.y * sa;
      pos[p++] = baseZ + ax.z * ca + az.z * sa;
      uvs[q++] = j / seg;
      uvs[q++] = n > 1 ? i / (n - 1) : 0;
      tans[r++] = t.x; tans[r++] = t.y; tans[r++] = t.z;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + ((j + 1) % seg);
      const d = (i + 1) * seg + j;
      idx.push(a, d, b, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('aTangent', new THREE.BufferAttribute(tans, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** 闭合环带：把一串「圆心 + 半径」的环缝起来，用于不规则脚掌等 */
export function rings(sectionList, seg, opts = {}) {
  const t = new THREE.Vector3(...(opts.axis ?? [0, 1, 0])).normalize();
  const ax = new THREE.Vector3(...(opts.ax ?? [1, 0, 0])).normalize();
  const az = new THREE.Vector3(...(opts.az ?? [0, 0, 1])).normalize();
  const built = sectionList.map((s, i) => ({
    c: [
      t.x * s.u + ax.x * (s.cx ?? 0) + az.x * (s.cz ?? 0),
      t.y * s.u + ax.y * (s.cx ?? 0) + az.y * (s.cz ?? 0),
      t.z * s.u + ax.z * (s.cx ?? 0) + az.z * (s.cz ?? 0)
    ],
    ax: [ax.x, ax.y, ax.z],
    az: [az.x, az.y, az.z],
    t: [t.x, t.y, t.z],
    rx: s.rx,
    ry: s.ry ?? s.rx
  }));
  // 支持逐角度调制
  if (!opts.profile) return stitch(built, seg, true);
  const n = built.length;
  const pos = new Float32Array(n * seg * 3);
  const uvs = new Float32Array(n * seg * 2);
  const tan = new Float32Array(n * seg * 3);
  const idx = [];
  let p = 0, q = 0, r = 0;
  for (let i = 0; i < n; i++) {
    const ring = built[i];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const pr = opts.profile(a, i, sectionList[i]) ?? [Math.cos(a), Math.sin(a)];
      const ca = pr[0] * ring.rx;
      const sa = pr[1] * ring.ry;
      pos[p++] = ring.c[0] + ring.ax[0] * ca + ring.az[0] * sa;
      pos[p++] = ring.c[1] + ring.ax[1] * ca + ring.az[1] * sa;
      pos[p++] = ring.c[2] + ring.ax[2] * ca + ring.az[2] * sa;
      uvs[q++] = j / seg;
      uvs[q++] = i / (n - 1);
      tan[r++] = ring.t[0]; tan[r++] = ring.t[1]; tan[r++] = ring.t[2];
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + ((j + 1) % seg);
      const d = (i + 1) * seg + j;
      idx.push(a, d, b, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('aTangent', new THREE.BufferAttribute(tan, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** 合并同材质几何体，减少 draw call（发丝用） */
export function mergeGeometries(list) {
  let vTotal = 0, iTotal = 0;
  for (const g of list) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : 0;
  }
  const pos = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const tan = new Float32Array(vTotal * 3);
  const idx = new Uint32Array(iTotal);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position;
    const u = g.attributes.uv;
    const t = g.attributes.aTangent;
    const n = p.count;
    pos.set(p.array.subarray(0, n * 3), vo * 3);
    if (u) uv.set(u.array.subarray(0, n * 2), vo * 2);
    if (t) tan.set(t.array.subarray(0, n * 3), vo * 3);
    const gi = g.index;
    if (gi) for (let k = 0; k < gi.count; k++) idx[io + k] = gi.getX(k) + vo;
    io += gi ? gi.count : 0;
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('aTangent', new THREE.BufferAttribute(tan, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

/** 在几何体表面均匀撒点（用于「粒子汇聚成人形」的开场） */
export function sampleSurface(geometry, matrix, count, rand) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const out = new Float32Array(count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const tri = Math.floor(rand() * triCount) * 3;
    const i0 = index ? index.getX(tri) : tri;
    const i1 = index ? index.getX(tri + 1) : tri + 1;
    const i2 = index ? index.getX(tri + 2) : tri + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    let u = rand(), v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    const x = a.x * w + b.x * u + c.x * v;
    const y = a.y * w + b.y * u + c.y * v;
    const z = a.z * w + b.z * u + c.z * v;
    const pt = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
    out[i * 3] = pt.x; out[i * 3 + 1] = pt.y; out[i * 3 + 2] = pt.z;
  }
  return out;
}

/** 把多个几何体按各自矩阵合并成一条 position 数组（只用于采样，不做渲染） */
export function sampleMeshes(meshes, count, rand) {
  const valid = meshes.filter(m => m.geometry && m.geometry.attributes.position);
  if (!valid.length) return new Float32Array(count * 3);
  const out = new Float32Array(count * 3);
  const per = Math.ceil(count / valid.length);
  let written = 0;
  for (const m of valid) {
    m.updateWorldMatrix(true, false);
    const n = Math.min(per, count - written);
    if (n <= 0) break;
    const pts = sampleSurface(m.geometry, m.matrixWorld, n, rand);
    out.set(pts.subarray(0, n * 3), written * 3);
    written += n;
  }
  return out;
}
