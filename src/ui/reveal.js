/**
 * DOM 动效层：逐字揭示、区块入场、卡片跟随倾斜、磁吸按钮。
 * 不依赖任何外部库，样式以内联 transition 保证与 main.css 解耦。
 */
const EASE = 'cubic-bezier(.22,1,.36,1)';

export function createReveal() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 逐字拆分会带 stagger 的标题 ── */
  const splitTargets = document.querySelectorAll('.hero__title .line, .htitle, .cta__title');
  for (const node of splitTargets) {
    const text = node.textContent;
    node.textContent = '';
    node.setAttribute('aria-label', text);
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch === ' ' ? '\u00A0' : ch;
      s.setAttribute('aria-hidden', 'true');
      s.style.display = 'inline-block';
      s.style.willChange = 'transform,opacity';
      if (!reduce) {
        s.style.opacity = '0';
        s.style.transform = 'translateY(0.62em) rotateX(-38deg)';
        s.style.transition = `opacity .72s ${EASE} ${i * 34}ms, transform .86s ${EASE} ${i * 34}ms`;
      }
      node.appendChild(s);
    });
    node._chars = Array.from(node.children);
  }

  /* ── 区块 / 文字揭示 ── */
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const t = e.target;
      t.classList.add('is-in');
      if (t._chars) {
        t._chars.forEach((c, i) => {
          c.style.transitionDelay = `${i * 34}ms`;
          c.style.opacity = '1';
          c.style.transform = 'none';
        });
      }
      io.unobserve(t);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

  document.querySelectorAll('.beat, .reveal').forEach(n => io.observe(n));

  /* ── 卖点卡 / 卡片：鼠标跟随倾斜 ── */
  const tilts = Array.from(document.querySelectorAll('.tile, .card'));
  for (const card of tilts) {
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0, hovering = false;
    const tick = () => {
      raf = 0;
      cx += (tx - cx) * 0.16;
      cy += (ty - cy) * 0.16;
      card.style.setProperty('--rx', (-cy * 7).toFixed(2) + 'deg');
      card.style.setProperty('--ry', (cx * 9).toFixed(2) + 'deg');
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) raf = requestAnimationFrame(tick);
    };
    card.addEventListener('pointermove', e => {
      if (reduce) return;
      const r = card.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      hovering = true;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    card.addEventListener('pointerleave', () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    });
  }

  /* ── 磁吸按钮 ── */
  for (const btn of document.querySelectorAll('[data-magnetic]')) {
    let raf = 0, mx = 0, my = 0, tx = 0, ty = 0;
    const tick = () => {
      raf = 0;
      mx += (tx - mx) * 0.2;
      my += (ty - my) * 0.2;
      btn.style.setProperty('--mx', mx.toFixed(1) + 'px');
      btn.style.setProperty('--my', my.toFixed(1) + 'px');
      if (Math.abs(tx - mx) > 0.1 || Math.abs(ty - my) > 0.1) raf = requestAnimationFrame(tick);
    };
    btn.addEventListener('pointermove', e => {
      if (reduce) return;
      const r = btn.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * 0.22;
      ty = (e.clientY - (r.top + r.height / 2)) * 0.28;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    btn.addEventListener('pointerleave', () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    });
  }

  /* ── 数字滚动（页脚年份 / 分镜计数装饰） ── */
  return { reduce };
}
