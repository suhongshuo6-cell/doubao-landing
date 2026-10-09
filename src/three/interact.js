/**
 * 交互：
 *  · 脸部按压 / 捏脸 —— 解析法求射线与头表面的交点（隐式曲面，逐次二分），
 *    只用 4 个捏点 uniform 做高斯位移，手感用欠阻尼弹簧。
 *  · 横向拖拽环绕 —— 松手弹回中位。
 *  · 视线跟随 —— 眼球朝指针方向转。
 */
import * as THREE from 'three';
import { HEAD, clamp } from '../config.js';
import { deformHead } from './character.js';

const _n = new THREE.Vector3();
const _p = new THREE.Vector3();

/** 单位空间隐式曲面：|p| < |deformHead(dir)| 表示在头内部 */
function insideHead(px, py, pz) {
  const len = Math.hypot(px, py, pz);
  if (len < 1e-5) return true;
  deformHead(px / len, py / len, pz / len, _n);
  return len < _n.length();
}

/** 射线与头部求交，返回单位空间坐标（未命中或背面返回 null） */
function rayHead(origin, dir) {
  const inv = [1 / HEAD.scale[0], 1 / HEAD.scale[1], 1 / HEAD.scale[2]];
  const ox = (origin.x - HEAD.center[0]) * inv[0];
  const oy = (origin.y - HEAD.center[1]) * inv[1];
  const oz = (origin.z - HEAD.center[2]) * inv[2];
  let dx = dir.x * inv[0], dy = dir.y * inv[1], dz = dir.z * inv[2];
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl; dy /= dl; dz /= dl;

  // 与单位球求交，得到参数区间
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - 1.05 * 1.05;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t0 = -b - sq, t1 = -b + sq;
  if (t1 < 0) return null;
  if (t0 < 0) t0 = 0;

  // 粗步进找进入点
  const steps = 26;
  let prev = t0, hit = -1;
  for (let i = 1; i <= steps; i++) {
    const t = t0 + (t1 - t0) * (i / steps);
    if (insideHead(ox + dx * t, oy + dy * t, oz + dz * t)) { hit = t; break; }
    prev = t;
  }
  if (hit < 0) return null;

  // 二分细化
  let a = prev, bb = hit;
  for (let i = 0; i < 14; i++) {
    const m = (a + bb) * 0.5;
    if (insideHead(ox + dx * m, oy + dy * m, oz + dz * m)) bb = m; else a = m;
  }
  const t = (a + bb) * 0.5;
  const p = new THREE.Vector3(ox + dx * t, oy + dy * t, oz + dz * t);
  // 只允许正面（脸）参与捏脸
  const nrm = p.clone().normalize();
  if (nrm.z < 0.28) return null;
  return p;
}

export function createInteractor({ canvas, camera, rig, character, hooks = {} }) {
  const headU = character.materials.head.uniforms;
  const eyeU = character.materials.eye.uniforms;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const state = {
    pointer: { x: 0, y: 0 },        // 平滑后的 -1..1
    raw: { x: 0, y: 0 },
    overFace: false,
    pinching: false,
    orbit: 0,
    orbitLimit: 0.3,
    gaze: new THREE.Vector3(0, 0, 1)
  };

  let orbitTarget = 0, orbitVel = 0;
  let dragging = false, dragStartX = 0, orbitStart = 0, dragMoved = 0;
  let pinchActive = false;
  const pinchPos = new THREE.Vector3();     // 单位空间
  const pinchPosTarget = new THREE.Vector3();
  const spring = { x: 0, v: 0, target: 0 };
  let lastPinchTime = 0;

  const PINCH_HOVER = 0.0075;
  const PINCH_PRESS = 0.034;

  function setNDC(e) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    state.raw.x = ndc.x;
    state.raw.y = ndc.y;
  }

  function faceHit() {
    raycaster.setFromCamera(ndc, camera);
    return rayHead(raycaster.ray.origin, raycaster.ray.direction);
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    setNDC(e);
    canvas.setPointerCapture?.(e.pointerId);
    const hit = faceHit();
    if (hit) {
      pinchActive = true;
      state.pinching = true;
      state.overFace = true;
      pinchPosTarget.copy(hit);
      if (spring.x < 0.004) pinchPos.copy(hit);
      spring.target = PINCH_PRESS;
      spring.v += 0.55;                       // 按下时给一点冲量，手感更"弹"
      hooks.onPinchStart?.(hit);
    } else {
      dragging = true;
      dragStartX = e.clientX;
      orbitStart = state.orbit;
      dragMoved = 0;
    }
    hooks.onPointerDown?.(e);
  });

  canvas.addEventListener('pointermove', e => {
    setNDC(e);
    if (pinchActive) {
      const hit = faceHit();
      if (hit) {
        pinchPosTarget.copy(hit);
        const speed = Math.abs(e.movementX ?? 0) + Math.abs(e.movementY ?? 0);
        spring.target = PINCH_PRESS * (1 + Math.min(0.9, speed / 40));
        lastPinchTime = performance.now();
      }
      hooks.onPinchMove?.(hit);
    } else if (dragging) {
      const dx = e.clientX - dragStartX;
      dragMoved = Math.abs(dx);
      orbitTarget = clamp(orbitStart - (dx / window.innerWidth) * 4.2 * state.orbitLimit,
        -state.orbitLimit, state.orbitLimit);
    }
    hooks.onPointerMove?.(e);
  });

  function endPointer(e) {
    if (pinchActive) {
      pinchActive = false;
      state.pinching = false;
      spring.target = PINCH_HOVER;
      hooks.onPinchEnd?.();
    }
    if (dragging) {
      dragging = false;
      if (dragMoved < 6) hooks.onTap?.(e);
      orbitTarget = 0;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => {
    state.raw.x = 0; state.raw.y = 0;
    if (pinchActive) { pinchActive = false; state.pinching = false; spring.target = 0; }
    dragging = false;
    orbitTarget = 0;
  });

  // 触屏轻点：无鼠标时的"唤醒"手势
  canvas.addEventListener('click', e => {
    if (!state.overFace) hooks.onTap?.(e);
  });

  function update(p, dt, time) {
    // 指针平滑
    state.pointer.x += (state.raw.x - state.pointer.x) * (1 - Math.exp(-9 * dt));
    state.pointer.y += (state.raw.y - state.pointer.y) * (1 - Math.exp(-9 * dt));

    state.orbitLimit = rig.orbitLimitAt(p);

    // 横向环绕（欠阻尼弹簧回中）
    if (!dragging) orbitTarget *= Math.exp(-6 * dt);
    const k = 120, c = 13;
    orbitVel += (-k * (state.orbit - orbitTarget) - c * orbitVel) * dt;
    state.orbit += orbitVel * dt;

    // 脸部命中：非拖拽状态下也跟随指针
    let hit = null;
    if (!dragging) {
      hit = faceHit();
      state.overFace = !!hit;
      if (hit && !pinchActive) {
        if (!state.overFacePrev) pinchPos.copy(hit);
        pinchPosTarget.copy(hit);
        spring.target = PINCH_HOVER;
      } else if (!hit && !pinchActive) {
        spring.target = 0;
      }
      state.overFacePrev = !!hit;
    } else {
      state.overFace = false;
    }

    // 捏点位置平滑（避免逐帧抖动）
    pinchPos.lerp(pinchPosTarget, 1 - Math.exp(-24 * dt));

    // 欠阻尼弹簧：松手后会有 1~2 次可见余振，就是"Q 弹"的来源
    const kk = 300, cc = 15;
    spring.v += (-kk * (spring.x - spring.target) - cc * spring.v) * dt;
    spring.x += spring.v * dt;
    if (Math.abs(spring.x) < 1e-5 && Math.abs(spring.v) < 1e-5) { spring.x = 0; spring.v = 0; }

    const arr = headU.uPinch.value;
    arr[0].set(pinchPos.x, pinchPos.y, pinchPos.z, spring.x);
    for (let i = 1; i < 4; i++) arr[i].set(0, 0, 0, 0);

    // 视线跟随指针
    const gx = state.pointer.x * 0.30;
    const gy = state.pointer.y * 0.20 + 0.02;
    const gz = 1;
    state.gaze.lerp(_p.set(gx, gy, gz).normalize(), 1 - Math.exp(-7 * dt));
    eyeU.uGaze.value.copy(state.gaze).normalize();

    return { hit, pinchStrength: spring.x, overFace: state.overFace };
  }

  return { state, update, faceHit, rayHead };
}
