/**
 * 极简断言库（带可读 diff）。
 * 不依赖 node:test，保证 run-all 既能独立跑，也能被 node --test 调用。
 */

const GREEN = "\u001b[32m"
const RED = "\u001b[31m"
const YELLOW = "\u001b[33m"
const DIM = "\u001b[2m"
const BOLD = "\u001b[1m"
const RESET = "\u001b[0m"

const colorEnabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (color, text) => (colorEnabled ? `${color}${text}${RESET}` : String(text))

export const style = {
  pass: (s) => paint(GREEN, s),
  fail: (s) => paint(RED, s),
  warn: (s) => paint(YELLOW, s),
  dim: (s) => paint(DIM, s),
  bold: (s) => paint(BOLD, s),
}

export class AssertionFailure extends Error {
  constructor(message, diff) {
    super(message)
    this.name = "AssertionFailure"
    this.diff = diff
  }
}

function stableOrder(value) {
  if (Array.isArray(value)) return value.map(stableOrder)
  if (value && typeof value === "object") {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = stableOrder(value[key])
    return out
  }
  return value
}

export function stringify(value) {
  if (value === undefined) return "undefined"
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`
  try {
    return JSON.stringify(stableOrder(value), null, 2)
  } catch {
    return String(value)
  }
}

/** 把两个值渲染成并排 diff（逐键 / 逐元素的统一 diff） */
export function renderDiff(actual, expected, label = "expected vs actual") {
  const a = currentOnly(actual)
  const e = currentOnly(expected)
  const aText = JSON.stringify(stableOrder(a), null, 2) ?? String(a)
  const eText = JSON.stringify(stableOrder(e), null, 2) ?? String(e)
  const aLines = aText.split("\n")
  const eLines = eText.split("\n")
  const out = [style.dim(`--- ${label}`)]
  // 简单 LCS 以得到 a/e 三路 diff
  const ops = diffLines(eLines, aLines)
  for (const op of ops) {
    if (op.type === "same") out.push(style.dim(`   ${op.line}`))
    else if (op.type === "removed") out.push(style.fail(`-  ${op.line}`))
    else out.push(style.pass(`+  ${op.line}`))
  }
  return out.join("\n")
}

function currentOnly(value) {
  if (value === undefined) return null
  return value
}

function diffLines(expectedLines, actualLines) {
  const n = expectedLines.length
  const m = actualLines.length
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1)
      lcs[i][j] = expectedLines[i] === actualLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (expectedLines[i] === actualLines[j]) {
      ops.push({ type: "same", line: expectedLines[i] })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: "removed", line: expectedLines[i] })
      i += 1
    } else {
      ops.push({ type: "added", line: actualLines[j] })
      j += 1
    }
  }
  while (i < n) ops.push({ type: "removed", line: expectedLines[i++] })
  while (j < m) ops.push({ type: "added", line: actualLines[j++] })
  return ops
}

function subsetDiff(actual, expected) {
  const key = (v) => JSON.stringify(stableOrder(v))
  const problems = []

  const walk = (act, exp, path) => {
    const keys = Object.keys(exp || {})
    if (!act || typeof act !== "object") {
      problems.push(`  ${path || "<root>"} 期望对象，实际 ${stringify(act)}`)
      return
    }
    for (const k of keys) {
      const current = `${path}.${k}`
      const e = exp[k]
      const a = act[k]
      if (e !== null && typeof e === "object" && !Array.isArray(e)) {
        walk(a, e, current)
        continue
      }
      if (key(a) !== key(e)) {
        problems.push(`  ${current}  期望 ${stringify(e)}，实际 ${stringify(a)}`)
      }
    }
  }
  walk(actual, expected, "")
  return problems
}

export function fail(message, detail) {
  throw new AssertionFailure(message, detail)
}

/** 深比较（严格，含数组顺序） */
export function equal(actual, expected, message = "值不相等") {
  if (JSON.stringify(stableOrder(actual)) !== JSON.stringify(stableOrder(expected))) {
    fail(message, renderDiff(actual, expected))
  }
}

/**
 * 部分匹配：expected 的每个键都必须匹配，additional 的键忽略（用于断言 $done 的稳定字段）
 * 例：match(tile.done, { content: "可用", backgroundColor: "#4285F4" })
 */
export function match(actual, expected, message = "对象不匹配") {
  const problems = subsetDiff(actual, expected)
  if (problems.length) {
    fail(message, `${problems.join("\n")}\n\n${renderDiff(actual, expected, "expected (子集) vs actual")}`)
  }
}

export function ok(value, message = "期望为真") {
  if (!value) fail(message, `实际值: ${stringify(value)}`)
}

export function notOk(value, message = "期望为假") {
  if (value) fail(message, `实际值: ${stringify(value)}`)
}

export function includes(haystack, needle, message = "未包含期望子串") {
  if (typeof haystack !== "string" || !haystack.includes(needle)) {
    fail(message, `期望包含: ${stringify(needle)}\n实际:     ${stringify(haystack)}`)
  }
}

export function lengthOf(list, expected, message = "长度不符") {
  const actual = Array.isArray(list) ? list.length : list === undefined ? 0 : 1
  if (actual !== expected) fail(message, `期望长度 ${expected}，实际 ${actual}\n实际内容: ${stringify(list)}`)
}

export default { equal, match, ok, notOk, includes, lengthOf, fail, renderDiff, style, AssertionFailure }
