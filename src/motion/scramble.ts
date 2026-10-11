/**
 * motion/scramble.ts — 已停用乱码 scramble（中文标题会被拆坏）。
 * 保留空实现，避免 main 引用报错。
 */
export function initScrambleReveal(): () => void {
  // 清理历史残留：若仍有 data-scramble，直接恢复明文
  document.querySelectorAll<HTMLElement>("[data-scramble]").forEach((el) => {
    const finalText = el.dataset.scrambleText || el.textContent || ""
    el.textContent = finalText
    el.classList.remove("is-scrambling")
  })
  return () => undefined
}
