import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'

/**
 * 产品亮点剧场 —— 每 tab 8–12s 自动演示（时间轴/拼贴/diff/波形字幕/来源卡/陪伴）
 * 可点击打断并重播。
 */

const PANEL_KEYS = ['memory', 'multi', 'create', 'voice', 'search', 'care'] as const
type PanelKey = (typeof PANEL_KEYS)[number]

const DEMO_MS: Record<PanelKey, number> = {
  memory: 10000,
  multi: 9000,
  create: 11000,
  voice: 10000,
  search: 9500,
  care: 10500,
}

export function initHighlights(): () => void {
  const stage = document.getElementById('hlStage')
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.hl-tab'))
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-hl-panel]'))
  if (!stage || !tabs.length) return () => undefined

  // 确保每个 panel 有剧场舞台
  panels.forEach((panel) => {
    const key = panel.dataset.hlPanel as PanelKey
    if (!key || panel.querySelector('.hl-theater')) return
    const theater = document.createElement('div')
    theater.className = 'hl-theater'
    theater.dataset.theater = key
    theater.innerHTML = theaterMarkup(key)
    const visual = panel.querySelector('.hl-panel__visual')
    if (visual) visual.appendChild(theater)
    else panel.prepend(theater)
  })

  const progress = document.createElement('div')
  progress.className = 'hl-progress'
  progress.innerHTML = '<i></i>'
  stage.appendChild(progress)
  const progressBar = progress.querySelector('i')!

  const destroyers: Array<() => void> = []
  let active: PanelKey = 'memory'
  let autoTimer = 0
  let demoKill: (() => void) | null = null
  let progressTween: gsap.core.Tween | null = null

  const setActive = (key: string, fromUser = false): void => {
    if (!PANEL_KEYS.includes(key as PanelKey)) return
    active = key as PanelKey
    tabs.forEach((tab) => {
      const on = tab.dataset.hl === key
      tab.classList.toggle('is-active', on)
      tab.setAttribute('aria-selected', String(on))
    })
    panels.forEach((panel) => {
      const on = panel.dataset.hlPanel === key
      panel.classList.toggle('is-active', on)
      panel.hidden = !on
      if (on && !motionPrefs.reduced) {
        gsap.fromTo(
          panel,
          {
            opacity: 0.35,
            y: 16,
            clipPath: 'inset(8% 12% 8% 12% round 18px)',
            filter: 'blur(4px)',
          },
          {
            opacity: 1,
            y: 0,
            clipPath: 'inset(0% 0% 0% 0% round 18px)',
            filter: 'blur(0px)',
            duration: 0.55,
            ease: 'power3.out',
            overwrite: true,
          },
        )
      }
    })
    demoKill?.()
    demoKill = runTheater(active)
    runProgress(DEMO_MS[active])
    if (fromUser) {
      stage.classList.add('is-burst')
      window.setTimeout(() => stage.classList.remove('is-burst'), 520)
      restartAuto()
    }
  }

  const runProgress = (ms: number): void => {
    progressTween?.kill()
    if (motionPrefs.reduced) {
      progressBar.style.transform = 'scaleX(0)'
      return
    }
    gsap.set(progressBar, { scaleX: 0, transformOrigin: 'left center' })
    progressTween = gsap.to(progressBar, { scaleX: 1, duration: ms / 1000, ease: 'none' })
  }

  const restartAuto = (): void => {
    window.clearTimeout(autoTimer)
    if (motionPrefs.reduced) return
    autoTimer = window.setTimeout(() => {
      const idx = PANEL_KEYS.indexOf(active)
      const next = PANEL_KEYS[(idx + 1) % PANEL_KEYS.length]!
      setActive(next, false)
      restartAuto()
    }, DEMO_MS[active])
  }

  tabs.forEach((tab) => {
    const onClick = (): void => setActive(tab.dataset.hl ?? 'memory', true)
    const onEnter = (): void => {
      if (motionPrefs.reduced) return
      gsap.to(tab, { y: -3, scale: 1.04, duration: 0.22, ease: 'back.out(2)', overwrite: 'auto' })
    }
    const onLeave = (): void => {
      gsap.to(tab, { y: 0, scale: 1, duration: 0.25, overwrite: 'auto' })
    }
    tab.addEventListener('click', onClick)
    tab.addEventListener('pointerenter', onEnter)
    tab.addEventListener('pointerleave', onLeave)
    destroyers.push(() => {
      tab.removeEventListener('click', onClick)
      tab.removeEventListener('pointerenter', onEnter)
      tab.removeEventListener('pointerleave', onLeave)
    })
  })

  document.querySelectorAll<HTMLElement>('[data-hl-hot]').forEach((hot) => {
    const onClick = (): void => {
      hot.classList.add('is-pop')
      window.setTimeout(() => hot.classList.remove('is-pop'), 480)
      // 打断并重播当前剧场
      setActive(active, true)
    }
    hot.addEventListener('click', onClick)
    destroyers.push(() => hot.removeEventListener('click', onClick))
  })

  // 点剧场本身也可重播
  stage.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('.hl-theater, .hl-progress')) setActive(active, true)
  })

  if (!motionPrefs.reduced) {
    const tween = gsap.fromTo(
      stage,
      { opacity: 0, y: 48 },
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: stage, start: 'top 82%', once: true },
      },
    )
    destroyers.push(() => {
      tween.scrollTrigger?.kill()
      tween.kill()
    })
  }

  setActive('memory')
  restartAuto()
  destroyers.push(() => {
    window.clearTimeout(autoTimer)
    demoKill?.()
    progressTween?.kill()
  })

  const onVis = (): void => {
    const rect = stage.getBoundingClientRect()
    const visible = rect.top < window.innerHeight * 0.85 && rect.bottom > window.innerHeight * 0.2
    if (!visible) {
      window.clearTimeout(autoTimer)
      demoKill?.()
      demoKill = null
    } else if (!motionPrefs.reduced) {
      if (!demoKill) demoKill = runTheater(active)
      restartAuto()
    }
  }
  window.addEventListener('scroll', onVis, { passive: true })
  destroyers.push(() => window.removeEventListener('scroll', onVis))

  return () => {
    for (const d of destroyers.reverse()) d()
    ScrollTrigger.refresh()
  }
}

function theaterMarkup(key: PanelKey): string {
  switch (key) {
    case 'memory':
      return `<div class="th-timeline" data-th="memory"><span></span><span></span><span></span><span></span><em>上周 → 今天</em></div>`
    case 'multi':
      return `<div class="th-collage" data-th="multi"><i></i><i></i><i></i><i></i><i></i><i></i></div>`
    case 'create':
      return `<div class="th-diff" data-th="create"><b>草稿</b><b class="is-new">成稿</b></div>`
    case 'voice':
      return `<div class="th-wave" data-th="voice"><div class="th-wave__bars"></div><p class="th-wave__cap">…</p></div>`
    case 'search':
      return `<div class="th-sources" data-th="search"><article>来源 A</article><article>来源 B</article><article>来源 C</article></div>`
    case 'care':
      return `<div class="th-care" data-th="care"><span>我在呢</span><span>慢慢说</span><span>需要休息吗</span></div>`
  }
}

function runTheater(key: PanelKey): () => void {
  const root = document.querySelector<HTMLElement>(`[data-theater="${key}"]`)
  if (!root || motionPrefs.reduced) return () => undefined
  const timers: number[] = []
  const tweens: gsap.core.Tween[] = []

  const clear = (): void => {
    timers.forEach((t) => window.clearTimeout(t))
    tweens.forEach((t) => t.kill())
  }

  switch (key) {
    case 'memory': {
      const nodes = root.querySelectorAll('.th-timeline > span')
      gsap.set(nodes, { scale: 0.4, opacity: 0.3 })
      nodes.forEach((n, i) => {
        timers.push(
          window.setTimeout(() => {
            tweens.push(
              gsap.to(n, { scale: 1.15, opacity: 1, duration: 0.45, ease: 'back.out(2)', yoyo: true, repeat: 1 }),
            )
          }, i * 1800),
        )
      })
      break
    }
    case 'multi': {
      const tiles = root.querySelectorAll('.th-collage i')
      gsap.set(tiles, { y: 20, opacity: 0, rotate: -6 })
      tiles.forEach((t, i) => {
        timers.push(
          window.setTimeout(() => {
            tweens.push(gsap.to(t, { y: 0, opacity: 1, rotate: 0, duration: 0.5, ease: 'back.out(1.8)' }))
          }, i * 700),
        )
      })
      break
    }
    case 'create': {
      const draft = root.querySelector('.th-diff b:not(.is-new)')
      const next = root.querySelector('.th-diff b.is-new')
      gsap.set(next, { opacity: 0, x: 24 })
      gsap.set(draft, { opacity: 1 })
      timers.push(
        window.setTimeout(() => {
          tweens.push(gsap.to(draft, { opacity: 0.35, x: -12, duration: 0.5 }))
          tweens.push(gsap.to(next, { opacity: 1, x: 0, duration: 0.55, ease: 'back.out(1.6)' }))
        }, 2200),
      )
      timers.push(
        window.setTimeout(() => {
          tweens.push(gsap.to(next, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 3 }))
        }, 5000),
      )
      break
    }
    case 'voice': {
      const barsHost = root.querySelector('.th-wave__bars')
      const cap = root.querySelector('.th-wave__cap')
      if (barsHost && barsHost.childElementCount === 0) {
        for (let i = 0; i < 16; i++) barsHost.appendChild(document.createElement('i'))
      }
      const bars = root.querySelectorAll('.th-wave__bars i')
      const caps = ['听…', '帮我查天气', '杭州多云 18–24℃', '记得带伞']
      let ci = 0
      const pulse = (): void => {
        bars.forEach((b) => {
          gsap.to(b, { scaleY: 0.2 + Math.random() * 0.9, duration: 0.28, ease: 'sine.inOut' })
        })
      }
      const pulseId = window.setInterval(pulse, 320)
      timers.push(pulseId)
      const capId = window.setInterval(() => {
        if (cap) cap.textContent = caps[ci % caps.length]!
        ci += 1
      }, 2200)
      timers.push(capId)
      break
    }
    case 'search': {
      const cards = root.querySelectorAll('.th-sources article')
      gsap.set(cards, { y: 30, opacity: 0 })
      cards.forEach((c, i) => {
        timers.push(
          window.setTimeout(() => {
            tweens.push(gsap.to(c, { y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }))
          }, 800 + i * 1600),
        )
      })
      break
    }
    case 'care': {
      const bubbles = root.querySelectorAll('.th-care span')
      gsap.set(bubbles, { scale: 0.6, opacity: 0 })
      bubbles.forEach((b, i) => {
        timers.push(
          window.setTimeout(() => {
            tweens.push(
              gsap.to(b, {
                scale: 1,
                opacity: 1,
                duration: 0.55,
                ease: 'elastic.out(1, 0.55)',
              }),
            )
          }, 900 + i * 2200),
        )
      })
      break
    }
  }

  return clear
}
