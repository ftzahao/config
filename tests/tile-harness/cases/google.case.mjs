/**
 * google.js（当前实现：GET https://www.google.com/generate_204，auto-redirect: false）
 * 定位：只测「通用连通性」，不做地区判定。
 * 分支：error → 网络错误 / !response → 无响应 / 204 → 可用 / CF 挑战页 → 被拦截
 *       429 → 请求限流 / 30x → 重定向 <host> / 200 → 异常 (200) / 其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://www.google.com/generate_204"

export default {
  script: "google",
  cases: [
    {
      name: "204 → 可用（Google 蓝）",
      responses: [fx.noContent()],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: "#4285F4" })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 3, autoRedirect: false })
      },
    },
    {
      name: "204 English 环境 → Available",
      environment: { language: "en-US" },
      responses: [fx.noContent()],
      async expect(result) {
        match(expectClean(result), { content: "Available" })
      },
    },
    {
      name: "200 + 中间设备改写的 body → 异常 (200)",
      responses: [fx.htmlPage({ status: 200, body: "<html>captcha</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "异常 (200)", backgroundColor: "#FF9500" })
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
      name: "503 + Cloudflare 挑战页 → 被拦截",
      responses: [fx.cloudflareHtml({ status: 503 })],
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
      name: "301 → consent.google.com → 重定向 consent.google.com",
      responses: [fx.redirect({ status: 301, location: "https://consent.google.com/m" })],
      async expect(result) {
        match(expectClean(result), { content: "重定向 consent.google.com", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "302 → www.google.cn → 重定向 www.google.cn",
      responses: [fx.redirect({ status: 302, location: "https://www.google.cn/" })],
      async expect(result) {
        match(expectClean(result), { content: "重定向 www.google.cn" })
      },
    },
    {
      name: "30x 无 Location → 重定向 (302)",
      responses: [{ status: 302, headers: {}, body: "" }],
      async expect(result) {
        match(expectClean(result), { content: "重定向 (302)" })
      },
    },
    {
      name: "500 → 错误 (500)",
      responses: [fx.serverError(500)],
      async expect(result) {
        match(expectClean(result), { content: "错误 (500)" })
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
      name: "网络错误（超时）→ 网络错误",
      responses: [fx.networkError(fx.NETWORK_ERRORS.timeout)],
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/google.js:8-31 —— request() 兜底 = params.timeout*1000+400（timeout:3 → 3.4s）`)
        }
      },
    }
  ],
}
