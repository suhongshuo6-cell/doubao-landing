/**
 * sections/universe.ts — 能力宇宙关卡墙 + 证言翻转卡
 */
import gsap from 'gsap'
import { ScrollTrigger } from '../motion/lenisSetup'
import { motionPrefs } from '../lib/motionPrefs'
import { bindTiltPress } from '../lib/tiltPress'

const LEVELS = [
  { id: 'L1', title: '开口就聊', desc: '不用选模型、不用切工具', tag: '对话' },
  { id: 'L2', title: '记住上下文', desc: '上周聊过的项目还能接', tag: '记忆' },
  { id: 'L3', title: '读图读表', desc: '文件丢进来，她先读再答', tag: '多模态' },
  { id: 'L4', title: '改到满意', desc: '语气、长度、风格同一段对话', tag: '创作' },
  { id: 'L5', title: '开口查询', desc: '按住说话，双手腾出来', tag: '语音' },
  { id: 'L6', title: '需要时联网', desc: '给结论，并标思路', tag: '搜索' },
  { id: 'L7', title: '安全陪伴', desc: '敏感话题收着说，碎碎念也接', tag: '陪伴' },
  { id: 'L8', title: '一句话模板', desc: '点一下灌进对话框', tag: '效率' },
]

export function initUniverse(): () => void {
  const destroyers: Array<() => void> = []
  const wall = document.getElementById('universeWall')
  if (wall && wall.childElementCount === 0) {
    LEVELS.forEach((lv, i) => {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'universe-card'
      card.dataset.level = lv.id
      card.innerHTML = `<span class="universe-card__id">${lv.id}</span><b>${lv.title}</b><p>${lv.desc}</p><em>${lv.tag}</em>`
      wall.appendChild(card)
      const onClick = (): void => {
        card.classList.toggle('is-cleared')
        card.classList.add('is-pop')
        window.setTimeout(() => card.classList.remove('is-pop'), 420)
        const fill = (window as unknown as { __askbarFill?: (t: string) => void }).__askbarFill
        fill?.(`演示：${lv.title} —— ${lv.desc}`)
      }
      card.addEventListener('click', onClick)
      destroyers.push(() => card.removeEventListener('click', onClick))
      if (!motionPrefs.reduced) {
        gsap.set(card, { opacity: 0, y: 40, rotateX: -20 })
        const st = ScrollTrigger.create({
          trigger: card,
          start: 'top 90%',
          once: true,
          onEnter: () => {
            gsap.to(card, {
              opacity: 1,
              y: 0,
              rotateX: 0,
              duration: 0.55,
              delay: i * 0.05,
              ease: 'back.out(1.5)',
            })
          },
        })
        destroyers.push(() => st.kill())
      }
    })
  }

  // 证言翻转
  document.querySelectorAll<HTMLElement>('.review-card--flip').forEach((card) => {
    const onClick = (): void => {
      card.classList.toggle('is-flipped')
    }
    card.addEventListener('click', onClick)
    destroyers.push(() => card.removeEventListener('click', onClick))
  })

  destroyers.push(bindTiltPress('.universe-card, .review-card--flip'))
  return () => {
    for (const d of destroyers.reverse()) d()
  }
}
