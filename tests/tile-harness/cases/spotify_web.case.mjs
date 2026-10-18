/**
 * spotify_web.js（GET https://open.spotify.com/，auto-redirect: false）
 * 定位：「域名落地」判定 —— 服务端把请求路由到哪个站点/地区，就是该出口的真实可用性。
 * 分支：error/无 response → 网络错误
 *       CF 挑战页 → 被拦截
 *       封锁文案 → 不可用 / 451 → 不可用 / 429 → 请求限流 / >=500 → 服务端错误
 *       30x：Location host 不在 DOMAINS → 被拦截 -> host
 *            在 DOMAINS + 首段是地区码 → 可用 (REGION)
 *            在 DOMAINS + 首段不是地区码 → 可用
 *       200 → 可用 / 403 → 受限 / 其它 → 错误 (status)
 * 本服务特有的形态：open.spotify.com 未登录会 302 到 /intl-de/ 这类地区路径或同域登录页；
 * Web Player 与账号域（accounts./www.spotify.com）同属一个主域，都算可用。
 */
import { assert, match, expectClean, expectRequest } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://open.spotify.com/"
const COLOR = "#1DB954"
const HOME =
  '<html><head><title>Spotify - Web Player</title></head><body><div id="main"></div></body></html>'

export default {
  script: "spotify_web",
  cases: [
    {
      name: "200 → 可用（Spotify 绿）",
      responses: [fx.htmlPage({ status: 200, body: HOME })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
      },
    },
    {
      name: "English 环境 200 → Available",
      environment: { language: "en-US" },
      responses: [fx.htmlPage({ status: 200, body: HOME })],
      async expect(result) {
        match(expectClean(result), { content: "Available", backgroundColor: COLOR })
      },
    },
    {
      // 未登录会跳到同域登录页，这是正常跳转
      name: "302 同域跳到 /login → 可用（不是拦截）",
      responses: [fx.redirect({ status: 302, location: "https://open.spotify.com/login" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      // 账号域与 Web Player 同属 spotify.com，仍在 DOMAINS 内
      name: "307 同域子域跳到 accounts.spotify.com → 可用",
      responses: [fx.redirect({ status: 307, location: "https://accounts.spotify.com/login" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
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
      name: "302 跳到同域地区前缀 /ja-jp/ → 可用 (JA)",
      responses: [fx.redirect({ status: 302, location: "https://open.spotify.com/ja-jp/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JA)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 跳到同域地区前缀 /de-de/ → 可用 (DE)",
      responses: [fx.redirect({ status: 302, location: "https://open.spotify.com/de-de/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 跳到同域地区前缀 /kr-ko/ → 可用 (KR)",
      responses: [fx.redirect({ status: 302, location: "https://open.spotify.com/kr-ko/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (KR)", backgroundColor: COLOR })
      },
    },
    {
      name: "200 + 'not available in your region' → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>Spotify isn't available in your region</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + 'not available in your country' → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>This service is not available in your country</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
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
      // 403 但无挑战页特征 → 属于「受限」，不是「被拦截」
      name: "403（无挑战页特征）→ 受限",
      responses: [{ status: 403, headers: {}, body: "<html>Forbidden</html>" }],
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
