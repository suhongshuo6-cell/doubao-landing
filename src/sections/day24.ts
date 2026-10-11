/**
 * sections/day24.ts — 可拖 24h 豆包一天时间轴
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'

interface Slot {
  h: number
  label: string
  title: string
  text: string
  user: string
  ai: string
}

const SLOTS: Slot[] = [
  { h: 7, label: '07:00', title: '早起刷题', text: '卡住先要思路，再要步骤。', user: '这题为什么先求导？', ai: '因为它找的是变化最快的点。' },
  { h: 9, label: '09:00', title: '晨会纪要', text: '三句话压成结论。', user: '帮我压成三条结论。', ai: '进度 / 风险 / 下周动作，已排好。' },
  { h: 12, label: '12:00', title: '午间周报', text: '同一段对话里改语气砍长度。', user: '压到 200 字，客观一点。', ai: '286→198 字，去掉形容词。' },
  { h: 15, label: '15:00', title: '读表答疑', text: '表格丢进来，她先读再答。', user: '这张表异常在哪？', ai: '第三行环比掉 18%，建议核对口径。' },
  { h: 18, label: '18:00', title: '通勤语音', text: '按住说话，双手腾出来。', user: '今天杭州要带伞吗？', ai: '傍晚有阵雨，建议带折叠伞。' },
  { h: 21, label: '21:00', title: '夜里陪伴', text: '碎碎念也接得住。', user: '有点累，不想复盘了。', ai: '那就先休息。明天我帮你开个头。' },
  { h: 23, label: '23:00', title: '灵感草稿', text: '一句话存成明天的种子。', user: '记一下：功能名叫「随口问」。', ai: '已记下。明早提醒你展开。' },
]

export function initDay24(): () => void {
  const section = document.getElementById('day24')
  if (!section) return () => undefined
  const destroyers: Array<() => void> = []

  const track = section.querySelector<HTMLElement>('.day24__track')
  const thumb = section.querySelector<HTMLElement>('.day24__thumb')
  const label = section.querySelector<HTMLElement>('[data-day24-label]')
  const title = section.querySelector<HTMLElement>('[data-day24-title]')
  const text = section.querySelector<HTMLElement>('[data-day24-text]')
  const user = section.querySelector<HTMLElement>('[data-day24-user]')
  const ai = section.querySelector<HTMLElement>('[data-day24-ai]')
  const ticks = section.querySelector<HTMLElement>('.day24__ticks')

  if (ticks && ticks.childElementCount === 0) {
    SLOTS.forEach((s) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'day24__tick'
      b.dataset.h = String(s.h)
      b.textContent = s.label
      ticks.appendChild(b)
    })
  }

  let index = 0
  const apply = (i: number, animate = true): void => {
    index = Math.max(0, Math.min(SLOTS.length - 1, i))
    const slot = SLOTS[index]!
    section.dataset.hour = String(slot.h)
    document.documentElement.dataset.dayHour = String(slot.h)
    if (label) label.textContent = slot.label
    if (title) title.textContent = slot.title
    if (text) text.textContent = slot.text
    if (user) user.textContent = slot.user
    if (ai) ai.textContent = slot.ai
    const t = index / Math.max(1, SLOTS.length - 1)
    if (thumb) thumb.style.left = `${t * 100}%`
    ticks?.querySelectorAll<HTMLElement>('.day24__tick').forEach((el, j) => {
      el.classList.toggle('is-active', j === index)
    })
    if (animate && !motionPrefs.reduced) {
      const card = section.querySelector('.day24__card')
      if (card) {
        gsap.fromTo(
          card,
          { opacity: 0.4, y: 16, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.45, ease: 'power2.out' },
        )
      }
    }
  }

  ticks?.querySelectorAll<HTMLButtonElement>('.day24__tick').forEach((btn, i) => {
    const onClick = (): void => apply(i, true)
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  // 拖拽滑块
  if (track && thumb) {
    let dragging = false
    const fromClientX = (x: number): void => {
      const rect = track.getBoundingClientRect()
      const p = Math.max(0, Math.min(1, (x - rect.left) / rect.width))
      apply(Math.round(p * (SLOTS.length - 1)), true)
    }
    const onDown = (e: PointerEvent): void => {
      dragging = true
      thumb.setPointerCapture(e.pointerId)
      fromClientX(e.clientX)
    }
    const onMove = (e: PointerEvent): void => {
      if (!dragging) return
      fromClientX(e.clientX)
    }
    const onUp = (): void => {
      dragging = false
    }
    thumb.addEventListener('pointerdown', onDown)
    thumb.addEventListener('pointermove', onMove)
    thumb.addEventListener('pointerup', onUp)
    track.addEventListener('pointerdown', (e) => {
      if (e.target === thumb) return
      fromClientX(e.clientX)
    })
    destroyers.push(() => {
      thumb.removeEventListener('pointerdown', onDown)
      thumb.removeEventListener('pointermove', onMove)
      thumb.removeEventListener('pointerup', onUp)
    })
  }

  apply(2, false)
  return () => {
    for (const d of destroyers.reverse()) d()
    document.documentElement.removeAttribute('data-dayHour')
  }
}
