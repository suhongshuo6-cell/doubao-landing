/**
 * sections/compare.ts — 对照条 clip-path 切换 + 模板飞入 askbar + tilt/press
 */

import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { bindTiltPress } from '../lib/tiltPress'

const TEMPLATES = [
  '帮我把这段话改成更客气的版本',
  '用三句话总结今天的会议',
  '给这个功能起 8 个候选名',
  '把周报压到 200 字，保留风险',
  '画一张「用户旅程」文字草图',
  '陪我练 5 分钟英语口语开场',
  '比较这两个方案的取舍',
  '把待办按紧急/重要排一下',
]

export function initCompare(): () => void {
  const destroyers: Array<() => void> = []

  // 对照条：左右列用 clip-path 揭示切换
  const cmpRow = document.querySelector<HTMLElement>('.cmp-row')
  if (cmpRow && !motionPrefs.reduced) {
    cmpRow.classList.add('cmp-row--reveal')
    const cols = cmpRow.querySelectorAll<HTMLElement>('.cmp-col')
    let side: 'old' | 'new' = 'new'
    const applySide = (next: 'old' | 'new'): void => {
      side = next
      cmpRow.dataset.side = next
      cols.forEach((col) => {
        const isNew = col.classList.contains('cmp-col--new')
        const active = next === 'new' ? isNew : !isNew
        gsap.to(col, {
          clipPath: active ? 'inset(0 0% 0 0%)' : isNew ? 'inset(0 0% 0 100%)' : 'inset(0 100% 0 0%)',
          opacity: active ? 1 : 0.45,
          duration: 0.55,
          ease: 'power2.inOut',
          overwrite: 'auto',
        })
      })
    }
    // 初始：两边都可见；点击列名切换强调
    gsap.set(cols, { clipPath: 'inset(0 0% 0 0%)', opacity: 1 })
    cols.forEach((col) => {
      const onClick = (): void => {
        applySide(col.classList.contains('cmp-col--new') ? 'new' : 'old')
      }
      col.style.cursor = 'pointer'
      col.addEventListener('click', onClick)
      destroyers.push(() => col.removeEventListener('click', onClick))
    })
    // 入场时先从中线揭开
    const tween = gsap.fromTo(
      cols,
      { clipPath: 'inset(0 50% 0 50%)', opacity: 0.3 },
      {
        clipPath: 'inset(0 0% 0 0%)',
        opacity: 1,
        duration: 0.85,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: cmpRow, start: 'top 80%', once: true },
      },
    )
    destroyers.push(() => {
      tween.scrollTrigger?.kill()
      tween.kill()
    })
    void side
  }

  const flyToAskbar = (btn: HTMLElement, text: string): void => {
    const fill = (window as unknown as { __askbarFill?: (t: string, auto?: boolean) => void }).__askbarFill
    const input = document.getElementById('askInput')
    const askbar = document.getElementById('askbar')
    const target = askbar ?? input

    if (motionPrefs.reduced || !target) {
      fill?.(text, false)
      if (!fill && input instanceof HTMLInputElement) {
        input.value = text
        input.focus()
      }
      document.getElementById('hero')?.scrollIntoView({ behavior: 'auto', block: 'start' })
      return
    }

    const from = btn.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    const ghost = btn.cloneNode(true) as HTMLElement
    ghost.classList.add('tpl-fly-ghost')
    ghost.style.cssText = [
      'position:fixed',
      `left:${from.left}px`,
      `top:${from.top}px`,
      `width:${from.width}px`,
      `height:${from.height}px`,
      'z-index:90',
      'pointer-events:none',
      'margin:0',
    ].join(';')
    document.body.appendChild(ghost)

    const dx = to.left + to.width * 0.5 - (from.left + from.width * 0.5)
    const dy = to.top + to.height * 0.5 - (from.top + from.height * 0.5)

    gsap.to(ghost, {
      x: dx,
      y: dy,
      scale: 0.55,
      opacity: 0.15,
      borderRadius: 24,
      duration: 0.7,
      ease: 'power3.inOut',
      onComplete: () => {
        ghost.remove()
        fill?.(text, false)
        if (!fill && input instanceof HTMLInputElement) {
          input.value = text
          input.focus()
        }
        askbar?.classList.add('is-filled')
        window.setTimeout(() => askbar?.classList.remove('is-filled'), 450)
      },
    })

    document.getElementById('hero')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  document.querySelectorAll<HTMLButtonElement>('[data-tpl]').forEach((btn) => {
    const onClick = (): void => {
      const text = btn.dataset.tpl || btn.textContent || ''
      btn.classList.add('is-pop')
      window.setTimeout(() => btn.classList.remove('is-pop'), 400)
      flyToAskbar(btn, text)
    }
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  const wall = document.getElementById('templateWall')
  if (wall && wall.childElementCount === 0) {
    TEMPLATES.forEach((t) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'tpl-chip'
      b.dataset.tpl = t
      b.textContent = t
      wall.appendChild(b)
      const onClick = (): void => flyToAskbar(b, t)
      b.addEventListener('click', onClick)
      destroyers.push(() => b.removeEventListener('click', onClick))
    })
  }

  // tilt / press spring：模板芯片、评价卡
  destroyers.push(bindTiltPress('.tpl-chip, .review-card, .review-card--flip, .cmp-col, .universe-card'))

  if (!motionPrefs.reduced) {
    const compare = document.getElementById('compare')
    if (compare) {
      const tween = gsap.fromTo(
        compare.querySelectorAll('.tpl-chip, .review-card'),
        { opacity: 0, y: 36 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.06,
          ease: 'back.out(1.5)',
          scrollTrigger: { trigger: compare, start: 'top 80%', once: true },
        },
      )
      destroyers.push(() => {
        tween.scrollTrigger?.kill()
        tween.kill()
      })
    }
  }

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
