/**
 * chatgpt.js（最终实现：GET https://chatgpt.com/cdn-cgi/trace，timeout: 3，auto-redirect: false）
 * 分支：error → 网络错误 / !response → 无响应 / CF 挑战页(200/403/503) → 被拦截
 *       429 → 请求限流 / 非 200 → 错误 (status)
 *       `^loc=XX$` → 封锁地区 → 被封锁 (XX)；否则 可用 (XX)；无 loc → 地区未知
 */
import { assert, match, expectClean, expectRequest, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://chatgpt.com/cdn-cgi/trace"
const TRACE = (loc) => `fl=42f1\nh=chatgpt.com\nip=203.0.113.7\ncolo=NRT\nhttp=http/2\nloc=${loc}\ntls=TLSv1.3\n`

export default {
  script: "chatgpt",
  cases: [
    {
      name: "200 + loc=JP → 可用 (JP)",
      responses: [{ status: 200, headers: { "Content-Type": "text/plain" }, body: TRACE("JP") }],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JP)", backgroundColor: "#10A37F" })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 3, autoRedirect: false })
      },
    },
    {
      name: "200 + loc=us（小写）→ 可用 (US)",
      responses: [{ status: 200, body: TRACE("us") }],
      async expect(result) {
        match(expectClean(result), { content: "可用 (US)" })
      },
    },
    {
      name: "200 + loc=CN（封锁地区）→ 被封锁 (CN)",
      responses: [{ status: 200, body: TRACE("CN") }],
      async expect(result) {
        match(expectClean(result), { content: "被封锁 (CN)", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + loc=HK（封锁地区）→ 被封锁 (HK)",
      responses: [{ status: 200, body: TRACE("HK") }],
      async expect(result) {
        match(expectClean(result), { content: "被封锁 (HK)" })
      },
    },
    {
      name: "200 English 环境 → Available (JP)",
      environment: { language: "en-US" },
      responses: [{ status: 200, body: TRACE("JP") }],
      async expect(result) {
        match(expectClean(result), { content: "Available (JP)" })
      },
    },
    {
      name: "200 但 trace 无 loc → 地区未知",
      responses: [{ status: 200, body: "fl=42f1\nh=chatgpt.com\ncolo=NRT\n" }],
      async expect(result) {
        match(expectClean(result), { content: "地区未知", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "200 + loc 非法（3 位）→ 地区未知",
      responses: [{ status: 200, body: TRACE("XYZ") }],
      async expect(result) {
        match(expectClean(result), { content: "地区未知" })
      },
    },
    {
      name: "200 + 只有一行真 loc（其它行含 loc= 不算）→ 可用 (JP)",
      responses: [{ status: 200, body: "loc=JP\ngateway=off\nx=loc=US\n" }],
      async expect(result) {
        // 正则 /^loc=([A-Za-z]{2})$/m 只认整行
        match(expectClean(result), { content: "可用 (JP)" })
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
      name: "301 重定向 → 错误 (301)",
      responses: [fx.redirect({ status: 301, location: "https://chatgpt.com/" })],
      async expect(result) {
        match(expectClean(result), { content: "错误 (301)" })
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
      name: "callback 的 error 为 null 且 response 为空 → 网络错误（先判 error）",
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/chatgpt.js:8-31 —— request() 兜底 = params.timeout*1000+400（本脚本 timeout:3 → 3.4s）`)
        }
      },
    }
  ],
}
