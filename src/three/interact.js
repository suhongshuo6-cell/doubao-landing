/**
 * 交互：
 *   · 捏脸 —— 指针落在面部区域且脸部足够大时启用。按下 → 高斯收缩形变 + 欠阻尼弹簧回弹，
 *             松手会有 1~2 次可见余振（"Q 弹"的来源）。全程没有任何闪光反馈。
 *   · 转身 —— 在非面部区域横向拖拽，正面 ↔ 侧面 ↔ 背面连续转动，松手吸附到最近的视图并回弹。
 *   · 视差 —— 指针位置驱动立绘的极小幅位移，带来"活着"的感觉。
 */
import { PORTRAIT, clamp, lerp } from '../config.js';

export function createInteractor({ canvas, portrait, hooks = {} }) {
  const state = {
    pointer: { x: 0, y: 0 },     // 平滑后的 -1..1
    raw: { x: 0, y: 0 },
    overFace: false,
    overCanvas: false,
    pinching: false,
    dragging: false,
    turn: 0,                      // 连续转身值，0=正 1=侧 2=背
    pressAmount: 0
  };

  let turnBase = 0;
  let turnTarget = 0;
  let turnVel = 0;
  let dragging = false, dragStartX = 0, dragMoved = 0;

  const pressPos = { x: PORTRAIT.cx, y: 54 };
  const pressTarget = { x: PORTRAIT.cx, y: 54 };
  let pressAmt = 0, pressVel = 0, pressTargetAmt = 0;
  let pinching = false;

  function toNDC(e) {
    const r = canvas.getBoundingClientRect();
    state.raw.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    state.raw.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  /** 指针是否落在脸部（并且脸足够大，捏起来才有意义） */
  function faceHit(e) {
    if (portrait.visibleHeight > PORTRAIT.pinchMaxViewH) return null;
    const p = portrait.screenToImage(e.clientX, e.clientY);
    const b = PORTRAIT.faceBox;
    if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) return null;
    return p;
  }

  /* ── 指针移入 / 移出画布 ── */
  canvas.addEventListener('pointerenter', () => { state.overCanvas = true; });
  canvas.addEventListener('pointerleave', () => {
    state.overCanvas = false;
    state.overFace = false;
    state.raw.x = 0; state.raw.y = 0;
    if (pinching) { pinching = false; state.pinching = false; pressTargetAmt = 0; }
    dragging = false; state.dragging = false;
  });

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    toNDC(e);
    canvas.setPointerCapture?.(e.pointerId);
    const hit = faceHit(e);
    if (hit) {
      pinching = true;
      state.pinching = true;
      pressTarget.x = hit.x;
      pressTarget.y = hit.y;
      if (pressAmt < 0.02) { pressPos.x = hit.x; pressPos.y = hit.y; }
      pressTargetAmt = PORTRAIT.pressMax;
      pressVel += 0.9;                       // 按下给一点冲量，手感更弹
      hooks.onPressStart?.(hit);
    } else {
      dragging = true;
      state.dragging = true;
      dragStartX = e.clientX;
      dragMoved = 0;
      turnBase = state.turn;
    }
  });

  canvas.addEventListener('pointermove', e => {
    toNDC(e);
    if (pinching) {
      const hit = faceHit(e);
      if (hit) {
        pressTarget.x = hit.x;
        pressTarget.y = hit.y;
        // 拖得越快，捏得越深
        const speed = Math.abs(e.movementX ?? 0) + Math.abs(e.movementY ?? 0);
        pressTargetAmt = PORTRAIT.pressMax * (1 + Math.min(0.5, speed / 46));
      }
      hooks.onPressMove?.(hit);
    } else if (dragging) {
      const dx = e.clientX - dragStartX;
      dragMoved = Math.abs(dx);
      state.turn = clamp(turnBase - dx / PORTRAIT.turnDragPx, -0.28, 2.28);
    }
  });

  function endPointer(e) {
    if (pinching) {
      pinching = false;
      state.pinching = false;
      pressTargetAmt = 0;                    // 松手 → 弹簧回弹
      hooks.onPressEnd?.();
    }
    if (dragging) {
      dragging = false;
      state.dragging = false;
      if (dragMoved < 6) hooks.onTap?.(e);
      turnTarget = clamp(Math.round(state.turn), 0, 2);   // 吸附到最近视图
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  /* ── 每帧 ── */
  function update(dt, time) {
    // 指针平滑（视差与视线跟随都用它）
    state.pointer.x = lerp(state.pointer.x, state.raw.x, 1 - Math.exp(-4 * dt));
    state.pointer.y = lerp(state.pointer.y, state.raw.y, 1 - Math.exp(-4 * dt));
    portrait.setParallax(state.pointer.x * PORTRAIT.parallax, -state.pointer.y * PORTRAIT.parallax * 0.6);

    // 悬停检测（未按下时）
    if (!dragging && !pinching) {
      const hit = faceHitFromLastPointer();
      state.overFace = !!hit;
      if (hit) {
        pressTarget.x = hit.x;
        pressTarget.y = hit.y;
        pressTargetAmt = PORTRAIT.pressHover;
      } else {
        pressTargetAmt = 0;
      }
    }

    // 转身吸附回弹（欠阻尼 → 松手后有轻微过冲）
    if (!dragging) {
      const k = PORTRAIT.turnSpring.k, c = PORTRAIT.turnSpring.c;
      turnVel += (-k * (state.turn - turnTarget) - c * turnVel) * dt;
      state.turn += turnVel * dt;
    }

    // 捏脸弹簧（欠阻尼 → Q 弹余振）
    const k2 = 330, c2 = 15;
    pressVel += (-k2 * (pressAmt - pressTargetAmt) - c2 * pressVel) * dt;
    pressAmt += pressVel * dt;
    if (Math.abs(pressAmt) < 1e-4 && Math.abs(pressVel) < 1e-4) { pressAmt = 0; pressVel = 0; }

    // 按压点平滑（避免逐帧抖动）
    pressPos.x = lerp(pressPos.x, pressTarget.x, 1 - Math.exp(-22 * dt));
    pressPos.y = lerp(pressPos.y, pressTarget.y, 1 - Math.exp(-22 * dt));

    portrait.state.turn = state.turn;
    portrait.setPressPoint(pressPos.x, pressPos.y);
    portrait.setPressAmount(pressAmt);
    state.pressAmount = pressAmt;

    return state;
  }

  // 悬停检测需要屏幕坐标，这里缓存最近一次的指针位置
  let lastClient = { x: -9999, y: -9999 };
  canvas.addEventListener('pointermove', e => { lastClient = { x: e.clientX, y: e.clientY }; },
    { passive: true });
  canvas.addEventListener('pointerenter', e => { lastClient = { x: e.clientX, y: e.clientY }; });
  function faceHitFromLastPointer() {
    if (!state.overCanvas) return null;
    return faceHit({ clientX: lastClient.x, clientY: lastClient.y });
  }

  return { state, update, faceHit };
}
