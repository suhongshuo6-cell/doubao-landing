/**
 * 离线自检：不需要浏览器，在 Node 里校验「立绘取景」主链路 + 可选模块，并逐条核对着色器接口。
 *
 *   node tools/scene-check.mjs
 *
 *   A. 立绘资源是否就位
 *   B. 10 个分镜取景是否覆盖「脸→颈→胸→腰→腿→脚→全身」且顺序单调
 *   C. 面部命中框（捏脸）是否落在人物头部范围内
 *   D. 取景数学：屏幕 ↔ 原图像素映射、竖屏收窄、捏脸启用门控
 *   E. 着色器 uniform / varying 交叉审计 —— three 在 WebGLUniforms.upload 里直接读
 *      v.needsUpdate，着色器声明了但 JS 没给值的 uniform 会在渲染时抛异常（黑屏）
 *   F. 可选模块（程序化数字人）仍可构建、几何健全
 *   G. 明亮主题：亮度、对比度、无深色残留、无高频动画
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

register('./three-resolver.mjs', import.meta.url);

const THREE = await import('three');
const { PORTRAIT, BEATS, PALETTE, QUALITY, INTRO } = await import('../src/config.js');
const { createPortraitMaterial } = await import('../src/three/portrait.js');
const S = await import('../src/three/shaders.js');
const LEGACY = await import('../src/legacy-config.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) console.log(`  ✓ ${msg}${extra ? '  ' + extra : ''}`);
  else { console.log(`  ✗ ${msg}  ${extra}`); fail++; }
};

/* ========== A. 立绘资源 ========== */
console.log('\n▍A 立绘资源');
{
  const dir = path.join(ROOT, 'assets', 'character');
  for (const name of PORTRAIT.views) {
    const webp = path.join(dir, `${name}.webp`);
    const png = path.join(dir, `${name}.png`);
    const hasWebp = fs.existsSync(webp);
    const hasPng = fs.existsSync(png);
    ok(hasWebp || hasPng, `${name}: 立绘就位`,
      hasWebp ? `webp ${(fs.statSync(webp).size / 1024).toFixed(0)}KB`
        : hasPng ? 'png（未跑预处理，页面会用 png）' : '缺失 → 页面显示占位提示');
  }
}
ok(PORTRAIT.views.length === 3, '三个视图（front / side / back）');
ok(PORTRAIT.imgW === 1280 && PORTRAIT.imgH === 720, '取景基准尺寸正确', `${PORTRAIT.imgW}×${PORTRAIT.imgH}`);

/* ========== B. 分镜取景 ========== */
console.log('\n▍B 分镜取景');
ok(BEATS.length === 10, '分镜数量 = 10', String(BEATS.length));
const headTop = 8, headBottom = 100, feetY = 700;
const headH = headBottom - headTop;
const get = id => BEATS.find(b => b.id === id);

for (const id of ['hero', 'face']) {
  const visibleH = get(id).frame.w / 1.7778;
  ok(headH / visibleH > 0.68, `${id}: 头部撑满画面（占屏高 ≥68%）`,
    `头 ${headH}px / 可见 ${visibleH.toFixed(0)}px = ${(headH / visibleH * 100).toFixed(0)}%`);
}
ok(get('feet').frame.cy > 600 && get('feet').frame.cy < feetY + 60, '赤足取景落在脚部',
  `cy=${get('feet').frame.cy}`);
ok(get('full').frame.w >= PORTRAIT.imgW * 0.85, '全身分镜能看到整个人', `w=${get('full').frame.w}`);

const seq = ['face', 'neck', 'chest', 'waist', 'legs', 'feet'].map(id => get(id).frame.cy);
let mono = true;
for (let i = 1; i < seq.length; i++) if (seq[i] <= seq[i - 1]) mono = false;
ok(mono, '取景自脸到脚单调下移（身体漫游成立）', seq.map(v => v.toFixed(0)).join(' → '));

/* ========== C. 捏脸命中框 ========== */
console.log('\n▍C 捏脸命中框');
const fb = PORTRAIT.faceBox;
ok(fb.y0 >= headTop && fb.y1 <= headBottom, '命中框在头部纵向范围内',
  `y ${fb.y0}~${fb.y1} vs 头 ${headTop}~${headBottom}`);
ok(fb.x0 > PORTRAIT.cx - 140 && fb.x1 < PORTRAIT.cx + 140, '命中框在头部横向范围内',
  `x ${fb.x0}~${fb.x1}，中轴 ${PORTRAIT.cx}`);
ok(Math.abs((fb.x0 + fb.x1) / 2 - PORTRAIT.cx) < 30, '命中框居中于人物中轴',
  `偏差 ${((fb.x0 + fb.x1) / 2 - PORTRAIT.cx).toFixed(1)}px`);
ok(PORTRAIT.pressRadius > 20 && PORTRAIT.pressRadius < 90, '按压半径合理', `${PORTRAIT.pressRadius}px`);
ok(PORTRAIT.pressMax > 0.15 && PORTRAIT.pressMax < 0.75, '按压强度"有反馈但不撕裂"', `${PORTRAIT.pressMax}`);
ok(PORTRAIT.pressHover > 0 && PORTRAIT.pressHover < PORTRAIT.pressMax, '悬停按压弱于按下按压');
ok(PORTRAIT.turnDragPx > 150 && PORTRAIT.turnDragPx < 900, '转身拖拽灵敏度合理', `${PORTRAIT.turnDragPx}px/视图`);

/* ========== D. 取景数学 ========== */
console.log('\n▍D 取景数学（与 shader 同一套映射）');
function resolveView(w, h, ww, zoom = 1) {
  const A = w / h;
  const portrait = A < 1.05;
  const width = ww * zoom * (portrait ? PORTRAIT.portraitShrink : 1);
  return { halfW: width / 2, halfH: width / 2 / A, A, visibleH: width / A, visibleW: width };
}
const heroW = get('hero').frame.w;
const desktop = resolveView(1600, 900, heroW);
ok(Math.abs(desktop.visibleH - heroW / 1.7778) < 0.5, '桌面：可见高 = 可见宽 / 宽高比',
  `${desktop.visibleH.toFixed(1)}px`);
const phone = resolveView(390, 844, heroW);
ok(headH / phone.visibleH > 0.42, '竖屏首屏头部仍占满画面（≥42% 屏高）',
  `头 ${headH}px / 可见 ${phone.visibleH.toFixed(0)}px = ${(headH / phone.visibleH * 100).toFixed(0)}%`);
ok(headH / desktop.visibleH > 0.60, '桌面首屏头部撑满画面（≥60% 屏高）',
  `${(headH / desktop.visibleH * 100).toFixed(0)}%`);

function screenToImage(sx, sy, W, H, view) {
  const s = { x: sx / W, y: 1 - sy / H };
  return { x: view.cx + (s.x - 0.5) * 2 * view.halfW, y: view.cy + (0.5 - s.y) * 2 * view.halfH };
}
const v = { cx: PORTRAIT.cx, cy: get('hero').frame.cy, halfW: desktop.halfW, halfH: desktop.halfH };
const mid = screenToImage(800, 450, 1600, 900, v);
ok(Math.abs(mid.x - PORTRAIT.cx) < 0.01 && Math.abs(mid.y - v.cy) < 0.01, '屏幕中心 → 取景中心',
  `(${mid.x.toFixed(1)}, ${mid.y.toFixed(1)})`);
const tl = screenToImage(0, 0, 1600, 900, v);
ok(tl.x < v.cx && tl.y < v.cy, '屏幕左上 → 取景左上', `(${tl.x.toFixed(0)}, ${tl.y.toFixed(0)})`);

ok(desktop.visibleH < PORTRAIT.pinchMaxViewH, '首屏满足捏脸放大门控',
  `${desktop.visibleH.toFixed(0)} < ${PORTRAIT.pinchMaxViewH}`);
const fullView = resolveView(1600, 900, get('full').frame.w);
ok(fullView.visibleH > PORTRAIT.pinchMaxViewH, '全身景别自动关闭捏脸（脸太小）',
  `${fullView.visibleH.toFixed(0)} > ${PORTRAIT.pinchMaxViewH}`);

/* ========== E. 着色器审计 ========== */
console.log('\n▍E 着色器 uniform / varying 审计');
function parseDecls(src, kind) {
  const out = [];
  const re = new RegExp(`\\b${kind}\\s+(?:(?:highp|mediump|lowp)\\s+)?(\\w+)\\s+([^;]+);`, 'g');
  let m;
  while ((m = re.exec(src))) {
    for (const part of m[2].split(',')) {
      const name = part.trim().split(/[\s=\[]/)[0];
      if (name) out.push({ type: m[1], name });
    }
  }
  return out;
}
const BUILTIN = new Set(['modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix',
  'normalMatrix', 'cameraPosition', 'isOrthographic']);
const KNOWN = new Set(['float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'sampler2D']);

function auditMaterial(name, mat) {
  const declared = new Set([
    ...parseDecls(mat.vertexShader, 'uniform'),
    ...parseDecls(mat.fragmentShader, 'uniform')
  ].filter(d => KNOWN.has(d.type)).map(d => d.name));
  const provided = new Set(Object.keys(mat.uniforms));
  const missing = [...declared].filter(n => !provided.has(n) && !BUILTIN.has(n));
  ok(missing.length === 0, `[${name}] GLSL 声明的 uniform 都有 JS 值`, missing.join(', '));

  const vv = parseDecls(mat.vertexShader, 'varying');
  const fv = parseDecls(mat.fragmentShader, 'varying');
  const typeOf = new Map(vv.map(d => [d.name, d.type]));
  const mismatch = fv.filter(d => typeOf.has(d.name) && typeOf.get(d.name) !== d.type);
  const orphan = fv.filter(d => !typeOf.has(d.name));
  ok(mismatch.length === 0, `[${name}] varying 类型一致`, mismatch.map(d => d.name).join(', '));
  ok(orphan.length === 0, `[${name}] fragment 的 varying 都在 vertex 写出`, orphan.map(d => d.name).join(', '));
}

const fake = new THREE.Texture();
fake.image = { width: 2560, height: 1440 };
const skinShared = { uTime: { value: 0 }, uReal: { value: 1 }, uSweepY: { value: 3 }, uSweepW: { value: 0.05 }, uSweepGlow: { value: 0 }, uFade: { value: 1 } };
auditMaterial('portrait', createPortraitMaterial({
  front: fake, side: fake, back: fake, texSize: { x: 2560, y: 1440 }, quality: QUALITY.high
}));
auditMaterial('skin', S.makeSkinMaterial({ shared: skinShared, lights: LEGACY.LIGHTS, pinched: true }));
auditMaterial('eye', S.makeEyeMaterial({ lights: LEGACY.LIGHTS }));
auditMaterial('hair', S.makeHairMaterial({ shared: skinShared, lights: LEGACY.LIGHTS }));
auditMaterial('fabric', S.makeFabricMaterial({ shared: skinShared, lights: LEGACY.LIGHTS }));
auditMaterial('outline', S.makeOutlineMaterial({ shared: skinShared, lights: LEGACY.LIGHTS }));
auditMaterial('grade', new THREE.ShaderMaterial(S.GradeShader));

/* ========== F. 可选模块 ========== */
console.log('\n▍F 可选模块：程序化数字人（页面默认不加载）');
try {
  const { buildCharacter } = await import('../src/three/character.js');
  const character = buildCharacter({ quality: LEGACY.QUALITY.high, shared: skinShared, lights: LEGACY.LIGHTS });
  character.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let tris = 0, nan = 0;
  character.group.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const val of g.attributes.position.array) if (!Number.isFinite(val)) nan++;
    box.union(new THREE.Box3().setFromBufferAttribute(g.attributes.position).applyMatrix4(o.matrixWorld));
  });
  ok(nan === 0, '假人几何无 NaN');
  ok(Math.abs(box.min.y) < 0.02 && box.max.y > 1.7 && box.max.y < 1.86,
    '假人比例正常（脚底贴地 / 身高约 1.78m）', `y=[${box.min.y.toFixed(3)}, ${box.max.y.toFixed(3)}]`);
  ok(tris > 15000, '假人三角面数量合理', String(Math.round(tris)));
} catch (e) {
  ok(false, '假人模块仍可构建', e.message);
}

/* ========== G. 明亮主题 ========== */
console.log('\n▍G 明亮主题');
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = h => { const [r, g, b] = hex2rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const relLum = h => {
  const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
ok(lum(PALETTE.bg0) > 0.85, '背景明亮（不在暗色区间）', `${PALETTE.bg0} 亮度 ${lum(PALETTE.bg0).toFixed(2)}`);
ok(lum(PALETTE.fg) < 0.2, '文字为深色', `${PALETTE.fg} 亮度 ${lum(PALETTE.fg).toFixed(2)}`);
ok(contrast(PALETTE.fg, PALETTE.bg0) > 7, '正文对比度达 WCAG AAA',
  `${contrast(PALETTE.fg, PALETTE.bg0).toFixed(1)}:1`);
ok(contrast(PALETTE.accent, PALETTE.bg0) > 4.5, '围巾红对比度 ≥ AA',
  `${contrast(PALETTE.accent, PALETTE.bg0).toFixed(1)}:1`);
ok(INTRO.breathe <= 0.03 && INTRO.breathePeriod >= 4,
  '呼吸补光极慢极小，不构成闪烁', `幅度 ${INTRO.breathe} / 周期 ${INTRO.breathePeriod}s`);
ok(Object.values(QUALITY).every(q => q.grain <= 0.02), '颗粒极低，不会形成噪点闪烁');

const cssPath = path.join(ROOT, 'styles', 'main.css');
if (fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, 'utf8');
  ok(!/#07070c|#12122b|#0c0c18|#08080f/i.test(css), 'CSS 无残留深色赛博底色');
  const fast = [...css.matchAll(/animation:\s*[^;{}]*?([\d.]+)s[^;{}]*?infinite/g)]
    .map(m => parseFloat(m[1])).filter(v => v < 4);
  ok(fast.length === 0, 'CSS 无 <4s 的高频无限循环动画', fast.join(', '));
  const blink = /@keyframes\s+\w*(blink|flicker|strobe|flash)\w*/i.test(css);
  ok(!blink, 'CSS 无 blink / flicker / strobe / flash 关键帧');
} else {
  ok(false, 'styles/main.css 存在');
}

console.log(`\n${fail === 0 ? '✅ 全部通过' : `❌ ${fail} 项未通过`}\n`);
process.exit(fail === 0 ? 0 : 1);
