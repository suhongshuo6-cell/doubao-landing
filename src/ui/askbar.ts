/**
 * ui/askbar.ts — 假对话引擎升级
 * 点问题→用户气泡→500ms 思考三点呼吸→逐行回复+关键词高亮→2–3追问→上下文细线
 * 高度用 GSAP 弹簧，勿跳。磁性入框。
 */
import gsap from 'gsap'
import { replyFake, getFakeHistory, rememberTurn, type FakeReply } from '../lib/fakeBrain'
import { chatArk, hasArkKey, ARK_SYSTEM_PROMPT, type ArkMessage } from '../lib/doubaoClient'
import { motionPrefs } from '../lib/motionPrefs'
import { EASE_IN } from '../motion/eases'

const SEEDS: readonly string[] = [
  '帮我把这周的周报写了',
  '看看这张图里有什么',
  '帮我安排一下今天',
  '给我一个创意点子',
]

const FAKE_FILES = ['周报草稿.pdf', '会议纪要.docx', '截图.png', '数据表.xlsx'] as const

const HIGHLIGHT_WORDS = [
  '周报', '结论', '风险', '增长', '翻译', '口语', '提纲', '行程', '天气',
  '杭州', '豆包', '摘要', '候选', '方案', '对比', '提示词', '待办', '创意',
]

export interface AskbarHooks {
  onSend(text: string, x: number, y: number): void
  onType(): void
  onFirstGesture(): void
  onAvatarBounce?(): void
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightHtml(text: string): string {
  let html = escapeHtml(text)
  for (const w of HIGHLIGHT_WORDS) {
    html = html.replace(new RegExp(`(${w})`, 'g'), '<mark class="ask-kw">$1</mark>')
  }
  return html.replace(/\n/g, '<br/>')
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
  const ctxLine = document.getElementById('askContext')
  if (!(input instanceof HTMLInputElement) || !bar) return () => undefined

  let replyTimer = 0
  let lastType = 0
  let disposed = false
  let busy = false
  let attached: string | null = null
  let voiceHold = false
  let abort: AbortController | null = null
  const destroyers: Array<() => void> = []

  const springHeight = (): void => {
    if (!thread || motionPrefs.reduced) {
      if (thread) thread.style.height = 'auto'
      return
    }
    const prev = thread.offsetHeight
    thread.style.height = 'auto'
    const next = thread.scrollHeight
    thread.style.height = `${prev}px`
    gsap.to(thread, {
      height: next,
      duration: 0.48,
      ease: 'power3.out',
      overwrite: true,
      onComplete: () => {
        thread.style.height = 'auto'
      },
    })
  }

  const bounceAvatar = (): void => {
    if (!avatar) return
    avatar.classList.remove('is-bounce')
    void avatar.offsetWidth
    avatar.classList.add('is-bounce')
    hooks.onAvatarBounce?.()
  }

  const updateContext = (): void => {
    if (!ctxLine) return
    const hist = getFakeHistory()
    if (hist.length < 2) {
      ctxLine.hidden = true
      return
    }
    const lastUser = [...hist].reverse().find((t) => t.role === 'user')
    ctxLine.hidden = false
    ctxLine.innerHTML = `<i></i><span>上下文 · ${escapeHtml((lastUser?.content ?? '').slice(0, 28))}${(lastUser?.content.length ?? 0) > 28 ? '…' : ''}</span>`
  }

  const appendBubble = (
    who: '你' | '豆包',
    text: string,
    kind: 'user' | 'ai' | 'think',
  ): HTMLElement | null => {
    if (!thread) return null
    const el = document.createElement('div')
    el.className = `ask-bubble ask-bubble--${kind}`
    if (kind === 'think') {
      el.innerHTML = `<span class="ask-bubble__who">豆包</span><div class="ask-think" aria-label="正在思考"><i></i><i></i><i></i></div>`
    } else {
      el.innerHTML = `<span class="ask-bubble__who"></span><p></p>`
      const whoEl = el.querySelector('.ask-bubble__who')
      const p = el.querySelector('p')
      if (whoEl) whoEl.textContent = who
      if (p) {
        if (kind === 'ai') p.innerHTML = highlightHtml(text)
        else p.textContent = text
      }
    }
    thread.appendChild(el)
    if (!motionPrefs.reduced) {
      gsap.fromTo(
        el,
        { opacity: 0, y: 22, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(1.6)' },
      )
    } else {
      el.classList.add('is-in')
    }
    springHeight()
    thread.scrollTop = thread.scrollHeight
    while (thread.children.length > 12) {
      thread.firstElementChild?.remove()
    }
    return el
  }

  const renderFollowups = (labels: string[]): void => {
    if (!chipsHost) return
    chipsHost.innerHTML = ''
    chipsHost.hidden = false
    const list = labels.slice(0, 3)
    list.forEach((label, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ask-follow'
      btn.textContent = label
      btn.addEventListener('click', () => void submit(label))
      chipsHost.appendChild(btn)
      if (!motionPrefs.reduced) {
        gsap.fromTo(
          btn,
          { opacity: 0, y: 10, scale: 0.9 },
          { opacity: 1, y: 0, scale: 1, duration: 0.35, delay: i * 0.05, ease: 'back.out(1.8)' },
        )
      }
    })
    springHeight()
  }

  const createStreamer = (
    el: HTMLElement,
  ): { push: (s: string) => void; finish: (followups?: string[]) => void; set: (s: string) => void } => {
    const p = el.querySelector('p')
    let shown = ''
    let queue = ''
    window.clearInterval(replyTimer)
    if (p) p.innerHTML = ''

    const tick = (): void => {
      if (disposed || !p) return
      if (!queue.length) return
      const take = queue.slice(0, Math.max(1, Math.min(3, Math.ceil(queue.length / 12))))
      queue = queue.slice(take.length)
      shown += take
      // 按行：遇到换行时分段高亮刷新
      p.innerHTML = highlightHtml(shown)
      if (thread) thread.scrollTop = thread.scrollHeight
      springHeight()
    }
    replyTimer = window.setInterval(tick, 22)

    return {
      push(s: string) {
        queue += s
      },
      set(s: string) {
        queue = ''
        shown = s
        if (p) p.innerHTML = highlightHtml(s)
      },
      finish(followups?: string[]) {
        const drain = window.setInterval(() => {
          if (!queue.length) {
            window.clearInterval(drain)
            window.clearInterval(replyTimer)
            busy = false
            updateContext()
            renderFollowups(followups ?? ['再细一点', '换个说法', '继续追问'])
            bounceAvatar()
            send?.classList.remove('is-ready')
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
    // 逐行推入：按换行分段，段间短暂停顿
    const lines = fake.text.split('\n')
    let lineIdx = 0
    let charIdx = 0
    const id = window.setInterval(() => {
      if (disposed) {
        window.clearInterval(id)
        return
      }
      if (lineIdx >= lines.length) {
        window.clearInterval(id)
        streamer.finish(fake.followups)
        return
      }
      const line = lines[lineIdx]!
      if (charIdx >= line.length) {
        if (lineIdx < lines.length - 1) streamer.push('\n')
        lineIdx += 1
        charIdx = 0
        return
      }
      const step = Math.max(1, Math.ceil(line.length / 28))
      streamer.push(line.slice(charIdx, charIdx + step))
      charIdx += step
    }, 26)
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
    send?.classList.add('is-ready')
    bounceAvatar()
    window.setTimeout(() => {
      bar.classList.remove('is-sending')
      wrap?.classList.remove('is-sending')
    }, 420)
    hooks.onSend(text, rect.left + rect.width / 2, rect.top)
    document.dispatchEvent(new CustomEvent('doubao:asked', { detail: { text } }))
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

    // 500ms 思考三点呼吸
    const think = appendBubble('豆包', '', 'think')
    await new Promise((r) => window.setTimeout(r, motionPrefs.reduced ? 80 : 500))
    think?.remove()
    springHeight()

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
          streamer.finish(['再细一点', '换个说法', '继续追问'])
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

  /** 磁性入框：芯片飞向输入框再灌字 */
  const magneticFill = (text: string, fromEl?: HTMLElement, autoSend = true): void => {
    if (fromEl && !motionPrefs.reduced) {
      const fr = fromEl.getBoundingClientRect()
      const ir = input.getBoundingClientRect()
      const ghost = fromEl.cloneNode(true) as HTMLElement
      ghost.classList.add('ask-magnet-ghost')
      ghost.style.cssText = `position:fixed;left:${fr.left}px;top:${fr.top}px;width:${fr.width}px;z-index:80;pointer-events:none;margin:0;`
      document.body.appendChild(ghost)
      gsap.to(ghost, {
        left: ir.left + 12,
        top: ir.top + 6,
        scale: 0.7,
        opacity: 0.15,
        duration: 0.42,
        ease: EASE_IN,
        onComplete: () => ghost.remove(),
      })
      bar.classList.add('is-filled')
      send?.classList.add('is-ready')
      window.setTimeout(() => bar.classList.remove('is-filled'), 500)
      window.setTimeout(() => {
        if (autoSend) void submit(text)
        else {
          input.value = text
          input.focus()
        }
      }, 280)
      return
    }
    input.value = text
    input.focus()
    bar.classList.add('is-filled')
    send?.classList.add('is-ready')
    window.setTimeout(() => bar.classList.remove('is-filled'), 500)
    if (autoSend) void submit(text)
  }

  const fill = (text: string, autoSend = false): void => {
    magneticFill(text, undefined, autoSend)
  }
  ;(window as unknown as { __askbarFill?: typeof fill }).__askbarFill = fill

  // 输入时点亮发送
  const onInput = (): void => {
    send?.classList.toggle('is-ready', input.value.trim().length > 0)
  }
  input.addEventListener('input', onInput)
  destroyers.push(() => input.removeEventListener('input', onInput))

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
    send?.classList.add('is-ready')
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
      magneticFill(seed, btn, true)
    }
    btn.addEventListener('click', onHint)
    destroyers.push(() => btn.removeEventListener('click', onHint))
  })

  // 空格聚焦（非输入态）
  const onSpaceFocus = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return
    const t = e.target as HTMLElement | null
    if (t?.closest('input, textarea, [contenteditable], button, a')) return
    e.preventDefault()
    input.focus()
    bar.classList.add('is-filled')
    window.setTimeout(() => bar.classList.remove('is-filled'), 400)
  }
  window.addEventListener('keydown', onSpaceFocus)
  destroyers.push(() => window.removeEventListener('keydown', onSpaceFocus))

  return () => {
    disposed = true
    abort?.abort()
    window.clearInterval(replyTimer)
    delete (window as unknown as { __askbarFill?: typeof fill }).__askbarFill
    for (const d of destroyers.reverse()) d()
  }
}
