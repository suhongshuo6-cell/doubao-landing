/**
 * doubaoClient.ts — 火山方舟 Chat Completions 接线骨架
 *
 * Key 来源（优先级）：
 * 1) window.__ARK_API_KEY__（运行时注入，勿写进源码）
 * 2) import.meta.env.VITE_ARK_API_KEY（仅建议本地 dev；GH Pages 会暴露前端 Key）
 *
 * 浏览器直连 ark 域名常遇 CORS → vite.dev proxy `/ark-api`。
 * 失败时调用方应回退 fakeBrain。
 */

export interface ArkMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ArkChatOptions {
  messages: ArkMessage[]
  model?: string
  stream?: boolean
  signal?: AbortSignal
  onToken?: (chunk: string) => void
}

declare global {
  interface Window {
    __ARK_API_KEY__?: string
    __ARK_MODEL__?: string
  }
}

const ARK_PATH = '/api/v3/chat/completions'
const DEFAULT_MODEL = 'doubao-pro-32k'

function readKey(): string | undefined {
  const runtime = typeof window !== 'undefined' ? window.__ARK_API_KEY__?.trim() : ''
  if (runtime) return runtime
  const env = import.meta.env.VITE_ARK_API_KEY
  if (typeof env === 'string' && env.trim()) return env.trim()
  return undefined
}

function readModel(): string {
  const runtime = typeof window !== 'undefined' ? window.__ARK_MODEL__?.trim() : ''
  if (runtime) return runtime
  const env = import.meta.env.VITE_ARK_MODEL
  if (typeof env === 'string' && env.trim()) return env.trim()
  return DEFAULT_MODEL
}

/** 是否配置了可用的 Key（不保证网络/CORS 成功） */
export function hasArkKey(): boolean {
  return Boolean(readKey())
}

function resolveEndpoint(): string {
  // 开发：走 Vite proxy，规避 CORS
  if (import.meta.env.DEV) return `/ark-api${ARK_PATH}`
  // 生产：若部署了同源反代，可用 VITE_ARK_BASE；否则直连（多半 CORS 失败 → 回退假智能）
  const base = (import.meta.env.VITE_ARK_BASE as string | undefined)?.replace(/\/$/, '')
  if (base) return `${base}${ARK_PATH}`
  return `https://ark.cn-beijing.volces.com${ARK_PATH}`
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
        }
        const piece = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? ''
        if (piece) {
          full += piece
          onToken(piece)
        }
      } catch {
        /* ignore partial json */
      }
    }
  }
  return full
}

/**
 * 调用方舟 chat/completions。无 Key 时抛错，由上层回退假智能。
 */
export async function chatArk(opts: ArkChatOptions): Promise<string> {
  const key = readKey()
  if (!key) throw new Error('ARK_API_KEY_MISSING')

  const model = opts.model ?? readModel()
  const stream = opts.stream !== false
  const url = resolveEndpoint()

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      stream,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`ARK_HTTP_${res.status}: ${errText.slice(0, 200)}`)
  }

  if (stream && res.body) {
    return readSseStream(res.body, opts.onToken ?? (() => undefined), opts.signal)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = json.choices?.[0]?.message?.content ?? ''
  if (text && opts.onToken) opts.onToken(text)
  return text
}

export const ARK_SYSTEM_PROMPT =
  '你是豆包，字节跳动的 AI 助手。回答简洁、友善、可执行。若用户在非官方落地页演示环境，可如实说明能力边界。'
