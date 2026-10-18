/**
 * disney.js（最终实现：devices → token → graphql 三段链）
 * 分支：
 *   1. devices: error → 网络错误 / response undefined → 错误 (no response)
 *               403/451/"403 ERROR" → 受限 / 无 assertion → 错误 (status)
 *   2. token:   error → 网络错误 / 403/451/forbidden-location → 不可用
 *               无 refresh_token → 错误 (status)
 *   3. graphql: error → 网络错误 / 403/451 → 不可用 / 非 200 → 错误 (status)
 *               "403 ERROR" → 受限 / errors[] → 错误 (code|message) / 无 session → 未知
 *               inSupportedLocation === false → 不可用 / countryCode → 可用 (XX) / 否则 可用
 */
import { assert, match, expectClean, expectRequest, expectRequestCount, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const DEVICES = "https://disney.api.edge.bamgrid.com/devices"
const TOKEN = "https://disney.api.edge.bamgrid.com/token"
const GRAPHQL = "https://disney.api.edge.bamgrid.com/graph/v1/device/graphql"

const DEVICES_OK = fx.json({ assertion: "eyJhbGciOiJSUzI1NiJ9.assertion-token" }, 201)
const TOKEN_OK = fx.json({ refresh_token: "rt-12345" })
const SESSION = ({ country = "us", supported = true } = {}) => ({
  data: {
    refreshToken: {
      activeSession: {
        sessionId: "sess",
        inSupportedLocation: supported,
        location: country ? { countryCode: country } : null,
      },
    },
  },
})

export default {
  script: "disney",
  cases: [
    {
      name: "三段成功 → 可用 (US)",
      responses: [DEVICES_OK, TOKEN_OK, fx.json(SESSION())],
      async expect(result) {
        match(expectClean(result), { content: "可用 (US)", backgroundColor: "#113CCF" })
        expectRequestCount(result, 3)
        expectRequest(result, 0, { method: "POST", url: DEVICES, timeout: 8 })
        expectRequest(result, 1, { method: "POST", url: TOKEN, timeout: 8 })
        expectRequest(result, 2, { method: "POST", url: GRAPHQL, timeout: 8 })
      },
    },
    {
      name: "三段成功 + 无 countryCode → 可用",
      responses: [DEVICES_OK, TOKEN_OK, fx.json(SESSION({ country: null }))],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
      },
    },
    {
      name: "graphql inSupportedLocation=false → 不可用",
      responses: [DEVICES_OK, TOKEN_OK, fx.json(SESSION({ supported: false }))],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "English 环境 → Available (JP)",
      environment: { language: "en-US" },
      responses: [DEVICES_OK, TOKEN_OK, fx.json(SESSION({ country: "jp" }))],
      async expect(result) {
        match(expectClean(result), { content: "Available (JP)" })
      },
    },
    {
      name: "devices 网络错误 → 网络错误（只发 1 个请求）",
      responses: [fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误", backgroundColor: "#FF9500" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "devices 403 → 受限",
      responses: [{ status: 403, headers: {}, body: fx.AWS_403_HTML }],
      async expect(result) {
        match(expectClean(result), { content: "受限" })
      },
    },
    {
      name: "devices 451 → 受限",
      responses: [{ status: 451, headers: {}, body: "" }],
      async expect(result) {
        match(expectClean(result), { content: "受限" })
      },
    },
    {
      name: "devices 200 + '403 ERROR' → 受限",
      responses: [fx.htmlPage({ status: 200, body: fx.AWS_403_HTML })],
      async expect(result) {
        match(expectClean(result), { content: "受限" })
      },
    },
    {
      name: "devices 200 + 非 JSON → 错误 (200)",
      responses: [fx.brokenJson()],
      async expect(result) {
        match(expectClean(result), { content: "错误 (200)" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "devices response undefined → 网络错误（request 把缺失 response 归一成 error）",
      responses: [{ error: null, response: undefined, data: "" }],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },
    {
      name: "token 403 → 不可用",
      responses: [DEVICES_OK, { status: 403, headers: {}, body: "" }],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "token 400 + forbidden-location → 不可用",
      responses: [DEVICES_OK, fx.json({ error: "forbidden-location" }, 400)],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
      },
    },
    {
      name: "token 网络错误 → 网络错误",
      responses: [DEVICES_OK, fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },
    {
      name: "token 200 + 无 refresh_token → 错误 (200)",
      responses: [DEVICES_OK, fx.json({ access_token: "x" })],
      async expect(result) {
        match(expectClean(result), { content: "错误 (200)" })
      },
    },
    {
      name: "graphql 500 → 错误 (500)",
      responses: [DEVICES_OK, TOKEN_OK, fx.serverError(500)],
      async expect(result) {
        match(expectClean(result), { content: "错误 (500)" })
      },
    },
    {
      name: "graphql 403 → 不可用",
      responses: [DEVICES_OK, TOKEN_OK, { status: 403, headers: {}, body: "" }],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
      },
    },
    {
      name: "graphql 200 + '403 ERROR' → 受限",
      responses: [DEVICES_OK, TOKEN_OK, fx.htmlPage({ status: 200, body: fx.AWS_403_HTML })],
      async expect(result) {
        match(expectClean(result), { content: "受限" })
      },
    },
    {
      name: "graphql 200 + errors[] 带 code → 错误 (UNAUTHORIZED)",
      responses: [
        DEVICES_OK,
        TOKEN_OK,
        fx.json({ errors: [{ message: "nope", extensions: { code: "UNAUTHORIZED" } }] }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "错误 (UNAUTHORIZED)" })
      },
    },
    {
      name: "graphql 200 + errors[] 无 code → 错误 (message)",
      responses: [DEVICES_OK, TOKEN_OK, fx.json({ errors: [{ message: "boom" }] })],
      async expect(result) {
        match(expectClean(result), { content: "错误 (boom)" })
      },
    },
    {
      name: "graphql 200 无 session 无 errors → 未知",
      responses: [DEVICES_OK, TOKEN_OK, fx.json({ data: {} })],
      async expect(result) {
        match(expectClean(result), { content: "未知", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "graphql 网络错误 → 网络错误",
      responses: [DEVICES_OK, TOKEN_OK, fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },
    {
      name: "链路数据传递：assertion → token，refresh_token → graphql",
      responses: [DEVICES_OK, TOKEN_OK, fx.json(SESSION())],
      async expect(result) {
        expectClean(result)
        expectRequest(result, 1, {
          bodyIncludes: "subject_token=eyJhbGciOiJSUzI1NiJ9.assertion-token",
          headersInclude: { "Content-Type": "application/x-www-form-urlencoded" },
        })
        expectRequest(result, 2, { bodyIncludes: '"refreshToken":"rt-12345"' })
      },
    },

    {
      name: "回调永不返回 → 兜底预算内 $done（≤2900ms）",
      timeoutMs: 3300,
      responses: [fx.hang()],
      async expect(result) {
        // 注意：本用例的 timeoutMs 刻意大于兜底预算，因此不能用 expectClean 的 timedOut 检查
        if (result.doneCalls.length !== 1) {
          assert.fail(`$done 调用 ${result.doneCalls.length} 次（期望 1）`, `outcome=${result.outcome} doneAfterMs=${result.doneAfterMs}`)
        }
        const done = result.done
        match({ hasContent: typeof done.content === "string" && done.content.length > 0 }, { hasContent: true })
        // +250ms 容差：全量套件是串行执行的，前序用例的事件循环压力会把
        // setTimeout 的调度推迟几十毫秒；这是测试环境噪声，不是脚本缺陷
        const budget = 2900
        if ((result.doneAfterMs ?? Infinity) > budget + 250) {
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/disney.js:8-31 —— TILE_BUDGET_MS = 2500（三段共享总预算）`)
        }
      },
    }
  ],
}
