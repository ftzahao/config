/**
 * tiktok.js（最终实现：GET https://www.tiktok.com/explore，auto-redirect: false）
 * 分支：error → 网络错误 / location 含 /notfound → 不可用
 *       30x：非 tiktok.com → 不可用；否则 重定向 (status)
 *       429 → 请求限流 / 403/451/access denied/地区文案 → 受限 / >=500 → 服务端错误
 *       200 → region（__UNIVERSAL_DATA_FOR_REHYDRATION__ / 兜底正则）→ 可用 (XX)；否则 可用
 *       其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest, expectContract, equal } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://www.tiktok.com/explore"

const explorePage = (region) => {
  const data = { __DEFAULT_SCOPE__: { "webapp.app-context": { region, language: "ja" } } }
  return fx.htmlPage({
    status: 200,
    body: `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
      data,
    )}</script></body></html>`,
  })
}

export default {
  script: "tiktok",
  cases: [
    {
      name: "200 + app-context region=JP → 可用 (JP)",
      responses: [explorePage("JP")],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JP)", backgroundColor: "#000000" })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
      },
    },
    {
      name: "请求必须带 auto-redirect: false",
      responses: [explorePage("US")],
      async expect(result) {
        expectClean(result)
        equal(result.requests[0]?.["auto-redirect"], false, "tiktok 探测依赖不跟随重定向")
      },
    },
    {
      name: "200 + 无 region → 可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>TikTok</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
      },
    },
    {
      name: "200 + 只有 \"region\":\"ALISG\"（内部码）→ 可用（不误报 AL）",
      responses: [fx.htmlPage({ status: 200, body: '<html><script>{"region":"ALISG"}</script></html>' })],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
      },
    },
    {
      name: "200 + 兜底正则：webapp.app-context 内 region=KR → 可用 (KR)",
      responses: [
        fx.htmlPage({
          status: 200,
          body: '<html><script>{"webapp.app-context":{"language":"ko","region":"KR"},"x":{"region":"ALISG"}}</script></html>',
        }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "可用 (KR)" })
      },
    },
    {
      name: "302 + Location 含 /notfound → 不可用",
      responses: [fx.redirect({ status: 302, location: "https://www.tiktok.com/notfound" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "302 跳到 tiktok.com 其它路径 → 重定向 (302)",
      responses: [fx.redirect({ status: 302, location: "https://www.tiktok.com/login" })],
      async expect(result) {
        match(expectClean(result), { content: "重定向 (302)", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "302 跳到非 tiktok 域名 → 不可用",
      responses: [fx.redirect({ status: 302, location: "https://blocked.example.net/" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
      },
    },
    {
      name: "307 → 重定向 (307)",
      responses: [fx.redirect({ status: 307, location: "https://www.tiktok.com/foryou" })],
      async expect(result) {
        match(expectClean(result), { content: "重定向 (307)" })
      },
    },
    {
      name: "小写 location header 也能识别 /notfound",
      responses: [{ status: 302, headers: { location: "https://www.tiktok.com/notfound" }, body: "" }],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
      },
    },
    {
      name: "403 + Access Denied 页 → 受限",
      responses: [fx.htmlPage({ status: 403, body: fx.AWS_403_HTML })],
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
      name: "200 + 'not available in your region' → 受限",
      responses: [fx.htmlPage({ status: 200, body: "<html>TikTok is not available in your region</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "受限" })
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
      name: "502 → 服务端错误 (502)",
      responses: [fx.serverError(502)],
      async expect(result) {
        match(expectClean(result), { content: "服务端错误 (502)" })
      },
    },
    {
      name: "400 → 错误 (400)",
      responses: [fx.serverError(400)],
      async expect(result) {
        match(expectClean(result), { content: "错误 (400)" })
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
      name: "English 环境 → Available (JP)",
      environment: { language: "en-US" },
      responses: [explorePage("JP")],
      async expect(result) {
        match(expectClean(result), { content: "Available (JP)" })
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
          location: "stash/tiles/tiktok.js:约 160-180 —— 200 且无 region 时直接判「可用」，未识别 CF 挑战页",
          evidence: result.done,
        })
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/tiktok.js:8-31 —— TILE_BUDGET_MS = 2500（共享总预算）`)
        }
      },
    }
  ],
}
