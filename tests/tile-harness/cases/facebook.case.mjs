/**
 * facebook.js（GET https://www.facebook.com/，auto-redirect: false）
 * 定位：「域名落地」判定 —— 服务端把请求路由到哪个站点/地区，就是该出口的真实可用性。
 * 与 discord.js 同一套骨架；差异在 DOMAINS（facebook.com）、品牌色，以及 **400 → 同域 favicon 复查**：
 *   实测带桌面 UA 访问首页会被 MockingBird 前置代理直接 400（去掉 UA 反而 200），
 *   所以 400 不能直接当「服务挂了」，用同域 favicon 再确认一次链路是否通。
 * 分支：error/无 response → 网络错误
 *       CF 挑战页 → 被拦截
 *       封锁文案 → 不可用 / 451 → 不可用 / 429 → 请求限流 / >=500 → 服务端错误
 *       30x：Location host 不在 DOMAINS → 被拦截 -> host
 *            在 DOMAINS + 首段是地区码 → 可用 (REGION)
 *            在 DOMAINS + 首段不是地区码 → 可用
 *       200 → 可用 / 400 + favicon 通 → 受限 / 400 + favicon 网络错误 → 网络错误
 *       403 → 受限 / 其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://www.facebook.com/"
const FAVICON = "https://www.facebook.com/favicon.ico"
const COLOR = "#0866FF"
const HOME = '<html><head><title>Facebook</title></head><body><div id="mount_0_0"></div></body></html>'
const FORBIDDEN = "<html><body><h1>Forbidden</h1></body></html>"

export default {
  script: "facebook",
  cases: [
    {
      name: "200 → 可用（Facebook 蓝）",
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
      // 未登录访问首页会被带到 /login，同域跳转是登录墙，不是封锁
      name: "302 同域跳到 /login → 可用（不是拦截）",
      responses: [fx.redirect({ status: 302, location: "https://www.facebook.com/login/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      name: "302 同域子域跳到 m.facebook.com → 可用",
      responses: [fx.redirect({ status: 302, location: "https://m.facebook.com/" })],
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
      // 形近域不是 facebook.com 的子域，必须判拦截而不是放过
      name: "302 跳到形近域 facebook.com.example.net → 被拦截",
      responses: [fx.redirect({ status: 302, location: "https://facebook.com.example.net/" })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截 -> facebook.com.example.net" })
      },
    },
    {
      name: "302 同域地区前缀 /ja-jp/ → 可用 (JA)",
      responses: [fx.redirect({ status: 302, location: "https://www.facebook.com/ja-jp/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JA)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 同域地区前缀 /de-de/ → 可用 (DE)",
      responses: [fx.redirect({ status: 302, location: "https://www.facebook.com/de-de/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 同域地区前缀 /kr-ko/ → 可用 (KR)",
      responses: [fx.redirect({ status: 302, location: "https://www.facebook.com/kr-ko/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (KR)", backgroundColor: COLOR })
      },
    },
    {
      name: "200 + 'not available in your region' → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>Facebook isn't available in your region</html>" })],
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
      name: "200 + REGION_BLOCK_HTML（运营商拦截页）→ 不可用",
      responses: [fx.htmlPage({ status: 200, body: fx.REGION_BLOCK_HTML })],
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
      name: "403（无挑战页特征）→ 受限",
      responses: [{ status: 403, headers: {}, body: FORBIDDEN }],
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
      // 实测形态：带桌面 UA 访问首页被 MockingBird 前置代理直接 400，favicon 仍可通
      name: "400 + favicon 复查可通 → 受限（不是服务挂了）",
      responses: [
        fx.htmlPage({ status: 400, body: "<html><head><title>Error</title></head><body>Sorry</body></html>" }),
        fx.htmlPage({ status: 200, body: "ico" }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "受限", backgroundColor: "#FF3B30" })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
        expectRequest(result, 1, { method: "GET", url: FAVICON, timeout: 4, autoRedirect: false })
      },
    },
    {
      name: "400 + favicon 复查网络错误 → 网络错误（链路确实不通）",
      responses: [fx.htmlPage({ status: 400, body: "<html>Error</html>" }), fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "400 + favicon 检查中文环境 → 受限（中文文案）",
      responses: [fx.htmlPage({ status: 400, body: "<html>Error</html>" }), fx.htmlPage({ status: 200, body: "" })],
      async expect(result) {
        match(expectClean(result), { content: "受限" })
      },
    },
    {
      name: "400 + favicon 检查 English 环境 → Restricted",
      environment: { language: "en-US" },
      responses: [fx.htmlPage({ status: 400, body: "<html>Error</html>" }), fx.htmlPage({ status: 200, body: "" })],
      async expect(result) {
        match(expectClean(result), { content: "Restricted", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "回调永不返回 → 兜底预算内 $done（≤2750ms）",
      timeoutMs: 3300,
      responses: [fx.hang()],
      async expect(result) {
        // hang 夹具下 harness 的 timedOut 恒为 true（请求被标记为挂起），
        // 这里只认「$done 恰好一次且发生在预算内」
        if (result.doneCalls.length !== 1) {
          assert.fail(
            `$done 调用 ${result.doneCalls.length} 次（期望 1）`,
            `outcome=${result.outcome} doneAfterMs=${result.doneAfterMs}`,
          )
        }
        match(result.done, { content: "网络错误", backgroundColor: "#FF9500" })
        const doneAfterMs = result.doneAfterMs ?? Infinity
        if (doneAfterMs > 2750) {
          assert.fail(`兜底过慢：${doneAfterMs}ms > 预算 2500ms+250ms`, `outcome=${result.outcome}`)
        }
      },
    },
  ],
}
