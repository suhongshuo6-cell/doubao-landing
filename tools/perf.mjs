/**
 * perf.mjs — 规格第九节「性能预算」的实测工具。
 *
 * 它回答三个问题，且**必须先说清楚测的是哪块 GPU**：
 *   1. 首屏多快可用（DOMContentLoaded / 角色就位 / 长任务）
 *   2. 连续滚动 10s 有没有掉帧累积（帧时间 p50 / p95 / p99、掉帧数）
 *   3. 自适应降档有没有按预期介入（renderScale 的轨迹）
 *
 * ⚠️ 关于 GPU：headless Chrome 在 macOS 上通常会退到 SwiftShader（软件渲染），
 * 这时的 fps 只代表"这段代码在 CPU 上跑得动"，**不能**当作真机数字。
 * 所以脚本会先把 `WEBGL_debug_renderer_info` 打出来；看到 SwiftShader 就说明
 * 这一轮只能当**相对基线**用，真机请用 `npm run dev` 在本机浏览器里跑。
 *
 * 用法：
 *   node tools/perf.mjs                 # 默认 http://127.0.0.1:4173
 *   node tools/perf.mjs http://localhost:5173
 */

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const outDir = new URL('../.preview-out/', import.meta.url).pathname
await mkdir(outDir, { recursive: true })

const SCROLL_SECONDS = 10
const WHEEL_EVERY_MS = 50
const WHEEL_DELTA = 130

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1'],
})

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// 采样器要在页面脚本之前装好，否则会漏掉启动阶段
await page.addInitScript(() => {
  const perf = { frames: [], longTasks: [], last: 0 }
  window.__PERF = perf
  const tick = (t) => {
    if (perf.last) perf.frames.push(t - perf.last)
    perf.last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) perf.longTasks.push(e.duration)
    }).observe({ entryTypes: ['longtask'] })
  } catch {
    /* 不支持 longtask 就算了 */
  }
})

await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
const tDCL = Date.now()

await page.waitForFunction(() => window.__DOUBAO?.state?.().ready === true, { timeout: 20000 })
const tReady = Date.now()

const env = await page.evaluate(() => {
  const gl = window.__DOUBAO.stage.renderer.getContext()
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return {
    glRenderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'n/a',
    dpr: window.devicePixelRatio,
    nav: (() => {
      const n = performance.getEntriesByType('navigation')[0]
      return n
        ? {
            domContentLoaded: Math.round(n.domContentLoadedEventEnd),
            loadEvent: Math.round(n.loadEventEnd),
            transferBytes: n.transferSize ?? null,
          }
        : null
    })(),
    paint: (() => {
      const f = performance.getEntriesByName('first-contentful-paint')[0]
      return f ? Math.round(f.startTime) : null
    })(),
  }
})

// 让首屏稳定下来，再清零采样窗口
await page.waitForTimeout(2500)
await page.evaluate(() => {
  window.__PERF.frames.length = 0
  window.__PERF.longTasks.length = 0
  window.__PERF.last = 0
})
const scaleBefore = await page.evaluate(() => window.__DOUBAO.state().renderScale)
const scaleTrace = []

// 连续滚动 10 秒：用真实 wheel 事件，走的是 Lenis 的完整链路
const started = Date.now()
while (Date.now() - started < SCROLL_SECONDS * 1000) {
  await page.mouse.wheel(0, WHEEL_DELTA)
  await page.waitForTimeout(WHEEL_EVERY_MS)
  if ((Date.now() - started) % 1000 < WHEEL_EVERY_MS) {
    scaleTrace.push(await page.evaluate(() => window.__DOUBAO.state().renderScale))
  }
}

const result = await page.evaluate(() => {
  const f = window.__PERF.frames.slice().sort((a, b) => a - b)
  const q = (p) => (f.length ? +f[Math.min(f.length - 1, Math.floor(f.length * p))].toFixed(2) : null)
  const mean = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0
  return {
    frames: f.length,
    fpsMean: mean > 0 ? +(1000 / mean).toFixed(1) : null,
    frameP50: q(0.5),
    frameP95: q(0.95),
    frameP99: q(0.99),
    frameMax: f.length ? +f[f.length - 1].toFixed(2) : null,
    over16_7: f.filter((x) => x > 16.7).length,
    over33: f.filter((x) => x > 33).length,
    over50: f.filter((x) => x > 50).length,
    longTasks: window.__PERF.longTasks.length,
    longTaskTotalMs: +window.__PERF.longTasks.reduce((a, b) => a + b, 0).toFixed(1),
    renderScale: window.__DOUBAO.state().renderScale,
    drawCalls: window.__DOUBAO.state().drawCalls,
    finalFraming: window.__DOUBAO.state().framing,
  }
})

await page.screenshot({ path: `${outDir}perf-end.png` })

const software = /swiftshader|llvmpipe|software/i.test(env.glRenderer)
const report = {
  base,
  gpu: env.glRenderer,
  softwareRendering: software,
  dpr: env.dpr,
  firstContentfulPaintMs: env.paint,
  // DCL → 角色 ready 的墙钟差值：这一段的含义是"文档可用之后，还要多久角色才上场"，
  // 是首屏体验里最该盯的一个数
  msFromDCLToCharacterReady: tReady - tDCL,
  nav: env.nav,
  scaleBefore,
  scaleTrace,
  scrollWindow: result,
}

console.log(`\n════════ 性能实测（规格第九节）════════\n`)
console.log(`GPU          : ${report.gpu}`)
if (software) {
  console.log(`               ⚠️ 软件渲染（SwiftShader）—— fps 只能当相对基线，不是真机数字`)
}
console.log(`首屏 FCP     : ${report.firstContentfulPaintMs ?? 'n/a'} ms`)
console.log(`DCL → 角色就位: ${report.msFromDCLToCharacterReady} ms`)
console.log(`长任务       : ${result.longTasks} 个 / 合计 ${result.longTaskTotalMs} ms`)
console.log(`\n连续滚动 ${SCROLL_SECONDS}s（真实 wheel 事件，走 Lenis 全链路）`)
console.log(`  帧数       : ${result.frames}`)
console.log(`  平均 fps   : ${result.fpsMean}`)
console.log(`  帧时间 p50 : ${result.frameP50} ms`)
console.log(`  帧时间 p95 : ${result.frameP95} ms`)
console.log(`  帧时间 p99 : ${result.frameP99} ms`)
console.log(`  最长帧     : ${result.frameMax} ms`)
console.log(`  >16.7ms    : ${result.over16_7} 帧`)
console.log(`  >33ms      : ${result.over33} 帧`)
console.log(`  >50ms      : ${result.over50} 帧`)
console.log(`\n自适应降档   : ${scaleBefore} → ${result.renderScale}`)
console.log(`  renderScale 轨迹: ${scaleTrace.join(' → ')}`)
console.log(`  draw calls : ${result.drawCalls}（预算 < 40）`)
console.log(`滚动结束取景 : ${result.finalFraming}\n`)

await writeFile(`${outDir}perf.json`, JSON.stringify(report, null, 2))
await browser.close()
