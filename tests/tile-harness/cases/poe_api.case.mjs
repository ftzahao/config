/**
 * poe_api.js（GET https://api.poe.com/，auto-redirect: false）
 * 定位：「JSON API 端点」判定 —— 没有可看的落地页面，只能看响应内容本身能不能用。
 * 实测（2026-10-18 出口 KR/JP）：403，1.4KB，无挑战特征 → 按模板判「受限」。
 * 与模板的差别只在 200 这一支：必须能 JSON.parse 才算可用，解析失败判「异常」（#FF9500）。
 * 分支：error/无 response → 网络错误
 *       CF 挑战页 → 被拦截
 *       封锁文案 → 不可用 / 451 → 不可用 / 429 → 请求限流 / >=500 → 服务端错误
 *       30x：Location host 不在 DOMAINS → 被拦截 -> host；在 DOMAINS（poe.com 自家）→ 可用
 *       200 + 可解析 JSON → 可用 (JSON 正常)
 *       200 + 解析失败 → 异常 (JSON 解析失败)
 *       403 → 受限 / 其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://api.poe.com/"
const COLOR = "#5D3FD3"
const API_JSON = { error: "Unauthorized", status: 401 }

export default {
  script: "poe_api",
  cases: [
    {
      name: "200 + 可解析 JSON → 可用 (JSON 正常)（Poe 紫）+ 请求形状",
      responses: [fx.json(API_JSON)],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JSON 正常)", backgroundColor: COLOR })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
      },
    },
    {
      name: "English 环境 200 + JSON → Available (JSON OK)",
      environment: { language: "en-US" },
      responses: [fx.json(API_JSON)],
      async expect(result) {
        match(expectClean(result), { content: "Available (JSON OK)", backgroundColor: COLOR })
      },
    },
    {
      // 200 但给的是 HTML 错误页：API 前端 / 网关回错页的典型形态
      name: "200 + 非 JSON body → 异常 (JSON 解析失败)",
      responses: [fx.brokenJson()],
      async expect(result) {
        match(expectClean(result), { content: "异常 (JSON 解析失败)", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "200 + 截断 JSON → 异常 (JSON 解析失败)",
      responses: [fx.truncatedJson()],
      async expect(result) {
        match(expectClean(result), { content: "异常 (JSON 解析失败)", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "200 + 空白 body → 异常 (JSON 解析失败)",
      responses: [fx.emptyBody()],
      async expect(result) {
        match(expectClean(result), { content: "异常 (JSON 解析失败)" })
      },
    },
    {
      name: "200 + JSON 里带 countryCode → 可用 (JSON 正常) (JP)",
      responses: [fx.json({ countryCode: "JP", data: {} })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JSON 正常) (JP)" })
      },
    },
    {
      name: "302 同域跳到 /login（api.poe.com 自己）→ 可用（不是拦截）",
      responses: [fx.redirect({ status: 302, location: "https://api.poe.com/login" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      name: "301 跳到 poe.com 主站（同品牌）→ 可用",
      responses: [fx.redirect({ status: 301, location: "https://poe.com/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
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
      name: "302 同域地区前缀 /ja-jp/ → 可用 (JA)",
      responses: [fx.redirect({ status: 302, location: "https://api.poe.com/ja-jp/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JA)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 同域地区前缀 /de-de/ → 可用 (DE)",
      responses: [fx.redirect({ status: 302, location: "https://api.poe.com/de-de/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)" })
      },
    },
    {
      name: "308 同域地区前缀 /kr-ko/ → 可用 (KR)",
      responses: [fx.redirect({ status: 308, location: "https://api.poe.com/kr-ko/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (KR)" })
      },
    },
    {
      name: "200 + 'not available in your country' → 不可用",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>Poe is not available in your country</html>" }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + 'not available in your region' → 不可用",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>This service is not available in your region</html>" }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + 'isn't available in your region' → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>Poe isn't available in your region</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
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
      // 实测的真实形态：403 + 1.4KB JSON 错误体（无挑战特征）→ 可达但拒绝本次请求
      name: "403（无挑战页特征，实测形态）→ 受限",
      responses: [fx.json({ error: "Forbidden" }, 403)],
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
