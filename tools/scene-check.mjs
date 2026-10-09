/**
 * 离线自检：不依赖浏览器，在 Node 里构建整个角色 + 粒子 + 着色器审计。
 *
 *   node tools/scene-check.mjs
 *
 * 检查项：
 *   1. 几何体是否有 NaN / 退化
 *   2. 人物尺寸与站位是否符合设计（脚底 y≈0、头顶 y≈1.78、脸在 y≈1.66）
 *   3. 头部是否按预期挖出两个眼裂
 *   4. 每个材质的 GLSL uniform 声明 与 JS uniforms 是否一一对应（漏一个就是静默失效）
 *   5. vertex / fragment 之间的 varying 是否匹配（不匹配会直接链接失败 → 黑屏）
 */
import { register } from 'node:module';
register('./three-resolver.mjs', import.meta.url);

const THREE = await import('three');
const { buildCharacter, EYE, deformHead, faceSurfacePoint, headToWorld } = await import('../src/three/character.js');
const { buildParticles } = await import('../src/three/particles.js');
const { QUALITY, LIGHTS, makeRandom, HEAD } = await import('../src/config.js');
const S = await import('../src/three/shaders.js');
const { createParticleMaterial } = await import('../src/three/particles.js');

let fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) console.log(`  ✓ ${msg}${extra ? '  ' + extra : ''}`);
  else { console.log(`  ✗ ${msg}  ${extra}`); fail++; }
};

/* ══════════ 1. 构建场景 ══════════ */
console.log('\n▍构建角色（high 档）');
const shared = {
  uTime: { value: 0 }, uReal: { value: 0 }, uSweepY: { value: 0 },
  uSweepW: { value: 0.055 }, uSweepGlow: { value: 0 }, uFade: { value: 1 }
};
const character = buildCharacter({ quality: QUALITY.high, shared, lights: LIGHTS });
character.group.updateMatrixWorld(true);

const box = new THREE.Box3();
let tris = 0, nan = 0, meshes = 0, verts = 0;
const perMesh = [];
character.group.traverse(o => {
  if (!o.isMesh) return;
  meshes++;
  const g = o.geometry;
  const pos = g.attributes.position;
  verts += pos.count;
  tris += (g.index ? g.index.count : pos.count) / 3;
  for (let i = 0; i < pos.count * 3; i++) if (!Number.isFinite(pos.array[i])) nan++;
  const b = new THREE.Box3().setFromBufferAttribute(pos).applyMatrix4(o.matrixWorld);
  box.union(b);
  perMesh.push({ name: o.name, tris: Math.round((g.index ? g.index.count : pos.count) / 3) });
});

console.log(`  网格 ${meshes} 个 / 顶点 ${verts} / 三角面 ${Math.round(tris)}`);
console.log(`  包围盒 X[${box.min.x.toFixed(3)}, ${box.max.x.toFixed(3)}]  Y[${box.min.y.toFixed(3)}, ${box.max.y.toFixed(3)}]  Z[${box.min.z.toFixed(3)}, ${box.max.z.toFixed(3)}]`);

console.log('\n▍几何体健全性');
ok(nan === 0, '无 NaN 顶点', `nan=${nan}`);
ok(tris > 15000 && tris < 260000, '三角面数量在合理区间', `${Math.round(tris)}`);
ok(Math.abs(box.min.y - 0) < 0.02, '脚底贴地 y≈0', `y_min=${box.min.y.toFixed(4)}`);
ok(box.max.y > 1.70 && box.max.y < 1.86, '身高约 1.78m', `y_max=${box.max.y.toFixed(3)}`);
ok(box.max.z > 0.07 && box.min.z < -0.10, '面部朝 +Z 且发量在后脑', `z=[${box.min.z.toFixed(3)}, ${box.max.z.toFixed(3)}]`);

/* ══════════ 2. 头部 ══════════ */
console.log('\n▍头部与眼睛');
const head = character.headMesh;
const headBox = new THREE.Box3().setFromBufferAttribute(head.geometry.attributes.position);
let fullSphereTris = 104 * 76 * 2;
const headTris = head.geometry.index.count / 3;
ok(head.geometry.attributes.position.count === (104 + 1) * (76 + 1), '头部顶点数符合球体细分', String(head.geometry.attributes.position.count));
ok(headTris < fullSphereTris, '眼裂处三角面已被挖掉', `${Math.round(headTris)} < ${fullSphereTris}`);
const removed = fullSphereTris - headTris;
ok(removed > 12 && removed < 320, '只挖掉两个眼裂（没有误伤后脑）', `removed=${Math.round(removed)} (每只眼约 ${Math.round(removed / 2)} 面)`);
ok(headTris > fullSphereTris * 0.97, '挖孔比例合理', `${(headTris / fullSphereTris * 100).toFixed(2)}%`);

// 眼裂尺寸与"是否漏空"：直接在几何上求解"头部表面"与"眼球表面"的交线
{
  const nx = EYE.nx, ny = EYE.ny;
  const nz = Math.sqrt(1 - nx * nx - ny * ny);
  const surf = headToWorld(deformHead(nx, ny, nz, new THREE.Vector3()));
  const eyeX = EYE.ipd * 0.5;
  const zc = surf.z + EYE.protrude - EYE.radius;     // 球心 z
  const R = EYE.radius;

  // 沿水平/垂直方向找"头表面跑到眼球后面"的临界点
  const edge = (axis) => {
    let last = -1;
    for (let i = 0; i <= 300; i++) {
      const off = (i / 300) * 0.32;
      const q = axis === 'h'
        ? deformHead(nx + off, ny, Math.sqrt(Math.max(0.001, 1 - (nx + off) ** 2 - ny * ny)), new THREE.Vector3())
        : deformHead(nx, ny + off, Math.sqrt(Math.max(0.001, 1 - nx * nx - (ny + off) ** 2)), new THREE.Vector3());
      const w = headToWorld(q);
      const u = axis === 'h' ? (w.x - eyeX) : (w.y - surf.y);
      if (Math.abs(u) >= R) break;
      const ballZ = zc + Math.sqrt(Math.max(0, R * R - u * u));
      if (ballZ > w.z) last = Math.abs(u);      // 眼球在头表面之前 → 这个方向是"洞"
      else break;                                // 头表面反超 → 洞到此为止
    }
    return last;
  };
  const halfW = edge('h'), halfH = edge('v');
  const wMm = halfW * 2000, hMm = halfH * 2000;
  ok(wMm > 15 && wMm < 36, '眼裂宽度 15~36mm', `${wMm.toFixed(1)}mm`);
  ok(hMm > 7 && hMm < 20, '眼裂高度 7~20mm', `${hMm.toFixed(1)}mm`);
  ok(hMm < wMm * 0.68, '眼裂是横向杏仁形', `h/w=${(hMm / wMm).toFixed(2)}`);
  ok(halfW > 0 && halfH > 0, '眼球确实从挖孔中露出（不是被脸皮盖住）');

  // 角膜顶点相对"未凹陷的脸面"的外凸量
  const flat = headToWorld(deformHead(nx, ny, nz, new THREE.Vector3()));
  const socketDepth = 0;
  const apexZ = zc + R;
  // 用同一高度但远离眼窝的一列作为脸面基准
  const baseZ = headToWorld(deformHead(0.0, ny, Math.sqrt(1 - ny * ny), new THREE.Vector3())).z;
  ok(apexZ - baseZ > -0.012 && apexZ - baseZ < 0.004, '角膜略低于鼻梁最高点（符合解剖）',
    `${((apexZ - baseZ) * 1000).toFixed(1)}mm`);
}

/* ══════════ 3. 粒子 ══════════ */
console.log('\n▍粒子');
const rand = makeRandom(778899);
const parts = buildParticles({ quality: QUALITY.high, characterGroup: character.group, pixelRatio: 1 });
let pnan = 0, pcount = 0;
parts.group.traverse(o => {
  if (!o.isPoints) return;
  pcount += o.geometry.attributes.position.count;
  for (const k of ['position', 'aStart', 'aTarget', 'aColor', 'aSeed', 'aSize', 'aDir']) {
    const a = o.geometry.attributes[k];
    if (!a) { console.log(`    缺少属性 ${k}`); fail++; continue; }
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) pnan++;
  }
});
ok(pnan === 0, '粒子属性无 NaN', `points=${pcount} bad=${pnan}`);
ok(pcount > QUALITY.high.particles, '粒子总数超过汇聚点数', `${pcount}`);

/* ══════════ 4. 着色器审计 ══════════ */
console.log('\n▍着色器 uniform / varying 审计');

function parseDecls(src, kind) {
  const out = [];
  const re = new RegExp(`\\b${kind}\\s+(?:(?:highp|mediump|lowp)\\s+)?(\\w+)\\s+([^;]+);`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const type = m[1];
    for (const part of m[2].split(',')) {
      const name = part.trim().split(/[\s=\[]/)[0];
      if (name) out.push({ type, name });
    }
  }
  return out;
}

const materials = {
  skin: S.makeSkinMaterial({ shared, lights: LIGHTS, pinched: true }),
  skinBody: S.makeSkinMaterial({ shared, lights: LIGHTS, pinched: false }),
  eye: S.makeEyeMaterial({ lights: LIGHTS }),
  hair: S.makeHairMaterial({ shared, lights: LIGHTS }),
  fabric: S.makeFabricMaterial({ shared, lights: LIGHTS }),
  outline: S.makeOutlineMaterial({ shared, lights: LIGHTS }),
  grade: new THREE.ShaderMaterial(S.GradeShader),
  particles: createParticleMaterial(1)
};

const KNOWN_UNIFORM_TYPES = new Set(['float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'sampler2D']);

for (const [name, mat] of Object.entries(materials)) {
  const vu = parseDecls(mat.vertexShader, 'uniform').filter(d => KNOWN_UNIFORM_TYPES.has(d.type));
  const fu = parseDecls(mat.fragmentShader, 'uniform').filter(d => KNOWN_UNIFORM_TYPES.has(d.type));
  const declared = new Set([...vu, ...fu].map(d => d.name));
  const provided = new Set(Object.keys(mat.uniforms));

  const missing = [...declared].filter(n => !provided.has(n));
  const unused = [...provided].filter(n => !declared.has(n));
  // three 内置 uniform 不需要自己提供
  const BUILTIN = new Set(['modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'isOrthographic']);
  const realMissing = missing.filter(n => !BUILTIN.has(n));

  ok(realMissing.length === 0, `[${name}] GLSL 里声明的 uniform 都有 JS 值`, realMissing.join(', '));
  if (unused.length) console.log(`    · 提示：[${name}] JS 侧多余 uniform（无害）：${unused.join(', ')}`);

  // varying 匹配
  const vv = parseDecls(mat.vertexShader, 'varying');
  const fv = parseDecls(mat.fragmentShader, 'varying');
  const fvMap = new Map(fv.map(d => [d.name, d.type]));
  const bad = vv.filter(d => fvMap.has(d.name) && fvMap.get(d.name) !== d.type);
  const notWritten = fv.filter(d => !vv.some(v => v.name === d.name));
  ok(bad.length === 0, `[${name}] varying 类型一致`, bad.map(d => d.name).join(', '));
  ok(notWritten.length === 0, `[${name}] fragment 用到的 varying 都在 vertex 里写出`, notWritten.map(d => d.name).join(', '));
}

/* ── 自定义 attribute ── */
const hairAttrs = ['aTangent'];
const declaredAttrs = parseDecls(materials.hair.vertexShader, 'attribute').map(d => d.name);
ok(hairAttrs.every(a => declaredAttrs.includes(a)), '头发的 aTangent 已声明', declaredAttrs.join(','));

/* ══════════ 5. 分镜配置 ══════════ */
console.log('\n▍分镜与相机关键帧');
const { BEATS } = await import('../src/config.js');
ok(BEATS.length === 10, '分镜数量 = 10', `${BEATS.length}`);
const heights = BEATS.map(b => b.cam.pos[1]);
ok(heights[1] > 1.60 && heights[1] < 1.72, '第 2 个分镜（面容）镜头在脸部高度', `y=${heights[1]}`);
ok(heights[heights.length - 1] > 0.8 && BEATS[BEATS.length - 1].cam.pos[2] > 2.0, '最后分镜拉远到全身');
let mono = true;
for (let i = 1; i < BEATS.length; i++) if (BEATS[i].cam.pos[1] > BEATS[i - 1].cam.pos[1] + 0.001) mono = false;
// 除了最后一个"拉远"分镜，其余应该是往下走的
// arms 分镜要抬头看手臂，允许一次回升
const down = BEATS.slice(0, 8).map(b => b.cam.pos[1]);
let rises = 0;
for (let i = 1; i < down.length; i++) if (down[i] > down[i - 1] + 0.001) rises++;
mono = rises <= 1 && down[7] < down[2];
ok(mono, '镜头高度自脸到脚单调下移（拉远分镜除外）', down.map(v => v.toFixed(2)).join(' → '));

console.log(`\n${fail === 0 ? '✅ 全部通过' : `❌ ${fail} 项未通过`}\n`);
process.exit(fail === 0 ? 0 : 1);
