/**
 * sections/workbench.ts — 可变形能力工作台
 * 同一主面板切换：对话 / 写作 / 文件多模态 / 图像 / 语音搜索
 * FLIP · 标签磁吸 · 微型演示（不挪走原卡事件绑定）
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'
import type { FrameLoop } from '../lib/frameLoop'

type Mode = 'dialog' | 'write' | 'file' | 'image' | 'voice'

const MODES: { id: Mode; label: string; cap?: string; title: string; lead: string }[] = [
  { id: 'dialog', label: '对话', cap: 'dialog', title: '多轮对话与复杂推理', lead: '接着说下去就好。上下文会留住，追问、改口、加条件都不必从头再来。' },
  { id: 'write', label: '写作', title: '写作与改写工作台', lead: '同一段里改语气、砍长度、加例子。点微型操作，看文字当场重组。' },
  { id: 'file', label: '文件多模态', cap: 'file', title: '文件与多模态理解', lead: 'PDF、表格、图片直接丢进来。她读完再回答，而不是让你先复述一遍。' },
  { id: 'image', label: '图像', cap: 'image', title: '图像生成与编辑', lead: '一句话改一张图：换背景、补光线、扩画幅。拖杆对比前后。' },
  { id: 'voice', label: '语音搜索', cap: 'voice', title: '实时语音与联网搜索', lead: '开口就能聊。按住波形说话，需要最新信息时她自己去看一眼。' },
]

const WRITE_VARIANTS: Record<string, string> = {
  detail:
    '本周完成「自助排查」上线（覆盖 3 条高频客诉路径），客诉量环比下降 12%（口径：工单关闭数）。风险：供应链可能拖双十一备货。下周：提前锁仓 + 补投放预案。',
  rephrase: '这周把自助排查推上线了，客诉大概少了一成二。接下来要盯住双十一的仓和投放，别临时抱佛脚。',
  short: '自助排查已上线，客诉 -12%。下周锁仓并补投。',
  base: '本周完成自助排查上线，客诉环比下降 12%。下周重点锁双十一仓位。',
}

export function initWorkbench(_loop: FrameLoop): () => void {
  const section = document.getElementById('capabilities')
  const track = document.getElementById('capTrack')
  const viewport = document.getElementById('capViewport')
  if (!section || !track) return () => undefined

  const destroyers: Array<() => void> = []
  section.classList.add('is-workbench')
  viewport?.classList.add('wb-viewport')

  // 标题区
  const headTitle = section.querySelector('.s-cap__title')
  if (headTitle) headTitle.textContent = '同一工作台，五种形态。'
  const headEyebrow = section.querySelector('.s-cap__head .eyebrow')
  if (headEyebrow) headEyebrow.textContent = '能力工作台'

  // Tabs
  let tabsBar = section.querySelector<HTMLElement>('.wb-tabs')
  if (!tabsBar) {
    tabsBar = document.createElement('div')
    tabsBar.className = 'wb-tabs wrap'
    tabsBar.setAttribute('role', 'tablist')
    tabsBar.setAttribute('aria-label', '能力切换')
    tabsBar.innerHTML =
      MODES.map(
        (m, i) =>
          `<button type="button" class="wb-tab${i === 0 ? ' is-active' : ''}" role="tab" data-wb="${m.id}" aria-selected="${i === 0 ? 'true' : 'false'}" data-magnetic>${m.label}</button>`,
      ).join('') + `<i class="wb-tab__pill" aria-hidden="true"></i>`
    const head = section.querySelector('.s-cap__head')
    head?.insertAdjacentElement('afterend', tabsBar)
  }

  // 写作面板（插入 track）
  let writeCard = track.querySelector<HTMLElement>('[data-cap="write"]')
  if (!writeCard) {
    writeCard = document.createElement('article')
    writeCard.className = 'cap-card cap-card--write'
    writeCard.dataset.cap = 'write'
    writeCard.innerHTML = `
      <div class="cap-card__chrome"><span class="cap-card__dots" aria-hidden="true"><i></i><i></i><i></i></span>sandbox://write</div>
      <div class="cap-card__body">
        <div class="cap-card__top"><span class="cap-card__index">W</span><h3 class="cap-card__title">写作与改写</h3></div>
        <p class="cap-card__text">同一段里改语气、砍长度、加例子。</p>
        <div class="cap-demo" data-demo="write">
          <div class="wb-write__draft" data-write-draft>${WRITE_VARIANTS.base}</div>
          <div class="demo-chips">
            <button type="button" class="demo-chip" data-write-op="detail">再具体一点</button>
            <button type="button" class="demo-chip" data-write-op="rephrase">换个说法</button>
            <button type="button" class="demo-chip" data-write-op="short">再短一点</button>
          </div>
        </div>
      </div>`
    const dialogCard = track.querySelector('[data-cap="dialog"]')
    dialogCard?.after(writeCard)
  }

  // 图像 before/after 拖杆
  const imageCard = track.querySelector<HTMLElement>('[data-cap="image"]')
  const imageDemo = imageCard?.querySelector<HTMLElement>('[data-demo="image"]')
  if (imageDemo && !imageDemo.querySelector('[data-ba-range]')) {
    const ba = document.createElement('div')
    ba.className = 'wb-ba'
    ba.innerHTML = `
      <label class="wb-ba__label">前后对比</label>
      <div class="wb-ba__track">
        <div class="wb-ba__fill" data-ba-fill style="width:50%"></div>
        <input type="range" min="0" max="100" value="50" aria-label="前后对比拖杆" data-ba-range />
      </div>`
    imageDemo.appendChild(ba)
    const range = ba.querySelector<HTMLInputElement>('[data-ba-range]')
    const fill = ba.querySelector<HTMLElement>('[data-ba-fill]')
    const pixels = imageDemo.querySelector<HTMLElement>('[data-pixels]')
    const onRange = (): void => {
      const v = Number(range?.value ?? 50)
      if (fill) fill.style.width = `${v}%`
      if (pixels) pixels.style.setProperty('--ba', String(v / 100))
      imageCard?.style.setProperty('--ba', String(v / 100))
    }
    range?.addEventListener('input', onRange)
    destroyers.push(() => range?.removeEventListener('input', onRange))
  }

  // 写作微型演示
  const draft = writeCard.querySelector<HTMLElement>('[data-write-draft]')
  const writeChipBtns = Array.from(writeCard.querySelectorAll<HTMLButtonElement>('[data-write-op]'))
  writeChipBtns.forEach((btn) => {
    const onOp = (): void => {
      const op = btn.dataset.writeOp ?? ''
      const next = WRITE_VARIANTS[op]
      if (!draft || !next) return
      writeChipBtns.forEach((b) => b.classList.toggle('is-fired', b === btn))
      draft.textContent = next
      if (!motionPrefs.reduced) {
        gsap.fromTo(draft, { opacity: 0.35, y: 8 }, { opacity: 1, y: 0, duration: 0.32, ease: EASE_IN })
      }
      writeCard?.classList.add('is-punch')
      window.setTimeout(() => writeCard?.classList.remove('is-punch'), 420)
    }
    btn.addEventListener('click', onOp)
    destroyers.push(() => btn.removeEventListener('click', onOp))
  })

  const cards = Array.from(track.querySelectorAll<HTMLElement>('.cap-card'))
  const pill = tabsBar.querySelector<HTMLElement>('.wb-tab__pill')
  const tabBtns = Array.from(tabsBar.querySelectorAll<HTMLButtonElement>('.wb-tab'))

  let mode: Mode = 'dialog'
  const metaBox = document.createElement('div')
  metaBox.className = 'wb-meta wrap'
  metaBox.innerHTML = `<span class="wb-meta__index">01</span><div><strong class="wb-meta__title"></strong><p class="wb-meta__lead"></p></div>`
  tabsBar.insertAdjacentElement('afterend', metaBox)
  const metaTitle = metaBox.querySelector<HTMLElement>('.wb-meta__title')
  const metaLead = metaBox.querySelector<HTMLElement>('.wb-meta__lead')
  const metaIndex = metaBox.querySelector<HTMLElement>('.wb-meta__index')

  const movePill = (tab: HTMLElement): void => {
    if (!pill) return
    const parent = tab.parentElement!
    const pr = parent.getBoundingClientRect()
    const tr = tab.getBoundingClientRect()
    gsap.to(pill, {
      x: tr.left - pr.left,
      width: tr.width,
      duration: motionPrefs.reduced ? 0 : 0.36,
      ease: 'power3.out',
      overwrite: true,
    })
  }

  const showMode = (next: Mode): void => {
    const meta = MODES.find((m) => m.id === next)!
    const idx = MODES.findIndex((m) => m.id === next)
    const activeCard =
      next === 'write'
        ? writeCard
        : cards.find((c) => c.dataset.cap === meta.cap) ?? null

    // FLIP: measure first
    const first = activeCard?.getBoundingClientRect()
    const prevVisible = cards.find((c) => !c.classList.contains('is-wb-hidden'))

    cards.forEach((c) => {
      const on = c === activeCard
      c.classList.toggle('is-wb-hidden', !on)
      c.classList.toggle('is-wb-active', on)
    })

    tabBtns.forEach((t) => {
      const on = t.dataset.wb === next
      t.classList.toggle('is-active', on)
      t.setAttribute('aria-selected', String(on))
    })
    const tab = tabBtns.find((t) => t.dataset.wb === next)
    if (tab) movePill(tab)

    if (metaTitle) metaTitle.textContent = meta.title
    if (metaLead) metaLead.textContent = meta.lead
    if (metaIndex) metaIndex.textContent = String(idx + 1).padStart(2, '0')
    section.dataset.wb = next
    mode = next
    if (!motionPrefs.reduced) {
      gsap.fromTo(
        metaBox,
        { opacity: 0.55, y: 8 },
        { opacity: 1, y: 0, duration: 0.34, ease: EASE_IN, overwrite: true },
      )
    }

    if (activeCard && !motionPrefs.reduced) {
      const last = activeCard.getBoundingClientRect()
      if (prevVisible && prevVisible !== activeCard && first) {
        gsap.fromTo(
          activeCard,
          { opacity: 0, y: 24, scale: 0.97 },
          { opacity: 1, y: 0, scale: 1, duration: 0.48, ease: 'power3.out' },
        )
      } else {
        void last
        gsap.fromTo(
          activeCard,
          { opacity: 0.6, y: 16 },
          { opacity: 1, y: 0, duration: 0.4, ease: EASE_IN },
        )
      }
    }

    // 滚动到工作台可见区中部（不强制）
    if (viewport) viewport.scrollLeft = 0
  }

  tabBtns.forEach((tab) => {
    const onClick = (): void => {
      const id = tab.dataset.wb as Mode
      if (!id || id === mode) {
        // 仍给反馈
        tab.classList.add('is-pulse')
        window.setTimeout(() => tab.classList.remove('is-pulse'), 300)
        return
      }
      showMode(id)
    }
    tab.addEventListener('click', onClick)
    destroyers.push(() => tab.removeEventListener('click', onClick))
  })

  // 隐藏横向控件
  const hideControls = (): void => {
    section.querySelectorAll('.cap-controls').forEach((el) => {
      ;(el as HTMLElement).hidden = true
    })
  }
  hideControls()
  const mo = new MutationObserver(hideControls)
  mo.observe(section, { childList: true })
  destroyers.push(() => mo.disconnect())

  showMode('dialog')
  requestAnimationFrame(() => {
    const active = tabBtns.find((t) => t.classList.contains('is-active'))
    if (active) movePill(active)
  })

  const onResize = (): void => {
    const active = tabBtns.find((t) => t.classList.contains('is-active'))
    if (active) movePill(active)
  }
  window.addEventListener('resize', onResize)
  destroyers.push(() => window.removeEventListener('resize', onResize))

  destroyers.push(() => {
    section.classList.remove('is-workbench')
    viewport?.classList.remove('wb-viewport')
    cards.forEach((c) => c.classList.remove('is-wb-hidden', 'is-wb-active'))
    tabsBar?.remove()
    metaBox.remove()
  })

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
