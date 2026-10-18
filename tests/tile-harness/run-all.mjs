#!/usr/bin/env node
/**
 * 一次跑完全部 Tile 脚本用例。
 *
 *   node tests/tile-harness/run-all.mjs               # 跑全部
 *   node tests/tile-harness/run-all.mjs disney google # 只跑指定脚本
 *   node tests/tile-harness/run-all.mjs --filter=html # 只跑名字匹配的用例
 *   node tests/tile-harness/run-all.mjs --verbose     # 打印每个用例的请求/输出
 *   node tests/tile-harness/run-all.mjs --json        # 机器可读输出
 *   node tests/tile-harness/run-all.mjs --diff        # 打印完整上下文（默认 8 行）
 *
 * 状态语义：
 *   PASS  用例通过
 *   FAIL  用例失败（脚本行为与用例断言不符 —— 通常是脚本 bug）
 *   BUG   用例显式标记了「当前实现已知有问题」（expect 返回 { bug }），
 *         记录真实行为但不视为通过（退出码仍非 0），修复脚本后需要把用例改为普通断言
 *   ERROR 用例本身抛错（夹具问题 / 测试代码 bug）
 *
 * 退出码：全部 PASS 才为 0。
 */
import path from "node:path"
import { runTileScript } from "./harness.mjs"
import { loadCases, validateCoverage } from "./load-cases.mjs"
import { AssertionFailure, stringify, style } from "./assert.mjs"
import { describeRequests } from "./support.mjs"

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith("--")))
const filterArg = argv.find((a) => a.startsWith("--filter="))
const nameFilter = filterArg ? filterArg.slice("--filter=".length) : null
const positional = argv.filter((a) => !a.startsWith("--"))
const verbose = flags.has("--verbose")
const jsonMode = flags.has("--json")
const strict = flags.has("--strict") // 把 BUG 也当作 FAIL（CI 可用）
const concurrencyFlag = argv.find((a) => a.startsWith("--concurrency="))
const concurrency = Math.max(1, Number(concurrencyFlag?.slice("--concurrency=".length)) || 4)
const sequential = flags.has("--serial")
const withContract = flags.has("--with-contract") || positional.includes("_contract")
const timeouts = flags.has("--slow-timeouts") ? 3000 : 600

function print(...args) {
  if (!jsonMode) console.log(...args)
}

async function runCase(suite, testCase) {
  const startedAt = Date.now()
  let result
  try {
    result = await runTileScript({
      scriptPath: testCase.script || suite.script,
      responses: testCase.responses ?? [],
      repeatLast: Boolean(testCase.repeatLast),
      environment: testCase.environment,
      route: testCase.route,
      argument: testCase.argument,
      timeoutMs: testCase.timeoutMs ?? timeouts,
    })
    const verdict = await testCase.expect(result)
    if (verdict && verdict.bug) {
      return {
        status: strict ? "FAIL" : "BUG",
        result,
        durationMs: Date.now() - startedAt,
        bug: typeof verdict.bug === "string" ? verdict.bug : "已知脚本 bug",
        evidence: verdict.evidence,
        location: verdict.location,
      }
    }
    if (verdict && verdict.skipReason) {
      return { status: "SKIP", result, durationMs: Date.now() - startedAt, reason: verdict.skipReason }
    }
    return { status: "PASS", result, durationMs: Date.now() - startedAt }
  } catch (error) {
    const isAssertion = error instanceof AssertionFailure
    return {
      status: isAssertion ? "FAIL" : "ERROR",
      result,
      durationMs: Date.now() - startedAt,
      message: error.message,
      detail: isAssertion ? error.diff : error.stack,
    }
  }
}

function renderCase(outcome, suite, testCase, index) {
  const label = suite.crossCutting
    ? `${testCase.script || "?"} › ${testCase.name}`
    : `${suite.script}.case.mjs › ${testCase.name}`
  if (outcome.status === "PASS") {
    print(`  ${style.pass("PASS")} ${label} ${style.dim(`(${outcome.durationMs}ms)`)}`)
    if (verbose && outcome.result) {
      print(indentBlock(renderContext(outcome.result), "       "))
    }
    return
  }

  if (outcome.status === "BUG") {
    print(`  ${style.warn("BUG ")} ${label} ${style.dim(`(${outcome.durationMs}ms)`)}`)
    if (outcome.location) print(style.dim(`       位置: ${outcome.location}`))
    print(indentBlock(style.warn(outcome.bug), "       "))
    if (outcome.evidence !== undefined) print(indentBlock(style.dim(`实际行为: ${stringify(outcome.evidence)}`), "       "))
    if (verbose && outcome.result) print(indentBlock(renderContext(outcome.result), "       "))
    return
  }

  if (outcome.status === "FAIL") {
    print(`  ${style.fail("FAIL")} ${style.dim(`(${outcome.durationMs}ms)`)} ${label}`)
    print(indentBlock(style.fail(outcome.message), "       "))
    if (outcome.detail) print(indentBlock(outcome.detail, "       "))
    if (outcome.result) print(indentBlock(style.dim(renderContext(outcome.result)), "       "))
    return
  }

  if (outcome.status === "SKIP") {
    print(`  ${style.dim("SKIP")} ${label} — ${outcome.reason}`)
    return
  }

  print(`  ${style.fail("ERROR")} ${style.dim(`(${outcome.durationMs}ms)`)} ${label}`)
  print(indentBlock(outcome.message || String(outcome.detail), "       "))
}

function renderContext(result) {
  const lines = []
  const doneText = result.doneCall ? stringify(result.doneCall.value) : "<未调用 $done>"
  lines.push(`$done:     ${doneText.replace(/\n\s*/g, " ")}`)
  lines.push(`outcome:   ${result.outcome}  timedOut=${result.timedOut}  doneCalls=${result.doneCalls.length}`)
  lines.push(`requests:\n${describeRequests(result)}`)
  if (result.errors.length) {
    lines.push(`errors:    ${result.errors.map((e) => `${e.name}: ${e.message}`).join(" | ")}`)
  }
  if (result.logs.length) lines.push(`logs:      ${result.logs.map((l) => `${l.level} ${l.args.join(" ")}`).join(" | ")}`)
  return lines.join("\n")
}

const indentBlock = (text, prefix) =>
  String(text)
    .split("\n")
    .map((line) => prefix + line)
    .join("\n")

async function main() {
  const suites = await loadCases()
  const coverage = validateCoverage(suites)

  const report = {
    startedAt: new Date().toISOString(),
    suites: [],
    coverage,
    totals: { pass: 0, fail: 0, bug: 0, error: 0, skip: 0, cases: 0, coverageProblems: 0 },
  }

  print(style.bold("Stash Tile 测试台"))
  print(style.dim(`脚本目录: stash/tiles/  用例目录: tests/tile-harness/cases/`))

  if (coverage.missingCoverage.length) {
    print(
      style.warn(
        `⚠ 以下 tile 脚本没有用例文件: ${coverage.missingCoverage.join(", ")}`,
      ),
    )
    report.totals.coverageProblems += coverage.missingCoverage.length
  }
  if (coverage.orphanSuites.length) {
    print(style.warn(`⚠ 以下用例文件找不到对应脚本: ${coverage.orphanSuites.join(", ")}`))
    report.totals.coverageProblems += coverage.orphanSuites.length
  }
  if (coverage.duplicateCaseNames.length) {
    print(style.warn(`⚠ 用例名重复（会导致 --filter 歧义）: ${coverage.duplicateCaseNames.join("; ")}`))
  }

  const selected = suites.filter((suite) => {
    if (!positional.length) return true
    // 指定脚本时默认不跑横切套件（否则会跑满 14×5 条，误导「只跑 x」的结果）；
    // 需要时显式加 --with-contract 或位置参数 `_contract`。
    if (suite.crossCutting) return withContract
    return positional.includes(suite.file) || suite.scripts.some((name) => positional.includes(name))
  }).filter((suite) => !(suite.crossCutting && !withContract && positional.length && !positional.includes("_contract")))

  if (positional.length && selected.length === 0) {
    print(style.fail(`没有匹配的脚本: ${positional.join(", ")}`))
    process.exitCode = 2
    return
  }

  for (const suite of selected) {
    const suiteLabel = suite.crossCutting
      ? `${path.basename(suite.file)}（横切 · ${suite.scripts.length} 个脚本 × ${suite.cases.length} 条契约）`
      : `${suite.script}.js`
    print(style.bold(suiteLabel) + (suite.crossCutting ? "" : style.dim(`  (${suite.cases.length} 个用例)`)))
  }
  print("")

  // 并发执行（默认 4）：用例都是独立 vm 沙箱，可以安全并行；
  // 输出顺序仍按 suite / case 定义顺序，保证报告稳定可比。
  const tasks = []
  for (const suite of selected) {
    const suiteReport = { script: suite.script, cases: [] }
    report.suites.push(suiteReport)
    const picked = suite.cases.filter((testCase) => !nameFilter || testCase.name.includes(nameFilter))
    for (const testCase of picked) tasks.push({ suite, suiteReport, testCase })
  }

  const results = new Array(tasks.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < tasks.length) {
      const index = cursor
      cursor += 1
      const { suite, testCase } = tasks[index]
      results[index] = await runCase(suite, testCase)
    }
  }
  const workers = Array.from({ length: sequential ? 1 : Math.min(concurrency, tasks.length) }, worker)
  await Promise.all(workers)

  for (let index = 0; index < tasks.length; index += 1) {
    const { suite, suiteReport, testCase } = tasks[index]
    const outcome = results[index]
    report.totals.cases += 1
    report.totals[outcome.status.toLowerCase()] += 1
    renderCase(outcome, suite, testCase)
    suiteReport.cases.push({
      name: testCase.name,
      status: outcome.status,
      durationMs: outcome.durationMs,
      bug: outcome.bug,
      location: outcome.location,
      evidence: outcome.evidence,
      message: outcome.message,
      done: outcome.result?.doneCall?.value,
      timedOut: outcome.result?.timedOut,
      doneAfterMs: outcome.result?.doneAfterMs,
      requests: outcome.result?.requests?.map((r) => ({ method: r.method, url: r.url })),
      errors: outcome.result?.errors?.map((e) => `${e.phase}:${e.name}:${e.message}`),
    })
  }
  print("")

  const { pass, fail, bug, error: errored, skip, cases, coverageProblems } = report.totals
  const bad = fail + bug + errored + coverageProblems
  print(style.bold("— 汇总 —"))
  print(
    `用例 ${cases} 个: ` +
      `${style.pass(`通过 ${pass}`)}, ` +
      `${style.fail(`失败 ${fail}`)}, ` +
      `${style.warn(`已知 bug ${bug}`)}, ` +
      `${style.fail(`用例错误 ${errored}`)}, ` +
      `${style.fail(`覆盖缺失 ${coverageProblems}`)}, ` +
      `${style.dim(`跳过 ${skip}`)}`,
  )
  if (bad) {
    const failingSuites = report.suites
      .map((s) => ({ script: s.script, bad: s.cases.filter((c) => ["FAIL", "BUG", "ERROR"].includes(c.status)) }))
      .filter((s) => s.bad.length)
    for (const s of failingSuites) {
      print(style.fail(`  ✗ ${s.script}.js: ${s.bad.length} 个问题用例`))
    }
  } else {
    print(style.pass("  全部用例通过 ✔"))
  }

  if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n")
  }

  process.exitCode = bad > 0 ? 1 : 0
}

main().catch((error) => {
  console.error(style.fail("runner 崩溃:"), error)
  process.exitCode = 1
})
