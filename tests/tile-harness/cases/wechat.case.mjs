/**
 * wechat.js（GET https://weixin.qq.com/，auto-redirect: false）
 * 定位：「域名落地」判定 —— 服务端把请求路由到哪个站点/地区，就是该出口的真实可用性。
 * 服务背景：实测 weixin.qq.com 200。海外入口是 wechat.com（同一产品的品牌域名），跨境跳转在两者之间
 *           发生 → 两个域名都在 DOMAINS 内；但海外出口有时给 200 + 「not available in your country」说明页，
 *           所以「200 即可用」之前必须先过封锁文案判断。
 * 判定顺序（与 _design.md §2 一致，顺序不能变）：
 *       1 error/无 response → 网络错误    2 200 + CF 挑战页 → 被拦截
 *       3 封锁文案 → 不可用                4 451 → 不可用
 *       5 429 → 请求限流                   6 >=500 → 服务端错误
 *       7 30x + Location host 不在 DOMAINS → 被拦截 -> host
 *       8 30x + 在 DOMAINS + 首段地区码 → 可用 (REGION)
 *       9 30x + 在 DOMAINS + 首段非地区码 → 可用
 *      10 200 → 可用   11 403 → 受限   其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest, expectRequestCount } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://weixin.qq.com/"
const COLOR = "#07C160"

export default {
  script: "wechat",
  cases: [
    {
      // 第一列锁定请求形状：GET + 不跟随重定向 + timeout 8
      name: "200 首页 → 可用（微信绿）",
      responses: [fx.htmlPage({ status: 200, body: "<html><head><title>微信，是一个生活方式</title></head><body><div class=\"index\"></div></body></html>" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
                expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
                expectRequestCount(result, 1)
      },
    },
    {
      name: "302 同域跳到 /cgi-bin/readtemplate → 可用",
      responses: [fx.redirect({ status: 302, location: "https://weixin.qq.com/cgi-bin/readtemplate?lang=en&t=weixin_faq" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      name: "307 同域子域跳到 res.weixin.qq.com → 可用",
      responses: [fx.redirect({ status: 307, location: "https://res.weixin.qq.com/dist/index.js" })],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
      },
    },
    {
      // wechat.com 是微信的海外品牌域名，属于同一产品；/en 首段是地区码形态 → 带上 (EN)
      name: "302 跨域跳到白名单内 wechat.com → 可用",
      responses: [fx.redirect({ status: 302, location: "https://www.wechat.com/en/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (EN)", backgroundColor: COLOR })
      },
    },
    {
      // 海外出口实测会出现这类 200 说明页；200 不等于可用
      name: "200 + 'not available in your country' → 不可用（海外出口说明页）",
      responses: [fx.htmlPage({ status: 200, body: "<html><body><h1>WeChat is not available in your country</h1></body></html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + 'not available in your region' → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>WeChat is not available in your region</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
      },
    },
    {
      name: "200 + isn't available in your region → 不可用",
      responses: [fx.htmlPage({ status: 200, body: "<html>WeChat isn't available in your region</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "不可用" })
      },
    },
    {
      name: "302 同域地区前缀 /de-de/ → 可用 (DE)",
      responses: [fx.redirect({ status: 302, location: "https://weixin.qq.com/de-de/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 同域地区前缀 /kr-ko/ → 可用 (KR)",
      responses: [fx.redirect({ status: 302, location: "https://weixin.qq.com/kr-ko/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (KR)" })
      },
    },
    {
      name: "302 跳到 /en/ → 可用 (EN)（首段是地区码形态）",
      responses: [fx.redirect({ status: 302, location: "https://weixin.qq.com/en/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (EN)", backgroundColor: COLOR })
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
    {
      name: "English 环境 200 → Available",
      environment: {"language":"en-US"},
      responses: [fx.htmlPage({ status: 200, body: "<html><head><title>WeChat</title></head></html>" })],
      async expect(result) {
        match(expectClean(result), { content: "Available", backgroundColor: COLOR })
      },
    },
    {
      name: "English 环境 200 + 封锁文案 → Unavailable",
      environment: {"language":"en-US"},
      responses: [fx.htmlPage({ status: 200, body: "<html>WeChat is not available in your country</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "Unavailable", backgroundColor: "#FF3B30" })
      },
    },
  ],
}
