/**
 * difyClient.ts — Dify Chat Messages 接线
 *
 * 应用：豆包接入口（公开页 https://udify.app/chat/toNa98fk5omTruA4）
 * 后端 API 基址（控制台 Backend API）：https://api.dify.ai/v1
 *
 * Key 来源（优先级）：
 * 1) window.__DIFY_API_KEY__（运行时注入，勿写进源码/公开仓库）
 * 2) import.meta.env.VITE_DIFY_API_KEY（仅建议本地 .env.local；GH Pages 会打进前端包）
 *
 * 浏览器直连常遇 CORS → vite.dev proxy `/dify-api`。
 * 生产可设 VITE_DIFY_BASE_URL=https://api.dify.ai/v1（直连；CORS 失败由调用方回退假智能）。
 */

export const DIFY_APP_NAME = '豆包接入口'
export const DIFY_PUBLIC_CHAT_URL = 'https://udify.app/chat/toNa98fk5omTruA4'

export interface DifyChatOptions {
  query: string
  conversationId?: string
  user?: string
  inputs?: Record<string, unknown>
  stream?: boolean
  signal?: AbortSignal
  onToken?: (chunk: string) => void
  onConversationId?: (id: string) => void
}

declare global {
  interface Window {
    __DIFY_API_KEY__?: string
    __DIFY_USER__?: string
  }
}

const DEFAULT_USER = 'doubao-landing-guest'

function readKey(): string | undefined {
  const runtime = typeof window !== 'undefined' ? window.__DIFY_API_KEY__?.trim() : ''
  if (runtime) return runtime
  const env = import.meta.env.VITE_DIFY_API_KEY
  if (typeof env === 'string' && env.trim()) return env.trim()
  return undefined
}

function readUser(): string {
  const runtime = typeof window !== 'undefined' ? window.__DIFY_USER__?.trim() : ''
  if (runtime) return runtime
  return DEFAULT_USER
}

/** 是否配置了可用的 Key（不保证网络/CORS 成功） */
export function hasDifyKey(): boolean {
  return Boolean(readKey())
}

/**
 * 解析 chat-messages 完整 URL。
 * - DEV：`/dify-api/v1/chat-messages`（Vite proxy → api.dify.ai）
 * - 生产：VITE_DIFY_BASE_URL（默认应含 `/v1`）+ `/chat-messages`
 * - 否则直连 `https://api.dify.ai/v1/chat-messages`
 */
function resolveEndpoint(): string {
  if (import.meta.env.DEV) return '/dify-api/v1/chat-messages'
  const base = (import.meta.env.VITE_DIFY_BASE_URL as string | undefined)?.replace(/\/$/, '')
  if (base) return `${base}/chat-messages`
  return 'https://api.dify.ai/v1/chat-messages'
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onToken: (chunk: string) => void,
  onConversationId?: (id: string) => void,
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
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          event?: string
          answer?: string
          conversation_id?: string
          message?: string
          code?: string
        }
        if (json.conversation_id && onConversationId) {
          onConversationId(json.conversation_id)
        }
        if (json.event === 'error') {
          throw new Error(`DIFY_SSE_ERROR: ${json.message ?? json.code ?? 'unknown'}`)
        }
        if (
          (json.event === 'message' || json.event === 'agent_message' || !json.event) &&
          typeof json.answer === 'string' &&
          json.answer
        ) {
          full += json.answer
          onToken(json.answer)
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('DIFY_SSE_ERROR')) throw err
        /* ignore partial json */
      }
    }
  }
  return full
}

/**
 * 调用 Dify chat-messages。无 Key 时抛错，由上层回退假智能。
 */
export async function chatDify(opts: DifyChatOptions): Promise<string> {
  const key = readKey()
  if (!key) throw new Error('DIFY_API_KEY_MISSING')

  const stream = opts.stream !== false
  const url = resolveEndpoint()
  const user = opts.user ?? readUser()

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      inputs: opts.inputs ?? {},
      query: opts.query,
      response_mode: stream ? 'streaming' : 'blocking',
      conversation_id: opts.conversationId ?? '',
      user,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`DIFY_HTTP_${res.status}: ${errText.slice(0, 200)}`)
  }

  if (stream && res.body) {
    return readSseStream(
      res.body,
      opts.onToken ?? (() => undefined),
      opts.onConversationId,
      opts.signal,
    )
  }

  const json = (await res.json()) as {
    answer?: string
    conversation_id?: string
  }
  if (json.conversation_id && opts.onConversationId) {
    opts.onConversationId(json.conversation_id)
  }
  const text = json.answer ?? ''
  if (text && opts.onToken) opts.onToken(text)
  return text
}
