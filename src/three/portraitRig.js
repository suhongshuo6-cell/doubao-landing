/**
 * 取景轨：把「滚动进度 p」翻译成立绘取景框（cy / w，单位为原图像素）。
 * 每个分镜的锚点 p 由该 section 在文档里的真实位置算出，
 * 所以改文案、调区块高度都不会让取景与文字错位。
 */
import { BEATS, clamp, lerp, easeInOutCubic } from '../config.js';

export function createPortraitRig({ beats = BEATS } = {}) {
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
      anchors.push({ id: b.id, idx: b.idx, name: b.name, en: b.en, p, frame: b.frame });
    }
    for (let i = 1; i < anchors.length; i++) {
      if (anchors[i].p <= anchors[i - 1].p + 1e-4) anchors[i].p = anchors[i - 1].p + 1e-3;
    }
    anchors[0].p = 0;
    anchors[anchors.length - 1].p = 1;
  }

  /** p → { cy, w }，段内 easeInOutCubic，所以镜头会在每个分镜处自然减速停顿 */
  function sample(p) {
    let i = 0;
    while (i < anchors.length - 2 && p > anchors[i + 1].p) i++;
    const a = anchors[i], b = anchors[i + 1];
    const t = clamp((p - a.p) / Math.max(1e-6, b.p - a.p));
    const e = easeInOutCubic(t);
    return {
      cy: lerp(a.frame.cy, b.frame.cy, e),
      w: lerp(a.frame.w, b.frame.w, e),
      from: a, to: b, t
    };
  }

  function beatAt(p) {
    let i = 0;
    while (i < anchors.length - 2 && p > anchors[i + 1].p) i++;
    const a = anchors[i], b = anchors[i + 1];
    const t = (p - a.p) / Math.max(1e-6, b.p - a.p);
    return { from: a, to: b, t, current: t > 0.5 ? b : a };
  }

  measure();
  return { measure, sample, beatAt, anchors };
}
