import gsap from 'gsap'
import { motionPrefs } from '../lib/motionPrefs'

/**
 * 5 / 数字带 —— 版式：通栏数据型
 *
 * ⚠️ 致敬页不得编造官方数据。这里的四个数字全部是**对页面自身结构**的描述
 * （一个入口 / 五类任务 / 两种交互 / 零次跳转），并且在下方明确标注"非官方口径"。
 *
 * 数字用 tween 一个代理对象再写 textContent，而不是直接 tween innerText：
 * 后者依赖插件与字符串解析，且在小数取整上不可靠。
 */
export function initNumbers(): () => void {
  const values = document.querySelectorAll<HTMLElement>('[data-count]')
  if (!values.length) return () => undefined

  if (motionPrefs.reduced) {
    values.forEach((el) => {
      el.textContent = el.dataset.count ?? el.textContent
    })
    return () => undefined
  }

  const tweens: gsap.core.Tween[] = []

  values.forEach((el) => {
    const target = Number(el.dataset.count ?? '0')
    if (!Number.isFinite(target)) return
    const proxy = { value: 0 }
    el.textContent = '0'
    tweens.push(
      gsap.to(proxy, {
        value: target,
        duration: 1.25,
        ease: 'power2.out',
        snap: { value: 1 },
        onUpdate: () => {
          el.textContent = String(proxy.value)
        },
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      }),
    )
  })

  return () => {
    for (const tween of tweens) {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }
}
