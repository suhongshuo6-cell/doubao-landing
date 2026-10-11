/**
 * motion/chapters.ts — 滚动叙事：01听见 / 02理解 / 03创作 / 04完成
 * 顶栏状态 · 右侧轨道扩散环 · 色温/取景 · 速度偏移停滚回正
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import type { FrameLoop } from '../lib/frameLoop'
import type { ScrollController } from './lenisSetup'
import { createSpring, SPRING } from '../lib/spring'

export interface ChapterDef {
  id: string
  no: string
  label: string
  status: string
  /** 0–1 scroll progress approx via section id */
  section: string
  temp: string
}

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 'hear', no: '01', label: '听见', status: 'CHAPTER · 听见', section: 'hero', temp: 'warm' },
  { id: 'understand', no: '02', label: '理解', status: 'CHAPTER · 理解', section: 'positioning', temp: 'neutral' },
  { id: 'create', no: '03', label: '创作', status: 'CHAPTER · 创作', section: 'capabilities', temp: 'cool' },
  { id: 'done', no: '04', label: '完成', status: 'CHAPTER · 完成', section: 'ctaStage', temp: 'warm' },
] as const

export interface ChapterHooks {
  loop: FrameLoop
  scroll: ScrollController
}

export function initChapters({ loop, scroll }: ChapterHooks): () => void {
  const root = document.documentElement
  const destroyers: Array<() => void> = []

  // 顶栏状态
  let statusEl = document.getElementById('chapterStatus')
  if (!statusEl) {
    const nav = document.querySelector('.nav__inner')
    statusEl = document.createElement('div')
    statusEl.id = 'chapterStatus'
    statusEl.className = 'chapter-status'
    statusEl.innerHTML = `<span class="chapter-status__no">01</span><span class="chapter-status__label">听见</span>`
    nav?.insertBefore(statusEl, nav.querySelector('.nav__sound') ?? nav.lastChild)
  }

  // 右侧章节轨道（扩散环）
  let orbit = document.getElementById('chapterOrbit')
  if (!orbit) {
    orbit = document.createElement('aside')
    orbit.id = 'chapterOrbit'
    orbit.className = 'chapter-orbit'
    orbit.setAttribute('aria-label', '章节轨道')
    orbit.innerHTML = CHAPTERS.map(
      (c, i) => `
      <button type="button" class="chapter-orbit__node" data-chapter="${c.id}" data-idx="${i}" aria-label="${c.no} ${c.label}">
        <i class="chapter-orbit__ring" aria-hidden="true"></i>
        <b>${c.no}</b>
        <span>${c.label}</span>
      </button>`,
    ).join('')
    document.body.appendChild(orbit)
  }

  const nodes = Array.from(orbit.querySelectorAll<HTMLButtonElement>('.chapter-orbit__node'))
  let active = -1

  const setActive = (index: number): void => {
    if (index === active || index < 0 || index >= CHAPTERS.length) return
    active = index
    const ch = CHAPTERS[index]!
    root.dataset.chapter = ch.id
    root.dataset.temp = ch.temp
    nodes.forEach((n, i) => {
      n.classList.toggle('is-active', i === index)
      n.classList.toggle('is-past', i < index)
    })
    if (statusEl) {
      const no = statusEl.querySelector('.chapter-status__no')
      const label = statusEl.querySelector('.chapter-status__label')
      if (no) no.textContent = ch.no
      if (label) label.textContent = ch.label
      statusEl.classList.remove('is-pulse')
      void statusEl.offsetWidth
      statusEl.classList.add('is-pulse')
    }
    // 扩散环
    const ring = nodes[index]?.querySelector<HTMLElement>('.chapter-orbit__ring')
    if (ring && !motionPrefs.reduced) {
      gsap.fromTo(
        ring,
        { scale: 0.4, opacity: 0.85 },
        { scale: 2.4, opacity: 0, duration: 0.9, ease: 'power2.out' },
      )
    }
  }

  // 点击跳转
  nodes.forEach((btn) => {
    const onClick = (): void => {
      const idx = Number(btn.dataset.idx)
      const ch = CHAPTERS[idx]
      if (!ch) return
      const el = document.getElementById(ch.section)
      if (!el) return
      scroll.scrollTo(el, { duration: 1.1 })
    }
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  // 滚动侦测章节
  const sectionEls = CHAPTERS.map((c) => document.getElementById(c.section)).filter(
    (el): el is HTMLElement => !!el,
  )

  const syncChapter = (): void => {
    const mid = window.innerHeight * 0.38
    let best = 0
    let bestDist = Infinity
    sectionEls.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const center = r.top + r.height * 0.25
      const dist = Math.abs(center - mid)
      if (r.top < window.innerHeight * 0.7 && dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    // fallback by progress bands
    const p = scroll.read().progress
    if (p > 0.82) best = 3
    else if (p > 0.42) best = Math.max(best, 2)
    else if (p > 0.14) best = Math.max(best, 1)
    setActive(best)
  }

  // 速度偏移：快滚时章节标题微移，停滚弹簧回正
  const offsetSpring = createSpring({ ...SPRING.warp, value: 0 })
  let lastVel = 0
  const removeTick = loop.add((dt) => {
    const state = scroll.read()
    const vel = state.velocity ?? 0
    lastVel = lastVel * 0.85 + vel * 0.15
    const target = Math.max(-14, Math.min(14, -lastVel * 0.012))
    offsetSpring.to(Math.abs(target) < 0.4 ? 0 : target)
    const v = offsetSpring.update(dt)
    root.style.setProperty('--chapter-shift', `${v.toFixed(2)}px`)
    syncChapter()
  })
  destroyers.push(removeTick)

  // 章节标题进入方式变化
  if (!motionPrefs.reduced) {
    document.querySelectorAll<HTMLElement>('[data-chapter-enter]').forEach((el) => {
      const mode = el.dataset.chapterEnter || 'rise'
      const from =
        mode === 'clip'
          ? { clipPath: 'inset(0 0 100% 0)', opacity: 1 }
          : mode === 'soft'
            ? { opacity: 0, filter: 'blur(10px)', y: 20 }
            : { opacity: 0, y: 36 }
      const to =
        mode === 'clip'
          ? { clipPath: 'inset(0 0 0% 0)', opacity: 1, duration: 0.85, ease: 'power3.out' }
          : mode === 'soft'
            ? { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.9, ease: 'power2.out' }
            : { opacity: 1, y: 0, duration: 0.75, ease: 'power3.out' }
      const tween = gsap.fromTo(el, from, {
        ...to,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      })
      destroyers.push(() => {
        tween.scrollTrigger?.kill()
        tween.kill()
      })
    })
  }

  setActive(0)
  syncChapter()

  // 给 CTA 收束用
  ;(window as unknown as { __chapterTags?: () => ChapterDef[] }).__chapterTags = () => [...CHAPTERS]

  return () => {
    delete (window as unknown as { __chapterTags?: unknown }).__chapterTags
    orbit?.remove()
    for (const d of destroyers.reverse()) d()
  }
}
