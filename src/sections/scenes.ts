import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'

/**
 * 场景一天时间轴 —— 早 / 午 / 晚 切换，对话 + 色温 + 背景一起变
 */

type DayPart = 'morning' | 'noon' | 'evening'

const DAY_COPY: Record<
  DayPart,
  { label: string; title: string; text: string; thread: Array<{ who: 'user' | 'ai'; text: string }> }
> = {
  morning: {
    label: '早晨',
    title: '先要思路，再要答案',
    text: '一道题卡住的时候，先问思路，再问步骤，最后让她出两道同类题。',
    thread: [
      { who: 'user', text: '这道题为什么要先求导？' },
      { who: 'ai', text: '因为它问的是「变化最快的那一点」。求导得到变化率，设为零就找到极值。' },
      { who: 'user', text: '闭区间端点还要不要算？' },
      { who: 'ai', text: '要。比三类候选：驻点、不可导点、区间端点。' },
    ],
  },
  noon: {
    label: '午间',
    title: '从大纲到成稿，都在同一段对话里',
    text: '风格随时改，长度随时砍，改完不必再复制到另一个工具。',
    thread: [
      { who: 'user', text: '这份周报太长了，压到三百字。' },
      { who: 'ai', text: '已压到 286 字。保留三条结论和两个风险点。' },
      { who: 'user', text: '语气再客观一点。' },
      { who: 'ai', text: '改好了：环比提升 12%，并补了口径说明。' },
    ],
  },
  evening: {
    label: '夜晚',
    title: '把琐碎压缩成一次对话',
    text: '订行程、比选项、整理信息，来回确认的那几轮，交给她。',
    thread: [
      { who: 'user', text: '周四下午去杭州，当天回来。' },
      { who: 'ai', text: '两个方案：早去晚回留 4 小时；或高铁往返更省事。' },
      { who: 'user', text: '第二个，顺便标下午会议。' },
      { who: 'ai', text: '行程排到 18:40。要整理成一页清单吗？' },
    ],
  },
}

export function initScenes(): () => void {
  const section = document.getElementById('scenes')
  if (!section) return () => undefined

  // 注入时间轴 UI（若不存在）
  let dayBar = section.querySelector<HTMLElement>('.day-timeline')
  if (!dayBar) {
    dayBar = document.createElement('div')
    dayBar.className = 'day-timeline wrap'
    dayBar.innerHTML = `
      <div class="day-tabs" role="tablist" aria-label="一天时间轴">
        <button type="button" class="day-tab is-active" data-day="morning" role="tab" aria-selected="true">早晨</button>
        <button type="button" class="day-tab" data-day="noon" role="tab" aria-selected="false">午间</button>
        <button type="button" class="day-tab" data-day="evening" role="tab" aria-selected="false">夜晚</button>
      </div>
      <div class="day-stage" data-day-stage>
        <div class="day-stage__info">
          <span class="scene__index" data-day-label>早晨</span>
          <h3 class="scene__title" data-day-title></h3>
          <p class="scene__text" data-day-text></p>
        </div>
        <div class="day-stage__thread" data-day-thread></div>
      </div>
    `
    const head = section.querySelector('.s-scenes__head')
    if (head?.nextSibling) section.insertBefore(dayBar, head.nextSibling)
    else section.appendChild(dayBar)
  }

  // 保留原 scenes 列表但隐藏（避免重复叙事）；若没有 day-stage 则用原列表
  const legacy = section.querySelector<HTMLElement>('.scenes')
  if (legacy) legacy.hidden = true

  const destroyers: Array<() => void> = []
  let current: DayPart = 'morning'

  const apply = (part: DayPart, animate = true): void => {
    current = part
    section.dataset.day = part
    document.documentElement.dataset.day = part
    dayBar!.querySelectorAll<HTMLButtonElement>('.day-tab').forEach((tab) => {
      const on = tab.dataset.day === part
      tab.classList.toggle('is-active', on)
      tab.setAttribute('aria-selected', String(on))
    })
    const pack = DAY_COPY[part]
    const label = dayBar!.querySelector('[data-day-label]')
    const title = dayBar!.querySelector('[data-day-title]')
    const text = dayBar!.querySelector('[data-day-text]')
    const thread = dayBar!.querySelector('[data-day-thread]')
    if (label) label.textContent = pack.label
    if (title) title.textContent = pack.title
    if (text) text.textContent = pack.text
    if (thread) {
      thread.innerHTML = ''
      pack.thread.forEach((m) => {
        const p = document.createElement('p')
        p.className = `bubble bubble--${m.who}`
        p.textContent = m.text
        thread.appendChild(p)
      })
      /* 气泡动画在下方 stage morph 里统一做 */
    }
    if (animate && !motionPrefs.reduced) {
      const stage = dayBar!.querySelector('.day-stage')
      if (stage) {
        gsap.fromTo(
          stage,
          {
            opacity: 0.25,
            rotateY: part === 'evening' ? 8 : part === 'morning' ? -8 : 0,
            filter: 'blur(8px) saturate(0.85)',
            clipPath: 'inset(6% 4% 6% 4% round 20px)',
          },
          {
            opacity: 1,
            rotateY: 0,
            filter: 'blur(0px) saturate(1)',
            clipPath: 'inset(0% 0% 0% 0% round 20px)',
            duration: 0.65,
            ease: 'power3.out',
          },
        )
      }
      // 气泡翻转出入
      if (thread) {
        gsap.fromTo(
          thread.children,
          { rotateX: -55, transformOrigin: 'top center', opacity: 0, y: 24 },
          {
            rotateX: 0,
            opacity: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.09,
            ease: 'back.out(1.5)',
            delay: 0.08,
          },
        )
      }
    }
  }

  dayBar.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((btn) => {
    const onClick = (): void => apply((btn.dataset.day as DayPart) || 'morning', true)
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })

  // 自动轮播时段
  let auto = 0
  const startAuto = (): void => {
    window.clearInterval(auto)
    if (motionPrefs.reduced) return
    auto = window.setInterval(() => {
      const order: DayPart[] = ['morning', 'noon', 'evening']
      const next = order[(order.indexOf(current) + 1) % 3]!
      apply(next, true)
    }, 9000)
  }
  startAuto()
  destroyers.push(() => window.clearInterval(auto))

  // 用户点击后重置计时
  dayBar.addEventListener('click', () => startAuto())

  apply('morning', false)

  // 原有气泡 spring（对 day-stage）
  if (!motionPrefs.reduced) {
    const stage = dayBar.querySelector('.day-stage')
    if (stage) {
      const tween = gsap.fromTo(
        stage,
        { opacity: 0, y: 48 },
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          ease: 'back.out(1.4)',
          scrollTrigger: { trigger: stage, start: 'top 84%', once: true },
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
    document.documentElement.removeAttribute('data-day')
  }
}
