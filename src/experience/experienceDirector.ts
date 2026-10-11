/**
 * experience/experienceDirector.ts — 体验状态机
 * idle → listening → command-submitted → thinking → reply-revealing →
 * result-ready → mode-unlocked → scene-completed → replay
 */
import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'
import { EXP, emit, on } from './events'
import {
  COMMAND_SCRIPTS,
  createSnapshot,
  matchCommand,
  type CommandId,
  type CommandScript,
  type ExpSnapshot,
  type ExpState,
} from './experienceState'

export interface DirectorHooks {
  onWhisper?(text: string): void
  onBurst?(x: number, y: number): void
  onModeUnlock?(mode: string): void
}

export interface ExperienceDirector {
  getState(): ExpState
  getSnapshot(): ExpSnapshot
  listen(): void
  submit(text: string, origin?: { x: number; y: number }): void
  completeScene(): void
  replay(): void
  destroy(): void
}

export function createExperienceDirector(hooks: DirectorHooks = {}): ExperienceDirector {
  const snap = createSnapshot()
  const destroyers: Array<() => void> = []
  let runToken = 0
  let timeline: gsap.core.Timeline | null = null

  const stage = (): HTMLElement | null => document.getElementById('command-stage')
  const panel = (): HTMLElement | null => document.getElementById('commandPanel')
  const status = (): HTMLElement | null => document.getElementById('commandStatus')
  const hudCount = (): HTMLElement | null => document.getElementById('interactionCount')
  const hudLine = (): HTMLElement | null => document.getElementById('interactionLine')
  const hudStatus = (): HTMLElement | null => document.getElementById('interactionStatus')
  const writeStatus = (text: string): void => {
    const el = status()
    if (el) el.textContent = text
  }

  const setState = (next: ExpState): void => {
    if (snap.state === next) return
    snap.state = next
    document.documentElement.dataset.exp = next
    stage()?.setAttribute('data-exp', next)
    emit(EXP.STATE_CHANGE, { state: next, command: snap.command, step: snap.step })
  }

  const setHud = (part: number, line: string, label = 'QUEST'): void => {
    const n = Math.max(0, Math.min(4, part))
    if (hudCount) hudCount()!.textContent = `${String(n).padStart(2, '0')} / 04`
    if (hudLine) hudLine()!.textContent = line
    if (hudStatus) hudStatus()!.textContent = label
    document
      .querySelectorAll<HTMLElement>('.interaction-hud__meter i')
      .forEach((el, i) => el.classList.toggle('is-on', i < n))
    emit(EXP.HUD, { part: n, line, label })
  }

  const paintPanel = (html: string, frame: string): void => {
    const host = panel()
    const root = stage()
    if (!host || !root) return
    root.dataset.frame = frame
    if (motionPrefs.reduced) {
      host.innerHTML = html
      return
    }
    gsap.to(host, {
      opacity: 0,
      y: 12,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: () => {
        host.innerHTML = html
        gsap.fromTo(
          host,
          { opacity: 0, y: 18, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.42, ease: EASE_IN },
        )
      },
    })
  }

  const runScript = (script: CommandScript, origin?: { x: number; y: number }): void => {
    timeline?.kill()
    const token = ++runToken
    snap.command = script.id
    snap.step = -1
    setState('command-submitted')
    setHud(1, `提交 · ${script.label}`, 'COMMAND')
    writeStatus(`已收到：${script.label}`)
    emit(EXP.COMMAND_SUBMIT, { id: script.id, seed: script.seed })
    if (origin) hooks.onBurst?.(origin.x, origin.y)

    const tl = gsap.timeline({
      onComplete: () => {
        if (token !== runToken) return
        setState('result-ready')
        setHud(3, `结果就绪 · ${script.label}`, 'RESULT')
        window.setTimeout(() => {
          if (token !== runToken) return
          snap.unlocked.add(script.unlockMode)
          setState('mode-unlocked')
          setHud(4, `解锁 · ${script.unlockMode}`, 'UNLOCK')
          hooks.onModeUnlock?.(script.unlockMode)
          emit(EXP.MODE_UNLOCK, { mode: script.unlockMode, command: script.id })
          document.documentElement.dataset.unlock = script.unlockMode
          // 短奖励 ≤1s
          document.documentElement.classList.add('exp-reward')
          window.setTimeout(() => document.documentElement.classList.remove('exp-reward'), 900)
        }, 320)
      },
    })
    timeline = tl

    tl.call(() => {
      if (token !== runToken) return
      setState('thinking')
      setHud(2, '思考中…', 'THINK')
      writeStatus('豆包正在想…')
      paintPanel('<div class="cmd-think"><i></i><i></i><i></i></div>', 'frame-think')
    })

    let t = motionPrefs.reduced ? 0.15 : 0.55
    script.steps.forEach((step, index) => {
      tl.call(
        () => {
          if (token !== runToken) return
          snap.step = index
          setState('reply-revealing')
          setHud(2 + Math.min(1, index / 3), step.hud ?? step.label, 'REVEAL')
          writeStatus(step.label)
          paintPanel(step.panel, step.frame)
          if (step.whisper) hooks.onWhisper?.(step.whisper)
          emit(EXP.COMMAND_STEP, { id: script.id, index, step })
          // 绑定复制按钮
          window.setTimeout(() => {
            panel()
              ?.querySelectorAll<HTMLButtonElement>('[data-cmd-copy]')
              .forEach((btn) => {
                btn.addEventListener(
                  'click',
                  () => {
                    btn.textContent = '已复制'
                    btn.classList.add('is-done')
                    hooks.onBurst?.(
                      btn.getBoundingClientRect().left + 20,
                      btn.getBoundingClientRect().top + 10,
                    )
                  },
                  { once: true },
                )
              })
          }, 50)
        },
        [],
        t,
      )
      t += (motionPrefs.reduced ? 0.12 : step.duration / 1000) * 0.85
    })
  }

  const listen = (): void => {
    setState('listening')
    setHud(0, '听你说一句', 'LISTEN')
    writeStatus('等待你的指令…')
  }

  const submit = (text: string, origin?: { x: number; y: number }): void => {
    const script = matchCommand(text) ?? COMMAND_SCRIPTS[0]!
    runScript(script, origin)
  }

  const completeScene = (): void => {
    snap.scenesDone += 1
    setState('scene-completed')
    setHud(Math.min(4, snap.scenesDone), `场景完成 · ${snap.scenesDone}/4`, 'SCENE')
    emit(EXP.SCENE_COMPLETE, { count: snap.scenesDone })
  }

  const replay = (): void => {
    timeline?.kill()
    runToken += 1
    snap.command = null
    snap.step = -1
    setState('replay')
    setHud(0, '再来一句', 'REPLAY')
    writeStatus('回到输入框')
    paintPanel('<div class="cmd-replay-hint">再说一句，舞台会重演。</div>', 'frame-idle')
    emit(EXP.REPLAY, {})
    const input = document.getElementById('askInput')
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.scrollIntoView({ behavior: motionPrefs.reduced ? 'auto' : 'smooth', block: 'center' })
    }
    window.setTimeout(() => listen(), 600)
  }

  // 外部事件：种子按钮 / askbar 发送
  destroyers.push(
    on<{ text: string; x?: number; y?: number }>(EXP.COMMAND_SUBMIT, (d) => {
      if (d?.text) submit(d.text, d.x != null && d.y != null ? { x: d.x, y: d.y } : undefined)
    }),
  )
  destroyers.push(
    on(EXP.REPLAY, () => {
      /* external may also call director.replay */
    }),
  )

  // 初始
  setState('idle')
  setHud(0, '移动视线，解锁下一镜', 'QUEST')
  window.setTimeout(() => listen(), 200)

  return {
    getState: () => snap.state,
    getSnapshot: () => snap,
    listen,
    submit,
    completeScene,
    replay,
    destroy: () => {
      timeline?.kill()
      runToken += 1
      destroyers.forEach((d) => d())
    },
  }
}

export function commandById(id: CommandId): CommandScript | undefined {
  return COMMAND_SCRIPTS.find((s) => s.id === id)
}
