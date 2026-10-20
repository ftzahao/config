/**
 * 横切契约测试（_contract.case.mjs）
 *
 * 与各脚本的业务逻辑无关，对 stash/tiles/ 下**每一个**脚本逐条断言 Stash Tile 的通用契约：
 *
 *   C1  网络错误（{error} / response undefined / data undefined）时：$done 恰好调用 1 次，
 *       content 中不得出现 undefined / NaN / [object Object]，且不得误判为「可用」。
 *   C2  回调永不返回时不得永久挂起：超时（800ms）之前 $done 必须已被调用。
 *   C3  HTTP 200 但 body 是 Cloudflare 挑战页（"Just a moment..."）时不得判为「可用」——
 *       同义文案（Available / 无限制 / Full / 可达 …）同样算失败，见 support.mjs expectNotAvailable。
 *   C4  $done 调用次数恰好为 1（happy path）。
 *   C5  源码静态检查：不得把 $httpClient 方法取出来脱离 receiver 调用
 *       （`$httpClient[method]` / `const fn = $httpClient.get` 等）。
 *
 * 脚本清单由 loadTileNames() 从 stash/tiles/ 动态读取：新增脚本会自动纳入契约测试，
 * 因此这里不写死 14 个。
 *
 * 预期：C2 / C5 在修复前会全红（所有脚本都无超时兜底、部分脚本用 `$httpClient[method]`），
 * 这类用例用 expectContract 记录为 BUG，并给出 file:line。
 */
import fs from "node:fs"
import path from "node:path"
import * as fx from "../fixtures.mjs"
import { AssertionFailure } from "../assert.mjs"
import { expectContract, expectNotAvailable } from "../support.mjs"
import { TILES_DIR } from "../harness.mjs"

/** C2 时限：兜底预算上限约 3.4s（timeout:3 → 3.4s），留 1.1s 余量 */
const DEFAULT_C2_TIMEOUT_MS = 4500
/** C2 时限：串行链路（disney 三段 / netflix 两段）需更长，且 fix-media 计划改为共享总预算 ≤2.5s */
const SERIAL_CHAIN_TIMEOUT_MS = 4500

/** 硬失败的文案特征：这些字符串说明脚本把内部状态泄漏到了 UI */
const GARBAGE = ["undefined", "NaN", "[object Object]"]

const TILE_NAMES = loadTileNames()

export default {
  script: TILE_NAMES,
  crossCutting: true,
  cases: TILE_NAMES.flatMap((script) => buildCases(script)),
}

function loadTileNames() {
  return fs
    .readdirSync(TILES_DIR)
    .filter((name) => name.endsWith(".js"))
    .map((name) => name.replace(/\.js$/, ""))
    .sort()
}

/** 读取脚本源码（用于静态检查） */
function readSource(script) {
  return fs.readFileSync(path.join(TILES_DIR, `${script}.js`), "utf8")
}

/**
 * 找出 $httpClient 方法被"取出后脱离 receiver 调用"的位置。
 * 匹配 `$httpClient[`，以及 `= $httpClient.get` / `= $httpClient.post` 这类赋值。
 * 纯注释行不计入。
 */
function findDetachedHttpClientCalls(source) {
  const hits = []
  source.split("\n").forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return
    if (/\$httpClient\s*\[/.test(line)) hits.push({ line: index + 1, code: trimmed })
    else if (/=\s*\$httpClient\.(get|post)\b/.test(line)) hits.push({ line: index + 1, code: trimmed })
  })
  return hits
}

/** 读取脚本里第一条请求的 URL（仅用于报告） */
function firstUrl(source) {
  const match = source.match(/url:\s*["']([^"']+)["']/)
  if (match) return match[1]
  const direct = source.match(/request\(\s*["']GET["']\s*,\s*["']([^"']+)["']/)
  return direct ? direct[1] : "(未识别)"
}

/**
 * 位置描述：优先静态定位 `$httpClient[method`，其次 `request()` 定义与 resolve 行，
 * 保证每个 BUG 都有 file:line（`<script>` 由调用方替换成真实文件名）。
 */
function locationOf(source, script, reason) {
  const lines = source.split("\n")
  const detached = lines.findIndex(
    (line) => /\$httpClient\s*\[/.test(line) && !/^\s*(\/\/|\*)/.test(line),
  )
  const url = firstUrl(source)
  const suffix = `（${url}）—— ${reason}`
  if (detached >= 0) {
    return `stash/tiles/${script}.js:${detached + 1}  $httpClient 方法取值处${suffix}`
  }
  const requestFn = lines.findIndex((line) => /function\s+request\s*\(/.test(line))
  const resolveLine = lines.findIndex((line) => /resolve\(\{\s*error,\s*response,\s*data\s*\}\)/.test(line))
  const anchors = []
  if (requestFn >= 0) anchors.push(requestFn + 1)
  if (resolveLine >= 0) anchors.push(resolveLine + 1)
  return `stash/tiles/${script}.js:${anchors.length ? anchors.join(",") : "1"}  request() 定义/${suffix}`
}

/** 检查 $done 载荷里是否泄漏内部状态；返回问题描述数组 */
function findGarbage(done, context) {
  const problems = []
  const content = String(done?.content ?? "")
  for (const token of GARBAGE) {
    if (content.includes(token)) {
      problems.push(`content 泄漏内部状态 "${token}"：${JSON.stringify(content)}（${context}）`)
    }
  }
  const payload = JSON.stringify(done ?? {})
  for (const token of GARBAGE) {
    if (payload.includes(token) && !content.includes(token)) {
      problems.push(`$done 载荷泄漏内部状态 "${token}"：${payload}（${context}）`)
    }
  }
  return problems
}

function buildCases(script) {
  const source = readSource(script)
  const cases = []

  /* ---------------- C1：网络错误 ---------------- */
  const networkVariants = [
    { label: "{error} 非空", responses: [fx.networkError()] },
    {
      label: "response 为 undefined",
      responses: [{ error: null, response: undefined, data: "" }],
    },
    { label: "response 与 data 均为 undefined", responses: [fx.emptyResponse()] },
  ]

  for (const variant of networkVariants) {
    cases.push({
      script,
      name: `${script} · C1 网络错误（${variant.label}）→ $done 一次且文案干净`,
      // b: 多请求脚本（netflix/spotify/disney）每个请求都拿到同样的网络错误
      responses: variant.responses,
      repeatLast: true,
      async expect(result) {
        const problems = []
        if (result.errors.length) {
          problems.push(...result.errors.map((e) => `[${e.phase}] ${e.name}: ${e.message}`))
        }
        if (result.doneCalls.length !== 1) {
          problems.push(
            `$done 调用 ${result.doneCalls.length} 次（期望恰好 1）；outcome=${result.outcome} timedOut=${result.timedOut} requests=${result.requests.length}`,
          )
        } else {
          problems.push(...findGarbage(result.doneCall.value, `${script}: ${variant.label}`))
          const content = String(result.doneCall.value?.content ?? "")
          if (/^\s*(可用|Available)\b/.test(content)) {
            problems.push(`网络错误时 content 仍为「可用」：${JSON.stringify(content)}`)
          }
        }
        if (problems.length) {
          throw new AssertionFailure(`网络错误契约被破坏（${script}: ${variant.label}）`, problems.join("\n"))
        }
        return { passed: true }
      },
    })
  }

  /* ---------------- C2：回调永不返回 → 不得永久挂起 ---------------- */
  // 时限说明（lead 决策）：各脚本 request() 兜底预算 = params.timeout*1000 + 余量，
  // 当前 timeout:3 → 约 3.4s 收口；这里给 4.5s，留 1.1s 余量，避免把正常慢请求误判。
  // 串行链路（disney 三段 / netflix 两段）预算更长，单独放宽到 SERIAL_CHAIN_TIMEOUT_MS。
  const serialChain = ["disney", "netflix"].includes(script)
  cases.push({
    script,
    name: `${script} · C2 回调永不返回 → 超时兜底调用 $done`,
    timeoutMs: serialChain ? SERIAL_CHAIN_TIMEOUT_MS : DEFAULT_C2_TIMEOUT_MS,
    responses: [fx.hang()],
    async expect(result) {
      const budget = serialChain ? SERIAL_CHAIN_TIMEOUT_MS : DEFAULT_C2_TIMEOUT_MS
      return expectContract(result, {
        expected: `回调永不返回时，脚本应在兜底预算内（≤${budget / 1000}s）调用 $done`,
        // 用真实收口时间判定：脚本在预算内 $done 即算通过（harness 的 timedOut 只看观察窗口）
        assertion: (r) => r.doneCalls.length >= 1 && (r.doneAfterMs ?? Infinity) <= budget,
        location: locationOf(source, script, "没有超时兜底：request() 只在 $httpClient 回调里 resolve"),
        evidence: {
          timedOut: result.timedOut,
          doneAfterMs: result.doneAfterMs,
          doneCalls: result.doneCalls.length,
          requests: result.requests.length,
          budgetMs: budget,
        },
      })
    },
  })

  /* ---------------- C3：200 + Cloudflare 挑战页不得判为可用 ---------------- */
  cases.push({
    script,
    name: `${script} · C3 200 + Cloudflare 挑战页 → 不得判为「可用」`,
    responses: [fx.cloudflareHtml({ status: 200 })],
    repeatLast: true,
    async expect(result) {
      const problems = []
      if (result.errors.length) {
        problems.push(...result.errors.map((e) => `[${e.phase}] ${e.name}: ${e.message}`))
      }
      if (result.doneCalls.length !== 1) problems.push(`$done 调用 ${result.doneCalls.length} 次（期望 1）`)
      if (problems.length) {
        throw new AssertionFailure(`挑战页用例未收敛（${script}）`, problems.join("\n"))
      }
      let verdict = false
      try {
        expectNotAvailable(result.done, `${script} C3`)
        verdict = true
      } catch {
        verdict = false
      }
      return expectContract(result, {
        expected: "200 + Cloudflare 挑战页（HTML）时不得判为「可用 / Available」",
        assertion: () => verdict,
        evidence: result.done,
        location: locationOf(source, script, "未识别 Cloudflare 挑战页特征（只按状态码/固定文案判定）"),
      })
    },
  })

  /* ---------------- C4：$done 恰好一次（happy path） ---------------- */
  cases.push({
    script,
    name: `${script} · C4 happy path → $done 恰好调用 1 次`,
    responses: [fx.noContent()],
    repeatLast: true,
    async expect(result) {
      const problems = []
      if (result.errors.length) {
        problems.push(...result.errors.map((e) => `[${e.phase}] ${e.name}: ${e.message}`))
      }
      if (result.doneCalls.length !== 1) {
        problems.push(
          `$done 调用 ${result.doneCalls.length} 次（期望 1）；outcome=${result.outcome} timedOut=${result.timedOut} requests=${result.requests.length}`,
        )
      }
      if (problems.length) {
        throw new AssertionFailure(`$done 次数契约被破坏（${script}）`, problems.join("\n"))
      }
      return { passed: true }
    },
  })

  /* ---------------- C5：静态检查 receiver 丢失 ---------------- */
  cases.push({
    script,
    name: `${script} · C5 源码静态检查：$httpClient 方法不得脱离 receiver 调用`,
    responses: [fx.noContent()],
    async expect(result) {
      const hits = findDetachedHttpClientCalls(source)
      return expectContract(result, {
        expected: "直接用 $httpClient.get(...) / $httpClient.post(...) 调用，而不是先取方法再调用（真机可能丢 this → TypeError）",
        assertion: () => hits.length === 0,
        location: hits.length
          ? `stash/tiles/${script}.js:${hits.map((hit) => hit.line).join(",")}  ${hits[0].code}`
          : "—",
        evidence: hits,
      })
    },
  })

  return cases
}
