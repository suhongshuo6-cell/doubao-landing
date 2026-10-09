/**
 * HUD：加载屏 / 顶栏 / 分镜刻度 / 部位标签 / 提示 / 自定义光标
 * 只负责 DOM，不碰 3D。所有状态由 main.js 每帧驱动。
 */
export function createHud({ onNav, onQuality, onSound, onSkip } = {}) {
  const $ = s => document.querySelector(s);
  const el = {
    body: document.body,
    loader: $('#loader'),
    loaderBar: $('#loaderBar'),
    loaderPct: $('#loaderPct'),
    loaderStage: $('#loaderStage'),
    topbar: $('#topbar'),
    reelFill: $('#reelFill'),
    ticks: Array.from(document.querySelectorAll('.reel__ticks li')),
    beatLabel: $('#beatLabel'),
    beatIdx: $('#beatIdx'),
    beatName: $('#beatName'),
    beatEn: $('#beatEn'),
    hintPinch: $('#hintPinch'),
    hintDrag: $('#hintDrag'),
    cursor: $('#cursor'),
    sound: $('#soundToggle'),
    quality: $('#qualityToggle'),
    wake: $('#wakeHint'),
    scrim: $('#scrim'),
    year: $('#year'),
    navLinks: Array.from(document.querySelectorAll('[data-nav]'))
  };

  if (el.year) el.year.textContent = String(new Date().getFullYear());

  let cursorState = { active: false, pinch: false, drag: false, down: false };
  let solid = null, beatKey = null, pinchShown = null, dragShown = null;

  /* ── 光标 ── */
  let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  let tx = cx, ty = cy;
  window.addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
  window.addEventListener('pointerdown', () => { cursorState.down = true; applyCursor(); });
  window.addEventListener('pointerup', () => { cursorState.down = false; applyCursor(); });
  const HOVERABLE = 'a,button,.tile,.card,.qr__box,.reel__ticks li,input,[data-magnetic]';
  window.addEventListener('pointerover', e => {
    const t = e.target;
    cursorState.active = !!(t && t.closest && t.closest(HOVERABLE));
    applyCursor();
  }, { passive: true });

  function applyCursor() {
    if (!el.cursor) return;
    el.cursor.classList.toggle('is-active', cursorState.active);
    el.cursor.classList.toggle('is-pinch', cursorState.pinch);
    el.cursor.classList.toggle('is-drag', cursorState.drag && !cursorState.pinch);
    el.cursor.classList.toggle('is-down', cursorState.down);
  }

  /* ── 导航 ── */
  for (const link of el.navLinks) {
    link.addEventListener('click', e => {
      const id = link.dataset.nav;
      const target = id === 'hero' ? '#s-hero' : `#s-${id}`;
      const node = document.querySelector(target);
      if (node) {
        e.preventDefault();
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        onNav?.(id);
      }
    });
  }

  el.sound?.addEventListener('click', () => {
    const on = el.sound.getAttribute('aria-pressed') !== 'true';
    el.sound.setAttribute('aria-pressed', String(on));
    onSound?.(on);
  });
  el.quality?.addEventListener('click', () => { onQuality?.(); });
  el.wake?.addEventListener('click', () => { onSkip?.(); });
  el.wake?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSkip?.(); }
  });

  return {
    el,
    /** 加载进度 0..1 */
    setLoading(v, stage) {
      const pct = Math.round(v * 100);
      if (el.loaderBar) el.loaderBar.style.width = pct + '%';
      if (el.loaderPct) el.loaderPct.textContent = String(pct);
      if (stage && el.loaderStage) el.loaderStage.textContent = stage;
    },
    finishLoading() {
      el.loader?.classList.add('is-done');
      el.body.classList.remove('is-loading');
      el.body.classList.add('is-ready');
      setTimeout(() => { if (el.loader) el.loader.style.display = 'none'; }, 900);
    },
    setNoWebGL() {
      const fb = document.querySelector('#fallback');
      if (fb) fb.hidden = false;
      this.finishLoading();
    },
    setScrollProgress(p) {
      if (el.reelFill) el.reelFill.style.height = (p * 100).toFixed(2) + '%';
    },
    setBeat(beat) {
      if (!beat || beatKey === beat.id) return;
      beatKey = beat.id;
      if (el.beatIdx) el.beatIdx.textContent = beat.idx;
      if (el.beatName) el.beatName.textContent = beat.name;
      if (el.beatEn) el.beatEn.textContent = beat.en;
      for (const t of el.ticks) t.classList.toggle('is-active', t.dataset.nav === beat.id);
      el.beatLabel?.classList.add('is-in');
    },
    setSolid(v) {
      const s = v > 0.02;
      if (s === solid) return;
      solid = s;
      el.topbar?.classList.toggle('is-solid', s);
    },
    setPinchHint(v) {
      if (v === pinchShown) return;
      pinchShown = v;
      el.hintPinch?.classList.toggle('is-in', v);
    },
    setDragHint(v) {
      if (v === dragShown) return;
      dragShown = v;
      el.hintDrag?.classList.toggle('is-in', v);
    },
    setScrim(v) {
      if (el.scrim) el.scrim.style.opacity = v.toFixed(3);
    },
    setSkip(v) {
      if (!el.wake) return;
      // main.css 里 .wake 默认是可见的（它不在原始 JS 钩子清单里），
      // 所以这里用 hidden 属性 + [hidden]{display:none!important} 来兜底控制。
      el.wake.hidden = !v;
      el.wake.classList.toggle('is-in', !!v);
    },
    setCursorState(patch) {
      Object.assign(cursorState, patch);
      applyCursor();
    },
    setQualityLabel(label) {
      if (el.quality) el.quality.setAttribute('title', `画质档位：${label}（点击切换）`);
    },
    tickCursor(dt) {
      const k = 1 - Math.exp(-22 * dt);
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      if (el.cursor) el.cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
    }
  };
}
