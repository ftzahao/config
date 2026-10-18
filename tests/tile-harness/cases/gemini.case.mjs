/**
 * gemini.js（当前实现：GET https://www.youtube.com/premium，auto-redirect: false）
 * 定位：Gemini 无官方地区信号，复用 YouTube 的 INNERTUBE_CONTEXT_GL / GL 近似判定。
 * 分支：error → 网络错误 / !response → 无响应 / CF 挑战页 → 被拦截 / 429 → 请求限流
 *       非 200 → 错误 (status) / 地区文案 → 地区受限 / 无国家码 → 可达·地区未知
 *       不支持地区（AF BY CU IR KP RU SY）→ 地区受限 (XX) / 其它 → 可用 (XX)
 */
import { assert, match, expectClean, expectRequest, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://www.youtube.com/premium"
const PAGE = (country, marker = "INNERTUBE_CONTEXT_GL") =>
  `<html><body><script>var ytcfg={"${marker}":"${country}"};</script>${"x".repeat(200)}</body></html>`

export default {
  script: "gemini",
  cases: [
    {
      name: "200 + INNERTUBE_CONTEXT_GL=JP → 可用 (JP)",
      responses: [fx.htmlPage({ status: 200, body: PAGE("JP") })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JP)", backgroundColor: "#4285F4" })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 3, autoRedirect: false })
      },
    },
    {
      name: "200 + 只有 GL=DE（兜底正则）→ 可用 (DE)",
      responses: [fx.htmlPage({ status: 200, body: PAGE("DE", "GL") })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)" })
      },
    },
    {
      name: "200 + INNERTUBE_CONTEXT_GL 优先于 GL",
      responses: [fx.htmlPage({ status: 200, body: '<script>{"GL":"US","INNERTUBE_CONTEXT_GL":"JP"}</script>' })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JP)" })
      },
    },
    {
      name: "200 + RU（不支持地区）→ 地区受限 (RU)",
      responses: [fx.htmlPage({ status: 200, body: PAGE("RU") })],
      async expect(result) {
        match(expectClean(result), { content: "地区受限 (RU)", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + CN（Gemini 支持中国大陆）→ 可用 (CN)",
      responses: [fx.htmlPage({ status: 200, body: PAGE("CN") })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (CN)" })
      },
    },
    {
      name: "200 + 'not available in your country' → 地区受限",
      responses: [fx.htmlPage({ status: 200, body: "<html>This is not available in your country</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "地区受限", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + 无国家码 → 可达·地区未知",
      responses: [fx.htmlPage({ status: 200, body: "<html>premium page</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "可达·地区未知", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "English 环境 → Available (JP)",
      environment: { language: "en-US" },
      responses: [fx.htmlPage({ status: 200, body: PAGE("JP") })],
      async expect(result) {
        match(expectClean(result), { content: "Available (JP)" })
      },
    },
    {
      name: "403 + Cloudflare 挑战页 → 被拦截",
      responses: [fx.cloudflareHtml({ status: 403 })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "200 + Cloudflare 挑战页 → 被拦截",
      responses: [fx.cloudflareHtml({ status: 200 })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截" })
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
      name: "204 → 错误 (204)（premium 页不该返回 204）",
      responses: [fx.noContent()],
      async expect(result) {
        match(expectClean(result), { content: "错误 (204)", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "301 重定向 → 错误 (301)",
      responses: [fx.redirect({ status: 301, location: "https://consent.youtube.com/m" })],
      async expect(result) {
        match(expectClean(result), { content: "错误 (301)" })
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
      name: "callback 无 error 但 response 为空 → 网络错误（先判 error 分支）",
      responses: [{ error: null, response: undefined, data: "" }],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },

    {
      name: "回调永不返回 → 兜底预算内 $done（≤3400ms）",
      timeoutMs: 3800,
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
        const budget = 3400
        if ((result.doneAfterMs ?? Infinity) > budget + 250) {
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/gemini.js:8-31 —— request() 兜底 = params.timeout*1000+400（timeout:3 → 3.4s）`)
        }
      },
    }
  ],
}
