/**
 * 运镜：把「滚动进度 p」翻译成相机参数。
 * 每个分镜的锚点 p 由该 section 在文档里的真实位置算出，
 * 因此文案增删、区块改高都不会让镜头与文字错位。
 */
import * as THREE from 'three';
import { BEATS, clamp, lerp, easeInOutCubic, noise3 } from '../config.js';

export function createCameraRig({ camera, beats = BEATS }) {
  const anchors = [];
  let scrollLen = 1;

  function measure() {
    const doc = document.documentElement;
    scrollLen = Math.max(1, doc.scrollHeight - window.innerHeight);
    anchors.length = 0;
    for (const b of beats) {
      const el = document.querySelector(`[data-beat="${b.id}"]`);
      let p = 0;
      if (el) {
        const center = el.offsetTop + el.offsetHeight * 0.5 - window.innerHeight * 0.5;
        p = clamp(center / scrollLen);
      }
      anchors.push({ id: b.id, idx: b.idx, name: b.name, en: b.en, p, cam: b.cam });
    }
    for (let i = 1; i < anchors.length; i++) {
      if (anchors[i].p <= anchors[i - 1].p + 1e-4) anchors[i].p = anchors[i - 1].p + 1e-3;
    }
    anchors[0].p = 0;
    anchors[anchors.length - 1].p = 1;
  }

  const _pos = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const cur = {
    pos: new THREE.Vector3(0, 1.664, 0.46),
    look: new THREE.Vector3(0, 1.6625, 0),
    fov: 34,
    roll: 0,
    orbit: 0.1
  };

  /** 找到 p 落在哪个分镜区间，并做缓动插值 */
  function sample(p) {
    let i = 0;
    while (i < anchors.length - 2 && p > anchors[i + 1].p) i++;
    const a = anchors[i], b = anchors[i + 1];
    const span = Math.max(1e-6, b.p - a.p);
    const t = clamp((p - a.p) / span);
    const e = easeInOutCubic(t);
    const ca = a.cam, cb = b.cam;
    _pos.set(
      lerp(ca.pos[0], cb.pos[0], e),
      lerp(ca.pos[1], cb.pos[1], e),
      lerp(ca.pos[2], cb.pos[2], e)
    );
    _look.set(
      lerp(ca.look[0], cb.look[0], e),
      lerp(ca.look[1], cb.look[1], e),
      lerp(ca.look[2], cb.look[2], e)
    );
    return {
      pos: _pos,
      look: _look,
      fov: lerp(ca.fov, cb.fov, e),
      orbitLimit: lerp(ca.orbit, cb.orbit, e),
      roll: lerp(ca.roll ?? 0, cb.roll ?? 0, e),
      from: a,
      to: b,
      local: t
    };
  }

  /** 主循环：p 已平滑，orbit 来自拖拽，pointer 为 -1..1 的归一化指针 */
  function update(p, dt, { orbit = 0, pointer = { x: 0, y: 0 }, time = 0, shake = 1 } = {}) {
    const s = sample(p);

    // 轨道环绕：绕注视点转 Y 轴
    const yaw = orbit;
    const dx = s.pos.x - s.look.x;
    const dz = s.pos.z - s.look.z;
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    _pos.set(s.look.x + dx * ca - dz * sa, s.pos.y, s.look.z + dx * sa + dz * ca);

    // 手持微抖 + 指针视差
    const n1 = noise3(time * 0.33, 0.5, 0.0) - 0.5;
    const n2 = noise3(0.0, time * 0.29, 5.2) - 0.5;
    const n3 = noise3(3.1, 0.0, time * 0.24) - 0.5;
    _pos.x += n1 * 0.007 * shake + pointer.x * 0.016;
    _pos.y += n2 * 0.006 * shake - pointer.y * 0.010;
    _pos.z += n3 * 0.004 * shake;

    const k = 1 - Math.exp(-16 * dt);
    cur.pos.lerp(_pos, k);
    cur.look.lerp(s.look, 1 - Math.exp(-13 * dt));
    cur.fov = lerp(cur.fov, s.fov, 1 - Math.exp(-8 * dt));
    cur.roll = lerp(cur.roll, s.roll + pointer.x * 0.004, 1 - Math.exp(-6 * dt));
    cur.orbitLimit = s.orbitLimit;

    camera.position.copy(cur.pos);
    camera.lookAt(cur.look);
    camera.rotateZ(cur.roll);
    if (Math.abs(camera.fov - cur.fov) > 0.001) {
      camera.fov = cur.fov;
      camera.updateProjectionMatrix();
    }
    return s;
  }

  /** 当前所在分镜（用于 HUD / 提示显隐） */
  function beatAt(p) {
    let i = 0;
    while (i < anchors.length - 2 && p > anchors[i + 1].p) i++;
    const a = anchors[i], b = anchors[i + 1];
    const t = (p - a.p) / Math.max(1e-6, b.p - a.p);
    return { from: a, to: b, t, current: t > 0.5 ? b : a };
  }

  measure();
  return { measure, sample, update, beatAt, anchors, orbitLimitAt: p => sample(p).orbitLimit };
}
