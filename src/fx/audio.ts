/**
 * fx/audio.ts — 全站唯一的音效引擎。
 *
 * 设计取自 demo 的五声音阶思路，但补了三件工程上必须有的事：
 *  1. **五声音阶**（宫商角徵羽）—— 随便按都不会出现不协和音，这是"乱敲键盘也好听"的前提；
 *  2. **用户手势解锁** —— 浏览器禁止自动播放，第一次真实交互才创建 AudioContext；
 *  3. **压缩器兜底** —— 连点/连按时多个振荡器叠加会爆音，串一个 DynamicsCompressor 压住。
 *
 * 静音是全局的：所有发声都必须经过这里，否则"静音"一定会漏掉某一处。
 */

/** 宫商角徵羽（半音偏移） */
const PENTATONIC = [0, 2, 4, 7, 9] as const
/** C4 */
const BASE_HZ = 261.63
const semi = (n: number): number => BASE_HZ * Math.pow(2, n / 12)

export interface ToneOptions {
  type?: OscillatorType
  /** 0–1，相对主增益 */
  vol?: number
  /** 滑音目标频率 */
  slideTo?: number
}

export interface FxAudio {
  readonly muted: boolean
  readonly ready: boolean
  /** 必须在用户手势里调用一次；重复调用无害 */
  unlock(): void
  setMuted(value: boolean): void
  toggleMute(): boolean
  tone(freq: number, dur: number, opts?: ToneOptions): void
  /** 五声音阶第 index 级；越界会自动翻八度 */
  note(index: number, opts?: ToneOptions): void
  /** 兼容既有调用：捏脸 / 切换取景节点的短促提示音 */
  blip(pitch?: number): void
  /** 按下小豆包：一个下滑的"啵" */
  pop(): void
  /** 上行琶音：输入框发送、烟花 */
  cheer(): void
}

export function createFxAudio(): FxAudio {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = false

  const ensure = (): AudioContext | null => {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume()
      return ctx
    }
    try {
      const ac = new AudioContext()
      const comp = ac.createDynamicsCompressor()
      comp.threshold.value = -20
      comp.knee.value = 14
      comp.ratio.value = 8
      comp.attack.value = 0.004
      comp.release.value = 0.18
      const gain = ac.createGain()
      gain.gain.value = muted ? 0 : 0.9
      gain.connect(comp)
      comp.connect(ac.destination)
      ctx = ac
      master = gain
      return ac
    } catch {
      ctx = null
      master = null
      return null
    }
  }

  const tone = (freq: number, dur: number, opts: ToneOptions = {}): void => {
    if (muted) return
    const a = ensure()
    if (!a || !master) return
    const t = a.currentTime
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t)
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t + dur)
    const vol = Math.max(0.0001, opts.vol ?? 0.12)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain)
    gain.connect(master)
    osc.start(t)
    osc.stop(t + dur + 0.04)
  }

  return {
    get muted() {
      return muted
    },
    get ready() {
      return ctx !== null && ctx.state === 'running'
    },
    unlock() {
      const a = ensure()
      if (a && a.state === 'suspended') void a.resume()
    },
    setMuted(value: boolean) {
      muted = value
      if (master && ctx) {
        const t = ctx.currentTime
        master.gain.cancelScheduledValues(t)
        master.gain.setTargetAtTime(value ? 0 : 0.9, t, 0.05)
      }
    },
    toggleMute() {
      this.setMuted(!muted)
      if (!muted) this.unlock()
      return muted
    },
    tone,
    note(index, opts) {
      const octave = Math.floor(index / PENTATONIC.length)
      const step = PENTATONIC[((index % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length]
      tone(semi(step + octave * 12), 0.22, { type: 'triangle', vol: 0.1, ...opts })
    },
    blip(pitch = 520) {
      tone(pitch, 0.13, { type: 'sine', vol: 0.05 })
    },
    pop() {
      tone(520, 0.2, { type: 'sine', vol: 0.17, slideTo: 170 })
    },
    cheer() {
      const steps = [0, 4, 7, 12, 16]
      steps.forEach((s, i) => {
        window.setTimeout(() => tone(semi(s), 0.36, { type: 'triangle', vol: 0.11 }), i * 95)
      })
    },
  }
}
