/**
 * experience/events.ts — 体验总线事件名
 */
export const EXP = {
  COMMAND_SUBMIT: 'doubao:command-submit',
  COMMAND_STEP: 'doubao:command-step',
  STATE_CHANGE: 'doubao:exp-state',
  MODE_UNLOCK: 'doubao:mode-unlock',
  SCENE_COMPLETE: 'doubao:scene-complete',
  REPLAY: 'doubao:replay',
  CHAPTER: 'doubao:chapter',
  HUD: 'doubao:hud',
  POINTER: 'doubao:pointer-mood',
} as const

export type ExpEvent = (typeof EXP)[keyof typeof EXP]

export function emit<T = unknown>(name: string, detail?: T): void {
  document.dispatchEvent(new CustomEvent(name, { detail }))
}

export function on<T = unknown>(name: string, fn: (detail: T) => void): () => void {
  const handler = (e: Event): void => fn((e as CustomEvent<T>).detail)
  document.addEventListener(name, handler)
  return () => document.removeEventListener(name, handler)
}
