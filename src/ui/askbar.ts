/**
 * ui/askbar.ts — Hero 对话：假智能（默认）+ 方舟真接线骨架 + 流式打字
 */

import { replyFake, getFakeHistory, rememberTurn, type FakeReply } from '../lib/fakeBrain'
import { chatArk, hasArkKey, ARK_SYSTEM_PROMPT, type ArkMessage } from '../lib/doubaoClient'

const SEEDS: readonly string[] = [
  '帮我把这周的周报写了',
  '这段话翻译成英文',
  '我该给这个功能起什么名',
  '陪我练十分钟口语',
]

const FAKE_FILES = ['周报草稿.pdf', '会议纪要.docx', '截图.png', '数据表.xlsx'] as const

export interface AskbarHooks {
  onSend(text: string, x: number, y: number): void
  onType(): void
  onFirstGesture(): void
  onAvatarBounce?(): void
}

export function initAskbar(hooks: AskbarHooks): () => void {
  const bar = document.getElementById('askbar')
  const input = document.getElementById('askInput')
  const send = document.getElementById('askSend')
  const reply = document.getElementById('askReply')
  const thread = document.getElementById('askThread')
  const wrap = document.getElementById('heroAsk')
  const chipsHost = document.getElementById('askFollowups')
  const voiceBtn = document.getElementById('askVoice')
  const attachBtn = document.getElementById('askAttach')
  const attachLabel = document.getElementById('askAttachLabel')
  const avatar = document.getElementById('askAvatar')
  if (!(input instanceof HTMLInputElement) || !bar) return () => undefined

  let replyTimer = 0
  let lastType = 0
  let disposed = false
  let busy = false
  let attached: string | null = null
  let voiceHold = false
  let abort: AbortController | null = null
  const destroyers: Array<() => void> = []

  const punch = (el: HTMLElement): void => {
    el.classList.remove('is-in')
    void el.offsetWidth
    el.classList.add('is-in')
  }

  const bounceAvatar = (): void => {
    if (!avatar) return
    avatar.classList.remove('is-bounce')
    void avatar.offsetWidth
    avatar.classList.add('is-bounce')
    hooks.onAvatarBounce?.()
  }

  const appendBubble = (who: '你' | '豆包', text: string, kind: 'user' | 'ai'): HTMLElement | null => {
    if (!thread) return null
    const el = document.createElement('div')
    el.className = `ask-bubble ask-bubble--${kind}`
    el.innerHTML = `<span class="ask-bubble__who"></span><p></p>`
    const whoEl = el.querySelector('.ask-bubble__who')
    const p = el.querySelector('p')
    if (whoEl) whoEl.textContent = who
    if (p) p.textContent = text
    thread.appendChild(el)
    punch(el)
    thread.scrollTop = thread.scrollHeight
    while (thread.children.length > 10) {
      thread.firstElementChild?.remove()
    }
    return el
  }

  const renderFollowups = (labels: string[]): void => {
    if (!chipsHost) return
    chipsHost.innerHTML = ''
    chipsHost.hidden = false
    labels.forEach((label) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ask-follow'
      btn.textContent = label
      btn.addEventListener('click', () => void submit(label))
      chipsHost.appendChild(btn)
    })
  }

  /** 流式打字：按字追加，支持外部增量推入 */
  const createStreamer = (el: HTMLElement): { push: (s: string) => void; finish: (followups?: string[]) => void; set: (s: string) => void } => {
    const p = el.querySelector('p')
    let shown = ''
    let queue = ''
    window.clearInterval(replyTimer)
    if (p) p.textContent = ''

    const tick = (): void => {
      if (disposed || !p) return
      if (!queue.length) return
      const take = queue.slice(0, Math.max(1, Math.min(3, Math.ceil(queue.length / 12))))
      queue = queue.slice(take.length)
      shown += take
      p.textContent = shown
      if (thread) thread.scrollTop = thread.scrollHeight
    }
    replyTimer = window.setInterval(tick, 22)

    return {
      push(s: string) {
        queue += s
      },
      set(s: string) {
        queue = ''
        shown = s
        if (p) p.textContent = s
      },
      finish(followups?: string[]) {
        const drain = window.setInterval(() => {
          if (!queue.length) {
            window.clearInterval(drain)
            window.clearInterval(replyTimer)
            busy = false
            renderFollowups(followups ?? ['再短一点', '换成口语', '继续追问'])
            bounceAvatar()
          }
        }, 30)
      },
    }
  }

  const showLegacyReply = (text: string): void => {
    if (!reply) return
    reply.textContent = text
    reply.classList.add('is-visible')
    window.setTimeout(() => reply.classList.remove('is-visible'), 2200)
  }

  const buildArkMessages = (userText: string): ArkMessage[] => {
    const msgs: ArkMessage[] = [{ role: 'system', content: ARK_SYSTEM_PROMPT }]
    for (const turn of getFakeHistory()) {
      msgs.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.content })
    }
    msgs.push({ role: 'user', content: userText })
    return msgs
  }

  const runFake = (userText: string, aiEl: HTMLElement | null): void => {
    const fake: FakeReply = replyFake(userText)
    if (!aiEl) {
      showLegacyReply(fake.text)
      busy = false
      renderFollowups(fake.followups)
      return
    }
    const streamer = createStreamer(aiEl)
    // 假智能也做流式观感
    let i = 0
    const id = window.setInterval(() => {
      if (disposed) {
        window.clearInterval(id)
        return
      }
      const step = Math.max(1, Math.ceil(fake.text.length / 40))
      streamer.push(fake.text.slice(i, i + step))
      i += step
      if (i >= fake.text.length) {
        window.clearInterval(id)
        streamer.finish(fake.followups)
      }
    }, 28)
  }

  const submit = async (preset?: string): Promise<void> => {
    hooks.onFirstGesture()
    if (busy) return
    let raw = (preset ?? input.value).trim()
    if (attached && !raw) raw = `看看这个附件：${attached}`
    else if (attached) raw = `${raw}（附：${attached}）`
    const text = raw || SEEDS[(Math.random() * SEEDS.length) | 0]!
    const rect = bar.getBoundingClientRect()
    busy = true
    bar.classList.add('is-sending')
    wrap?.classList.add('is-sending')
    bounceAvatar()
    window.setTimeout(() => {
      bar.classList.remove('is-sending')
      wrap?.classList.remove('is-sending')
    }, 420)
    hooks.onSend(text, rect.left + rect.width / 2, rect.top)
    appendBubble('你', text, 'user')
    input.value = ''
    attached = null
    if (attachLabel) {
      attachLabel.textContent = ''
      attachLabel.hidden = true
    }
    attachBtn?.classList.remove('is-on')
    if (chipsHost) {
      chipsHost.innerHTML = ''
      chipsHost.hidden = true
    }

    await new Promise((r) => window.setTimeout(r, 220))
    const ai = appendBubble('豆包', '', 'ai')

    if (hasArkKey()) {
      abort?.abort()
      abort = new AbortController()
      const streamer = ai ? createStreamer(ai) : null
      try {
        const full = await chatArk({
          messages: buildArkMessages(text),
          stream: true,
          signal: abort.signal,
          onToken: (chunk) => streamer?.push(chunk),
        })
        const answer = full.trim() || '（空响应）我换成本地助手继续帮你。'
        rememberTurn(text, answer)
        if (streamer) {
          if (!full.trim()) streamer.set(answer)
          streamer.finish(['再短一点', '换成口语', '继续追问'])
        } else {
          showLegacyReply(answer)
          busy = false
        }
        return
      } catch (err) {
        console.info('[askbar] 方舟失败，回退假智能', err)
        if (streamer) streamer.set('')
        runFake(text, ai)
        return
      }
    }

    runFake(text, ai)
  }

  /** 供模板墙飞入后灌字；autoSend 可选 */
  const fill = (text: string, autoSend = false): void => {
    input.value = text
    input.focus()
    bar.classList.add('is-filled')
    window.setTimeout(() => bar.classList.remove('is-filled'), 500)
    if (autoSend) void submit(text)
  }
  ;(window as unknown as { __askbarFill?: typeof fill }).__askbarFill = fill

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
      return
    }
    if (event.key.length === 1) {
      hooks.onFirstGesture()
      const now = performance.now()
      if (now - lastType > 90) {
        lastType = now
        hooks.onType()
      }
    }
  }

  const onSendClick = (event: MouseEvent): void => {
    event.preventDefault()
    void submit()
  }

  const onFirstPointer = (): void => hooks.onFirstGesture()

  input.addEventListener('keydown', onKeydown)
  send?.addEventListener('click', onSendClick)
  bar.addEventListener('pointerdown', onFirstPointer, { passive: true })
  destroyers.push(() => {
    input.removeEventListener('keydown', onKeydown)
    send?.removeEventListener('click', onSendClick)
    bar.removeEventListener('pointerdown', onFirstPointer)
  })

  const onAttach = (): void => {
    hooks.onFirstGesture()
    attached = FAKE_FILES[(Math.random() * FAKE_FILES.length) | 0]!
    if (attachLabel) {
      attachLabel.textContent = attached
      attachLabel.hidden = false
    }
    attachBtn?.classList.add('is-on')
    bar.classList.add('has-attach')
    window.setTimeout(() => bar.classList.remove('has-attach'), 400)
  }
  attachBtn?.addEventListener('click', onAttach)
  destroyers.push(() => attachBtn?.removeEventListener('click', onAttach))

  const voiceLabel = document.getElementById('askVoiceLabel')
  const startVoice = (event: Event): void => {
    event.preventDefault()
    hooks.onFirstGesture()
    voiceHold = true
    voiceBtn?.classList.add('is-holding')
    voiceBtn?.setAttribute('aria-pressed', 'true')
    if (voiceLabel) voiceLabel.textContent = '聆听中…'
    bar.classList.add('is-voice')
  }
  const endVoice = (): void => {
    if (!voiceHold) return
    voiceHold = false
    voiceBtn?.classList.remove('is-holding')
    voiceBtn?.setAttribute('aria-pressed', 'false')
    if (voiceLabel) voiceLabel.textContent = '按住说话'
    bar.classList.remove('is-voice')
    void submit('（语音）帮我查一下今天杭州天气')
  }
  voiceBtn?.addEventListener('pointerdown', startVoice)
  voiceBtn?.addEventListener('pointerup', endVoice)
  voiceBtn?.addEventListener('pointerleave', endVoice)
  voiceBtn?.addEventListener('pointercancel', endVoice)
  destroyers.push(() => {
    voiceBtn?.removeEventListener('pointerdown', startVoice)
    voiceBtn?.removeEventListener('pointerup', endVoice)
    voiceBtn?.removeEventListener('pointerleave', endVoice)
    voiceBtn?.removeEventListener('pointercancel', endVoice)
  })

  document.querySelectorAll<HTMLButtonElement>('[data-ask-seed]').forEach((btn) => {
    const onHint = (): void => {
      const seed = btn.dataset.askSeed ?? btn.textContent ?? ''
      void submit(seed)
    }
    btn.addEventListener('click', onHint)
    destroyers.push(() => btn.removeEventListener('click', onHint))
  })

  return () => {
    disposed = true
    abort?.abort()
    window.clearInterval(replyTimer)
    delete (window as unknown as { __askbarFill?: typeof fill }).__askbarFill
    for (const d of destroyers.reverse()) d()
  }
}
