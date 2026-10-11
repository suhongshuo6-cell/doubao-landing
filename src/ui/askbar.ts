/**
 * ui/askbar.ts — 首屏那条「随便打点什么」的输入条。
 *
 * 它是全站唯一的「会回应你」入口：demo 里最有价值的交互就是这个 ——
 * 用户自己动手输入，然后立刻得到反馈。这里把它接到豆包的语气上：
 * 不假装是真 AI，只给一句像样的回应，重点在**即时感**而不是功能。
 *
 * 三条细节：
 *  1. 输入时按节流给轻微的音符反馈（不是每敲一个字都响，那会很吵）；
 *  2. 发送后回复是**逐字打出来**的，比整段淡入更像"在回你"；
 *  3. 回复用完即走，不留历史 —— 这是落地页不是聊天窗。
 */

const REPLIES: readonly string[] = [
  '在。慢慢说，我不着急。',
  '先说半句也行，剩下的我接着猜。',
  '这段我记下了，下次不用重讲。',
  '要不要我把它写成一版正式的？',
  '你说的我听着呢——继续。',
  '需要我先画个草稿看看吗？',
  '这个我擅长，交给我吧。',
  '嗯，然后呢？',
]

const SEEDS: readonly string[] = [
  '帮我把这周的周报写了',
  '这段话翻译成英文',
  '我该给这个功能起什么名',
  '陪我练十分钟口语',
]

export interface AskbarHooks {
  /** 发送：main 用它触发粒子 + 和弦 */
  onSend(text: string, x: number, y: number): void
  /** 正在输入：轻微反馈，已按 90ms 节流 */
  onType(): void
  /** 第一次真实交互，用来解锁 AudioContext */
  onFirstGesture(): void
}

export function initAskbar(hooks: AskbarHooks): () => void {
  const bar = document.getElementById('askbar')
  const input = document.getElementById('askInput')
  const send = document.getElementById('askSend')
  const reply = document.getElementById('askReply')
  if (!(input instanceof HTMLInputElement) || !bar) return () => undefined

  let replyTimer = 0
  let lastType = 0
  let disposed = false

  const showReply = (text: string): void => {
    if (!reply) return
    window.clearInterval(replyTimer)
    reply.textContent = ''
    reply.classList.add('is-visible')
    let i = 0
    replyTimer = window.setInterval(() => {
      if (disposed) return
      i += 1
      reply.textContent = text.slice(0, i)
      if (i >= text.length) {
        window.clearInterval(replyTimer)
        window.setTimeout(() => reply.classList.remove('is-visible'), 2600)
      }
    }, 34)
  }

  const submit = (): void => {
    hooks.onFirstGesture()
    const raw = input.value.trim()
    const text = raw || SEEDS[(Math.random() * SEEDS.length) | 0]!
    const rect = bar.getBoundingClientRect()
    hooks.onSend(text, rect.left + rect.width / 2, rect.top)
    showReply(REPLIES[(Math.random() * REPLIES.length) | 0]!)
    input.value = ''
    input.blur()
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
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
    submit()
  }

  const onFirstPointer = (): void => hooks.onFirstGesture()

  input.addEventListener('keydown', onKeydown)
  send?.addEventListener('click', onSendClick)
  bar.addEventListener('pointerdown', onFirstPointer, { passive: true })

  return () => {
    disposed = true
    window.clearInterval(replyTimer)
    input.removeEventListener('keydown', onKeydown)
    send?.removeEventListener('click', onSendClick)
    bar.removeEventListener('pointerdown', onFirstPointer)
  }
}
