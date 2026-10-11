// 只引 weight 轴、不带 italic、不引 optical size：中文字形走系统字体，
// 拉丁与数字只需要 latin 子集，其余子集由 unicode-range 挡住，浏览器不会下载。
import '@fontsource-variable/inter/wght.css'
import './styles/global.css'
import './styles/stage.css'

import gsap from 'gsap'

import { createFrameLoop } from './lib/frameLoop'
import { createScroll, ScrollTrigger } from './motion/lenisSetup'
import { createAnchorMap, initVelocityWarp } from './motion/transitions'
import { initReveal } from './motion/reveal'
import { EASE_IN } from './motion/eases'
import { createSpring, SPRING } from './lib/spring'
import { motionPrefs } from './lib/motionPrefs'
import { initNav } from './ui/nav'
import { initProgressRail } from './ui/progressRail'
import { initContentSections, initStageSections } from './sections'
import { createStage2d } from './fx/stage2d'
import { initAskbar } from './ui/askbar'
import { initPolymorphCursor } from './motion/cursor'
import { initChapters } from './motion/chapters'
import { initFeedback } from './ui/feedback'
import { initPortalTransitions } from './motion/portalTransitions'
import { createExperienceDirector } from './experience/experienceDirector'
import type { CharacterRig } from './three/character'

/**
 * main.ts — 五幕体验入口
 * 阶段 1：ExperienceDirector + 五幕 sections + 滚动电影
 * 阶段 2：Three 角色异步进场
 */

document.documentElement.classList.add('js')

const params = new URLSearchParams(window.location.search)
const forceParam = params.get('character')
const force =
  forceParam === 'model' || forceParam === 'imageRig' || forceParam === 'probe'
    ? forceParam
    : undefined

function boot(): void {
  const loop = createFrameLoop()
  const scroll = createScroll()
  initVelocityWarp(scroll, loop)

  const anchorEls = Array.from(document.querySelectorAll<HTMLElement>('[data-anchor]'))
  const anchorMap = createAnchorMap(
    anchorEls.map((el) => ({ el, t: Number(el.dataset.anchor ?? '0') })),
  )

  const rail = initProgressRail(
    scroll,
    anchorMap,
    document.getElementById('railIndicator'),
    document.getElementById('railList'),
  )
  initNav(scroll, loop)
  initReveal()
  initPolymorphCursor(loop)
  initFeedback(loop)
  initChapters({ loop, scroll })
  initPortalTransitions({ loop, scroll })

  const whisperEl = document.getElementById('characterWhisper')
  let whisperTimer = 0
  const say = (text: string): void => {
    if (!whisperEl) return
    whisperEl.textContent = text
    whisperEl.classList.add('is-visible')
    window.clearTimeout(whisperTimer)
    whisperTimer = window.setTimeout(() => whisperEl.classList.remove('is-visible'), 1500)
  }

  const fx = createStage2d()
  const director = createExperienceDirector({
    onWhisper: say,
    onBurst: (x, y) => fx?.react('send', x, y),
    onModeUnlock: () => fx?.react('cheer'),
  })

  initContentSections({
    scroll,
    loop,
    director,
    onBurst: (x, y) => fx?.react('tap', x, y),
  })

  /* Gen2：滚动区带 data-zone → 角色层对比度；视差；色温 */
  const zoneSections = Array.from(document.querySelectorAll<HTMLElement>('[data-zone]'))
  const parallaxEls = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'))
  const syncZone = (): void => {
    let active = 'product'
    const mid = window.innerHeight * 0.42
    for (const el of zoneSections) {
      const r = el.getBoundingClientRect()
      if (r.top <= mid && r.bottom >= mid) {
        active = el.dataset.zone || active
        break
      }
    }
    document.documentElement.dataset.zone = active
    if (!motionPrefs.reduced) {
      for (const el of parallaxEls) {
        const speed = Number(el.dataset.parallaxSpeed || -0.06)
        const rect = el.getBoundingClientRect()
        const offset = (rect.top + rect.height * 0.5 - window.innerHeight * 0.5) * speed
        el.style.setProperty('--py', offset.toFixed(2))
      }
    }
  }
  loop.add(() => syncZone())
  syncZone()

  if (fx) {
    loop.add((dt, elapsed) => {
      fx.update(dt, elapsed)
      fx.draw()
    })

    window.addEventListener(
      'pointermove',
      (event) => fx.pointer(event.clientX, event.clientY),
      { passive: true },
    )

    let keyPresses = 0
    window.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable]')) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.length !== 1 && event.key !== ' ') return
      keyPresses += 1
      fx.audio.unlock()
      fx.react('key')
      void keyPresses
    })

    window.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest('a, button, input, [data-no-pinch]')) return
        const { clientX: x, clientY: y } = event
        fx.mascot.hit(x, y) ? fx.react('mascot', x, y) : fx.react('tap', x, y)
      },
      { passive: true },
    )

    const soundBtn = document.getElementById('soundToggle')
    const syncSound = (): void => {
      const muted = fx.audio.muted
      soundBtn?.setAttribute('aria-pressed', String(!muted))
      document.documentElement.classList.toggle('sound-off', muted)
    }
    soundBtn?.addEventListener('click', () => {
      fx.audio.toggleMute()
      syncSound()
    })
    syncSound()

    initAskbar({
      onFirstGesture: () => fx.audio.unlock(),
      onType: () => fx.audio.note(2 + ((Math.random() * 3) | 0), { vol: 0.045 }),
      onSend: (_text, x, y) => fx.react('send', x, y),
      onAvatarBounce: () => fx.mascot.bounce(1.1),
    })

    document.getElementById('fireBtn')?.addEventListener('click', () => {
      fx.audio.unlock()
      fx.react('cheer')
    })
  }

  /* 指针情绪：move / down / drag → 不同反馈 */
  let drag = false
  let downX = 0
  let downY = 0
  window.addEventListener(
    'pointermove',
    (e) => {
      document.documentElement.dataset.pointer = drag ? 'drag' : 'move'
      document.documentElement.style.setProperty('--ptr-x', `${(e.clientX / window.innerWidth - 0.5).toFixed(3)}`)
      document.documentElement.style.setProperty('--ptr-y', `${(e.clientY / window.innerHeight - 0.5).toFixed(3)}`)
    },
    { passive: true },
  )
  window.addEventListener(
    'pointerdown',
    (e) => {
      drag = false
      downX = e.clientX
      downY = e.clientY
      document.documentElement.dataset.pointer = 'down'
    },
    { passive: true },
  )
  window.addEventListener(
    'pointerup',
    () => {
      drag = false
      document.documentElement.dataset.pointer = 'move'
    },
    { passive: true },
  )
  window.addEventListener(
    'pointermove',
    (e) => {
      if (document.documentElement.dataset.pointer === 'down' || document.documentElement.dataset.pointer === 'drag') {
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10) {
          drag = true
          document.documentElement.dataset.pointer = 'drag'
        }
      }
    },
    { passive: true },
  )

  ScrollTrigger.addEventListener('refresh', () => anchorMap.refresh())
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  const settle = (): void => {
    ScrollTrigger.refresh()
    anchorMap.refresh()
  }
  fonts?.ready.then(settle).catch(settle)
  window.setTimeout(settle, 900)

  const startP = Number(params.get('p'))
  if (params.has('p') && Number.isFinite(startP)) {
    window.setTimeout(() => {
      scroll.scrollTo(anchorMap.toScroll(Math.min(Math.max(startP, 0), 1)), { immediate: true })
      ScrollTrigger.refresh()
    }, 400)
  }

  /* ═══════════ 阶段 2：3D 层异步进场 ═══════════ */
  void (async () => {
    const THREE = await import('three')
    const { createStage } = await import('./three/stage')
    const { createCharacter, DEFAULT_METRICS } = await import('./three/character')
    const { createCameraRig } = await import('./three/cameraRig')

    const canvasEl = document.getElementById('stage')
    if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('缺少 #stage canvas')
    const canvas: HTMLCanvasElement = canvasEl

    const stage = createStage(canvas)
    stage.scene.add(stage.camera)

    const rig = createCameraRig({ stage, metrics: DEFAULT_METRICS })
    initStageSections({ stage })

    let character: CharacterRig | null = null

    createCharacter({
      renderer: stage.renderer,
      camera: stage.camera,
      force,
      onFallback: (reason) => console.info('[character] 降级：', reason),
    })
      .then((rigged) => {
        character = rigged
        if (!rigged.object3d.parent) stage.scene.add(rigged.object3d)
        rig.updateMetrics(rigged.metrics)
        document.documentElement.dataset.character = rigged.kind
        if (motionPrefs.reduced || params.get('nointro') === '1' || params.has('p')) {
          rig.setIntro(1)
        } else {
          runIntro()
        }
      })
      .catch((error: unknown) => {
        console.error('[character] 装配失败', error)
        document.documentElement.dataset.character = 'none'
      })

    let introTween: gsap.core.Tween | null = null

    function runIntro(): void {
      rig.setIntro(0)
      stage.setRenderScale(0.72)
      const state = { t: 0 }
      introTween = gsap.to(state, {
        t: 1,
        duration: 0.95,
        ease: EASE_IN,
        onUpdate: () => {
          rig.setIntro(state.t)
          const blur = (1 - state.t) * 14
          canvas.style.filter = blur > 0.25 ? `blur(${blur.toFixed(2)}px)` : ''
        },
        onComplete: () => {
          canvas.style.filter = ''
          stage.setRenderScale(1)
        },
      })
    }

    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2(0, 0)
    const hitPoint = new THREE.Vector3()
    const ring = document.getElementById('pinchRing')
    const hud = document.getElementById('interactionHud')
    const ringX = createSpring(SPRING.pointer)
    const ringY = createSpring(SPRING.pointer)
    const rootEl = document.documentElement

    const PINCH_GATE = 0.38
    let pinchHoldMs = 0
    let pinchSuccessCount = 0
    let pinchRewardDone = false

    const firePinchReward = (x: number, y: number): void => {
      if (pinchRewardDone) return
      pinchRewardDone = true
      pinchSuccessCount += 1
      say('手感刚好。')
      fx?.mascot.bounce(1.35)
      fx?.react('cheer', x, y)
      rootEl.classList.add('pinch-reward-shake', 'pinch-egg')
      window.setTimeout(() => rootEl.classList.remove('pinch-reward-shake'), 600)
      window.setTimeout(() => rootEl.classList.remove('pinch-egg'), 2600)
      document.dispatchEvent(new CustomEvent('doubao:pinch-reward', { detail: { source: 'hero' } }))
    }

    let pointerInside = false
    let pressing = false
    let hoveringFace = false
    let pressOrigin: { x: number; y: number } | null = null
    let longPressTimer = 0
    let lastPressing = false

    const blip = (pitch = 520): void => fx?.audio.blip(pitch)

    const updateHud = (node: number): void => {
      const part = Math.min(4, Math.max(0, node))
      const labels = ['QUEST · 命令舞台', 'QUEST · 上下文轨道', 'QUEST · 工作台', 'QUEST · 时间机', 'QUEST · 收束']
      const lines = [
        '说一句，看舞台变形',
        '对照 · 模板 · 数字在轨道里',
        '五种形态 FLIP 切换',
        '学习 / 工作 / 生活',
        '回到输入框再来一句',
      ]
      rootEl.classList.add('interaction-live')
      hud?.classList.add('interaction-live')
      const status = document.getElementById('interactionStatus')
      const count = document.getElementById('interactionCount')
      const line = document.getElementById('interactionLine')
      if (status) status.textContent = labels[part] ?? '四处看看'
      if (count) count.textContent = `${String(part).padStart(2, '0')} / 04`
      if (line) line.textContent = lines[part] ?? lines[0]!
      hud?.querySelectorAll<HTMLElement>('.interaction-hud__meter i').forEach((el, i) =>
        el.classList.toggle('is-on', i < part),
      )
    }

    const pinchBoost = 1

    const cancelPress = (): void => {
      window.clearTimeout(longPressTimer)
      pressing = false
      pressOrigin = null
    }

    const trackPointer = (event: PointerEvent): void => {
      ndc.x = (event.clientX / window.innerWidth) * 2 - 1
      ndc.y = -(event.clientY / window.innerHeight) * 2 + 1
      rig.setPointer(ndc)
      character?.setPointer(ndc)
      ringX.to(event.clientX)
      ringY.to(event.clientY)
      pointerInside = true
    }

    window.addEventListener(
      'pointermove',
      (event) => {
        trackPointer(event)
        if (
          pressOrigin &&
          Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 12
        ) {
          cancelPress()
        }
      },
      { passive: true },
    )

    window.addEventListener(
      'pointerdown',
      (event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest('a, button, [data-no-pinch]')) return
        trackPointer(event)
        pressOrigin = { x: event.clientX, y: event.clientY }
        if (motionPrefs.coarse) {
          longPressTimer = window.setTimeout(() => {
            pressing = true
          }, 180)
        } else {
          pressing = true
        }
      },
      { passive: true },
    )

    window.addEventListener('pointerup', cancelPress, { passive: true })
    window.addEventListener('pointercancel', cancelPress, { passive: true })
    window.addEventListener('pointerleave', () => {
      pointerInside = false
      cancelPress()
    })

    window.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest('a, button, [data-no-pinch]')) return
        const framing = rig.framing
        if (framing < PINCH_GATE && hoveringFace) say('轻一点。')
        else if (framing > 0.72) say(framing > 0.9 ? '全身都在。' : '镜头还在继续。')
      },
      { passive: true },
    )

    const quality = { window: 0, frames: 0, goodStreak: 0, paused: true }

    function updateQuality(dt: number): void {
      if (quality.paused || dt <= 0) return
      quality.window += dt
      quality.frames += 1
      if (quality.window < 2) return
      const fps = quality.frames / quality.window
      quality.window = 0
      quality.frames = 0
      if (fps < 45) {
        quality.goodStreak = 0
        if (stage.renderScale > 0.55) stage.setRenderScale(Math.max(0.55, stage.renderScale - 0.15))
      } else if (fps > 57) {
        quality.goodStreak += 1
        if (quality.goodStreak >= 2 && stage.renderScale < 1) {
          quality.goodStreak = 0
          stage.setRenderScale(Math.min(1, stage.renderScale + 0.15))
        }
      } else {
        quality.goodStreak = 0
      }
    }

    let lastNode = -1

    loop.add((dt) => {
      const state = scroll.read()
      rig.setProgress(anchorMap.toFraming(state.progress))
      rig.update(dt)

      if (character) {
        character.setFraming(rig.framing)
        character.setSmear?.(Number(rootEl.style.getPropertyValue('--vel')) || 0)
        character.update(dt)
      }

      if (pressing && !lastPressing) {
        blip(360)
        pinchHoldMs = 0
        if (hoveringFace) fx?.react('pinch', ringX.value, ringY.value)
      }
      if (pressing && hoveringFace) pinchHoldMs += dt * 1000
      if (!pressing && lastPressing && hoveringFace && pinchHoldMs > 280) {
        firePinchReward(ringX.value, ringY.value)
      }
      if (!pressing) pinchHoldMs = 0
      lastPressing = pressing

      if (canvas) {
        const breathe = Math.sin(performance.now() * 0.00135) * 0.7
        const ptrX = Number(rootEl.style.getPropertyValue('--ptr-x') || 0)
        canvas.style.transform = `translate3d(${(ptrX * 8).toFixed(2)}px, ${breathe.toFixed(2)}px, 0)`
      }

      hoveringFace = false
      if (character && pointerInside && rig.framing < PINCH_GATE) {
        raycaster.setFromCamera(ndc, stage.camera)
        const hits = raycaster.intersectObject(character.faceProxy, false)
        const first = hits[0]
        if (first) {
          hoveringFace = true
          hitPoint.copy(first.point)
        }
      }

      if (character) {
        if (hoveringFace) {
          const base = pressing ? 1 : 0.28
          character.pinch(hitPoint, Math.min(2.2, base * pinchBoost))
        } else {
          character.pinch(null, 0)
        }
      }

      rootEl.classList.toggle('fullbody-live', rig.framing < PINCH_GATE || rig.framing >= 0.62)

      if (ring) {
        const x = ringX.update(dt)
        const y = ringY.update(dt)
        const strength = character?.pinchStrength ?? 0
        ring.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${(1 - strength * 0.12).toFixed(3)})`
      }
      rootEl.classList.toggle('pinch-active', hoveringFace)
      rootEl.classList.toggle('pinch-pressing', hoveringFace && pressing)

      if (rig.nodeIndex !== lastNode) {
        lastNode = rig.nodeIndex
        rail.setActive(lastNode)
        updateHud(lastNode)
        fx?.setNode(lastNode)
      }

      updateQuality(dt)
      stage.render()
    })

    window.setTimeout(() => {
      quality.paused = false
    }, 1400)

    let resizeTimer = 0
    window.addEventListener('resize', () => {
      fx?.resize()
      stage.resize()
      rig.resize()
      anchorMap.refresh()
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        anchorMap.refresh()
        ScrollTrigger.refresh()
      }, 220)
    })

    if (params.get('debug') === '1') {
      const panel = document.createElement('pre')
      panel.id = 'debugPanel'
      panel.style.cssText =
        'position:fixed;left:12px;bottom:12px;z-index:99;margin:0;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.92);box-shadow:0 8px 24px rgba(14,14,18,.08);font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#0E0E12;white-space:pre;pointer-events:none'
      document.body.appendChild(panel)
      let frames = 0
      let acc = 0
      let fps = 0
      loop.add((dt) => {
        frames += 1
        acc += dt
        if (acc >= 0.5) {
          fps = frames / acc
          frames = 0
          acc = 0
          panel.textContent = JSON.stringify(
            {
              kind: character?.kind ?? null,
              framing: Number(rig.framing.toFixed(3)),
              node: rig.nodeIndex,
              exp: director.getState(),
              fps: Number(fps.toFixed(1)),
            },
            null,
            1,
          )
        }
      })
    }

    Object.assign(window, {
      __DOUBAO: {
        stage,
        fx,
        scroll,
        rig,
        anchorMap,
        director,
        get character() {
          return character
        },
        goTo: (t: number) => scroll.scrollTo(anchorMap.toScroll(t), { duration: 1.2 }),
        killIntro: () => {
          introTween?.kill()
          canvas.style.filter = ''
          stage.setRenderScale(1)
          rig.setIntro(1)
        },
      },
    })
  })().catch((error: unknown) => {
    console.error('[stage] 3D 层装配失败', error)
    document.documentElement.dataset.character = 'none'
  })
}

try {
  boot()
} catch (error) {
  console.error('[boot] 失败', error)
  document.documentElement.classList.remove('js')
}
