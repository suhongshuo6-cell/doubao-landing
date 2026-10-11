/**
 * fakeBrain.ts — 本地假智能：意图库 + 多轮记忆 + 产品知识
 * 无 API Key 时默认走这里；回复要像助手，不是傻模板。
 */

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface FakeReply {
  text: string
  followups: string[]
}

type Intent =
  | 'greeting'
  | 'identity'
  | 'write'
  | 'translate'
  | 'summarize'
  | 'name'
  | 'speak'
  | 'plan'
  | 'compare'
  | 'image'
  | 'search'
  | 'weather'
  | 'memory'
  | 'howto'
  | 'thanks'
  | 'followup'
  | 'fallback'

const PRODUCT: Record<string, string> = {
  who: '我是豆包——字节跳动做的 AI 助手。这个页面是非官方致敬演示，对话默认走本地假智能；若你在本地配了方舟 Key，会尝试真模型。',
  can: '我擅长：多轮对话与推理、改写润色、翻译、文件/表格理解示意、图像想法草图、语音查询、联网搜事实（真环境需后端）。同一段对话里就能改语气、砍长度、加条件。',
  scenes: '常见场景：早上看题要思路、午间压周报、晚上订行程比选项。记住上下文，不用每次从零复述。',
  vsSearch: '和普通搜索比：我给结论并标思路，而不是扔一堆链接；改语气不必换工具；上周聊过的项目还能接着说。',
}

const MEMORY_CAP = 12

function detectIntent(text: string, history: ChatTurn[]): Intent {
  const t = text.toLowerCase().trim()
  if (/^(你好|嗨|hi|hello|在吗|早上好|晚上好)/i.test(t)) return 'greeting'
  if (/你是谁|你叫什么|豆包是|官方吗|假的吗|真智能/.test(t)) return 'identity'
  if (/谢谢|感谢|多谢|太棒了/.test(t)) return 'thanks'
  if (/天气|气温|下雨|带伞/.test(t)) return 'weather'
  if (/翻译|translate|英文|日文|中译/.test(t)) return 'translate'
  if (/总结|摘要|三句话|压到|缩短|精简/.test(t)) return 'summarize'
  if (/起名|候选名|叫什么|功能名|标题/.test(t)) return 'name'
  if (/口语|练口语|发音|英语对话/.test(t)) return 'speak'
  if (/计划|行程|待办|四象限|排期|行程/.test(t)) return 'plan'
  if (/比较|对比|取舍|哪个好|方案/.test(t)) return 'compare'
  if (/画|图像|配图|插画|生成图|换背景/.test(t)) return 'image'
  if (/搜|查一下|最新|联网|新闻/.test(t)) return 'search'
  if (/周报|邮件|文案|改写|客气|润色|大纲|写成/.test(t)) return 'write'
  if (/怎么用|能做什么|你会什么|场景/.test(t)) return 'howto'
  if (/还记得|上次|刚才|继续|接着/.test(t)) return 'memory'
  if (/再|换成|加个|导出|继续追问|更短|更长|口语化/.test(t) && history.length > 0) return 'followup'
  return 'fallback'
}

function lastUserTopic(history: ChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]
    if (m?.role === 'user') return m.content.slice(0, 40)
  }
  return ''
}

function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0]!
}

function craft(intent: Intent, text: string, history: ChatTurn[]): FakeReply {
  const topic = lastUserTopic(history)
  const short = text.length > 80 ? `${text.slice(0, 78)}…` : text

  switch (intent) {
    case 'greeting':
      return {
        text: pick([
          '在。今天想写点什么、查点什么，还是随便聊聊？',
          '嗯，我在。先丢半句也行，剩下的我接着猜。',
          '你好呀。周报、翻译、起名、练口语——随便开口。',
        ]),
        followups: ['帮我写周报', '你会什么', '陪我练口语'],
      }
    case 'identity':
      return {
        text: `${PRODUCT.who}\n\n${PRODUCT.can}`,
        followups: ['常见场景有哪些', '和搜索有什么不同', '帮我改段文案'],
      }
    case 'howto':
      return {
        text: `${PRODUCT.can}\n\n${PRODUCT.scenes}`,
        followups: ['写一版周报大纲', '比较两个方案', '查杭州天气'],
      }
    case 'write': {
      const body =
        /周报/.test(text)
          ? '先给你一版压到结论的周报骨架：\n1) 本周结果：环比 +12%（口径：付费+续费）\n2) 两件关键事：自助排查上线；话术改版\n3) 风险：供应链可能拖双十一备货\n4) 下周：提前锁仓 + 补投放预案\n\n要我再压到 200 字，或换成老板口吻吗？'
          : /客气|润色|改写/.test(text)
            ? `可以。我按「更客气、仍清楚」改一版示意：\n「麻烦您方便时看一下这版方案；有不妥之处请直接告诉我，我再改。」\n\n你原文里若有硬约束（截止日/数字），发我，我嵌进去。`
            : `收到：「${short}」。\n我先给结构：目标 → 三点展开 → 风险/下一步。你回「再短一点 / 换成口语 / 加个例子」，我原地改，不用重开话题。`
      return { text: body, followups: ['再短一点', '换成口语', '加个例子'] }
    }
    case 'translate':
      return {
        text: /英文|english/i.test(text)
          ? `示意英译（可再调正式度）：\n"Could you take a quick look when you have a moment? Happy to revise based on your notes."\n\n若有专有名词表，发我，我按表统一。`
          : `可以翻。把原文贴过来，并告诉我目标语种和语气（口语 / 商务 / 学术）。`,
        followups: ['更正式一点', '更口语', '保留术语不变'],
      }
    case 'summarize':
      return {
        text: `好，按「三句话结论」示意：\n1) 核心进展已经落地；\n2) 主要风险在供应与转化；\n3) 下周动作是锁仓与补投。\n\n把原文丢进来，我按你的字数硬砍，并标出我删掉的部分。`,
        followups: ['压到 200 字', '保留风险', '做成大纲'],
      }
    case 'name':
      return {
        text: `给你 8 个候选（偏产品向）：闪记、轻航、并线、回声台、速览、脉语、澄镜、顺口。\n喜欢「短 / 科技 / 温暖」哪条气质？我再筛一轮。`,
        followups: ['偏温暖', '偏极简', '再来 8 个'],
      }
    case 'speak':
      return {
        text: `口语开场（你先说，我纠）：\n"Hey, I've been meaning to ask — how did that project go last week?"\n\n你回一句英文，我标重音和更自然的替代表达。`,
        followups: ['换商务场景', '再慢一点', '给我评分'],
      }
    case 'plan':
      return {
        text: `先按紧急/重要四象限排一版示意：\n· 紧急且重要：周四杭州往返票；下午会材料\n· 重要不紧急：周报口径统一；双十一锁仓\n· 紧急不重要：群里表情包投票（可延后）\n· 都不：无脑刷资讯\n\n把你的待办列表贴过来，我重排。`,
        followups: ['只要今天的', '标耗时', '做成清单'],
      }
    case 'compare':
      return {
        text: `对比框架（你可套两个方案）：\n· 成本：一次性 vs 长期\n· 风险：失败是否可逆\n· 速度：多久能验证\n· 体验：用户多走几步？\n\n把 A/B 要点丢我，我填表并给倾向（带理由，不当黑箱）。`,
        followups: ['更看重速度', '更看重风险', '写成一页纸'],
      }
    case 'image':
      return {
        text: `图像这边在本页是沙盒示意：换背景 / 涂抹重组 / 扩画幅。真生成需要接创作接口。\n你可以用一句话描述构图，我先写成可投模型的提示词。`,
        followups: ['写一条提示词', '改成扁平插画风', '去能力区试试'],
      }
    case 'search':
    case 'weather':
      return {
        text: intent === 'weather'
          ? `（示意联网）杭州今天多云，约 18–24℃，空气不错；傍晚可能有短时小雨，记得带伞。\n真天气以系统/气象源为准——这是落地页演示回复。`
          : `我可以按「结论 + 来源卡」的方式答。当前是本地假智能，不会真的出网；配上方舟 Key 且代理可用时，才会走真模型。\n你要查的关键词是？`,
        followups: ['换个城市', '只要结论', '标来源格式'],
      }
    case 'memory': {
      const recall = topic || '刚才那件事'
      return {
        text: topic
          ? `记得。我们刚聊到「${recall}」。要接着改，还是换个角度？`
          : `这轮还没存下具体话题。你先丢一句，我之后就能「接着说」。`,
        followups: ['继续', '换个语气', '重新开始'],
      }
    }
    case 'followup': {
      const base = topic ? `基于「${topic}」` : '基于上一句'
      if (/短|压|精简/.test(text)) {
        return {
          text: `${base}，更短一版：结论先行，细节收成两条。需要我再砍到一句话也可以。`,
          followups: ['一句话版', '保留数字', '加行动项'],
        }
      }
      if (/口语|客气|正式|老板/.test(text)) {
        return {
          text: `${base}，语气已调。读起来应更顺口，数字和风险点都还在。要不要再偏「汇报向」？`,
          followups: ['再客气点', '更直接', '导出清单'],
        }
      }
      return {
        text: `${base}，收到「${short}」。我按这个方向改好了示意稿；不满意就继续扔约束，我原地迭代。`,
        followups: ['再细一点', '加个例子', '换成英文'],
      }
    }
    case 'thanks':
      return {
        text: pick(['不客气。还有要改的直接说。', '嗯，随时叫我。', '好。需要我做成可复制清单再说一声。']),
        followups: ['再来一个', '清一下话题', '你会什么'],
      }
    default:
      return {
        text: pick([
          `我听到了：「${short}」。\n可以按写作 / 翻译 / 计划 / 对比来拆。你更想先要哪一种结果？`,
          `这段我记下了。要不我先给个三点提纲，你再挑要展开的部分？`,
          `可以。先确认目标：要成稿、要清单，还是只要思路？说一个就行。`,
        ]),
        followups: ['给我提纲', '直接成稿', '你是谁'],
      }
  }
}

/** 会话记忆（模块级，页面生命周期内保留） */
const history: ChatTurn[] = []

export function resetFakeMemory(): void {
  history.length = 0
}

export function getFakeHistory(): readonly ChatTurn[] {
  return history
}

export function rememberTurn(user: string, assistant: string): void {
  history.push({ role: 'user', content: user })
  history.push({ role: 'assistant', content: assistant })
  while (history.length > MEMORY_CAP) history.shift()
}

export function replyFake(userText: string): FakeReply {
  const trimmed = userText.trim() || '你好'
  const intent = detectIntent(trimmed, history)
  const out = craft(intent, trimmed, history)
  history.push({ role: 'user', content: trimmed })
  history.push({ role: 'assistant', content: out.text })
  while (history.length > MEMORY_CAP) history.shift()
  return out
}
