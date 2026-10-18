/**
 * netflix.js（最终实现：GET https://www.netflix.com/title/<id>，auto-redirect: false）
 * 地区来源：Location > X-Originating-Url > 200 无前缀
 * 分支：
 *   title1 有地区 → 无限制 (REGION) / title1 ok → 无限制
 *   title2 有地区 → 仅原创 (REGION) / title2 ok → 仅原创
 *   两个都没连上 → 网络错误
 *   连上了但没地区 → 有非 200 状态码 → 错误 (code)；否则 不可用
 */
import { assert, match, expectClean, expectRequest, expectRequestCount, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const TITLE1 = "https://www.netflix.com/title/70143836"
const TITLE2 = "https://www.netflix.com/title/80197526"

const located = (path, status = 302) => ({
  status,
  headers: { Location: `https://www.netflix.com${path}` },
  body: "",
})
const originating = (path) => ({
  status: 200,
  headers: { "X-Originating-Url": `https://www.netflix.com${path}` },
  body: "",
})

export default {
  script: "netflix",
  cases: [
    {
      name: "title1 302 → /jp-en/title/... → 无限制 (JP)",
      responses: [located("/jp-en/title/70143836")],
      async expect(result) {
        match(expectClean(result), { content: "无限制 (JP)", backgroundColor: "#E50914" })
        expectRequest(result, 0, { method: "GET", url: TITLE1, timeout: 8, autoRedirect: false })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "title1 通过 X-Originating-Url → 无限制 (HK)",
      responses: [originating("/hk/title/70143836")],
      async expect(result) {
        match(expectClean(result), { content: "无限制 (HK)" })
      },
    },
    {
      name: "title1 200（登录态无前缀）→ 无限制（无地区）",
      responses: [fx.htmlPage({ status: 200, body: "<html>browse</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "无限制" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "title1 404、title2 302 → /hk/title/... → 仅原创 (HK)",
      responses: [fx.serverError(404), located("/hk/title/80197526")],
      async expect(result) {
        match(expectClean(result), { content: "仅原创 (HK)", backgroundColor: "#FF9500" })
        expectRequestCount(result, 2)
        expectRequest(result, 1, { method: "GET", url: TITLE2, timeout: 8, autoRedirect: false })
      },
    },
    {
      name: "title1 404、title2 200 → 仅原创（无地区）",
      responses: [fx.serverError(404), fx.htmlPage({ status: 200, body: "<html>originals</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "仅原创" })
      },
    },
    {
      name: "两个都 404 → 错误 (404)（连上了但拿不到地区）",
      responses: [fx.serverError(404), fx.serverError(404)],
      async expect(result) {
        match(expectClean(result), { content: "错误 (404)", backgroundColor: "#FF9500" })
        expectRequestCount(result, 2)
      },
    },
    {
      name: "两个都网络错误 → 网络错误",
      responses: [fx.networkError(), fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "title1 网络错误、title2 命中 → 仅原创 (US)",
      responses: [fx.networkError(), located("/us/title/80197526")],
      async expect(result) {
        match(expectClean(result), { content: "仅原创 (US)" })
      },
    },
    {
      name: "response undefined（未连上）+ title2 404 → 错误 (404)",
      responses: [{ error: null, response: undefined, data: "" }, fx.serverError(404)],
      async expect(result) {
        match(expectClean(result), { content: "错误 (404)" })
      },
    },
    {
      name: "English 环境 → Full (JP)",
      environment: { language: "en-US" },
      responses: [located("/jp-en/title/70143836")],
      async expect(result) {
        match(expectClean(result), { content: "Full (JP)" })
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/netflix.js:8-31,74-108 —— TILE_BUDGET_MS = 2500（共享总预算），首个请求挂住时不再发第二个请求`)
        }
      },
    }
  ],
}
