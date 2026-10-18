/**
 * npm.js（GET https://registry.npmjs.org/，auto-redirect: false）
 * 定位：「域名落地」判定 —— 服务端把请求路由到哪个站点/地区，就是该出口的真实可用性。
 * 分支：error/无 response → 网络错误
 *       CF 挑战页 → 被拦截
 *       封锁文案 → 不可用 / 451 → 不可用 / 429 → 请求限流 / >=500 → 服务端错误
 *       30x：Location host 不在 DOMAINS → 被拦截 -> host
 *            在 DOMAINS + 首段是地区码 → 可用 (REGION)
 *            在 DOMAINS + 首段不是地区码 → 可用
 *       200 + 可解析 JSON → 可用（JSON 端点专化）
 *       200 + 不可解析（中间设备改写）→ 异常（JSON 端点专化，绝不判可用）
 *       403 → 受限 / 其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://registry.npmjs.org/"
const COLOR = "#CB3837"
// 实测 2026-10-18：registry 根路径返回 "{}"（2 字节）；历史上也可能返回 db_name，两种都算可用
const REGISTRY_JSON = { db_name: "registry" }

export default {
  script: "npm",
  cases: [
    {
      name: "200 + 合法 JSON → 可用（npm 红）",
      responses: [fx.json(REGISTRY_JSON)],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
      },
    },
    {
      // 实测的真实 body：只有 "{}"，同样合法可解析 → 可用
      name: "200 + 实测 body {} → 可用",
      responses: [fx.json({})],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      name: "English 环境 200 + 合法 JSON → Available",
      environment: { language: "en-US" },
      responses: [fx.json(REGISTRY_JSON)],
      async expect(result) {
        match(expectClean(result), { content: "Available", backgroundColor: COLOR })
      },
    },
    {
      // 关键用例：公司网关/运营商把 body 换成 HTML 但保留 200 —— 不能判可用
      name: "200 + body 是 HTML（中间设备改写）→ 异常",
      responses: [fx.htmlPage({ status: 200, body: "<html>captcha</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "异常", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "English 环境 200 + body 是 HTML → Unexpected",
      environment: { language: "en-US" },
      responses: [fx.htmlPage({ status: 200, body: "<html>captcha</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "Unexpected", backgroundColor: "#FF9500" })
      },
    },
    {
      // 截断的 JSON 以 { 开头，只看首字符会误判 —— 必须整体 JSON.parse
      name: "200 + 截断的 JSON → 异常",
      responses: [fx.truncatedJson('{"db_name": "regis')],
      async expect(result) {
        match(expectClean(result), { content: "异常", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "301 同域跳到 /-/ping → 可用",
      responses: [fx.redirect({ status: 301, location: "https://registry.npmjs.org/-/ping" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      // 官网/文档在 npmjs.com，属业务域名
      name: "302 同域跳到 docs.npmjs.com → 可用",
      responses: [fx.redirect({ status: 302, location: "https://docs.npmjs.com/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      name: "302 跳到陌生域名 → 被拦截 -> host",
      responses: [fx.redirect({ status: 302, location: "https://blocked.example.net/" })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截 -> blocked.example.net", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "301 跳到陌生域名（大小写混写）→ 被拦截 -> Host 小写",
      responses: [fx.redirect({ status: 301, location: "https://Redirect.Example.NET/x" })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截 -> redirect.example.net" })
      },
    },
    {
      name: "302 跳到同域地区前缀 /ja-jp/ → 可用 (JA)",
      responses: [fx.redirect({ status: 302, location: "https://npmjs.org/ja-jp/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JA)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 跳到同域地区前缀 /de-de/ → 可用 (DE)",
      responses: [fx.redirect({ status: 302, location: "https://npmjs.org/de-de/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 跳到同域地区前缀 /kr-ko/ → 可用 (KR)",
      responses: [fx.redirect({ status: 302, location: "https://npmjs.org/kr-ko/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (KR)", backgroundColor: COLOR })
      },
    },
    {
      name: "200 + 'not available in your region' → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>npm isn't available in your region</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + 'not available in your country' → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>This service is not available in your country</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "451 → 不可用",
      responses: [{ status: 451, headers: {}, body: "" }],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + Cloudflare 挑战页 → 被拦截（绝不判可用）",
      responses: [fx.cloudflareHtml({ status: 200 })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "403 + Cloudflare 挑战页 → 被拦截",
      responses: [fx.cloudflareHtml({ status: 403 })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截" })
      },
    },
    {
      name: "429 → 请求限流",
      responses: [fx.rateLimited()],
      async expect(result) {
        match(expectClean(result), { content: "请求限流", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "503 → 服务端错误 (503)",
      responses: [fx.serverError(503)],
      async expect(result) {
        match(expectClean(result), { content: "服务端错误 (503)" })
      },
    },
    {
      name: "403（无挑战页特征）→ 受限",
      responses: [{ status: 403, headers: {}, body: "<html>Forbidden</html>" }],
      async expect(result) {
        match(expectClean(result), { content: "受限", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "404 → 错误 (404)",
      responses: [fx.serverError(404)],
      async expect(result) {
        match(expectClean(result), { content: "错误 (404)", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "网络错误 → 网络错误",
      responses: [fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "callback 无 error 但 response 为空 → 网络错误",
      responses: [fx.emptyResponse()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },
    {
      name: "回调永不返回 → 兜底预算内 $done（≤2750ms）",
      timeoutMs: 3300,
      responses: [fx.hang()],
      async expect(result) {
        if (result.doneCalls.length !== 1) {
          assert.fail(
            `$done 调用 ${result.doneCalls.length} 次（期望 1）`,
            `outcome=${result.outcome} doneAfterMs=${result.doneAfterMs}`,
          )
        }
        match({ hasContent: typeof result.done.content === "string" && result.done.content.length > 0 }, { hasContent: true })
        // +250ms 容差吸收事件循环抖动；预算来自 TILE_BUDGET_MS = 2500
        if ((result.doneAfterMs ?? Infinity) > 2750) {
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 2500ms+250ms`)
        }
      },
    },
  ],
}
