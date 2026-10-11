/**
 * fx/easter.ts — 彩蛋：连点头像小剧场、捏脸进度满、烟花加重
 */

import type { Mascot } from './mascot'
import type { FxParticles } from './particles'
import type { FxAudio } from './audio'

export interface EasterDeps {
  mascot: Mascot
  particles: FxParticles
  audio: FxAudio
  /** 捏脸进度 0–1（由 main 注入） */
  getPinchProgress?: () => number
}

export function initEaster(deps: EasterDeps): () => void {
  const destroyers: Array<() => void> = []
  let theaterOpen = false
  let pinchEggDone = false

  // 连点官方头像 → 小剧场
  deps.mascot.onRapidTap((count) => {
    if (count >= 5 && !theaterOpen) {
      theaterOpen = true
      showAvatarTheater(() => {
        theaterOpen = false
      })
      deps.audio.cheer()
      deps.mascot.bounce(1.6)
      deps.particles.burst(deps.mascot.x, deps.mascot.y, {
        n: 36,
        speedMin: 4,
        speedMax: 14,
        big: true,
        colors: ['#FF5A3C', '#FFB020', '#7EB6FF', '#FFD9CF'],
      })
    }
  })

  // 捏脸进度满彩蛋（轮询 HUD meter）
  const checkPinch = (): void => {
    if (pinchEggDone) return
    const on = document.querySelectorAll('.interaction-hud__meter i.is-on').length
    const prog = deps.getPinchProgress?.() ?? on / 5
    if (prog >= 0.98 || on >= 5) {
      pinchEggDone = true
      deps.audio.cheer()
      const W = window.innerWidth
      const H = window.innerHeight
      for (let i = 0; i < 6; i++) {
        window.setTimeout(() => {
          deps.particles.burst(W * (0.25 + Math.random() * 0.5), H * (0.3 + Math.random() * 0.3), {
            n: 22,
            speedMin: 3,
            speedMax: 12,
            big: true,
            gravity: 0.05,
          })
        }, i * 140)
      }
      const whisper = document.getElementById('characterWhisper')
      if (whisper) {
        whisper.textContent = '关卡通关！你捏得很温柔。'
        whisper.classList.add('is-visible')
        window.setTimeout(() => whisper.classList.remove('is-visible'), 2200)
      }
      document.documentElement.classList.add('pinch-egg')
      window.setTimeout(() => document.documentElement.classList.remove('pinch-egg'), 2800)
    }
  }
  const pinchTimer = window.setInterval(checkPinch, 600)
  destroyers.push(() => window.clearInterval(pinchTimer))


  // 输入「你好豆包」彩蛋（监听 askbar 发送）
  const onAsked = (e: Event): void => {
    const detail = (e as CustomEvent<{ text?: string }>).detail
    const text = (detail?.text ?? '').trim()
    if (!/你好.?豆包|嗨.?豆包|hello.?doubao/i.test(text)) return
    deps.audio.cheer()
    deps.mascot.bounce(1.5)
    deps.particles.burst(deps.mascot.x, deps.mascot.y, {
      n: 28,
      speedMin: 3,
      speedMax: 12,
      big: true,
      colors: ['#FF5A3C', '#FFB020', '#7EB6FF'],
    })
    const whisper = document.getElementById('characterWhisper')
    if (whisper) {
      whisper.textContent = '我也在，一直都在。'
      whisper.classList.add('is-visible')
      window.setTimeout(() => whisper.classList.remove('is-visible'), 2000)
    }
  }
  document.addEventListener('doubao:asked', onAsked)
  destroyers.push(() => document.removeEventListener('doubao:asked', onAsked))

  // 页脚烟花加重
  const fireBtn = document.getElementById('fireBtn')
  const onFire = (): void => {
    deps.audio.unlock()
    deps.audio.cheer()
    deps.mascot.bounce(2)
    const W = window.innerWidth
    const H = window.innerHeight
    const waves = 9
    for (let i = 0; i < waves; i++) {
      window.setTimeout(() => {
        deps.particles.burst(W * (0.12 + Math.random() * 0.76), H * (0.15 + Math.random() * 0.5), {
          n: 32,
          speedMin: 4,
          speedMax: 16,
          gravity: 0.07,
          big: true,
          colors: ['#FF5A3C', '#FFB020', '#7EB6FF', '#A7F3D0', '#F9A8D4', '#FDE68A'],
        })
      }, i * 120)
    }
    deps.particles.minis(deps.mascot.x, deps.mascot.y)
    fireBtn?.classList.add('is-boom')
    window.setTimeout(() => fireBtn?.classList.remove('is-boom'), 1200)
  }
  // 覆盖/叠加原有 fire（main 也绑了 react cheer；这里加重）
  fireBtn?.addEventListener('click', onFire)
  destroyers.push(() => fireBtn?.removeEventListener('click', onFire))

  return () => {
    for (const d of destroyers.reverse()) d()
  }
}

function showAvatarTheater(onDone: () => void): void {
  const existing = document.getElementById('avatarTheater')
  existing?.remove()
  const el = document.createElement('div')
  el.id = 'avatarTheater'
  el.className = 'avatar-theater'
  el.innerHTML = `
    <div class="avatar-theater__card">
      <img src="/img/doubao-official-chibi.png" alt="" width="96" height="96" />
      <p class="avatar-theater__title">你找到了隐藏剧场</p>
      <p class="avatar-theater__line">「今天也要好好聊天呀。」</p>
      <button type="button" class="avatar-theater__ok">好的，豆包</button>
    </div>
  `
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('is-in'))
  const close = (): void => {
    el.classList.remove('is-in')
    window.setTimeout(() => {
      el.remove()
      onDone()
    }, 280)
  }
  el.querySelector('.avatar-theater__ok')?.addEventListener('click', close)
  el.addEventListener('click', (e) => {
    if (e.target === el) close()
  })
  window.setTimeout(close, 5200)
}
