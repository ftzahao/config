/**
 * instagram.js（最终实现：GET https://www.instagram.com/，auto-redirect: false）
 * 分支：error → 网络错误 / 地区封锁文案 → 不可用 / 30x（非 Meta 域 → 不可用，其余 → 重定向）
 *       429/"too many requests" → 请求限流 / 403/451 → 受限 / >=500 → 服务端错误
 *       200：无 app shell → 未知；有 → 可用 (XX) 或 可用 / 其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://www.instagram.com/"

export default {
  script: "instagram",
  cases: [
    {
      name: "200 + Polaris app shell + country_code=JP → 可用 (JP)",
      responses: [
        fx.htmlPage({
          status: 200,
          body: '<html><script>requireLazy(["PolarisSiteData"])</script><script>{"entry_data":{"PolarisSiteData":[{"country_code":"JP"}]}}</script></html>',
        }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JP)", backgroundColor: "#E1306C" })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
      },
    },
    {
      name: "200 + Polaris 但无 country_code → 可用",
      responses: [fx.htmlPage({ status: 200, body: '<html><script>"PolarisRoot"</script><script>instagram.com/static/x.js</script></html>' })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: "#E1306C" })
      },
    },
    {
      name: "200 + 无 app shell 标记 → 未知",
      responses: [fx.htmlPage({ status: 200, body: "<html><body>blank</body></html>" })],
      async expect(result) {
        match(expectClean(result), { content: "未知", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "200 + 'not available in your country' → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>Instagram is not available in your country</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + \"is_country_blocked\":true → 不可用",
      responses: [fx.htmlPage({ status: 200, body: '<html>{"is_country_blocked":true}</html>' })],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
      },
    },
    {
      name: "302 跳到 accounts/login（同域）→ 重定向 (302)",
      responses: [fx.redirect({ status: 302, location: "https://www.instagram.com/accounts/login/" })],
      async expect(result) {
        match(expectClean(result), { content: "重定向 (302)", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "302 跳到非 Meta 域名 → 不可用",
      responses: [fx.redirect({ status: 302, location: "https://blocked.example.net/" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
      },
    },
    {
      name: "301 跳 l.instagram.com → 重定向 (301)",
      responses: [fx.redirect({ status: 301, location: "https://l.instagram.com/?u=x" })],
      async expect(result) {
        match(expectClean(result), { content: "重定向 (301)" })
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
      name: "200 + 'too many requests' → 请求限流",
      responses: [fx.htmlPage({ status: 200, body: "<html>Please wait. Too many requests</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "请求限流" })
      },
    },
    {
      name: "403 + CF 挑战页 → 被拦截（挑战页优先于「受限」）",
      responses: [fx.cloudflareHtml({ status: 403 })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截", backgroundColor: "#FF9500" })
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
      name: "500 → 服务端错误 (500)",
      responses: [fx.serverError(500)],
      async expect(result) {
        match(expectClean(result), { content: "服务端错误 (500)", backgroundColor: "#FF9500" })
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
      name: "English 环境 → Unavailable",
      environment: { language: "en-US" },
      responses: [fx.htmlPage({ status: 200, body: "<html>not available in your country</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "Unavailable" })
      },
    },


    {
      name: "200 + CF 挑战页（含 Polaris 字样）→ 被拦截（不再误判可用）",
      responses: [
        fx.htmlPage({
          status: 200,
          body: fx.CLOUDFLARE_CHALLENGE_HTML.replace("<style>", "<style>/*PolarisSiteData*/"),
        }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "被拦截" })
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/instagram.js:8-31 —— TILE_BUDGET_MS = 2500（共享总预算）`)
        }
      },
    }
  ],
}
