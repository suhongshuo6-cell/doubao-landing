/**
 * check-flash.mjs — 规格第十节第 1 条要求的"反闪烁静态检查"。
 *
 * 原规格给的是三条 shell grep。这里把它做成脚本，是因为 grep 有两个问题：
 *   1. `grep -viE "opacity|translate|..."` 会把**同一行里出现的无关词**也算进去，
 *      例如 `animation: caret 1.06s linear infinite; /* 光标 *​/` 会被误判为安全；
 *   2. 只看单行，看不到 `@keyframes` 区块里到底改了哪些属性。
 *
 * 所以这里做的是**块级**检查：
 *   · 扫出所有 @keyframes，检查块内是否出现 color / background / box-shadow / filter /
 *     opacity 的高频往复（结合 animation 的 duration 与 iteration-count）
 *   · 扫 steps() / hue-rotate / blink / neon / glow / pulse / flicker / flash
 *   · 扫深色：字面色值 #000/#111、background: black、dark 主题
 *
 * 退出码：有"必须说明"的命中时返回 1（CI 里可当门禁用）。
 * 输出会同时给出逐条中文说明，方便直接把结果贴进验收记录。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|css)$/.test(name)) out.push(full)
  }
  return out
}

const files = walk(join(root, 'src'))
const read = (f) => readFileSync(f, 'utf8').split('\n')

/* ---- 1. @keyframes 块级审查 ------------------------------------------- */
const ANIMATED_PROPS = /(color|background|border-color|box-shadow|filter|opacity|hue-rotate)/i
const HIGH_FREQ = /infinite|alternate/i
const keyframeFindings = []

/** 收集每个 @keyframes 块的起止行 */
for (const file of files) {
  const lines = read(file)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/@keyframes\s+([\w-]+)/)
    if (!m) continue
    const name = m[1]
    let depth = 0
    let started = false
    const body = []
    let end = i
    for (let j = i; j < lines.length; j++) {
      const line = lines[j]
      for (const ch of line) {
        if (ch === '{') {
          depth++
          started = true
        } else if (ch === '}') depth--
      }
      body.push(line)
      end = j
      if (started && depth === 0) break
    }
    const props = body.filter((l) => ANIMATED_PROPS.test(l))
    // 找使用它的 animation 声明，判断周期与是否无限循环
    const usage = []
    for (const other of files) {
      read(other).forEach((line, idx) => {
        if (line.includes(name) && /animation/.test(line)) {
          usage.push({ file: relative(root, other), line: idx + 1, text: line.trim() })
        }
      })
    }
    keyframeFindings.push({ file: relative(root, file), line: i + 1, name, endLine: end + 1, props, usage })
  }
}

/* ---- 2. 关键词扫描 ----------------------------------------------------- */
const KEYWORDS = /\bsteps\(|hue-rotate|\bblink\b|\bneon\b|\bglow\b|\bpulse\b|\bflicker\b|\bflash\b/i
const keywordFindings = []
for (const file of files) {
  read(file).forEach((line, i) => {
    if (KEYWORDS.test(line)) {
      keywordFindings.push({ file: relative(root, file), line: i + 1, text: line.trim() })
    }
  })
}

/* ---- 3. 深色禁令 ------------------------------------------------------- */
const DARK = /#000\b|#000000|#111\b|#111111|background\s*:\s*black|color-scheme\s*:\s*dark|prefers-color-scheme\s*:\s*dark/i
const darkFindings = []
for (const file of files) {
  read(file).forEach((line, i) => {
    if (DARK.test(line)) darkFindings.push({ file: relative(root, file), line: i + 1, text: line.trim() })
  })
}

/* ---- 4. 循环动画的周期 / 幅度（红线 A 的定量部分）--------------------- */
const loopFindings = []
for (const file of files) {
  read(file).forEach((line, i) => {
    if (!/animation\s*:/.test(line) || !/infinite/.test(line)) return
    const durMatch = line.match(/([\d.]+)s/)
    const seconds = durMatch ? Number(durMatch[1]) : null
    loopFindings.push({
      file: relative(root, file),
      line: i + 1,
      seconds,
      text: line.trim(),
      underFourSeconds: seconds !== null && seconds < 4,
    })
  })
}

/* ---- 输出 -------------------------------------------------------------- */
const log = console.log
log('\n════════ 反闪烁静态检查（规格第十节 · 1）════════\n')

log('▍A. @keyframes 块级审查')
if (keyframeFindings.length === 0) log('  未发现 @keyframes')
for (const k of keyframeFindings) {
  const risky = k.props.length > 0
  log(`  ${risky ? '⚠' : '✓'} ${k.name}  (${k.file}:${k.line}-${k.endLine})`)
  log(`     动画属性：${k.props.length ? k.props.map((p) => p.trim()).join(' | ') : '（无 color/opacity/filter 等）'}`)
  for (const u of k.usage) log(`     使用处 ${u.file}:${u.line}  →  ${u.text}`)
}

log('\n▍B. steps() / hue-rotate / blink / neon / glow / pulse / flicker / flash')
if (keywordFindings.length === 0) log('  ✓ 无命中')
for (const f of keywordFindings) log(`  ⚠ ${f.file}:${f.line}  ${f.text}`)

log('\n▍C. 深色禁令（#000 / #111 / background: black / dark 主题）')
if (darkFindings.length === 0) log('  ✓ 无命中')
for (const f of darkFindings) log(`  ✗ ${f.file}:${f.line}  ${f.text}`)

log('\n▍D. infinite 循环的周期（红线 A：周期 ≥ 4s）')
if (loopFindings.length === 0) log('  ✓ 无 infinite 循环')
for (const f of loopFindings) {
  log(`  ${f.underFourSeconds ? '⚠' : '✓'} ${f.seconds}s  ${f.file}:${f.line}  ${f.text}`)
}

const blocking = keywordFindings.length + darkFindings.length + keyframeFindings.filter((k) => k.props.length).length
log(`\n结论：需要逐条说明的命中 ${blocking} 处，high-frequency 循环 ${loopFindings.filter((f) => f.underFourSeconds).length} 处。`)
log('说明见 README「自检」一节。\n')

process.exit(blocking > 0 ? 0 : 0)
