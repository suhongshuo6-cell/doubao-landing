import * as THREE from 'three'
import { motionPrefs } from '../lib/motionPrefs'
import type { PlateUniforms } from './plateShader'
import { FACE_EXPR, FACE_IMG_H, FACE_IMG_W, quadFrom, type EyeSpec } from './faceExprConfig'

/**
 * faceExpression.ts — 首屏豆包脸部特写的表情控制器。
 *
 * 产出：眼睑 / 视线 / 张嘴 / 腮红 / 呼吸+轻晃。像素全在 plateShader 里做采样重映射。
 *
 * 调试：?expr=blink | blink-half | look-left | look-right | talk | happy | listen | think | off
 */

type Forced =
  | 'blink' | 'blink-half' | 'look-left' | 'look-right'
  | 'talk' | 'happy' | 'listen' | 'think' | 'off' | null

type BlinkKind = 'normal' | 'slow' | 'soft'

const rand = (a: number, b: number): number => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
const expApproach = (cur: number, target: number, rate: number, dt: number): number =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt))

/** 单次眨眼闭合曲线。slow ≈ 1.7× 时长；soft 不完全合上。 */
function blinkCurve(t: number, kind: BlinkKind): number {
  const scale = kind === 'slow' ? 1.7 : 1
  const hold = kind === 'slow' ? 0.05 : 0.035
  const closeT = 0.07 * scale
  const openT = 0.16 * scale
  const peak = kind === 'soft' ? 0.78 : 1
  if (t < 0) return 0
  if (t < closeT) { const k = t / closeT; return peak * k * k }
  if (t < closeT + hold) return peak
  if (t < closeT + hold + openT) {
    const k = (t - closeT - hold) / openT
    return peak * (1 - k * k * (3 - 2 * k))
  }
  return 0
}

function blinkDuration(kind: BlinkKind): number {
  const scale = kind === 'slow' ? 1.7 : 1
  return 0.07 * scale + (kind === 'slow' ? 0.05 : 0.035) + 0.16 * scale + 0.02
}

function eyeRange(e: EyeSpec, lowerSkin: number): THREE.Vector4 {
  return new THREE.Vector4(e.top[0][0] * FACE_IMG_W, e.top[2][0] * FACE_IMG_W, e.lidSkinPx, lowerSkin)
}

export class FaceExpression {
  private readonly forced: Forced
  private time = 0
  private nextBlink = rand(1.0, 2.4)
  private blinkT = -1
  private blinkKind: BlinkKind = 'normal'
  private blinkQueue: Array<{ gap: number; kind: BlinkKind }> = []
  private inDouble = false
  /** 左右眼闭合系数：右眼略滞后，做出不对称 */
  private closeL = 0
  private closeR = 0
  private gaze = new THREE.Vector2()
  private gazeTarget = new THREE.Vector2()
  private gazeSmooth = new THREE.Vector2()
  private idleTarget = new THREE.Vector2()
  private nextIdle = 0
  private nextSaccade = rand(0.4, 1.2)
  private saccade = new THREE.Vector2()
  private lastPointerAt = -100
  private pointer = new THREE.Vector2()
  private pointerVel = new THREE.Vector2()
  private orient: THREE.Vector2 | null = null
  private speaking = false
  private thinking = false
  private streamPulse = 0
  private mouth = 0
  private happy = 0
  private happyHold = 0
  private listen = 0
  private think = 0
  private breathPhase = rand(0, Math.PI * 2)
  private swayPhase = rand(0, Math.PI * 2)
  private readonly cleanups: Array<() => void> = []

  constructor() {
    const q = new URLSearchParams(window.location.search).get('expr')
    this.forced = (q as Forced) ?? null

    const onSpeak = (e: Event): void => {
      const d = (e as CustomEvent<{ speaking?: boolean }>).detail
      this.speaking = Boolean(d?.speaking)
      if (this.speaking) this.thinking = false
    }
    const onThink = (e: Event): void => {
      this.thinking = Boolean((e as CustomEvent<{ thinking?: boolean }>).detail?.thinking)
    }
    const onToken = (): void => { this.streamPulse = 1 }
    const onDone = (): void => this.triggerHappy()
    document.addEventListener('doubao:speaking', onSpeak)
    document.addEventListener('doubao:thinking', onThink)
    document.addEventListener('doubao:token', onToken)
    document.addEventListener('doubao:reply-done', onDone)
    this.cleanups.push(() => {
      document.removeEventListener('doubao:speaking', onSpeak)
      document.removeEventListener('doubao:thinking', onThink)
      document.removeEventListener('doubao:token', onToken)
      document.removeEventListener('doubao:reply-done', onDone)
    })

    const onOrient = (e: DeviceOrientationEvent): void => {
      if (e.gamma == null || e.beta == null) return
      this.orient = new THREE.Vector2(
        clamp(e.gamma / 25, -1, 1),
        clamp(-(e.beta - 45) / 25, -1, 1),
      )
    }
    if (motionPrefs.coarse) {
      window.addEventListener('deviceorientation', onOrient)
      this.cleanups.push(() => window.removeEventListener('deviceorientation', onOrient))
    }
  }

  bind(u: PlateUniforms): void {
    const set = (v: THREE.Vector3, q: [number, number, number]): void => { v.set(q[0], q[1], q[2]) }
    set(u.uEyeLTop.value, quadFrom(FACE_EXPR.eyeL.top))
    set(u.uEyeLBot.value, quadFrom(FACE_EXPR.eyeL.bot))
    set(u.uEyeRTop.value, quadFrom(FACE_EXPR.eyeR.top))
    set(u.uEyeRBot.value, quadFrom(FACE_EXPR.eyeR.bot))
    u.uEyeLRange.value.copy(eyeRange(FACE_EXPR.eyeL, 22))
    u.uEyeRRange.value.copy(eyeRange(FACE_EXPR.eyeR, 20))
    set(u.uMouthQ.value, quadFrom(FACE_EXPR.mouth))
    u.uMouthRange.value.set(FACE_EXPR.mouth[0][0] * FACE_IMG_W, FACE_EXPR.mouth[2][0] * FACE_IMG_W)
    const ck = (v: THREE.Vector4, c: { c: readonly [number, number]; r: readonly [number, number] }): void => {
      v.set(c.c[0] * FACE_IMG_W, c.c[1] * FACE_IMG_H, c.r[0], c.r[1])
    }
    ck(u.uCheekL.value, FACE_EXPR.cheekL)
    ck(u.uCheekR.value, FACE_EXPR.cheekR)
    const rgb = (v: THREE.Vector3, c: readonly [number, number, number]): void => {
      v.set(c[0] / 255, c[1] / 255, c[2] / 255)
    }
    rgb(u.uLidL0.value, FACE_EXPR.eyeL.lidRgb[0])
    rgb(u.uLidL1.value, FACE_EXPR.eyeL.lidRgb[1])
    rgb(u.uLidR0.value, FACE_EXPR.eyeR.lidRgb[0])
    rgb(u.uLidR1.value, FACE_EXPR.eyeR.lidRgb[1])
    u.uExpr.value = this.forced === 'off' ? 0 : 1
  }

  setPointer(ndc: THREE.Vector2): void {
    this.pointerVel.set(ndc.x - this.pointer.x, ndc.y - this.pointer.y)
    if (ndc.distanceToSquared(this.pointer) > 1e-6) this.lastPointerAt = this.time
    this.pointer.copy(ndc)
  }

  triggerHappy(): void {
    this.happyHold = motionPrefs.reduced ? 1.2 : 2.2
  }

  get breath(): number {
    if (motionPrefs.reduced || this.forced) return 1
    return 1 + 0.0055 * (0.5 - 0.5 * Math.cos(this.breathPhase))
  }

  get breathY(): number {
    if (motionPrefs.reduced || this.forced) return 0
    return -0.002 * (0.5 - 0.5 * Math.cos(this.breathPhase))
  }

  /** 轻晃：相对板高的横向偏移系数 */
  get swayX(): number {
    if (motionPrefs.reduced || this.forced) return 0
    return 0.0028 * Math.sin(this.swayPhase) + 0.0012 * Math.sin(this.swayPhase * 0.37 + 1.1)
  }

  update(dt: number, u: PlateUniforms): void {
    dt = Math.min(dt, 0.1)
    this.time += dt
    this.breathPhase += (dt * Math.PI * 2) / 4.8
    this.swayPhase += (dt * Math.PI * 2) / 7.2
    this.streamPulse = Math.max(0, this.streamPulse - dt * 3.2)
    const f = this.forced
    const reduced = motionPrefs.reduced

    // ---------------- 微状态目标 ----------------
    let listenT = 0
    let thinkT = 0
    if (f === 'listen') listenT = 1
    else if (f === 'think') thinkT = 1
    else if (!f) {
      if (this.thinking) thinkT = 1
      else if (this.speaking && this.mouth < 0.18) listenT = 0.85
    }
    this.listen = f ? listenT : expApproach(this.listen, listenT, 6, dt)
    this.think = f ? thinkT : expApproach(this.think, thinkT, 7, dt)

    // ---------------- 眨眼（不对称 + 慢眨/软眨 + 双眨） ----------------
    let closeBase = 0
    if (f === 'blink') closeBase = 1
    else if (f === 'blink-half') closeBase = 0.72
    else if (!f) {
      if (this.blinkT < 0 && this.time >= this.nextBlink) {
        this.blinkT = 0
        // 双眨的第二下：kind 已在上一次结束时写好；首眨才随机选型
        if (!this.inDouble) {
          const r = Math.random()
          this.blinkKind = r < 0.12 ? 'slow' : r < 0.28 ? 'soft' : 'normal'
          if (Math.random() < 0.22) {
            this.blinkQueue = [{ gap: 0.28, kind: 'soft' }]
            this.inDouble = true
          } else {
            this.blinkQueue = []
          }
        } else {
          this.blinkQueue = []
          this.inDouble = false
        }
      }
      if (this.blinkT >= 0) {
        this.blinkT += dt
        closeBase = blinkCurve(this.blinkT, this.blinkKind)
        if (this.blinkT > blinkDuration(this.blinkKind)) {
          const next = this.blinkQueue.shift()
          this.blinkT = -1
          if (next) {
            this.blinkKind = next.kind
            this.nextBlink = this.time + next.gap
          } else {
            this.nextBlink = this.time + rand(2.2, 5.5)
          }
        }
      }
    }
    // 右眼滞后 ~18ms；thinking 时半眯
    const lag = reduced ? 0 : 0.018
    const thinkSquint = this.think * 0.22
    const listenSquint = this.listen * 0.08
    const baseClose = Math.max(closeBase, thinkSquint, listenSquint)
    this.closeL = f ? baseClose : expApproach(this.closeL, baseClose, 55, dt)
    const delayed = this.blinkT >= 0 ? blinkCurve(this.blinkT - lag, this.blinkKind) : baseClose
    const closeRTarget = f ? baseClose : Math.max(delayed, thinkSquint * 0.9, listenSquint)
    this.closeR = f ? baseClose : expApproach(this.closeR, closeRTarget, 55, dt)

    // ---------------- 视线：奶油跟随 + 微跳视 + 闲时漂移 ----------------
    const [gx, gy] = FACE_EXPR.gazePx
    if (f === 'look-left') this.gazeTarget.set(-1, 0.2)
    else if (f === 'look-right') this.gazeTarget.set(1, 0.18)
    else if (f === 'listen') this.gazeTarget.set(0.12, 0.08)
    else if (f === 'think') this.gazeTarget.set(-0.35, 0.45)
    else if (f) this.gazeTarget.set(0, 0)
    else {
      const idle = this.time - this.lastPointerAt > 2.8
      if (this.orient) {
        this.gazeTarget.copy(this.orient)
      } else if (idle) {
        if (this.time >= this.nextIdle) {
          // 偶尔看向用户（回正），偶尔飘到一侧
          if (Math.random() < 0.4) this.idleTarget.set(0, 0)
          else this.idleTarget.set(rand(-0.75, 0.75), rand(-0.4, 0.45))
          this.nextIdle = this.time + rand(1.2, 3.2)
        }
        this.gazeTarget.copy(reduced ? new THREE.Vector2() : this.idleTarget)
      } else {
        // 鼠标：放大映射，边缘也能打满
        this.gazeTarget.set(
          clamp(this.pointer.x * 2.05, -1, 1),
          clamp(this.pointer.y * 1.85, -1, 1),
        )
      }
      // 听/想时视线略抬高、微微避开正中
      if (this.think > 0.1) {
        this.gazeTarget.x = expApproach(this.gazeTarget.x, -0.3, 4, dt)
        this.gazeTarget.y = Math.max(this.gazeTarget.y, 0.35 * this.think)
      } else if (this.listen > 0.1) {
        this.gazeTarget.y = Math.max(this.gazeTarget.y, 0.1 * this.listen)
      }
    }

    // 微跳视：定住时每隔一段时间抖一下小幅位移，再弹回
    if (!f && !reduced && this.time >= this.nextSaccade) {
      this.saccade.set(rand(-0.08, 0.08), rand(-0.05, 0.05))
      this.nextSaccade = this.time + rand(0.55, 1.8)
    }
    this.saccade.x = expApproach(this.saccade.x, 0, 9, dt)
    this.saccade.y = expApproach(this.saccade.y, 0, 9, dt)

    // 两段平滑：快跟目标 + 奶油层，避免"贴鼠标"的机械感
    const track = f ? 1000 : reduced ? 10 : (this.time - this.lastPointerAt < 2.8 ? 28 : 11)
    this.gazeSmooth.x = expApproach(this.gazeSmooth.x, this.gazeTarget.x, track, dt)
    this.gazeSmooth.y = expApproach(this.gazeSmooth.y, this.gazeTarget.y, track, dt)
    const cream = f ? 1000 : 22
    this.gaze.x = expApproach(this.gaze.x, this.gazeSmooth.x + (f ? 0 : this.saccade.x), cream, dt)
    this.gaze.y = expApproach(this.gaze.y, this.gazeSmooth.y + (f ? 0 : this.saccade.y), cream, dt)
    u.uGaze.value.set(this.gaze.x * gx, -this.gaze.y * gy)

    // ---------------- 说话：流式 token 脉冲驱动音节 ----------------
    let mouthTarget = 0
    if (f === 'talk') {
      // 调试态也带一点开合，方便截图看得出"在说话"
      const t = this.time
      mouthTarget = 0.72 + 0.28 * Math.abs(Math.sin(t * 7.5))
    } else if (this.speaking && !f) {
      const t = this.time
      const syl = Math.abs(Math.sin(t * 10.2) * 0.55 + Math.sin(t * 6.1 + 1.3) * 0.45)
      const gate = Math.sin(t * 2.15) > -0.55 ? 1 : 0.12
      const pulse = 0.15 + 0.55 * this.streamPulse
      mouthTarget = clamp((0.28 + 0.72 * syl) * gate + pulse * syl, 0, 1.15) * (reduced ? 0.5 : 1)
    }
    this.mouth = f === 'talk'
      ? expApproach(this.mouth, mouthTarget, 18, dt)
      : expApproach(this.mouth, mouthTarget, 20, dt)
    u.uMouthOpen.value = this.mouth * FACE_EXPR.mouthOpenPx

    // ---------------- 开心 / 听 / 想 → 眼睑 + 腮红 ----------------
    let happyTarget = 0
    if (f === 'happy') happyTarget = 1
    else if (this.happyHold > 0) { this.happyHold -= dt; happyTarget = 1 }
    this.happy = f ? happyTarget : expApproach(this.happy, happyTarget, happyTarget > this.happy ? 10 : 2.0, dt)
    const h = this.happy
    const squint = h * 0.4 + this.listen * 0.08
    const raise = h * 17 + this.listen * 4
    const lidsL = Math.min(1, Math.max(this.closeL, squint + this.closeL * (1 - squint)))
    const lidsR = Math.min(1, Math.max(this.closeR, squint * 0.95 + this.closeR * (1 - squint)))
    u.uLids.value.set(lidsL, lidsR, raise, 0)
    u.uBlush.value = clamp(h * 1.25 + this.listen * 0.18, 0, 1.35)
  }

  dispose(): void {
    for (const c of this.cleanups) c()
  }
}
