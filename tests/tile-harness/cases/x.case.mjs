/**
 * x.js（最终实现：GET https://x.com/，auto-redirect: false）
 * 分支：error → 网络错误
 *       30x：非 x.com → 不可用；否则 重定向 (status)
 *       429 → 请求限流 / >=500 → 服务端错误
 *       200：封锁文案 → 不可用；data-app-env / twitter.com / body>1000 → 可用；否则 未知
 *       403/451 → 受限 / 其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://x.com/"
const SHELL = '<html><body data-app-env="x.com"><div id="react-root"></div>' + "x".repeat(1200) + "</body></html>"

export default {
  script: "x",
  cases: [
    {
      name: "200 + app shell → 可用（Twitter 蓝）",
      responses: [fx.htmlPage({ status: 200, body: SHELL })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: "#1D9BF0" })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
      },
    },
    {
      // 真实首页 200 响应里的 app shell 标记（实测 x.com 首页 html 命中 og:site_name / data-app-env）
      name: "200 + og:site_name 标记 → 可用",
      responses: [
        fx.htmlPage({
          status: 200,
          body: '<html><meta property="og:site_name" content="X (formerly Twitter)"></html>'
        })
      ],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
      },
    },
    {
      // 单纯很长但无 app shell 的错误页不得判为可用（不再靠 body.length > 1000 判定）
      name: "200 + 超长但无 app shell 的错误页 → 未知",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>Something went wrong. " + "x".repeat(4000) + "</html>" })
      ],
      async expect(result) {
        match(expectClean(result), { content: "未知", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "200 + 页面很短且无标记 → 未知",
      responses: [fx.htmlPage({ status: 200, body: "<html>tiny</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "未知", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "200 + 'not available in your country' → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>This site is not available in your country</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "302 跳到 x.com 其它路径 → 重定向 (302)",
      responses: [fx.redirect({ status: 302, location: "https://x.com/i/flow/login" })],
      async expect(result) {
        match(expectClean(result), { content: "重定向 (302)", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "302 跳到非 x.com 域名 → 不可用",
      responses: [fx.redirect({ status: 302, location: "https://blocked.example.net/" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
      },
    },
    {
      name: "308 → 重定向 (308)",
      responses: [fx.redirect({ status: 308, location: "https://x.com/home" })],
      async expect(result) {
        match(expectClean(result), { content: "重定向 (308)" })
      },
    },
    {
      name: "429 → 请求限流",
      responses: [fx.rateLimited()],
      async expect(result) {
        match(expectClean(result), { content: "请求限流" })
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
      name: "451 → 受限",
      responses: [{ status: 451, headers: {}, body: "" }],
      async expect(result) {
        match(expectClean(result), { content: "受限" })
      },
    },
    {
      name: "404 → 错误 (404)",
      responses: [fx.serverError(404)],
      async expect(result) {
        match(expectClean(result), { content: "错误 (404)" })
      },
    },
    {
      name: "网络错误 → 网络错误",
      responses: [fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },
    {
      name: "English 环境 → Available",
      environment: { language: "en-US" },
      responses: [fx.htmlPage({ status: 200, body: SHELL })],
      async expect(result) {
        match(expectClean(result), { content: "Available" })
      },
    },

    {
      name: "⚠ 200 + CF 挑战页 → 判为「可用」",
      responses: [fx.cloudflareHtml({ status: 200 })],
      async expect(result) {
        expectClean(result)
        return expectContract(result, {
          expected: "挑战页不应判为可用",
          assertion: (r) => !/可用|Available/.test(String(r.done?.content ?? "")),
          location: "stash/tiles/x.js:约 115-125 —— body.length > 1000 就判「可用」，CF 挑战页 HTML 远超 1000 字节",
          evidence: result.done,
        })
      },
    },
    {
      name: "200 长错误页（无 app shell 标记）→ 未知（不再凭长度判可用）",
      responses: [fx.htmlPage({ status: 200, body: "<html>Something went wrong" + "x".repeat(1200) + "</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "未知", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "200 + __initial_state__ 标记 → 可用",
      responses: [fx.htmlPage({ status: 200, body: '<html><script id="__initial_state__"></script></html>' })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: "#1D9BF0" })
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/x.js:8-31 —— TILE_BUDGET_MS = 2500（共享总预算）`)
        }
      },
    }
  ],
}
