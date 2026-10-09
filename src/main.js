/**
 * 入口：全屏立绘 + 明亮棚拍主题 + 滚动取景漫游。
 *
 * 调试参数：
 *   ?p=0.42        直接停在某个滚动进度（跳过开场）
 *   ?nointro=1     跳过开场
 *   ?q=low|medium|high  指定画质
 *   ?debug=1       右下角调试面板
 *   ?frames=8      只渲染 8 帧后停住（无头截图用）
 *   ?view=side|back 直接切到某个视图
 */
import * as THREE from 'three';

// 立绘是"照片"，整条管线都在显示空间做图像处理（不做线性工作流），
// 这样 clear color / 背景色 / 贴图采样都所见即所得。
THREE.ColorManagement.enabled = false;

import { createPortrait } from './three/portrait.js';
import { createPortraitRig } from './three/portraitRig.js';
import { createInteractor } from './three/interact.js';
import { createHud } from './ui/hud.js';
import { createReveal } from './ui/reveal.js';
import { createAudio } from './ui/audio.js';
import { QUALITY, INTRO, PALETTE, clamp, lerp, easeOutCubic } from './config.js';

/* ══════════ 调试 / 错误通道（无头浏览器靠它核对） ══════════ */
const qs = new URLSearchParams(location.search);
const debugEl = document.createElement('pre');
debugEl.id = 'debug';
debugEl.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9999;margin:0;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#2f6f4f;text-align:right;pointer-events:none;display:none;';
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
const maxFrames = qs.has('frames') ? Math.max(1, parseInt(qs.get('frames'), 10) || 1) : 0;
const forceView = { side: 1, back: 2 }[qs.get('view')] ?? null;

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

  let qName = pickQuality();
  let quality = QUALITY[qName];

  hud.setLoading(0.05, '初始化渲染器');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false
  });
  renderer.setClearColor(new THREE.Color(PALETTE.bg0), 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  await nextFrame();

  hud.setLoading(0.14, '载入立绘');
  const portrait = await createPortrait({
    renderer,
    quality,
    onProgress: (frac, name, ok) => {
      const label = { front: '正面', side: '侧面', back: '背面' }[name] || name;
      hud.setLoading(0.14 + frac * 0.72,
        ok ? `载入立绘 · ${label}` : `缺少立绘 · ${label}（已用占位图）`);
    }
  });

  hud.setLoading(0.9, '校准取景');
  const rig = createPortraitRig();
  const interactor = createInteractor({
    canvas, portrait,
    hooks: {
      onPressStart: () => audio.blip(680, 0.2, 'sine', 0.10),
      onPressMove: hit => { if (hit) audio.blip(430 + Math.random() * 150, 0.08, 'triangle', 0.035); },
      onTap: () => audio.blip(520, 0.1, 'sine', 0.05)
    }
  });
  createReveal();

  /* ── 尺寸 ── */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, quality.dpr);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    portrait.uniforms.uRes.value.set(w * pr, h * pr);
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

  if (forceView !== null) { interactor.state.turn = forceView; portrait.state.turnCur = forceView; }

  /* ── 首帧 ── */
  hud.setLoading(0.97, '准备就绪');
  portrait.state.turnCur = interactor.state.turn;
  portrait.update(1 / 60, 0);
  renderer.render(portrait.scene, portrait.camera);
  await nextFrame();
  hud.setLoading(1, '准备就绪');
  hud.finishLoading();
  hud.setQualityLabel(quality.label);

  /* ══════════ 开场：只做一次推近 + 对焦，没有粒子也没有闪光 ══════════ */
  let introT = 0;
  let introActive = !skipIntro;
  document.documentElement.style.overflow = introActive ? 'hidden' : '';
  if (forceP === null) window.scrollTo(0, 0);

  function endIntro(byUser = false) {
    if (!introActive) return;
    introActive = false;
    document.documentElement.style.overflow = '';
    portrait.state.zoom = 1;
    portrait.setBlur(0);
    portrait.setExposure(1);
    hud.setSkip(false);
    if (byUser) hud.el.beatLabel?.classList.add('is-in');
  }

  function updateIntro(dt) {
    introT += dt;
    const t = clamp(introT / INTRO.total);
    const e = easeOutCubic(t);
    portrait.state.zoom = lerp(INTRO.zoomFrom, 1, e);
    portrait.setBlur(lerp(INTRO.blurFrom, 0, e));
    portrait.setExposure(lerp(1.04, 1, e));
    hud.setSkip(t > 0.7);
    if (t >= 1) endIntro();
  }

  /* ══════════ 分镜 UI 配置 ══════════ */
  const BEAT_UI = {
    hero: { pinch: true, drag: false, scrim: 0.00 },
    face: { pinch: true, drag: false, scrim: 0.00 },
    neck: { pinch: false, drag: false, scrim: 0.14 },
    chest: { pinch: false, drag: false, scrim: 0.18 },
    waist: { pinch: false, drag: false, scrim: 0.18 },
    arms: { pinch: false, drag: true, scrim: 0.16 },
    legs: { pinch: false, drag: false, scrim: 0.16 },
    feet: { pinch: false, drag: false, scrim: 0.14 },
    full: { pinch: false, drag: true, scrim: 0.28 },
    download: { pinch: false, drag: false, scrim: 0.40 }
  };

  /* ══════════ 主循环 ══════════ */
  let time = 0, last = performance.now();
  let p = forceP ?? 0, pSmooth = p;
  let fpsAcc = 0, fpsFrames = 0, fps = 60, dbgAcc = 0;
  let frameCount = 0, downscaled = false;
  const frameBuf = { cy: 54, w: 215 };

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
    last = now;
    time += dt;

    const scrollLen = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const targetP = clamp(window.scrollY / scrollLen);

    if (introActive) {
      updateIntro(dt);
      p = 0; pSmooth = 0;
      const s0 = rig.sample(0);
      frameBuf.cy = s0.cy; frameBuf.w = s0.w;
    } else {
      p = targetP;
      pSmooth += (p - pSmooth) * (1 - Math.exp(-13 * dt));
      const s = rig.sample(pSmooth);
      frameBuf.cy = s.cy; frameBuf.w = s.w;

      const st = interactor.update(dt, time);
      const beat = rig.beatAt(pSmooth);
      const a = BEAT_UI[beat.from.id] || BEAT_UI.face;
      const b = BEAT_UI[beat.to.id] || a;
      const e = easeOutCubic(beat.t);
      const pinchOn = beat.t < 0.5 ? a.pinch : b.pinch;
      const dragOn = beat.t < 0.5 ? a.drag : b.drag;

      hud.setBeat(beat.t > 0.5 ? beat.to : beat.from);
      hud.setScrollProgress(pSmooth);
      hud.setSolid(pSmooth > 0.012);
      hud.setScrim(lerp(a.scrim, b.scrim, e));
      hud.setPinchHint(pinchOn && !st.pinching);
      hud.setDragHint(dragOn);
      hud.setCursorState({ pinch: st.overFace, drag: st.overCanvas && !st.overFace });
    }

    portrait.setFrame(frameBuf);
    portrait.update(dt, time);
    renderer.render(portrait.scene, portrait.camera);

    hud.tickCursor(dt);

    // 轻量自动降级
    if (!downscaled && !forceP) {
      fpsAcc += dt; fpsFrames++;
      if (fpsAcc > 1) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
      if (fps < 26 && time > 8) { downscaled = true; applyLowFallback(); }
    }

    dbgAcc += dt;
    if (dbgAcc > 0.4) {
      dbgAcc = 0;
      const info = renderer.info;
      debugEl.dataset.state =
        `p=${p.toFixed(3)} q=${qName} fps=${fps.toFixed(0)} turn=${interactor.state.turn.toFixed(2)} ` +
        `cy=${frameBuf.cy.toFixed(1)} w=${frameBuf.w.toFixed(1)} press=${interactor.state.pressAmount.toFixed(3)} ` +
        `tri=${info.render.triangles} calls=${info.render.calls} ` +
        `view=${['front', 'side', 'back'][Math.round(clamp(interactor.state.turn, 0, 2))]}`;
      if (qs.get('debug') === '1' || errs.length) {
        debugEl.style.display = 'block';
        debugEl.textContent = (errs.length ? 'ERROR: ' + errs.join('\n') + '\n' : '') + debugEl.dataset.state;
      }
    }

    frameCount++;
    if (maxFrames && frameCount >= maxFrames) {
      debugEl.style.display = 'block';
      debugEl.textContent = (errs.length ? 'ERROR: ' + errs.join('\n') + '\n' : '') + debugEl.dataset.state;
      debugEl.dataset.frames = String(frameCount);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function applyLowFallback() {
    renderer.setPixelRatio(1);
    portrait.uniforms.uGrain.value = 0.004;
    portrait.uniforms.uSharp.value = 0;
    document.body.classList.add('quality-low');
    hud.setQualityLabel('AUTO-LOW');
    qName = 'low';
  }

  function cycleQuality() {
    const order = ['high', 'medium', 'low'];
    const cur = order.indexOf(qName);
    const next = order[(cur + 1) % order.length];
    const extra = `${forceP !== null ? `&p=${forceP}` : ''}${qs.get('debug') === '1' ? '&debug=1' : ''}`;
    location.search = `?q=${next}${extra}`;
  }

  /* ── 键盘推进分镜 / 左右转身 ── */
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
    if (e.key === 'ArrowLeft') { e.preventDefault(); interactor.state.turn = clamp(Math.round(interactor.state.turn) + 1, 0, 2); }
    if (e.key === 'ArrowRight') { e.preventDefault(); interactor.state.turn = clamp(Math.round(interactor.state.turn) - 1, 0, 2); }
  });

  /* ── 对外调试句柄 ── */
  window.__DOUBAO = {
    renderer, portrait, rig, interactor, hud,
    get p() { return p; },
    get errors() { return errs.slice(); },
    get missingImages() { return portrait.state.missing; },
    state: () => debugEl.dataset.state,
    goTo(v) {
      const len = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, clamp(v) * len);
    },
    setTurn(v) { interactor.state.turn = clamp(v, 0, 2); },
    skipIntro: () => endIntro(true)
  };
}
