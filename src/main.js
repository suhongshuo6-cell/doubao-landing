/**
 * 入口：装配 3D 舞台 + DOM 层，驱动开场时间线与主循环。
 *
 * 调试参数：
 *   ?p=0.42        直接停在某个滚动进度（跳过开场）
 *   ?nointro=1     跳过开场动画
 *   ?q=low|medium|high  指定画质
 *   ?debug=1       显示右下角调试面板
 */
import * as THREE from 'three';
import { createStage } from './three/stage.js';
import { buildCharacter } from './three/character.js';
import { buildParticles } from './three/particles.js';
import { createCameraRig } from './three/cameraRig.js';
import { createInteractor } from './three/interact.js';
import { createHud } from './ui/hud.js';
import { createReveal } from './ui/reveal.js';
import { createAudio } from './ui/audio.js';
import { QUALITY, INTRO, LIGHTS, clamp, lerp, easeOutCubic, easeInOutCubic } from './config.js';

/* ══════════ 调试 / 错误通道（无头浏览器靠它核对） ══════════ */
const qs = new URLSearchParams(location.search);
const debugEl = document.createElement('pre');
debugEl.id = 'debug';
debugEl.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9999;margin:0;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8ef0c0;text-align:right;pointer-events:none;display:none;text-shadow:0 0 6px #000;';
document.body.appendChild(debugEl);
const errs = [];
function reportError(msg) {
  if (errs.length > 6) return;
  errs.push(String(msg).slice(0, 300));
  debugEl.dataset.error = errs.join(' || ');
  debugEl.style.display = 'block';
  debugEl.textContent = 'ERROR: ' + errs.join('\n');
}
window.addEventListener('error', e => reportError(`${e.message} @${e.filename || ''}:${e.lineno || 0}`));
window.addEventListener('unhandledrejection', e => reportError('promise ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));
const _ce = console.error.bind(console);
console.error = (...a) => { reportError(a.map(x => (x && x.message) || x).join(' ')); _ce(...a); };

/* ══════════ 环境判定 ══════════ */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) { return false; }
}

function pickQuality() {
  const forced = qs.get('q');
  if (forced && QUALITY[forced]) return forced;
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  if (mobile || mem <= 4 || cores <= 4 || window.innerWidth < 760) return 'medium';
  return 'high';
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const forceP = qs.has('p') ? clamp(parseFloat(qs.get('p')) || 0) : null;
const skipIntro = qs.get('nointro') === '1' || forceP !== null || reduceMotion;
// 无头截图用：?frames=N 只渲染 N 帧后停住；?instant=1 让相机直接落到目标位（不做阻尼过渡）
const maxFrames = qs.has('frames') ? Math.max(1, parseInt(qs.get('frames'), 10) || 1) : 0;
const instantCam = qs.get('instant') === '1';

/* ══════════ 启动 ══════════ */
const canvas = document.getElementById('gl');
const hud = createHud({
  onQuality: () => cycleQuality(),
  onSound: on => (on ? audio.enable() : audio.disable()),
  onSkip: () => endIntro(true)
});
const audio = createAudio();

if (!hasWebGL()) {
  hud.setNoWebGL();
  reportError('WebGL2 unavailable');
} else {
  boot().catch(err => {
    // 任何异常都不能让用户永远停在加载屏
    reportError((err && (err.stack || err.message)) || err);
    hud.setLoading(1, '渲染初始化失败，已切换到静态介绍');
    hud.finishLoading();
    document.body.classList.add('no-webgl');
    const fb = document.querySelector('#fallback');
    if (fb) fb.hidden = false;
  });
}

function nextFrame() {
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function boot() {
  document.body.classList.add('is-loading');
  if (typeof WebGL2RenderingContext === 'undefined') throw new Error('WebGL2 not supported');
  hud.setLoading(0.06, '正在唤醒虚拟形象');
  await nextFrame();

  let qName = pickQuality();
  let quality = QUALITY[qName];

  hud.setLoading(0.24, '搭建渲染管线');
  const stage = createStage({ canvas, quality });
  const shared = stage.shared;
  await nextFrame();

  hud.setLoading(0.48, '雕刻面部与发丝');
  const character = buildCharacter({ quality, shared, lights: LIGHTS });
  stage.scene.add(character.group);
  await nextFrame();

  hud.setLoading(0.68, '注入光与尘埃');
  const particles = buildParticles({
    quality,
    characterGroup: character.group,
    pixelRatio: Math.min(window.devicePixelRatio || 1, quality.dpr)
  });
  stage.scene.add(particles.group);
  await nextFrame();

  hud.setLoading(0.86, '校准镜头');
  const rig = createCameraRig({ camera: stage.camera });
  const interactor = createInteractor({
    canvas, camera: stage.camera, rig, character,
    hooks: {
      onPinchStart: () => { audio.blip(760, 0.22, 'sine', 0.16); },
      onPinchMove: hit => { if (hit) audio.blip(420 + Math.random() * 180, 0.09, 'triangle', 0.05); },
      onTap: () => audio.blip(520, 0.12, 'sine', 0.08)
    }
  });
  createReveal();

  /* ── 尺寸 ── */
  const outlineRes = character.materials.outline.uniforms.uResolution.value;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, quality.dpr);
    stage.resize(w, h, pr);
    outlineRes.set(w * pr, h * pr);
    particles.setPixelRatio(pr);
    rig.measure();
    if (forceP !== null) {
      const len = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const prev = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, forceP * len);
      document.documentElement.style.scrollBehavior = prev;
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 260));
  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => resize());

  /* ── 首帧 ── */
  hud.setLoading(0.97, '准备就绪');
  stage.renderer.compile(stage.scene, stage.camera);
  stage.render();
  await nextFrame();
  hud.setLoading(1, '准备就绪');
  hud.finishLoading();
  hud.setQualityLabel(quality.label);

  /* ══════════ 开场时间线 ══════════ */
  const CAM_FROM = { pos: new THREE.Vector3(0.06, 1.28, 2.35), look: new THREE.Vector3(0, 1.50, 0), fov: 44 };
  const CAM_TO = { pos: new THREE.Vector3(0.0, 1.664, 0.46), look: new THREE.Vector3(0, 1.6625, 0), fov: 34 };
  let introT = 0;
  let burstFired = false;
  let introActive = !skipIntro;
  const _cp = new THREE.Vector3(), _cl = new THREE.Vector3();

  document.documentElement.style.overflow = introActive ? 'hidden' : '';
  window.scrollTo(0, forceP !== null ? window.scrollY : 0);

  function endIntro(byUser = false) {
    if (!introActive) return;
    introActive = false;
    document.documentElement.style.overflow = '';
    shared.uReal.value = 1;
    shared.uSweepY.value = 2.4;
    shared.uSweepGlow.value = 0;
    shared.uFade.value = 1;
    character.materials.eye.uniforms.uFade.value = 1;
    particles.setConverge(1);
    particles.setConvergeFade(0.12);
    stage.gradePass.uniforms.uFlash.value = 0;
    hud.setSkip(false);
    if (byUser) hud.el.beatLabel?.classList.add('is-in');
  }

  function updateIntro(dt) {
    introT += dt;
    const t = introT;

    // 1) 粒子自球壳汇聚成人形
    particles.setConverge(clamp(t / INTRO.convergeEnd));
    particles.setConvergeFade(clamp(1 - (t - INTRO.convergeEnd) / 0.7) * 0.92 + 0.08);

    // 2) 角色在粒子成形后"点亮"
    const fade = clamp((t - INTRO.materialIn) / 0.5);
    const f = easeOutCubic(fade);
    shared.uFade.value = f;
    character.materials.eye.uniforms.uFade.value = f;

    // 3) 扫光蜕变：自下而上，脸最后
    let sweepY = -0.5, glow = 0;
    if (t > INTRO.sweepStart) {
      const st = clamp((t - INTRO.sweepStart) / (INTRO.sweepEnd - INTRO.sweepStart));
      const e = easeInOutCubic(st);
      sweepY = lerp(-0.25, 2.15, e);
      glow = Math.sin(Math.pow(st, 0.75) * Math.PI) * 1.25;
      shared.uReal.value = 1;
      if (st > 0.05 && st < 0.08) audio.swell();
    }
    shared.uSweepY.value = sweepY;
    shared.uSweepGlow.value = glow;

    // 4) 镜头从半身推近到脸部特写
    const ct = easeOutCubic(clamp((t - 0.12) / (INTRO.total - 0.45)));
    _cp.lerpVectors(CAM_FROM.pos, CAM_TO.pos, ct);
    _cl.lerpVectors(CAM_FROM.look, CAM_TO.look, ct);
    stage.camera.position.copy(_cp);
    stage.camera.lookAt(_cl);
    stage.camera.fov = lerp(CAM_FROM.fov, CAM_TO.fov, ct);
    stage.camera.updateProjectionMatrix();

    stage.gradePass.uniforms.uFlash.value = glow * 0.10 + (fade < 1 ? (1 - fade) * 0.02 : 0);
    stage.gradePass.uniforms.uAberration.value = 1 + glow * 2.4;
    if (t > INTRO.sweepStart && !burstFired) { burstFired = true; particles.fireBurst(sweepY); }
    if (burstFired) particles.updateBurst(clamp((t - INTRO.sweepStart) / 1.15));

    hud.setSkip(t > 1.4);
    if (t >= INTRO.total) {
      // 与运镜 rig 无缝衔接
      rig.update(0, 0.016, { orbit: 0, pointer: { x: 0, y: 0 }, time: t });
      endIntro();
    }
  }

  /* ══════════ 分镜 UI 配置 ══════════ */
  const BEAT_UI = {
    hero: { breath: 0.40, sway: 0.000, pinch: true, drag: false, scrim: 0.04 },
    face: { breath: 0.55, sway: 0.000, pinch: true, drag: false, scrim: 0.04 },
    neck: { breath: 1.00, sway: 0.012, pinch: false, drag: false, scrim: 0.26 },
    chest: { breath: 1.15, sway: 0.022, pinch: false, drag: false, scrim: 0.30 },
    waist: { breath: 0.75, sway: 0.050, pinch: false, drag: false, scrim: 0.32 },
    arms: { breath: 0.60, sway: 0.020, pinch: false, drag: true, scrim: 0.28 },
    legs: { breath: 0.50, sway: 0.030, pinch: false, drag: false, scrim: 0.28 },
    feet: { breath: 0.50, sway: 0.020, pinch: false, drag: false, scrim: 0.24 },
    full: { breath: 0.60, sway: 0.020, pinch: false, drag: true, scrim: 0.40 },
    download: { breath: 0.40, sway: 0.010, pinch: false, drag: false, scrim: 0.55 }
  };
  const uiCur = { breath: 0.4, sway: 0, scrim: 0.1, pinch: false, drag: false };

  /* ══════════ 主循环 ══════════ */
  let time = 0, last = performance.now();
  let p = forceP ?? 0, pSmooth = p;
  let fpsAcc = 0, fpsFrames = 0, fps = 60, dbgAcc = 0;
  let downscaled = false, snapped = false, frameCount = 0;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
    last = now;
    time += dt;

    shared.uTime.value = time;
    shared.uSweepW.value = 0.055;

    const scrollLen = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const targetP = clamp(window.scrollY / scrollLen);

    if (introActive) {
      updateIntro(dt);
      p = 0; pSmooth = 0;
    } else {
      p = targetP;
      pSmooth += (p - pSmooth) * (1 - Math.exp(-13 * dt));
      const st = interactor.state;
      if (instantCam && !snapped) {
        snapped = true;
        const t0 = rig.sample(pSmooth);
        stage.camera.position.copy(t0.pos);
        stage.camera.lookAt(t0.look);
        stage.camera.fov = t0.fov;
        stage.camera.updateProjectionMatrix();
        rig.update(pSmooth, 999, { orbit: 0, pointer: { x: 0, y: 0 }, time: 0 });
      }
      const sampled = rig.update(pSmooth, dt, {
        orbit: st.orbit,
        pointer: st.pointer,
        time
      });
      // 分镜运动参数插值
      const beat = rig.beatAt(pSmooth);
      const a = BEAT_UI[beat.from.id] || BEAT_UI.face;
      const b = BEAT_UI[beat.to.id] || a;
      const e = easeInOutCubic(beat.t);
      uiCur.breath = lerp(a.breath, b.breath, e);
      uiCur.sway = lerp(a.sway, b.sway, e);
      uiCur.scrim = lerp(a.scrim, b.scrim, e);
      uiCur.pinch = beat.t < 0.5 ? a.pinch : b.pinch;
      uiCur.drag = beat.t < 0.5 ? a.drag : b.drag;
      hud.setBeat(beat.t > 0.5 ? beat.to : beat.from);
      hud.setScrollProgress(pSmooth);
      hud.setSolid(pSmooth > 0.012);
      hud.setScrim(uiCur.scrim);
      hud.setPinchHint(uiCur.pinch && !st.pinching);
      hud.setDragHint(uiCur.drag);
      stage.gradePass.uniforms.uFlash.value *= Math.exp(-6 * dt);
      stage.gradePass.uniforms.uAberration.value =
        lerp(1, 0.55, 1 - shared.uReal.value) + st.pinchStrength * 4;
    }

    // 角色
    character.update(time, {
      breath: uiCur.breath,
      sway: uiCur.sway
    });

    // 交互（开场期间只跑指针平滑，不响应捏脸）
    const hit = introActive ? { hit: null, overFace: false } : interactor.update(pSmooth, dt, time);

    particles.update(time);
    hud.tickCursor(dt);
    hud.setCursorState({ pinch: !!(hit && hit.overFace) });

    // 轻量自动降级：连续 2 秒低于 26fps 就降一档
    if (!downscaled && !forceP) {
      fpsAcc += dt; fpsFrames++;
      if (fpsAcc > 1) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
      if (fps < 26 && time > 8) { downscaled = true; applyLowFallback(); }
    }

    stage.render();

    dbgAcc += dt;
    if (dbgAcc > 0.4) {
      dbgAcc = 0;
      const info = stage.renderer.info;
      debugEl.dataset.state = `p=${p.toFixed(3)} q=${qName} fps=${fps.toFixed(0)} tri=${info.render.triangles} calls=${info.render.calls} prog=${info.programs ? info.programs.length : 0} pinch=${(hit && hit.pinchStrength || 0).toFixed(4)} face=${hit && hit.overFace ? 1 : 0}`;
      if (qs.get('debug') === '1' || errs.length) {
        debugEl.style.display = 'block';
        debugEl.textContent = (errs.length ? 'ERROR: ' + errs.join('\n') + '\n' : '') + debugEl.dataset.state;
      }
    }
    frameCount++;
    if (maxFrames && frameCount >= maxFrames) {
      debugEl.style.display = 'block';
      const info = stage.renderer.info;
      debugEl.textContent = (errs.length ? 'ERROR: ' + errs.join('\n') + '\n' : '') + debugEl.dataset.state;
      debugEl.dataset.frames = String(frameCount);
      return;   // 停住，交给无头浏览器截图 / dump-dom
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── 画质降级 ── */
  function applyLowFallback() {
    stage.renderer.setPixelRatio(1);
    if (stage.composer.passes) {
      for (const pass of stage.composer.passes) {
        if (pass.constructor && pass.constructor.name === 'UnrealBloomPass') pass.enabled = false;
      }
    }
    character.hairStrands.forEach((m, i) => { if (i % 2 === 1) m.visible = false; });
    document.body.classList.add('quality-low');
    hud.setQualityLabel('AUTO-LOW');
  }

  function cycleQuality() {
    const order = ['high', 'medium', 'low'];
    const cur = order.indexOf(qName);
    qName = order[(cur + 1) % order.length];
    location.search = `?q=${qName}${forceP !== null ? `&p=${forceP}` : ''}${qs.get('debug') === '1' ? '&debug=1' : ''}`;
  }

  /* ── 键盘：方向键 / PgUp / PgDn 推进分镜 ── */
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && introActive) return endIntro(true);
    if (e.key === ' ' && introActive) { e.preventDefault(); return endIntro(true); }
    if (introActive) return;
    const len = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const jump = window.innerHeight * 0.9;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); window.scrollBy({ top: jump, behavior: 'smooth' }); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); window.scrollBy({ top: -jump, behavior: 'smooth' }); }
    if (e.key === 'Home') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (e.key === 'End') { e.preventDefault(); window.scrollTo({ top: len, behavior: 'smooth' }); }
  });

  /* ── 对外调试句柄 ── */
  window.__DOUBAO = {
    stage, character, particles, rig, interactor, hud,
    get p() { return p; },
    get errors() { return errs.slice(); },
    state: () => debugEl.dataset.state,
    goTo(v) {
      const len = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, clamp(v) * len);
    },
    skipIntro: () => endIntro(true)
  };
}
