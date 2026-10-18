/**
 * claude.js（最终实现：GET https://platform.claude.com/login，auto-redirect: false）
 * 分支：error → 网络错误 / !response → 无响应 / CF 挑战页(200/403/503) → 被拦截
 *       429 → 请求限流 / 30x → 可用 -> <host> / 其它非 200 → 错误 (status)
 *       200 + "ipCountry":"XX" → 被封锁 (XX) 或 可用 (XX)；无字段 → 可用
 */
import { assert, match, expectClean, expectRequest, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://platform.claude.com/login"
const PAGE = (country) =>
  `<!DOCTYPE html><html><head><script>window.__CFG__={"ipCountry":"${country}"};</script></head><body>Log in to Claude</body></html>`

export default {
  script: "claude",
  cases: [
    {
      name: "200 + ipCountry=JP → 可用 (JP)",
      responses: [fx.htmlPage({ status: 200, body: PAGE("JP") })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JP)", backgroundColor: "#D97757" })
        expectRequest(result, 0, { method: "GET", url: URL, autoRedirect: false })
      },
    },
    {
      name: "200 + 转义形式 ipCountry → 可用 (DE)",
      responses: [
        fx.htmlPage({ status: 200, body: '<script>const c = {"cfg":"{\\"ipCountry\\":\\"DE\\"}"}</script>' }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)" })
      },
    },
    {
      name: "200 + ipCountry=CN → 被封锁 (CN)",
      responses: [fx.htmlPage({ status: 200, body: PAGE("CN") })],
      async expect(result) {
        match(expectClean(result), { content: "被封锁 (CN)", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 English 环境 → Available (JP)",
      environment: { language: "en-US" },
      responses: [fx.htmlPage({ status: 200, body: PAGE("JP") })],
      async expect(result) {
        match(expectClean(result), { content: "Available (JP)" })
      },
    },
    {
      name: "200 但页面无 ipCountry → 可用（结构变更兜底）",
      responses: [fx.htmlPage({ status: 200, body: "<html><body>Login</body></html>" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: "#D97757" })
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
      name: "302 跳到 platform.claude.com → 可用 -> platform.claude.com",
      responses: [fx.redirect({ status: 302, location: "https://platform.claude.com/login?from=console" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 -> platform.claude.com" })
      },
    },
    {
      name: "301 无 location header → 可用 -> ?",
      responses: [{ status: 301, headers: {}, body: "" }],
      async expect(result) {
        match(expectClean(result), { content: "可用 -> ?" })
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
      name: "451 → 错误 (451)",
      responses: [{ status: 451, headers: {}, body: "Unavailable For Legal Reasons" }],
      async expect(result) {
        match(expectClean(result), { content: "错误 (451)", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "网络错误 → 网络错误",
      responses: [fx.networkError(fx.NETWORK_ERRORS.dns)],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },

    {
      name: "302 跳到 Anthropic 体系外域名 → 被拦截 -> blocked.example.com",
      responses: [fx.redirect({ status: 302, location: "https://blocked.example.com/" })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截 -> blocked.example.com", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "302 跳到 claude.ai（体系内）→ 可用 -> claude.ai",
      responses: [fx.redirect({ status: 302, location: "https://claude.ai/login" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 -> claude.ai", backgroundColor: "#D97757" })
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/claude.js:8-31 —— request() 兜底 = params.timeout*1000+400（本脚本 timeout:3 → 3.4s）`)
        }
      },
    }
  ],
}
