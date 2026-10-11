// 只引 weight 轴、不带 italic、不引 optical size：中文字形走系统字体，
// 拉丁与数字只需要 latin 子集，其余子集由 unicode-range 挡住，浏览器不会下载。
import '@fontsource-variable/inter/wght.css'
import './styles/global.css'
import './styles/gen2.css'
import './styles/spectacle.css'
import './styles/gen3.css'
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
import { initSpectacle } from './motion/spectacle'
import { initPolymorphCursor } from './motion/cursor'
import { initScrambleReveal } from './motion/scramble'
import { initVelocityMarquee } from './motion/marquee'
import { initChapterGates } from './motion/gates'
import { initEaster } from './fx/easter'
import { initChapters } from './motion/chapters'
import { initFeedback } from './ui/feedback'
import type { CharacterRig } from './three/character'

/**
 * main.ts — 入口，装配所有模块。
 *
 * ============================ 两阶段装配 ============================
 * three.js 有 244KB(gzip)，如果静态 import，它必须**下载 + 解析 + 执行完**
 * 才会触发 DOMContentLoaded —— 实测首屏 FCP 因此被拖到 3.7s。
 *
 * 所以这里是两阶段：
 *   阶段 1（同步、无 three）：单帧循环、平滑滚动、速度形变、取景锚点、
 *                            顶部导航、取景导航条、所有内容区块、滚动揭示
 *   阶段 2（异步、动态 import）：renderer / 灯光 / 环境、相机取景路径、
 *                            角色双轨探测、开场推近、捏脸、自适应画质
 *
 * 关键约束：**不能用顶层 await**。动态 import 不会阻塞模块求值，
 * 所以 DCL 与首屏绘制都不等 three；用顶层 await 就前功尽弃了。
 * 角色晚一拍上场这件事本身也是更好的节奏 —— 先见文案，再见人。
 * ==================================================================
 */

// 立刻打标记：CSS 里 html.js [data-reveal] 才会先隐藏，避免"先看到再飞入"的闪现
document.documentElement.classList.add('js')

const params = new URLSearchParams(window.location.search)
const forceParam = params.get('character')
const force =
  forceParam === 'model' || forceParam === 'imageRig' || forceParam === 'probe'
    ? forceParam
    : undefined

function boot(): void {
  /* ═══════════ 阶段 1：不依赖 three，立刻跑 ═══════════ */

  const loop = createFrameLoop()
  const scroll = createScroll()
  initVelocityWarp(scroll, loop)

  // 锚点必须在**布局最终态**下测量：字体晚到、pin 生成的 spacer 都会改变文档高度。
  // 挂在 ScrollTrigger 的 refresh 之后重测，是最省心也最不容易漏的做法 ——
  // 否则 toScroll()/toFraming() 会基于过期高度，取景和文字就会错位。
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
  initContentSections({ scroll, loop })
  initSpectacle({ loop })
  initPolymorphCursor(loop)
  initFeedback(loop)
  initChapters({ loop, scroll })
  initScrambleReveal()
  initVelocityMarquee(scroll, loop)

  /* Gen2：滚动区带 data-zone → 角色层对比度；视差；转场光洗 */
  const zoneSections = Array.from(document.querySelectorAll<HTMLElement>('[data-zone]'))
  const parallaxEls = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'))
  const cutSection = document.getElementById('cutover')
  let cutFired = false
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
    if (cutSection && !cutFired) {
      const r = cutSection.getBoundingClientRect()
      if (r.top < window.innerHeight * 0.7 && r.bottom > window.innerHeight * 0.25) {
        cutFired = true
        cutSection.classList.add('is-slash')
      }
    }
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


  /* ═══════════ 2D 特效层：粒子 + 小豆包 + 鼠标柔光 ═══════════
     刻意放在阶段 1：它是"会回应你"的部分，不该等 244KB 的 three。
     用户滚到首屏第一下点击就能得到反馈，哪怕 3D 还没进场。          */
  const fx = createStage2d()

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

    // 键盘：五声音阶 + 光标处炸一小簇。输入框里打字不算（那边走 askbar 的轻反馈）
    let keyPresses = 0
    window.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable]')) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.length !== 1 && event.key !== ' ') return
      keyPresses += 1
      fx.audio.unlock()
      fx.react('key')
    })

    // 点击：点到小豆包 → 挤压 + "啵"；点到别处 → 一小簇 + 一个音
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

    // 音效开关
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

    // 首屏输入条：全站唯一的"会回应你"入口
    initAskbar({
      onFirstGesture: () => fx.audio.unlock(),
      onType: () => fx.audio.note(2 + ((Math.random() * 3) | 0), { vol: 0.045 }),
      onSend: (_text, x, y) => fx.react('send', x, y),
      onAvatarBounce: () => fx.mascot.bounce(1.1),
    })

    initChapterGates({
      burst: (x, y) => {
        fx.particles.burst(x, y, { n: 18, speedMin: 2, speedMax: 9, big: false })
        fx.particles.ring(x, y, '#FF5A3C')
      },
    })

    // 彩蛋：连点头像 / 捏脸通关 / 烟花加重
    initEaster({
      mascot: fx.mascot,
      particles: fx.particles,
      audio: fx.audio,
      getPinchProgress: () => {
        const on = document.querySelectorAll('.interaction-hud__meter i.is-on').length
        return on / 5
      },
    })

    // 页脚烟花（easter 会再加重一波）
    document.getElementById('fireBtn')?.addEventListener('click', () => {
      fx.audio.unlock()
      fx.react('cheer')
    })
  }

  ScrollTrigger.addEventListener('refresh', () => anchorMap.refresh())
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  const settle = (): void => {
    ScrollTrigger.refresh()
    anchorMap.refresh()
  }
  fonts?.ready.then(settle).catch(settle)
  window.setTimeout(settle, 900)

  // 调试：?p=0.36 直接停在某个取景进度（布局与 pin 稳定后再跳）
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
    // 路径 B 的立绘板挂在相机下（天然屏幕对齐）。相机必须进场景图，
    // 否则渲染器的 traverse 到不了它的子节点，角色层会整个不显示。
    stage.scene.add(stage.camera)

    const rig = createCameraRig({ stage, metrics: DEFAULT_METRICS })
    initStageSections({ stage })

    /* ---- 角色：双轨资产自动探测 ---- */
    let character: CharacterRig | null = null

    createCharacter({
      renderer: stage.renderer,
      camera: stage.camera,
      force,
      onFallback: (reason) => console.info('[character] 降级：', reason),
    })
      .then((rigged) => {
        character = rigged
        // 注意：scene.add() 会**重新挂载**节点。立绘路径的 object3d 已经挂在相机下了，
        // 再 add 一次会把它从相机上摘下来 —— 相机会变成 0 个子节点，整个角色层不渲染。
        // 所以只给"还没有父节点"（探针/glb 路径）补挂一次。
        if (!rigged.object3d.parent) stage.scene.add(rigged.object3d)
        // 角色地标可能与默认值不同（例如归一化后的 glb），重建取景曲线
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

    /* ---- 开场：dolly in + 900ms 景深虚化消散 ---- */
    let introTween: gsap.core.Tween | null = null

    function runIntro(): void {
      rig.setIntro(0)
      // 整屏 blur 期间降分辨率：这是整站最贵的一段 GPU 开销
      stage.setRenderScale(0.72)
      const state = { t: 0 }
      introTween = gsap.to(state, {
        t: 1,
        duration: 0.9,
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

    /* ---- 指针：面部 raycast → 捏脸 ---- */
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2(0, 0)
    const hitPoint = new THREE.Vector3()
    const ring = document.getElementById('pinchRing')
    const hud = document.getElementById('interactionHud')
    const hudStatus = document.getElementById('interactionStatus')
    const hudCount = document.getElementById('interactionCount')
    const hudLine = document.getElementById('interactionLine')
    const whisper = document.getElementById('characterWhisper')
    const ringX = createSpring(SPRING.pointer)
    const ringY = createSpring(SPRING.pointer)
    const rootEl = document.documentElement

    /** 只有脸在画面里足够大时才允许捏（规格：面部特写段） */
    const PINCH_GATE = 0.38
    let pinchHoldMs = 0
    let pinchSuccessCount = 0
    let pinchRewardDone = false

    const firePinchReward = (x: number, y: number): void => {
      if (pinchRewardDone) return
      pinchRewardDone = true
      pinchSuccessCount += 1
      say('手感刚好。再捏一下？')
      fx?.mascot.bounce(1.35)
      fx?.react('cheer', x, y)
      fx?.particles.burst(x, y, {
        n: 42,
        speedMin: 3,
        speedMax: 14,
        big: true,
        gravity: 0.06,
        colors: ['#FF5A3C', '#FFB020', '#7EB6FF', '#F9A8D4', '#FDE68A'],
      })
      rootEl.classList.add('pinch-reward-shake', 'pinch-egg')
      window.setTimeout(() => rootEl.classList.remove('pinch-reward-shake'), 600)
      window.setTimeout(() => rootEl.classList.remove('pinch-egg'), 2600)
      const hint = document.getElementById('heroPinchHint')
      const reward = document.getElementById('heroReward')
      const rewardText = document.getElementById('heroRewardText')
      if (hint) hint.hidden = true
      if (reward) reward.hidden = false
      if (rewardText) {
        rewardText.textContent = '她轻声说：手感刚好。官方 Q 版跳了一下 · 已解锁 Alcoves 提示'
      }
      document.dispatchEvent(new CustomEvent('doubao:pinch-reward', { detail: { source: 'hero' } }))
      // HUD 记一格
      const meters = hud?.querySelectorAll<HTMLElement>('.interaction-hud__meter i')
      meters?.forEach((el, i) => el.classList.toggle('is-on', i < Math.min(5, pinchSuccessCount + 2)))
      if (hudStatus) hudStatus.textContent = 'QUEST · 捏脸奖励'
      if (hudLine) hudLine.textContent = '首屏捏脸通关 · 往下进 Alcoves 三关'
    }

    let pointerInside = false
    let pressing = false
    let hoveringFace = false
    let pressOrigin: { x: number; y: number } | null = null
    let longPressTimer = 0
    let lastPressing = false
    let whisperTimer = 0

    const say = (text: string): void => {
      if (!whisper) return
      whisper.textContent = text
      whisper.classList.add('is-visible')
      window.clearTimeout(whisperTimer)
      whisperTimer = window.setTimeout(() => whisper.classList.remove('is-visible'), 1500)
    }
    // 音效统一走 fx.audio（五声音阶 + 压缩器 + 全局静音），这里只留一个薄壳
    const blip = (pitch = 520): void => fx?.audio.blip(pitch)

    const updateHud = (node: number): void => {
      const part = Math.min(5, Math.max(1, node + 1))
      const labels = ['QUEST · 开场捏脸', 'QUEST · 定位', 'QUEST · 能力', 'QUEST · Alcoves', 'QUEST · 收束']
      const lines = [
        '首屏捏一下脸，拿奖励',
        '产品定位 · 继续下滚',
        '能力横滑 · 终端卡可玩',
        '三扇门 Flip 进出',
        '时间轴 / 宇宙 / CTA',
      ]
      rootEl.classList.add('interaction-live')
      hud?.classList.add('interaction-live')
      if (hudStatus) hudStatus.textContent = labels[part - 1] ?? '四处看看'
      if (hudCount) hudCount.textContent = `${String(part).padStart(2, '0')} / 05`
      if (hudLine) hudLine.textContent = lines[part - 1] ?? lines[0]!
      hud?.querySelectorAll<HTMLElement>('.interaction-hud__meter i').forEach((el, i) => el.classList.toggle('is-on', i < part))
    }

    /** 捏脸倍率（产品亮点幕不再暴露材质滑杆） */
    const pinchBoost = 1

    const cancelPress = (): void => {
      window.clearTimeout(longPressTimer)
      pressing = false
      pressOrigin = null
    }

    /** 触摸端没有 hover，pointermove 可能一次都不来 —— 所以按下时也要取一次坐标 */
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
        // 拖动超过 12px 视为滚动/转视角，取消捏脸
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
        // 关键：触摸端第一次接触就是 pointerdown，没有 pointermove。
        // 不在这里取坐标的话 pointerInside 永远是 false，捏脸在手机上完全不会触发。
        trackPointer(event)
        pressOrigin = { x: event.clientX, y: event.clientY }
        if (motionPrefs.coarse) {
          // 触摸端：长按 = 捏脸（规格第八节）。不设长按的话一滑动就会误捏。
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

    window.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('a, button, [data-no-pinch]')) return
      const framing = rig.framing
      // 音效由 fx 层统一负责（阶段 1），这里只出文字
      if (framing < PINCH_GATE && hoveringFace) {
        say('轻一点。')
      } else if (framing > 0.72) {
        say(framing > 0.9 ? '脚也看到了。' : '镜头还在继续。')
      }
    }, { passive: true })

    /* ---- 自适应画质（规格第九节：中端集显稳定 60fps）---- */
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
        // 连续两个好窗口才回升，避免在阈值附近来回抖
        if (quality.goodStreak >= 2 && stage.renderScale < 1) {
          quality.goodStreak = 0
          stage.setRenderScale(Math.min(1, stage.renderScale + 0.15))
        }
      } else {
        quality.goodStreak = 0
      }
    }

    /* ---- 主循环：唯一的一帧 ---- */
    let lastNode = -1

    loop.add((dt) => {
      const state = scroll.read()

      // 滚动进度 → 取景进度（按各区块真实位置锚定），再交给弹簧
      rig.setProgress(anchorMap.toFraming(state.progress))
      rig.update(dt)

      if (character) {
        character.setFraming(rig.framing)
        // 速度拖影：慢滚时 --vel 恒为 0，画面完全平静
        character.setSmear?.(Number(rootEl.style.getPropertyValue('--vel')) || 0)
        character.update(dt)
      }

      if (pressing && !lastPressing) {
        blip(360)
        pinchHoldMs = 0
        if (hoveringFace) fx?.react('pinch', ringX.value, ringY.value)
      }
      if (pressing && hoveringFace) {
        pinchHoldMs += dt * 1000
      }
      if (!pressing && lastPressing && hoveringFace && pinchHoldMs > 280) {
        firePinchReward(ringX.value, ringY.value)
      }
      if (!pressing) pinchHoldMs = 0
      lastPressing = pressing
      if (canvas) {
        const breathe = Math.sin(performance.now() * 0.00135) * 0.7
        canvas.style.transform = `translate3d(0, ${breathe.toFixed(2)}px, 0)`
      }

      // ---- 面部命中与捏脸 ----
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

      // 全身段：强调捏脸光环与 HUD
      rootEl.classList.toggle('fullbody-live', rig.framing < PINCH_GATE || rig.framing >= 0.62 || document.documentElement.classList.contains('alcove-open'))

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
        // 小豆包换到立绘的另一侧 + 一圈声波 + 一个音
        fx?.setNode(lastNode)
      }

      updateQuality(dt)
      stage.render()
    })

    // 开场推近期间不做画质降档，否则会把"虚化"误判成掉帧
    window.setTimeout(() => {
      quality.paused = false
    }, 1400)

    /* ---- resize ---- */
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

    /* ---- 调试面板：?debug=1 ---- */
    if (params.get('debug') === '1') {
      const panel = document.createElement('pre')
      panel.id = 'debugPanel'
      panel.style.cssText = [
        'position:fixed', 'left:12px', 'bottom:12px', 'z-index:99',
        'margin:0', 'padding:10px 12px', 'border-radius:10px',
        'background:rgba(255,255,255,.92)', 'box-shadow:0 8px 24px rgba(14,14,18,.08)',
        'font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
        'color:#0E0E12', 'white-space:pre', 'pointer-events:none',
      ].join(';')
      document.body.appendChild(panel)
      const gl = stage.renderer.getContext()
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
          const s = {
            kind: character?.kind ?? null,
            ready: character?.ready ?? false,
            framing: Number(rig.framing.toFixed(3)),
            node: rig.nodeIndex,
            yawDeg: Number(((rig.yaw * 180) / Math.PI).toFixed(1)),
            fps: Number(fps.toFixed(1)),
            renderScale: stage.renderScale,
            drawCalls: stage.renderer.info.render.calls,
            triangles: stage.renderer.info.render.triangles,
            glRenderer: (() => {
              const ext = gl.getExtension('WEBGL_debug_renderer_info')
              return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'n/a'
            })(),
            cam: [
              Number(stage.camera.position.x.toFixed(2)),
              Number(stage.camera.position.y.toFixed(2)),
              Number(stage.camera.position.z.toFixed(2)),
            ],
          }
          panel.textContent = JSON.stringify(s, null, 1)
        }
      })
    }

    /* ---- 开发期钩子 ---- */
    Object.assign(window, {
      __DOUBAO: {
        stage,
        fx,
        scroll,
        rig,
        anchorMap,
        get character() {
          return character
        },
        goTo: (t: number) => scroll.scrollTo(anchorMap.toScroll(t), { duration: 1.2 }),
        state: () => ({
          framing: Number(rig.framing.toFixed(4)),
          target: Number(anchorMap.toFraming(scroll.read().progress).toFixed(4)),
          progress: Number(scroll.read().progress.toFixed(4)),
          scrollY: Math.round(window.scrollY),
          node: rig.nodeIndex,
          kind: character?.kind ?? null,
          ready: character?.ready ?? false,
          renderScale: stage.renderScale,
          drawCalls: stage.renderer.info.render.calls,
        }),
        killIntro: () => {
          introTween?.kill()
          canvas.style.filter = ''
          stage.setRenderScale(1)
          rig.setIntro(1)
        },
      },
    })
  })().catch((error: unknown) => {
    // 3D 层炸了也不能连累文字内容 —— 内容在阶段 1 就已经装好了
    console.error('[stage] 3D 层装配失败', error)
    document.documentElement.dataset.character = 'none'
  })
}

try {
  boot()
} catch (error) {
  // 兜底：任何一步炸掉，都要保证文字内容可见，而不是留一个空白页
  console.error('[boot] 失败', error)
  document.documentElement.classList.remove('js')
}
