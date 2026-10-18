/**
 * 用例公共辅助：把"每个 Tile 都必须满足的硬约束"抽出来，
 * 使各 case 文件只关心业务分支本身。
 *
 * 硬约束（Tile 契约）：
 *   1. 脚本必须在超时前调用且只调用一次 $done（Tile 必须释放资源）。
 *   2. 不得有未捕获异常 / 未处理 rejection / 夹层错误。
 *   3. $done 参数必须是对象。
 *   4. 所有 response 夹具都应被消费（反之说明请求没发出或发多了）。
 */
import * as assert from "./assert.mjs"

export { assert }

/**
 * 断言一次运行"收敛良好"（未挂起、无异常、恰好一次 $done）。
 * @returns {object} doneCalls[0].value
 */
export function expectClean(result, label = "") {
  const prefix = label ? `[${label}] ` : ""
  if (result.errors.length) {
    const lines = result.errors.map(
      (e) => `[${e.phase}] ${e.name}: ${e.message}${e.stack ? `\n${indent(firstFrames(e.stack))}` : ""}`,
    )
    assert.fail(`${prefix}脚本抛出未捕获异常`, lines.join("\n"))
  }
  if (result.timedOut) {
    assert.fail(
      `${prefix}脚本挂起：$done 未在 ${result.options.timeoutMs}ms 内调用`,
      `outcome=${result.outcome}  hungRequest=${result.hungRequest}  已发起请求=${result.requests.length}\n` +
        `已记录 $done ${result.doneCalls.length} 次`,
    )
  }
  if (result.doneCalls.length === 0) {
    assert.fail(
      `${prefix}脚本未调用 $done`,
      `outcome=${result.outcome}  已发起请求=${result.requests.length}（对 Tile 脚本来说这是资源泄漏）`,
    )
  }
  if (result.doneCalls.length > 1) {
    assert.fail(
      `${prefix}脚本调用了 $done ${result.doneCalls.length} 次（应当只调用一次）`,
      assert.stringify(result.doneCalls.map((c) => ({ index: c.index, value: c.value }))),
    )
  }
  if (result.doneCall.valueType !== "object" && result.doneCall.valueType !== "undefined") {
    assert.fail(`${prefix}$done 参数必须为对象`, `实际类型: ${result.doneCall.valueType}`)
  }
  return result.done
}

/** 断言请求次数 */
export function expectRequestCount(result, expected, label = "") {
  assert.equal(result.requests.length, expected, `${label ? `[${label}] ` : ""}请求次数不符`)
}

/** 断言第 n 个请求的方法 + URL */
export function expectRequest(result, index, { method, url, timeout, autoRedirect, bodyIncludes, headersInclude }, label = "") {
  const request = result.requests[index]
  const prefix = label ? `[${label}] ` : ""
  if (!request) assert.fail(`${prefix}缺少第 ${index + 1} 个请求`, `实际共 ${result.requests.length} 个请求`)
  const actual = {
    method: request.method,
    url: request.url,
    timeout: request.timeout,
    "auto-redirect": request["auto-redirect"],
  }
  const expected = { method, url, timeout, "auto-redirect": autoRedirect }
  for (const key of Object.keys(expected)) {
    if (expected[key] !== undefined) {
      assert.equal(actual[key], expected[key], `${prefix}请求 #${index + 1} 的 ${key} 不符`)
    }
  }
  if (bodyIncludes !== undefined) {
    assert.includes(request.body, bodyIncludes, `${prefix}请求 #${index + 1} 的 body 未包含期望内容`)
  }
  if (headersInclude) {
    for (const [name, value] of Object.entries(headersInclude)) {
      assert.equal(request.headers?.[name], value, `${prefix}请求 #${index + 1} 的 header "${name}" 不符`)
    }
  }
}

/**
 * 断言场景下"不应当成功"：即 content 不含"可用/Available"这类肯定文案。
 * 用于 HTML 拦截页 / 错误响应这类关键场景 —— 拦截页被误判为“可用”是严重 bug。
 */
export function expectNotAvailable(done, label = "") {
  const content = String(done?.content ?? "")
  if (/可用|Available/.test(content)) {
    assert.fail(
      `[${label}] 拦截/异常页面被误判为「可用」`,
      `content = ${assert.stringify(content)}\n` +
        `backgroundColor = ${assert.stringify(done?.backgroundColor)}`,
    )
  }
}

function firstFrames(stack) {
  return String(stack)
    .split("\n")
    .slice(0, 4)
    .join("\n")
}

const indent = (text) => text.replace(/^/gm, "    ")

/** 打印一个紧凑的请求日志，方便失败时排查 */
export function describeRequests(result) {
  if (!result.requests.length) return "(无请求)"
  return result.requests
    .map((r, i) => `#${i + 1} ${r.method} ${r.url}${r.responded ? "" : " (未响应)"}`)
    .join("\n")
}

/**
 * "契约"断言：描述**期望的正确行为**，但被测脚本当前可能不满足。
 *
 * 与普通断言的差别：不满足时不 FAIL，而是返回 `{ bug, location, evidence }`，
 * 由 run-all 计为 BUG 并附上真实行为与定位。这样测试套件既能"全绿不骗人"，
 * 又能把已知问题显式登记出来，修复脚本后用例会自动转为 PASS。
 *
 * @param {object} result runTileScript 的返回值
 * @param {{expected: string, assertion: (r) => boolean, location: string, evidence?: any}} spec
 */
export function expectContract(result, spec) {
  let passed = false
  let assertionError
  try {
    passed = Boolean(spec.assertion(result))
  } catch (error) {
    assertionError = error
  }
  if (passed) return { passed: true }
  return {
    bug: `期望：${spec.expected}，但当前实现不满足${assertionError ? `（断言抛错：${assertionError.message}）` : ""}`,
    location: spec.location,
    evidence:
      spec.evidence !== undefined
        ? spec.evidence
        : {
            done: result?.doneCall?.value ?? "<未调用 $done>",
            doneCalls: result?.doneCalls?.length ?? 0,
            timedOut: result?.timedOut,
            outcome: result?.outcome,
          },
  }
}

/* 便捷再导出：用例文件只需 import 自 "../support.mjs" */
export const match = assert.match
export const equal = assert.equal
export const ok = assert.ok
export const notOk = assert.notOk
export const includes = assert.includes
export const lengthOf = assert.lengthOf
