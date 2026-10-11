/**
 * experience/experienceState.ts — 体验状态与命令剧本
 */
export type ExpState =
  | 'idle'
  | 'listening'
  | 'command-submitted'
  | 'thinking'
  | 'reply-revealing'
  | 'result-ready'
  | 'mode-unlocked'
  | 'scene-completed'
  | 'replay'

export type CommandId = 'report' | 'vision' | 'plan' | 'idea'

export interface CommandStep {
  label: string
  /** 舞台构图：影响布局 class */
  frame: string
  /** 角色低语 */
  whisper?: string
  /** HUD 文案 */
  hud?: string
  /** 面板 HTML 片段 */
  panel: string
  duration: number
}

export interface CommandScript {
  id: CommandId
  seed: string
  label: string
  unlockMode: 'dialog' | 'write' | 'file' | 'image' | 'voice'
  steps: CommandStep[]
}

export const COMMAND_SCRIPTS: readonly CommandScript[] = [
  {
    id: 'report',
    seed: '帮我把这周的周报写了',
    label: '写周报',
    unlockMode: 'write',
    steps: [
      {
        label: '听见关键词',
        frame: 'frame-listen',
        whisper: '周报，对吧。',
        hud: '捕捉 · 周报',
        panel: '<div class="cmd-chip is-hot">周报</div><div class="cmd-chip">本周</div><div class="cmd-chip">结论</div>',
        duration: 420,
      },
      {
        label: '拉出大纲骨架',
        frame: 'frame-outline',
        whisper: '先压成三条结论。',
        hud: '骨架 · 大纲',
        panel: '<ol class="cmd-outline"><li>进展</li><li>风险</li><li>下周</li></ol>',
        duration: 520,
      },
      {
        label: '填充事实点',
        frame: 'frame-facts',
        whisper: '把数字钉进去。',
        hud: '填充 · 事实',
        panel: '<ul class="cmd-facts"><li>自助排查上线</li><li>客诉 -12%</li><li>双十一仓位</li></ul>',
        duration: 560,
      },
      {
        label: '改语气 / 砍长度',
        frame: 'frame-edit',
        whisper: '语气再客观一点。',
        hud: '改写 · 语气',
        panel: '<div class="cmd-draft">本周完成自助排查上线，客诉环比下降 12%。下周重点锁仓。</div>',
        duration: 640,
      },
      {
        label: '成稿可带走',
        frame: 'frame-done',
        whisper: '可以发出去了。',
        hud: '完成 · 周报',
        panel: '<div class="cmd-result"><b>周报 · 286 字</b><p>进展 / 风险 / 下周 · 已就绪</p><button type="button" class="cmd-copy" data-cmd-copy>复制成稿</button></div>',
        duration: 480,
      },
    ],
  },
  {
    id: 'vision',
    seed: '看看这张图里有什么',
    label: '看图',
    unlockMode: 'image',
    steps: [
      {
        label: '接住图片',
        frame: 'frame-drop',
        whisper: '图来了。',
        hud: '接收 · 图像',
        panel: '<div class="cmd-shot cmd-shot--in"></div>',
        duration: 400,
      },
      {
        label: '扫区域',
        frame: 'frame-scan',
        whisper: '先看主体。',
        hud: '扫描 · 区域',
        panel: '<div class="cmd-shot"><i class="cmd-scan"></i></div>',
        duration: 520,
      },
      {
        label: '标出物件',
        frame: 'frame-tags',
        whisper: '杯子、窗光、桌面。',
        hud: '标注 · 物件',
        panel: '<div class="cmd-shot"><span class="cmd-tag" style="--x:22%;--y:38%">杯子</span><span class="cmd-tag" style="--x:62%;--y:28%">窗光</span><span class="cmd-tag" style="--x:48%;--y:70%">桌面</span></div>',
        duration: 560,
      },
      {
        label: '前后对比',
        frame: 'frame-ba',
        whisper: '要不要换背景？',
        hud: '编辑 · 对比',
        panel: '<div class="cmd-ba"><div class="cmd-ba__before"></div><div class="cmd-ba__after" style="width:55%"></div><i class="cmd-ba__handle" style="left:55%"></i></div>',
        duration: 620,
      },
      {
        label: '结果卡',
        frame: 'frame-done',
        whisper: '图里的故事讲完了。',
        hud: '完成 · 看图',
        panel: '<div class="cmd-result"><b>看图结论</b><p>暖色室内静物 · 主光来自左侧窗</p><button type="button" class="cmd-copy" data-cmd-copy>带走描述</button></div>',
        duration: 480,
      },
    ],
  },
  {
    id: 'plan',
    seed: '帮我安排一下今天',
    label: '安排今天',
    unlockMode: 'dialog',
    steps: [
      {
        label: '收集碎片',
        frame: 'frame-chips',
        whisper: '今天有几块？',
        hud: '收集 · 碎片',
        panel: '<div class="cmd-chip">开会</div><div class="cmd-chip">深度活</div><div class="cmd-chip">运动</div><div class="cmd-chip is-hot">晚饭</div>',
        duration: 420,
      },
      {
        label: '时间轴铺开',
        frame: 'frame-timeline',
        whisper: '先排硬约束。',
        hud: '铺开 · 时间轴',
        panel: '<div class="cmd-tl"><i style="--t:0.1"></i><i style="--t:0.35"></i><i style="--t:0.62"></i><i style="--t:0.85"></i></div>',
        duration: 520,
      },
      {
        label: '冲突提示',
        frame: 'frame-conflict',
        whisper: '下午和深度活撞车了。',
        hud: '冲突 · 提示',
        panel: '<div class="cmd-warn">14:00 会议 ↔ 深度写作 · 建议后移写作</div>',
        duration: 560,
      },
      {
        label: '重组日程',
        frame: 'frame-reorder',
        whisper: '换个顺序。',
        hud: '重组 · 日程',
        panel: '<ol class="cmd-outline"><li>09:30 深度</li><li>14:00 会议</li><li>18:30 运动</li><li>20:00 晚饭</li></ol>',
        duration: 600,
      },
      {
        label: '今日清单',
        frame: 'frame-done',
        whisper: '今天就这样。',
        hud: '完成 · 今日',
        panel: '<div class="cmd-result"><b>今日清单</b><p>4 件事 · 已避开冲突</p><button type="button" class="cmd-copy" data-cmd-copy>复制清单</button></div>',
        duration: 480,
      },
    ],
  },
  {
    id: 'idea',
    seed: '给我一个创意点子',
    label: '来个创意',
    unlockMode: 'voice',
    steps: [
      {
        label: '火花迸出',
        frame: 'frame-spark',
        whisper: '来点火花。',
        hud: '火花 · 迸出',
        panel: '<div class="cmd-sparks"><i></i><i></i><i></i><i></i><i></i></div>',
        duration: 400,
      },
      {
        label: '候选发散',
        frame: 'frame-fan',
        whisper: '先发散，再收敛。',
        hud: '发散 · 候选',
        panel: '<div class="cmd-fan"><span>语音日记</span><span>口袋灵感</span><span>一句话海报</span></div>',
        duration: 520,
      },
      {
        label: '收敛一条',
        frame: 'frame-pick',
        whisper: '就这条。',
        hud: '收敛 · 选定',
        panel: '<div class="cmd-pick is-hot">「口袋灵感」— 走路时按住说话，回家自动成卡片</div>',
        duration: 560,
      },
      {
        label: '落地草图',
        frame: 'frame-sketch',
        whisper: '画成可做的一步。',
        hud: '草图 · 落地',
        panel: '<div class="cmd-sketch">按住 → 波形 → 卡片墙 → 今晚复盘</div>',
        duration: 600,
      },
      {
        label: '创意卡',
        frame: 'frame-done',
        whisper: '带走吧。',
        hud: '完成 · 创意',
        panel: '<div class="cmd-result"><b>创意卡</b><p>口袋灵感 · 语音→卡片</p><button type="button" class="cmd-copy" data-cmd-copy>带走点子</button></div>',
        duration: 480,
      },
    ],
  },
] as const

export function matchCommand(text: string): CommandScript | null {
  const t = text.trim()
  for (const s of COMMAND_SCRIPTS) {
    if (t.includes(s.seed.slice(0, 4)) || t === s.seed || t.includes(s.label)) return s
  }
  if (/周报|报告/.test(t)) return COMMAND_SCRIPTS[0]!
  if (/看图|这张图|图片/.test(t)) return COMMAND_SCRIPTS[1]!
  if (/安排|今天|日程|待办/.test(t)) return COMMAND_SCRIPTS[2]!
  if (/创意|点子|灵感/.test(t)) return COMMAND_SCRIPTS[3]!
  return null
}

export interface ExpSnapshot {
  state: ExpState
  command: CommandId | null
  step: number
  unlocked: Set<string>
  scenesDone: number
}

export function createSnapshot(): ExpSnapshot {
  return {
    state: 'idle',
    command: null,
    step: -1,
    unlocked: new Set(),
    scenesDone: 0,
  }
}
