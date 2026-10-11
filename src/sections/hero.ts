import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN, EASE_OUT } from '../motion/eases'

/**
 * Hero —— 对话线程 + 可点选分支（换代交互）
 */

const BRANCHES: Record<string, { user: string; ai: string; jump?: string }> = {
  report: {
    user: '那就继续，给我一版能直接贴进文档的周报。',
    ai: '三句话结论 + 两条风险已排好。往下滚，能力沙盒里还能改语气。',
  },
  tour: {
    user: '先别写了，带我看看日常怎么用你。',
    ai: '好。学习、写作、订行程——场景段有三段真实对话，跟我走。',
    jump: '#scenes',
  },
  play: {
    user: '我想先动手玩一下。',
    ai: '去能力沙盒，或滚到 Alcoves 三关。捏脸有奖励。',
    jump: '#alcoves',
  },
}

export function initHero(): () => void {
  const destroyers: Array<() => void> = []

  const msgs = Array.from(document.querySelectorAll<HTMLElement>('[data-hero-msg]'))
  const nextBtn = document.getElementById('heroNext') as HTMLButtonElement | null
  const branches = document.getElementById('heroBranches')
  const thread = document.getElementById('heroThread')
  let shown = 0
  let branched = false

  const punchIn = (el: HTMLElement): void => {
    el.hidden = false
    if (motionPrefs.reduced) {
      el.classList.add('is-in')
      return
    }
    gsap.fromTo(
      el,
      { opacity: 0, y: 28, scale: 0.92, filter: 'blur(8px)' },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        duration: 0.62,
        ease: 'back.out(1.7)',
        onComplete: () => el.classList.add('is-in'),
      },
    )
  }

  const showBranches = (): void => {
    if (!branches || branched) return
    branches.hidden = false
    if (motionPrefs.reduced) return
    gsap.fromTo(
      branches.querySelectorAll('.hero-branch'),
      { opacity: 0, y: 12, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.06, ease: 'back.out(1.8)' },
    )
  }

  const revealOne = (): void => {
    if (shown >= msgs.length) {
      showBranches()
      if (nextBtn) {
        nextBtn.disabled = true
        nextBtn.textContent = '选一条分支'
      }
      return
    }
    const el = msgs[shown]!
    punchIn(el)
    shown += 1
    if (el.hasAttribute('data-hero-branch-gate') || shown >= msgs.length) {
      showBranches()
      if (nextBtn) {
        nextBtn.disabled = true
        nextBtn.textContent = '选一条分支'
      }
    }
  }

  if (msgs.length) {
    if (motionPrefs.reduced) {
      msgs.forEach((m) => {
        m.hidden = false
        m.classList.add('is-in')
      })
      shown = msgs.length
      showBranches()
      if (nextBtn) {
        nextBtn.disabled = true
        nextBtn.textContent = '选一条分支'
      }
    } else {
      window.setTimeout(() => revealOne(), 420)
      const auto = window.setInterval(() => {
        if (shown >= msgs.length || branches?.hidden === false) {
          window.clearInterval(auto)
          return
        }
        revealOne()
      }, 1750)
      destroyers.push(() => window.clearInterval(auto))
    }
  }

  const onNext = (): void => revealOne()
  nextBtn?.addEventListener('click', onNext)
  destroyers.push(() => nextBtn?.removeEventListener('click', onNext))

  const appendBubble = (who: '你' | '豆包', text: string, kind: 'user' | 'ai'): void => {
    if (!thread) return
    const el = document.createElement('div')
    el.className = `hero-bubble hero-bubble--${kind}`
    el.innerHTML = `<span class="hero-bubble__who">${who}</span><p></p>`
    const p = el.querySelector('p')
    if (p) p.textContent = text
    thread.appendChild(el)
    punchIn(el)
    thread.scrollTop = thread.scrollHeight
  }

  const onBranch = (event: Event): void => {
    const btn = event.currentTarget as HTMLButtonElement
    const key = btn.dataset.branch ?? ''
    const pack = BRANCHES[key]
    if (!pack || branched) return
    branched = true
    branches?.querySelectorAll<HTMLButtonElement>('.hero-branch').forEach((b) => {
      b.disabled = true
    })
    appendBubble('你', pack.user, 'user')
    window.setTimeout(() => {
      appendBubble('豆包', pack.ai, 'ai')
      if (nextBtn) {
        nextBtn.disabled = true
        nextBtn.textContent = '已选分支'
      }
      if (pack.jump) {
        window.setTimeout(() => {
          const target = document.querySelector(pack.jump!)
          target?.scrollIntoView({ behavior: motionPrefs.reduced ? 'auto' : 'smooth', block: 'start' })
        }, 700)
      }
    }, 380)
  }

  branches?.querySelectorAll<HTMLButtonElement>('[data-branch]').forEach((b) => {
    b.addEventListener('click', onBranch)
    destroyers.push(() => b.removeEventListener('click', onBranch))
  })

  const hint = document.getElementById('scrollHint')
  if (hint && !motionPrefs.reduced) {
    const line = hint.querySelector<HTMLElement>('.hero__scroll-line')
    const tl = gsap.timeline({ delay: 1.2 })
    tl.fromTo(hint, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, ease: EASE_IN })
    if (line) {
      tl.to(line, { scaleY: 0.45, duration: 0.85, ease: 'sine.inOut' }, '-=0.2').to(line, {
        scaleY: 1,
        duration: 0.85,
        ease: 'sine.inOut',
      })
    }
    tl.to(hint, { opacity: 0, duration: 0.55, ease: EASE_OUT, delay: 0.35 }).set(hint, {
      display: 'none',
    })

    const dismiss = (): void => {
      tl.kill()
      gsap.set(hint, { display: 'none' })
    }
    window.addEventListener('wheel', dismiss, { passive: true, once: true })
    window.addEventListener('touchstart', dismiss, { passive: true, once: true })
    destroyers.push(() => {
      tl.kill()
      window.removeEventListener('wheel', dismiss)
      window.removeEventListener('touchstart', dismiss)
    })
  } else if (hint) {
    hint.style.display = 'none'
  }

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
