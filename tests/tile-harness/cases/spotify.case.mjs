/**
 * spotify.js（最终实现：两级探测 + 共享总预算 TILE_BUDGET_MS = 2500）
 *   1. GET https://www.spotify.com/signup（auto-redirect:false）
 *      → Location / sp_m cookie 取地区；CF 挑战页 → blocked
 *   2. 无地区时 GET https://open.spotify.com/ → appServerConfig 的 base64 JSON（market/country）；CF → blocked
 * 文案：被拦截 / 网络错误 / 可用 (XX) / 可用
 */
import { assert, match, expectClean, expectRequest, expectRequestCount, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const SIGNUP = "https://www.spotify.com/signup"
const OPEN = "https://open.spotify.com/"
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

const openPage = (obj) => {
  const b64 = Buffer.from(JSON.stringify(obj)).toString("base64")
  return fx.htmlPage({
    status: 200,
    body: `<html><body><script id="appServerConfig" type="text/plain">${b64}</script></body></html>`,
  })
}
const redirectTo = (location) => ({ status: 302, headers: { Location: location }, body: "" })

export default {
  script: "spotify",
  cases: [
    {
      name: "signup 302 → /jp/ → 可用 (JP)",
      responses: [redirectTo("https://www.spotify.com/jp/signup/")],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JP)", backgroundColor: "#1DB954" })
        expectRequest(result, 0, { method: "GET", url: SIGNUP, timeout: 8, autoRedirect: false })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "signup 302 → /hk-en/ → 可用 (HK)",
      responses: [redirectTo("https://www.spotify.com/hk-en/")],
      async expect(result) {
        match(expectClean(result), { content: "可用 (HK)" })
      },
    },
    {
      name: "signup 200 + set-cookie sp_m=de → 可用 (DE)",
      responses: [
        // 真实 $httpClient 的 headers 键为小写；脚本直接读 headers["set-cookie"]
        { status: 200, headers: { "set-cookie": "sp_t=abc; Path=/\nsp_m=de; Path=/" }, body: "<html>signup</html>" },
      ],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "signup 无地区 → open.spotify.com market=FR → 可用 (FR)",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>signup</html>" }),
        openPage({ market: "FR", isAnonymous: true }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "可用 (FR)" })
        expectRequestCount(result, 2)
        expectRequest(result, 1, { method: "GET", url: OPEN, timeout: 8 })
      },
    },
    {
      name: "signup 无地区 + open 无 appServerConfig → 可用",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>signup</html>" }),
        fx.htmlPage({ status: 200, body: "<html>open</html>" }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: "#1DB954" })
      },
    },
    {
      name: "signup 无地区 + open 的 base64 不是 JSON → 可用（解析失败兜底）",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>signup</html>" }),
        fx.htmlPage({
          status: 200,
          body: `<script id="appServerConfig">${Buffer.from("not-json").toString("base64")}</script>`,
        }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
      },
    },
    {
      name: "signup 无地区 + open 500 → 可用（无地区）",
      responses: [fx.htmlPage({ status: 200, body: "<html>signup</html>" }), fx.serverError(500)],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
      },
    },
    {
      name: "signup 403（非 200/301/302 且无地区）→ 网络错误",
      responses: [{ status: 403, headers: {}, body: "" }],
      async expect(result) {
        match(expectClean(result), { content: "网络错误", backgroundColor: "#FF9500" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "signup 500 → 网络错误",
      responses: [fx.serverError(500)],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },
    {
      name: "signup 网络错误 → 网络错误（不发第二个请求）",
      responses: [fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "signup 200 + CF 挑战页 → 被拦截",
      responses: [fx.cloudflareHtml({ status: 200 })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截", backgroundColor: "#FF9500" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "signup 403 + CF 挑战页 → 被拦截",
      responses: [fx.cloudflareHtml({ status: 403 })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截" })
      },
    },
    {
      name: "signup 无地区 + open 返回 CF 挑战页 → 被拦截",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>signup</html>" }),
        fx.cloudflareHtml({ status: 403 }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "被拦截" })
        expectRequestCount(result, 2)
      },
    },
    {
      name: "请求带 UA + Accept-Language: en + auto-redirect:false",
      responses: [redirectTo("https://www.spotify.com/us/")],
      async expect(result) {
        expectClean(result)
        expectRequest(result, 0, {
          autoRedirect: false,
          headersInclude: { "Accept-Language": "en", "User-Agent": UA },
        })
      },
    },
    {
      name: "English 环境 → Available (JP)",
      environment: { language: "en-US" },
      responses: [redirectTo("https://www.spotify.com/jp/")],
      async expect(result) {
        match(expectClean(result), { content: "Available (JP)" })
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/spotify.js:8,11-40 —— TILE_BUDGET_MS = 2500（共享总预算）`)
        }
      },
    }
  ],
}
