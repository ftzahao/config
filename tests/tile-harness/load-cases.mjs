/**
 * 用例加载器。
 *
 * 一个 case 文件形如 `cases/<script>.case.mjs`：
 *
 *   export default {
 *     script: "google",          // 被测脚本名（stash/tiles/<script>.js）
 *     cases: [
 *       {
 *         name: "happy path",
 *         responses: [...],       // 见 fixtures.mjs
 *         environment: {...},     // 可选，默认 zh-Hans-CN
 *         route: (params) => ..., // 可选
 *         timeoutMs: 3000,        // 可选
 *         expect(result) { ... }  // 断言；抛 AssertionFailure 即失败
 *       }
 *     ]
 *   }
 *
 * 约定：`expect` 返回 `{ bug: "..." }`（或 `{ todo: true }`）表示"期望的行为与当前实现不符，
 * 我会把当前实现的真实行为记录下来"。run-all 会把这些计为 BUG（而不是 FAIL），
 * 因为它们是"脚本当前已知有问题"的显式记录，修复后需要更新用例。
 */
import fs from "node:fs"
import path from "node:path"
import { HARNESS_DIR, TILES_DIR } from "./harness.mjs"

export const CASES_DIR = path.join(HARNESS_DIR, "cases")

/** 读取全部 case 文件 */
export async function loadCases() {
  if (!fs.existsSync(CASES_DIR)) return []
  const files = fs
    .readdirSync(CASES_DIR)
    .filter((name) => name.endsWith(".case.mjs"))
    .sort()
  const suites = []
  for (const file of files) {
    const mod = await import(path.join(CASES_DIR, file))
    const suite = mod.default ?? mod.suite
    if (!suite || !Array.isArray(suite.cases)) {
      throw new Error(`${file}: 必须导出 default = { script, cases: [...] }`)
    }
    // `script` 可以为数组（横切契约测试一次覆盖全部脚本）；`_` 前缀文件不参与"覆盖检查"
    const script = suite.script || file.replace(/\.case\.mjs$/, "")
    suites.push({
      file,
      script,
      scripts: Array.isArray(script) ? script : [script],
      crossCutting: Boolean(suite.crossCutting) || Array.isArray(script),
      suite,
      cases: suite.cases,
    })
  }
  return suites
}

/** 仓库里实际的 tile 脚本清单（不含测试文件） */
export function listTileScripts() {
  return fs
    .readdirSync(TILES_DIR)
    .filter((name) => name.endsWith(".js"))
    .sort()
}

/**
 * 校验：
 *   1. 每个 tile 脚本都有 case 文件（覆盖检查）
 *   2. case 文件引用的脚本存在
 */
export function validateCoverage(suites) {
  const tiles = listTileScripts()
  const covered = new Set(suites.flatMap((s) => s.scripts))
  const tileNames = new Set(tiles.map((tile) => tile.replace(/\.js$/, "")))
  const missing = tiles.filter((tile) => !covered.has(tile.replace(/\.js$/, "")))
  const orphan = suites.filter((s) => !s.crossCutting && !s.scripts.every((n) => tileNames.has(n))).map((s) => s.file)
  const duplicateScripts = suites
    .filter((s) => !s.crossCutting)
    .map((s) => s.script)
    .filter((name, index, all) => all.indexOf(name) !== index)
  const duplicateNames = []
  for (const s of suites) {
    const seen = new Set()
    for (const c of s.cases) {
      if (seen.has(c.name)) duplicateNames.push(`${s.file} :: ${c.name}`)
      seen.add(c.name)
    }
  }
  const caseCount = suites.reduce((sum, s) => sum + s.cases.length, 0)
  return {
    tiles,
    missingCoverage: missing,
    orphanSuites: orphan,
    duplicateScripts,
    duplicateCaseNames: duplicateNames,
    caseCount,
  }
}
