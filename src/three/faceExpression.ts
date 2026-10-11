import * as THREE from 'three'
import { motionPrefs } from '../lib/motionPrefs'
import type { PlateUniforms } from './plateShader'
import { FACE_EXPR, FACE_IMG_H, FACE_IMG_W, quadFrom, type EyeSpec } from './faceExprConfig'

/**
 * faceExpression.ts — 首屏豆包脸部特写的表情控制器。
 *
 * 只产出数值（眼睑闭合、视线、张嘴、腮红、呼吸），真正的像素活儿在 plateShader 里：
 * 所有表情都是"在原图里换个位置采样"，所以永远是原分辨率原像素，没有贴片。
 *
 * 调试：?expr=blink | blink-half | look-left | look-right | talk | happy | off
 */

type Forced = 'blink' | 'blink-half' | 'look-left' | 'look-right' | 'talk' | 'happy' | 'off' | null

const rand = (a: number, b: number): number => a + Math.random() * (b - a)
const expApproach = (cur: number, target: number, rate: number, dt: number): number =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt))

/** 单次眨眼的闭合曲线：快闭（70ms）、短停（35ms）、慢睁（150ms） */
function blinkCurve(t: number): number {
  if (t < 0) return 0
  if (t < 0.07) { const k = t / 0.07; return k * k }
  if (t < 0.105) return 1
  if (t < 0.255) { const k = (t - 0.105) / 0.15; return 1 - k * k * (3 - 2 * k) }
  return 0
}

function eyeRange(e: EyeSpec, lowerSkin: number): THREE.Vector4 {
  return new THREE.Vector4(e.top[0][0] * FACE_IMG_W, e.top[2][0] * FACE_IMG_W, e.lidSkinPx, lowerSkin)
}

export class FaceExpression {
  private readonly forced: Forced
  private time = 0
  private nextBlink = rand(1.2, 3)
  private blinkT = -1
  private blinkQueue: number[] = []
  private inDouble = false
  private gaze = new THREE.Vector2()
  private gazeTarget = new THREE.Vector2()
  private idleTarget = new THREE.Vector2()
  private nextIdle = 0
  private lastPointerAt = -100
  private pointer = new THREE.Vector2()
  private orient: THREE.Vector2 | null = null
  private speaking = false
  private mouth = 0
  private happy = 0
  private happyHold = 0
  private readonly cleanups: Array<() => void> = []

  constructor() {
    const q = new URLSearchParams(window.location.search).get('expr')
    this.forced = (q as Forced) ?? null

    const onSpeak = (e: Event): void => {
      this.speaking = Boolean((e as CustomEvent<{ speaking?: boolean }>).detail?.speaking)
    }
    const onDone = (): void => this.triggerHappy()
    document.addEventListener('doubao:speaking', onSpeak)
    document.addEventListener('doubao:reply-done', onDone)
    this.cleanups.push(() => {
      document.removeEventListener('doubao:speaking', onSpeak)
      document.removeEventListener('doubao:reply-done', onDone)
    })

    const onOrient = (e: DeviceOrientationEvent): void => {
      if (e.gamma == null || e.beta == null) return
      // 手机竖握时 beta≈45° 为中位；左右倾 ±25° 打满
      this.orient = new THREE.Vector2(
        THREE.MathUtils.clamp(e.gamma / 25, -1, 1),
        THREE.MathUtils.clamp(-(e.beta - 45) / 25, -1, 1),
      )
    }
    if (motionPrefs.coarse) {
      window.addEventListener('deviceorientation', onOrient)
      this.cleanups.push(() => window.removeEventListener('deviceorientation', onOrient))
    }
  }

  /** 静态几何 → uniforms（只需一次） */
  bind(u: PlateUniforms): void {
    const set = (v: THREE.Vector3, q: [number, number, number]): void => { v.set(q[0], q[1], q[2]) }
    set(u.uEyeLTop.value, quadFrom(FACE_EXPR.eyeL.top))
    set(u.uEyeLBot.value, quadFrom(FACE_EXPR.eyeL.bot))
    set(u.uEyeRTop.value, quadFrom(FACE_EXPR.eyeR.top))
    set(u.uEyeRBot.value, quadFrom(FACE_EXPR.eyeR.bot))
    u.uEyeLRange.value.copy(eyeRange(FACE_EXPR.eyeL, 20))
    u.uEyeRRange.value.copy(eyeRange(FACE_EXPR.eyeR, 18))
    set(u.uMouthQ.value, quadFrom(FACE_EXPR.mouth))
    u.uMouthRange.value.set(FACE_EXPR.mouth[0][0] * FACE_IMG_W, FACE_EXPR.mouth[2][0] * FACE_IMG_W)
    const ck = (v: THREE.Vector4, c: { c: readonly [number, number]; r: readonly [number, number] }): void => {
      v.set(c.c[0] * FACE_IMG_W, c.c[1] * FACE_IMG_H, c.r[0], c.r[1])
    }
    ck(u.uCheekL.value, FACE_EXPR.cheekL)
    ck(u.uCheekR.value, FACE_EXPR.cheekR)
    const rgb = (v: THREE.Vector3, c: readonly [number, number, number]): void => { v.set(c[0] / 255, c[1] / 255, c[2] / 255) }
    rgb(u.uLidL0.value, FACE_EXPR.eyeL.lidRgb[0])
    rgb(u.uLidL1.value, FACE_EXPR.eyeL.lidRgb[1])
    rgb(u.uLidR0.value, FACE_EXPR.eyeR.lidRgb[0])
    rgb(u.uLidR1.value, FACE_EXPR.eyeR.lidRgb[1])
    u.uExpr.value = this.forced === 'off' ? 0 : 1
  }

  setPointer(ndc: THREE.Vector2): void {
    if (ndc.distanceToSquared(this.pointer) > 1e-6) this.lastPointerAt = this.time
    this.pointer.copy(ndc)
  }

  triggerHappy(): void {
    this.happyHold = motionPrefs.reduced ? 1.0 : 1.6
  }

  /** 呼吸：返回板的缩放系数（1 附近），reduced 时恒为 1 */
  get breath(): number {
    if (motionPrefs.reduced || this.forced) return 1
    return 1 + 0.0035 * (0.5 - 0.5 * Math.cos((this.time / 4.6) * Math.PI * 2))
  }

  get breathY(): number {
    if (motionPrefs.reduced || this.forced) return 0
    return -0.0012 * (0.5 - 0.5 * Math.cos((this.time / 4.6) * Math.PI * 2))
  }

  update(dt: number, u: PlateUniforms): void {
    dt = Math.min(dt, 0.1)
    this.time += dt
    const f = this.forced
    const reduced = motionPrefs.reduced

    // ---------------- 眨眼 ----------------
    let close = 0
    if (f === 'blink') close = 1
    else if (f === 'blink-half') close = 0.55
    else if (!f) {
      if (this.blinkT < 0 && this.time >= this.nextBlink) {
        this.blinkT = 0
        // 15% 的概率连眨两下（第二下不再递归触发）
        if (!this.inDouble && Math.random() < 0.15) { this.blinkQueue = [0.34]; this.inDouble = true }
        else { this.blinkQueue = []; this.inDouble = false }
      }
      if (this.blinkT >= 0) {
        this.blinkT += dt
        close = blinkCurve(this.blinkT)
        if (this.blinkT > 0.26) {
          const gap = this.blinkQueue.shift()
          this.blinkT = -1
          this.nextBlink = this.time + (gap !== undefined ? gap - 0.26 : rand(2.5, 6))
        }
      }
    }

    // ---------------- 视线 ----------------
    const [gx, gy] = FACE_EXPR.gazePx
    if (f === 'look-left') this.gazeTarget.set(-1, 0.15)
    else if (f === 'look-right') this.gazeTarget.set(1, 0.15)
    else if (f) this.gazeTarget.set(0, 0)
    else {
      const idle = this.time - this.lastPointerAt > 2.5
      if (this.orient) this.gazeTarget.copy(this.orient)
      else if (idle) {
        if (this.time >= this.nextIdle) {
          this.idleTarget.set(rand(-0.6, 0.6), rand(-0.35, 0.35))
          if (Math.random() < 0.35) this.idleTarget.set(0, 0)
          this.nextIdle = this.time + rand(1.4, 3.6)
        }
        this.gazeTarget.copy(reduced ? new THREE.Vector2() : this.idleTarget)
      } else {
        this.gazeTarget.set(
          THREE.MathUtils.clamp(this.pointer.x * 1.3, -1, 1),
          THREE.MathUtils.clamp(this.pointer.y * 1.3, -1, 1),
        )
      }
    }
    // 眼球是"跳视"：快速到位，不拖泥带水
    const gRate = f ? 1000 : reduced ? 6 : 18
    this.gaze.x = expApproach(this.gaze.x, this.gazeTarget.x, gRate, dt)
    this.gaze.y = expApproach(this.gaze.y, this.gazeTarget.y, gRate, dt)
    // 图片 y 向下：指针在上 → 虹膜往上（-y）
    u.uGaze.value.set(this.gaze.x * gx, -this.gaze.y * gy)

    // ---------------- 说话 ----------------
    let mouthTarget = 0
    if (f === 'talk') mouthTarget = 0.85
    else if (this.speaking && !f) {
      const t = this.time
      // 几条不相干的正弦叠出"音节"节奏，偶尔合上
      const syl = Math.abs(Math.sin(t * 9.1) * 0.6 + Math.sin(t * 5.3 + 1.7) * 0.4)
      const gate = Math.sin(t * 1.9) > -0.6 ? 1 : 0.15
      mouthTarget = (0.25 + 0.75 * syl) * gate * (reduced ? 0.4 : 1)
    }
    this.mouth = f ? mouthTarget : expApproach(this.mouth, mouthTarget, 22, dt)
    u.uMouthOpen.value = this.mouth * FACE_EXPR.mouthOpenPx

    // ---------------- 开心 ----------------
    let happyTarget = 0
    if (f === 'happy') happyTarget = 1
    else if (this.happyHold > 0) { this.happyHold -= dt; happyTarget = 1 }
    this.happy = f ? happyTarget : expApproach(this.happy, happyTarget, happyTarget > this.happy ? 9 : 2.2, dt)
    const h = this.happy
    // 开心时眼睛笑眯：上睑落下 ~35%，下睑上推 ~5px；眨眼叠加在其上
    const squint = h * 0.16
    const lids = Math.max(close, squint + close * (1 - squint))
    u.uLids.value.set(lids, Math.min(1, lids * 1.0), h * 8, 0)
    u.uBlush.value = h
  }

  dispose(): void {
    for (const c of this.cleanups) c()
  }
}
