import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from './eases'

gsap.registerPlugin(ScrollTrigger)

/**
 * reveal.ts — 两件事：
 *
 * 1) 统一的滚动 reveal：淡入 + 上移 24px + blur(6px→0)，只触发一次。
 * 2) 自己实现的「文字逐行升起」。
 *
 * 规格明确要求不要用 SplitText（避免版本问题），所以这里手写：
 * 把段落按「断行机会」切成最小单元 → 用真实布局量出每个单元的纵向位置 →
 * 位置相同的归为一行 → 重组为 <span class="sp-l"><span class="sp-l__i">…</span></span>，
 * 外层 overflow:hidden，内层做 yPercent 110 → 0 的 stagger 升起。
 *
 * 用真实布局量行、而不是按字数猜，才能正确处理中英混排、标点避头尾、响应式换行。
 */

/** 断行单元：CJK 逐字断，拉丁按词断，空白单独成段 */
const TOKEN_RE =
  /[\u2E80-\u9FFF\u3040-\u30FF\u3000-\u303F\uFF00-\uFFEF]|[^\s\u2E80-\u9FFF\u3040-\u30FF\u3000-\u303F\uFF00-\uFFEF]+|\s+/g

/** 保留原始 markup，供 resize 时重切 */
const originals = new WeakMap<HTMLElement, string>()

interface Chunk {
  span: HTMLElement
  /** 该单元自身 + 紧随其后的空白（空白归前一个单元，换行时才不会让行首缩进） */
  nodes: Node[]
}

function tokenize(el: HTMLElement): Chunk[] {
  const chunks: Chunk[] = []
  let pending: Chunk | null = null

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  for (const node of textNodes) {
    const text = node.nodeValue ?? ''
    if (!text.trim()) {
      // 纯空白节点直接并进上一个单元
      if (pending) {
        pending.nodes.push(node)
      }
      continue
    }
    const parent = node.parentNode
    if (!parent) continue
    const frag = document.createDocumentFragment()
    const parts = text.match(TOKEN_RE) ?? []
    for (const part of parts) {
      if (!part.trim()) {
        frag.appendChild(document.createTextNode(part))
        continue
      }
      const span = document.createElement('span')
      span.className = 'sp-u'
      span.textContent = part
      frag.appendChild(span)
      pending = { span, nodes: [span] }
      chunks.push(pending)
    }
    parent.replaceChild(frag, node)
  }
  return chunks
}

/** 把 el 的文本按真实渲染行切开。幂等：重复调用会先还原。 */
export function splitLines(el: HTMLElement): boolean {
  if (!originals.has(el)) originals.set(el, el.innerHTML)
  el.innerHTML = originals.get(el) ?? ''

  // 元素不可见（比如折叠面板里）时量不出行，直接放弃，避免把整段挤成一行
  if (el.getBoundingClientRect().height <= 0) return false

  const chunks = tokenize(el)
  if (chunks.length < 2) return false

  // 量行：用 rect.top 而不是 offsetTop，避免 offsetParent 差异带来的误差
  const tops = chunks.map((c) => Math.round(c.span.getBoundingClientRect().top))
  const lines: Chunk[][] = []
  let current: Chunk[] = []
  let lastTop = tops[0] ?? 0
  chunks.forEach((chunk, i) => {
    const top = tops[i] ?? lastTop
    if (top > lastTop + 1 && current.length) {
      lines.push(current)
      current = []
    }
    current.push(chunk)
    lastTop = top
  })
  if (current.length) lines.push(current)

  // 只有一行：不需要切，留着原样（也没有升起效果）
  if (lines.length < 2) {
    el.innerHTML = originals.get(el) ?? ''
    return false
  }

  el.textContent = ''
  for (const line of lines) {
    const outer = document.createElement('span')
    outer.className = 'sp-l'
    const inner = document.createElement('span')
    inner.className = 'sp-l__i'
    for (const chunk of line) for (const node of chunk.nodes) inner.appendChild(node)
    outer.appendChild(inner)
    el.appendChild(outer)
  }
  el.dataset.split = 'lines'
  return true
}

export function unsplitLines(el: HTMLElement): void {
  if (!originals.has(el)) return
  el.innerHTML = originals.get(el) ?? ''
  delete el.dataset.split
}

export interface RevealOptions {
  /** 每行之间的错峰，秒 */
  stagger?: number
  delay?: number
  duration?: number
}

/** 逐行升起。返回 tween，方便调用方接管。 */
export function revealLines(el: HTMLElement, options: RevealOptions = {}): gsap.core.Tween | null {
  const lines = el.querySelectorAll<HTMLElement>('.sp-l__i')
  if (!lines.length) return null

  if (motionPrefs.reduced) {
    gsap.set(el, { opacity: 1 })
    gsap.set(lines, { yPercent: 0, clearProps: 'transform' })
    return null
  }

  // 切行完成后才把整段亮出来：此时每行已经被推到底部，升起动画不会被看到"先出现再消失"
  gsap.set(el, { opacity: 1 })

  return gsap.fromTo(
    lines,
    { yPercent: 130 },
    {
      yPercent: 0,
      duration: options.duration ?? 1.05,
      delay: options.delay ?? 0,
      ease: EASE_IN,
      stagger: options.stagger ?? 0.09,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    },
  )
}

/** 通用的元素 reveal：淡入 + 上移 24px + blur(6px→0)，只触发一次。 */
export function reveal(el: Element, options: RevealOptions = {}): gsap.core.Tween | null {
  if (motionPrefs.reduced) {
    gsap.set(el, { opacity: 1, y: 0, filter: 'none', clearProps: 'all' })
    return null
  }
  return gsap.fromTo(
    el,
    { opacity: 0, y: 24, filter: 'blur(6px)' },
    {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: options.duration ?? 1.05,
      delay: options.delay ?? 0,
      ease: EASE_IN,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    },
  )
}

/**
 * 装配全站 reveal：找到 [data-reveal] 与 [data-reveal-lines] 并批量接管。
 * 用 ScrollTrigger.batch 让同一屏内的元素一起触发，而不是各自为政地错峰响起。
 */
export function initReveal(root: ParentNode = document): () => void {
  const tweens: gsap.core.Tween[] = []
  const splitTargets: HTMLElement[] = []

  root.querySelectorAll<HTMLElement>('[data-reveal-lines]').forEach((el) => {
    splitTargets.push(el)
  })

  const run = (): void => {
    for (const el of splitTargets) {
      const ok = splitLines(el)
      if (!ok) {
        // 只有一行（或被折叠/隐藏）：不做逐行动画，但必须把内容亮出来
        gsap.set(el, { opacity: 1 })
        continue
      }
      const t = revealLines(el, { stagger: Number(el.dataset.revealLines) || 0.06 })
      if (t) tweens.push(t)
    }
    root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      const t = reveal(el, { delay: Number(el.dataset.revealDelay) || 0 })
      if (t) tweens.push(t)
    })
  }

  // 必须等字体就位再切行：Inter 是自托管可变字体，晚到会让行数算错
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (fonts?.ready) {
    fonts.ready.then(run).catch(run)
  } else {
    run()
  }

  // 视口宽度变化会改变断行结果 → 重切（只重切、不重播动画）
  let resizeTimer = 0
  let lastWidth = window.innerWidth
  const onResize = (): void => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (Math.abs(window.innerWidth - lastWidth) < 2) return
      lastWidth = window.innerWidth
      for (const el of splitTargets) {
        unsplitLines(el)
        if (splitLines(el)) gsap.set(el.querySelectorAll('.sp-l__i'), { yPercent: 0 })
      }
      ScrollTrigger.refresh()
    }, 220)
  }
  window.addEventListener('resize', onResize)

  return () => {
    window.removeEventListener('resize', onResize)
    window.clearTimeout(resizeTimer)
    for (const t of tweens) t.kill()
    for (const el of splitTargets) unsplitLines(el)
  }
}
