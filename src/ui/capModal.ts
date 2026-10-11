/**
 * ui/capModal.ts — 能力卡 → 迷你 App；GSAP Flip 共享几何飞入/收回
 */

import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { motionPrefs } from '../lib/motionPrefs'

gsap.registerPlugin(Flip)

type CapKey = 'dialog' | 'file' | 'image' | 'voice'

const TITLES: Record<CapKey, string> = {
  dialog: '多轮对话 · 分支树',
  file: '文件摘要 · 翻页',
  image: '图像编辑 · 前后对比',
  voice: '实时语音 · 字幕',
}

export function initCapModal(): () => void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.cap-card[data-cap]'))
  if (!cards.length) return () => undefined

  cards.forEach((card) => {
    if (card.querySelector('.cap-expand-hint')) return
    const hint = document.createElement('button')
    hint.type = 'button'
    hint.className = 'cap-expand-hint'
    hint.textContent = '展开迷你 App →'
    hint.dataset.capOpen = card.dataset.cap ?? ''
    card.querySelector('.cap-card__body')?.appendChild(hint)
  })

  let overlay: HTMLElement | null = null
  let lastFocus: HTMLElement | null = null
  let flipOrigin: HTMLElement | null = null
  const destroyers: Array<() => void> = []

  const close = (): void => {
    if (!overlay) return
    const el = overlay
    overlay = null
    document.body.classList.remove('cap-modal-open')
    const sheet = el.querySelector<HTMLElement>('.cap-modal__sheet')
    const origin = flipOrigin
    flipOrigin = null

    if (motionPrefs.reduced || !sheet || !origin) {
      el.remove()
      lastFocus?.focus()
      return
    }

    // Flip 收回：sheet → 原卡片几何
    const state = Flip.getState(sheet)
    sheet.classList.add('is-flipping-back')
    const r = origin.getBoundingClientRect()
    gsap.set(sheet, {
      position: 'fixed',
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      borderRadius: 22,
      overflow: 'hidden',
    })
    Flip.from(state, {
      duration: 0.55,
      ease: 'power3.inOut',
      absolute: true,
      onComplete: () => {
        el.remove()
        lastFocus?.focus()
      },
    })
    gsap.to(el.querySelector('.cap-modal__backdrop'), { opacity: 0, duration: 0.35 })
  }

  const open = (key: CapKey, from: HTMLElement): void => {
    if (overlay) close()
    lastFocus = from
    const card = from.closest<HTMLElement>('.cap-card') || from
    flipOrigin = card

    overlay = document.createElement('div')
    overlay.className = 'cap-modal'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', TITLES[key])
    overlay.innerHTML = `
      <div class="cap-modal__backdrop" data-cap-close></div>
      <div class="cap-modal__sheet" data-flip-id="cap-${key}">
        <header class="cap-modal__head">
          <div class="cap-modal__brand">
            <img src="${import.meta.env.BASE_URL}img/doubao-official-chibi.png" alt="" width="36" height="36" class="cap-modal__avatar" />
            <div>
              <p class="cap-modal__eyebrow">迷你 App</p>
              <h3 class="cap-modal__title">${TITLES[key]}</h3>
            </div>
          </div>
          <button type="button" class="cap-modal__close" data-cap-close aria-label="关闭">✕</button>
        </header>
        <div class="cap-modal__body" data-cap-body></div>
      </div>
    `
    document.body.appendChild(overlay)
    document.body.classList.add('cap-modal-open')
    const body = overlay.querySelector<HTMLElement>('[data-cap-body]')!
    const sheet = overlay.querySelector<HTMLElement>('.cap-modal__sheet')!
    mountApp(key, body)

    if (!motionPrefs.reduced) {
      const r = card.getBoundingClientRect()
      gsap.set(overlay.querySelector('.cap-modal__backdrop'), { opacity: 0 })
      gsap.to(overlay.querySelector('.cap-modal__backdrop'), { opacity: 1, duration: 0.35 })
      gsap.set(sheet, {
        position: 'fixed',
        top: r.top,
        left: r.left,
        width: r.width,
        height: Math.max(r.height, 120),
        borderRadius: 22,
        overflow: 'hidden',
        margin: 0,
      })
      const state = Flip.getState(sheet)
      gsap.set(sheet, { clearProps: 'top,left,width,height,position,margin,borderRadius,overflow' })
      Flip.from(state, {
        duration: 0.65,
        ease: 'power3.inOut',
        absolute: true,
      })
    }

    overlay.querySelectorAll('[data-cap-close]').forEach((btn) => {
      btn.addEventListener('click', close)
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    destroyers.push(() => window.removeEventListener('keydown', onKey))
    ;(overlay.querySelector('.cap-modal__close') as HTMLElement | null)?.focus()
  }

  cards.forEach((card) => {
    const key = (card.dataset.cap || 'dialog') as CapKey
    const onOpen = (e: Event): void => {
      const t = e.target as HTMLElement
      if (t.closest('.demo-chip, .cap-op, .demo-hold, [data-file-drop], [data-image-action]')) return
      if (t.closest('[data-cap-open]') || t.closest('.cap-card__chrome') || t.closest('.cap-expand-hint')) {
        e.preventDefault()
        open(key, t.closest('button') || card)
      }
    }
    const onHint = (e: Event): void => {
      e.stopPropagation()
      open(key, e.currentTarget as HTMLElement)
    }
    card.addEventListener('click', onOpen)
    const hint = card.querySelector('.cap-expand-hint')
    hint?.addEventListener('click', onHint)
    destroyers.push(() => {
      card.removeEventListener('click', onOpen)
      hint?.removeEventListener('click', onHint)
    })
  })

  return () => {
    close()
    for (const d of destroyers.reverse()) d()
  }
}

function mountApp(key: CapKey, root: HTMLElement): void {
  switch (key) {
    case 'dialog':
      mountDialogTree(root)
      break
    case 'file':
      mountFilePager(root)
      break
    case 'image':
      mountImageCompare(root)
      break
    case 'voice':
      mountVoiceCaptions(root)
      break
  }
}

function mountDialogTree(root: HTMLElement): void {
  root.innerHTML = `
    <div class="mini-tree">
      <div class="mini-msg mini-msg--user">帮我拆一下这个季度的增长目标</div>
      <div class="mini-msg mini-msg--ai">可以。先定总增 13%，再按渠道拆。</div>
      <div class="mini-branches" data-tree-level="1">
        <button type="button" data-tree="a">按渠道拆</button>
        <button type="button" data-tree="b">先写风险</button>
        <button type="button" data-tree="c">老板一页纸</button>
      </div>
      <div class="mini-tree__tail" data-tree-tail></div>
    </div>
  `
  const tail = root.querySelector('[data-tree-tail]')!
  const replies: Record<string, string> = {
    a: '自然 / 付费 / 活动 → +4% / +6% / +3%。要不要再拆到周？',
    b: '最大风险：转化掉 1.5pt。预案是补投放 8%。',
    c: '三句话结论 + 一张表。语气已压到「汇报向」。',
  }
  root.querySelectorAll<HTMLButtonElement>('[data-tree]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.tree ?? 'a'
      root.querySelectorAll('[data-tree]').forEach((b) => ((b as HTMLButtonElement).disabled = true))
      const u = document.createElement('div')
      u.className = 'mini-msg mini-msg--user'
      u.textContent = btn.textContent
      const a = document.createElement('div')
      a.className = 'mini-msg mini-msg--ai'
      a.textContent = replies[k] ?? '好的。'
      tail.append(u, a)
      if (!motionPrefs.reduced) {
        gsap.fromTo([u, a], { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.12, duration: 0.4 })
      }
    })
  })
}

function mountFilePager(root: HTMLElement): void {
  const pages = [
    { t: '摘要 · 第 1 页', b: 'Q3 收入环比 +12%。核心增长来自付费渠道与续费。' },
    { t: '摘要 · 第 2 页', b: '客诉率下降 18%。主要因自助排查上线与话术改版。' },
    { t: '摘要 · 第 3 页', b: '风险：供应链延期可能影响双十一备货。建议提前两周锁仓。' },
  ]
  let i = 0
  root.innerHTML = `
    <div class="mini-pager">
      <div class="mini-pager__sheet">
        <h4 data-pg-t></h4>
        <p data-pg-b></p>
      </div>
      <div class="mini-pager__nav">
        <button type="button" data-pg="-1">上一页</button>
        <span data-pg-idx></span>
        <button type="button" data-pg="1">下一页</button>
      </div>
    </div>
  `
  const render = (): void => {
    const p = pages[i]!
    root.querySelector('[data-pg-t]')!.textContent = p.t
    root.querySelector('[data-pg-b]')!.textContent = p.b
    root.querySelector('[data-pg-idx]')!.textContent = `${i + 1} / ${pages.length}`
  }
  root.querySelectorAll<HTMLButtonElement>('[data-pg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      i = Math.max(0, Math.min(pages.length - 1, i + Number(btn.dataset.pg)))
      render()
      const sheet = root.querySelector('.mini-pager__sheet')
      if (sheet && !motionPrefs.reduced) {
        gsap.fromTo(sheet, { x: 16, opacity: 0.5 }, { x: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' })
      }
    })
  })
  render()
}

function mountImageCompare(root: HTMLElement): void {
  root.innerHTML = `
    <div class="mini-compare">
      <div class="mini-compare__stage">
        <div class="mini-compare__before" aria-hidden="true"></div>
        <div class="mini-compare__after" data-after style="width:55%"></div>
        <input class="mini-compare__range" type="range" min="0" max="100" value="55" aria-label="前后对比" />
      </div>
      <p class="mini-compare__hint">拖动滑杆：左=原图 · 右=换背景后</p>
    </div>
  `
  const range = root.querySelector<HTMLInputElement>('.mini-compare__range')!
  const after = root.querySelector<HTMLElement>('[data-after]')!
  range.addEventListener('input', () => {
    after.style.width = `${range.value}%`
  })
}

function mountVoiceCaptions(root: HTMLElement): void {
  const lines = [
    '你：帮我查一下今天杭州天气。',
    '豆包：正在联网…',
    '豆包：杭州今天多云，18–24℃，空气不错。',
    '豆包：傍晚可能有短时小雨，记得带伞。',
  ]
  root.innerHTML = `
    <div class="mini-voice">
      <div class="mini-voice__wave" data-mv-wave></div>
      <button type="button" class="mini-voice__hold" data-mv-hold>按住说话</button>
      <ul class="mini-voice__caps" data-mv-caps></ul>
    </div>
  `
  const wave = root.querySelector('[data-mv-wave]')!
  for (let i = 0; i < 24; i++) {
    const bar = document.createElement('i')
    wave.appendChild(bar)
  }
  const caps = root.querySelector('[data-mv-caps]')!
  const hold = root.querySelector<HTMLButtonElement>('[data-mv-hold]')!
  let timer = 0
  let idx = 0
  const play = (): void => {
    caps.innerHTML = ''
    idx = 0
    hold.classList.add('is-on')
    wave.classList.add('is-live')
    window.clearInterval(timer)
    timer = window.setInterval(() => {
      if (idx >= lines.length) {
        window.clearInterval(timer)
        hold.classList.remove('is-on')
        wave.classList.remove('is-live')
        return
      }
      const li = document.createElement('li')
      li.textContent = lines[idx]!
      caps.appendChild(li)
      idx += 1
    }, 700)
  }
  hold.addEventListener('click', play)
}
