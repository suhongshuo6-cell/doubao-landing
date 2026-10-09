/**
 * verify.mjs — 用本机已安装的 Google Chrome（playwright channel: 'chrome'）
 * 对本地预览服务做一次真实的浏览器验收。
 *
 * 为什么不用 playwright 自带的 chromium：下载不可用；而 channel:'chrome' 直接
 * 复用系统 Chrome，一样能拿到 WebGL、控制台错误和真实截图。
 *
 * 用法：node tools/verify.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const outDir = new URL('../.preview-out/', import.meta.url).pathname
await mkdir(outDir, { recursive: true })

const SHOTS = [
  { p: 0.0, name: '01-face', note: '面容' },
  { p: 0.18, name: '02-neck', note: '肩颈与围巾' },
  { p: 0.36, name: '03-arms', note: '手与手臂' },
  { p: 0.54, name: '04-waist', note: '腰线' },
  { p: 0.74, name: '05-legs', note: '腿与足' },
  { p: 0.92, name: '06-body', note: '全身' },
]

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    // 不要强制 --use-angle=swiftshader：实测 headless Chrome 也能走 Metal 真 GPU，
    // 强制软件渲染会得到完全误导性的帧率与自适应降档行为。
    // --enable-unsafe-swiftshader 只作为没有 GPU 时的兜底。
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
  ],
})

const report = []
const consoleErrors = []

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    consoleErrors.push(`[${msg.type()}] ${msg.text()}`)
  }
})
page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`))

// 不带 debug=1：截图里不该出现左下角那面板，报告用图要干净
await page.goto(`${base}/?nointro=1`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__DOUBAO?.state?.().ready === true, { timeout: 15000 })
await page.waitForTimeout(1200)

for (const shot of SHOTS) {
  await page.evaluate((p) => {
    window.__DOUBAO.goTo(p)
  }, shot.p)
  // goTo 走 Lenis 补间（1.2s）+ 相机弹簧（时间常数约 0.18s，约 0.9s 收敛），
  // 所以要等到 ~2.6s 再读值，否则量到的是"还在滑行中"的相机。
  await page.waitForTimeout(3200)
  const state = await page.evaluate(() => window.__DOUBAO.state())
  await page.screenshot({ path: `${outDir}${shot.name}.png` })
  report.push({ ...shot, ...state })
}

// 横向鼠标 → yaw 是否生效（规格 6.6）
await page.mouse.move(1400, 450)
await page.waitForTimeout(900)
const yawRight = await page.evaluate(() => window.__DOUBAO.state())
await page.mouse.move(40, 450)
await page.waitForTimeout(900)
const yawLeft = await page.evaluate(() => window.__DOUBAO.state())
await page.screenshot({ path: `${outDir}07-body-yaw.png` })

/* ---- 捏脸：规格 6.5 的"哇点"，必须逐帧验收 ---------------------------- */
// 回到首屏（只有一张脸的那一屏），把光标放到画面正中按下
await page.evaluate(() => window.__DOUBAO.goTo(0))
await page.waitForTimeout(2600)
const faceBox = await page.evaluate(() => {
  const s = window.__DOUBAO.state()
  return { framing: s.framing, kind: s.kind }
})
await page.mouse.move(720, 430)
await page.waitForTimeout(900)
const hoverState = await page.evaluate(() => {
  const el = window.__DOUBAO.character
  return {
    pinchStrength: el?.pinchStrength ?? null,
    pinchActive: document.documentElement.classList.contains('pinch-active'),
    ringOpacity: getComputedStyle(document.getElementById('pinchRing')).opacity,
    cursor: getComputedStyle(document.body).cursor,
  }
})
await page.screenshot({ path: `${outDir}09-pinch-hover.png` })

await page.mouse.down()
await page.waitForTimeout(260)
const pressState = await page.evaluate(() => {
  const el = window.__DOUBAO.character
  return {
    pinchStrength: el?.pinchStrength ?? null,
    pinchActive: document.documentElement.classList.contains('pinch-active'),
    pressing: document.documentElement.classList.contains('pinch-pressing'),
    cursor: getComputedStyle(document.body).cursor,
  }
})
await page.screenshot({ path: `${outDir}10-pinch-press.png` })
await page.mouse.up()
await page.waitForTimeout(500)

/* ---- 过渡帧：切点是否真的被虚焦藏住了 -------------------------------- */
const transitionShots = []
for (const t of [0.09, 0.27, 0.45, 0.63, 0.83]) {
  await page.evaluate((v) => window.__DOUBAO.goTo(v), t)
  await page.waitForTimeout(2400)
  const st = await page.evaluate(() => window.__DOUBAO.state())
  await page.screenshot({ path: `${outDir}11-transition-${String(t).replace('.', '')}.png` })
  transitionShots.push({ t, framing: st.framing })
}

/* ---- 四大能力卡的微交互演示（规格第七节第 3 条）------------------------- */
// 回到能力段，横向滚一遍，确认四张卡的演示都跑到了终态
await page.evaluate(() => window.__DOUBAO.goTo(0.36))
await page.waitForTimeout(2400)
const demoChecks = []
for (let i = 0; i < 4; i++) {
  // 每张卡各截一张：横向位移由 pin 的 scrub 控制，这里用滚轮推进
  await page.mouse.wheel(0, 620)
  await page.waitForTimeout(1800)
  const state = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null
    const typed = document.querySelector('[data-typewriter]')
    const wave = document.querySelector('[data-wave] i')
    const pixels = document.querySelector('[data-pixels] i')
    return {
      typed: typed?.textContent ?? null,
      typedLen: typed?.textContent?.length ?? 0,
      progress: q('[data-progress-label]'),
      pixels: q('[data-pixels-label]'),
      progressWidth: document.querySelector('[data-progress]')?.style.width ?? null,
      pixelFilter: pixels ? getComputedStyle(pixels).filter : null,
      waveScaleY: wave?.style.transform ?? null,
      framing: window.__DOUBAO.state().framing,
    }
  })
  demoChecks.push(state)
  await page.screenshot({ path: `${outDir}08-cards-${i + 1}.png` })
}

/* ---- 移动端一趟：规格第八节的 <768px 分支必须单独验 -------------------- */
// 换一个 iPhone 竖屏的视口 + 触摸，跑同样的 6 个节点。
// 桌面通过不等于移动通过 —— 运镜构图、断点、触摸语义在三处都不一样。
const mobileShots = []
const mPage = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
})
mPage.on('pageerror', (err) => consoleErrors.push(`[mobile pageerror] ${err.message}`))
await mPage.goto(`${base}/?nointro=1`, { waitUntil: 'load' })
await mPage.waitForFunction(() => window.__DOUBAO?.state?.().ready === true, { timeout: 15000 })
await mPage.waitForTimeout(1200)

const mobileEnv = await mPage.evaluate(() => ({
  tier: window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'other',
  coarse: window.matchMedia('(pointer: coarse)').matches,
  railHidden: getComputedStyle(document.getElementById('rail')).display === 'none',
  docWidth: document.documentElement.scrollWidth,
  viewportWidth: window.innerWidth,
}))

for (const shot of SHOTS) {
  await mPage.evaluate((v) => window.__DOUBAO.goTo(v), shot.p)
  await mPage.waitForTimeout(3200)
  const st = await mPage.evaluate(() => window.__DOUBAO.state())
  await mPage.screenshot({ path: `${outDir}m-${shot.name}.png` })
  mobileShots.push({ p: shot.p, name: shot.name, ...st })
}

// 触摸长按 = 捏脸（规格第八节）
await mPage.evaluate(() => window.__DOUBAO.goTo(0))
await mPage.waitForTimeout(3000)
// 长按捏脸：coarse 指针下 pointerdown 会等 180ms 才置 pressing，
// tap 是瞬时动作，验不出长按 —— 必须真的按住
await mPage.mouse.move(215, 560)
await mPage.mouse.down()
await mPage.waitForTimeout(420)
const mobilePinch = await mPage.evaluate(() => ({
  pinchActive: document.documentElement.classList.contains('pinch-active'),
  pressing: document.documentElement.classList.contains('pinch-pressing'),
  strength: window.__DOUBAO.character?.pinchStrength ?? null,
}))
await mPage.mouse.up()
await mPage.screenshot({ path: `${outDir}m-hero.png` })
await mPage.close()

// 手动开始自动环绕？不需要，只记录
const summary = {
  base,
  shots: report,
  yawRight,
  yawLeft,
  demoChecks,
  pinch: { faceBox, hoverState, pressState },
  transitionShots,
  mobileEnv,
  mobileShots,
  mobilePinch,
  consoleErrors,
}

await writeFile(`${outDir}report.json`, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
await browser.close()
