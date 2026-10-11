/**
 * sections/storyTimeMachine.ts — 学习 / 工作 / 生活 时间机
 * + replay-cta 收束回输入框
 */
import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'
import { EXP, emit } from '../experience/events'
import type { ExperienceDirector } from '../experience/experienceDirector'
import type { ScrollController } from '../motion/lenisSetup'

const STORIES = [
  {
    id: 'learn',
    label: '学习',
    title: '先要思路，再要答案',
    user: '这道题为什么要先求导？',
    ai: '因为它问的是「变化最快的那一点」。求导得到变化率，设为零就找到极值。',
  },
  {
    id: 'work',
    label: '工作',
    title: '从大纲到成稿，都在同一段对话',
    user: '这份周报太长了，压到三百字。',
    ai: '已压到 286 字。保留三条结论和两个风险点，删掉了过程描述。',
  },
  {
    id: 'life',
    label: '生活',
    title: '把琐碎压缩成一次对话',
    user: '周四下午去杭州，当天回来，帮我看怎么安排。',
    ai: '两个方案：早班去晚班回；或高铁往返，路上多一小时但更从容。',
  },
] as const

export function initStoryTimeMachine(opts: {
  director: ExperienceDirector
  scroll: ScrollController
}): () => void {
  const section = document.getElementById('story-time-machine')
  const replay = document.getElementById('replay-cta')
  if (!section) return () => undefined
  const destroyers: Array<() => void> = []

  const tabs = section.querySelectorAll<HTMLButtonElement>('[data-story]')
  const stage = section.querySelector<HTMLElement>('.story-stage')

  const show = (id: string): void => {
    const story = STORIES.find((s) => s.id === id) ?? STORIES[0]!
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.story === id))
    section.dataset.story = id
    if (!stage) return
    const html = `
      <span class="story-stage__tag">${story.label}</span>
      <h3 class="story-stage__title">${story.title}</h3>
      <div class="story-stage__thread">
        <p class="bubble bubble--user">${story.user}</p>
        <p class="bubble bubble--ai">${story.ai}</p>
      </div>
      <button type="button" class="story-stage__try" data-story-try="${story.user}">试一句</button>`
    if (motionPrefs.reduced) {
      stage.innerHTML = html
    } else {
      gsap.to(stage, {
        opacity: 0,
        x: -24,
        filter: 'blur(6px)',
        duration: 0.22,
        onComplete: () => {
          stage.innerHTML = html
          gsap.fromTo(
            stage,
            { opacity: 0, x: 28, filter: 'blur(8px)' },
            { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.45, ease: EASE_IN },
          )
          bindTry()
        },
      })
      return
    }
    bindTry()
  }

  const bindTry = (): void => {
    stage?.querySelectorAll<HTMLButtonElement>('[data-story-try]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const text = btn.dataset.storyTry || ''
          const input = document.getElementById('askInput')
          if (input instanceof HTMLInputElement) input.value = text
          opts.director.submit(text, {
            x: btn.getBoundingClientRect().left,
            y: btn.getBoundingClientRect().top,
          })
          document.getElementById('command-stage')?.scrollIntoView({
            behavior: motionPrefs.reduced ? 'auto' : 'smooth',
          })
        },
        { once: true },
      )
    })
  }

  tabs.forEach((btn) => {
    const onClick = (): void => {
      show(btn.dataset.story || 'learn')
      btn.classList.add('is-fired')
      window.setTimeout(() => btn.classList.remove('is-fired'), 400)
    }
    btn.addEventListener('click', onClick)
    destroyers.push(() => btn.removeEventListener('click', onClick))
  })
  show('learn')

  // 横向速度感：滚动时故事卡横向滑
  if (!motionPrefs.reduced) {
    const st = ScrollTrigger.create({
      trigger: section,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        section.style.setProperty('--story-x', `${((self.progress - 0.5) * 80).toFixed(1)}px`)
      },
    })
    destroyers.push(() => st.kill())
  }

  const stEnter = ScrollTrigger.create({
    trigger: section,
    start: 'top 55%',
    once: true,
    onEnter: () => {
      opts.director.completeScene()
      emit(EXP.CHAPTER, { id: 'done' })
    },
  })
  destroyers.push(() => stEnter.kill())

  /* ---- replay CTA ---- */
  const replayBtn = replay?.querySelector<HTMLButtonElement>('[data-replay]')
  const backBtn = replay?.querySelector<HTMLButtonElement>('[data-back-deck]')
  replayBtn?.addEventListener('click', () => {
    opts.director.replay()
    emit(EXP.REPLAY, {})
    replayBtn.classList.add('is-fired')
  })
  backBtn?.addEventListener('click', () => {
    opts.director.replay()
    document.getElementById('command-stage')?.scrollIntoView({
      behavior: motionPrefs.reduced ? 'auto' : 'smooth',
      block: 'start',
    })
    backBtn.classList.add('is-fired')
  })

  const stReplay = ScrollTrigger.create({
    trigger: replay ?? section,
    start: 'top 70%',
    once: true,
    onEnter: () => opts.director.completeScene(),
  })
  destroyers.push(() => stReplay.kill())

  void opts.scroll
  return () => destroyers.forEach((d) => d())
}
