/**
 * youtube_mobile.js（GET https://m.youtube.com/，auto-redirect: false，移动端 UA）
 * 定位：「域名落地」判定 —— 服务端把请求路由到哪个站点/地区，就是该出口的真实可用性。
 * 实测（2026-10-18 出口 KR/JP）：移动站带桌面 UA 会 302 → www.youtube.com/?app=desktop，
 * 所以脚本必须用移动 UA；桌面 UA 时移动站自己就不肯渲染，测的其实是桌面站。
 * 分支：error/无 response → 网络错误
 *       CF 挑战页 → 被拦截
 *       封锁文案 → 不可用 / 451 → 不可用 / 429 → 请求限流 / >=500 → 服务端错误
 *       30x：Location host 不在 DOMAINS → 被拦截 -> host
 *            同品牌跨子域（m.youtube.com → www.youtube.com/?app=desktop）→ 可用
 *            在 DOMAINS + 首段是地区码 → 可用 (REGION)
 *       200 → 可用 / 403 → 受限 / 其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://m.youtube.com/"
const COLOR = "#FF0000"
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const HOME =
  '<html><head><title>YouTube</title></head><body><div id="app"></div></body></html>'

/** 第一列用例统一锁请求形状；移动 UA 是移动站能给出真实页面的前提，必须一起断言 */
function expectMobileRequest(result) {
  expectRequest(result, 0, {
    method: "GET",
    url: URL,
    timeout: 8,
    autoRedirect: false,
    headersInclude: { "User-Agent": MOBILE_UA },
  })
}

export default {
  script: "youtube_mobile",
  cases: [
    {
      name: "200 → 可用（YouTube 红）+ 请求带移动 UA",
      responses: [fx.htmlPage({ status: 200, body: HOME })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
        expectMobileRequest(result)
      },
    },
    {
      name: "English 环境 200 → Available",
      environment: { language: "en-US" },
      responses: [fx.htmlPage({ status: 200, body: HOME })],
      async expect(result) {
        match(expectClean(result), { content: "Available", backgroundColor: COLOR })
        // 少了移动 UA，移动站会直接 302 到桌面站，测不到移动站本身
        expectMobileRequest(result)
      },
    },
    {
      // 真实形态：移动站把请求导到桌面站，Location 的 host 是 www.youtube.com
      name: "302 m.youtube.com → www.youtube.com/?app=desktop → 可用（同品牌跨子域）",
      responses: [fx.redirect({ status: 302, location: "https://www.youtube.com/?app=desktop" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      name: "302 同域跳到 /feed/subscriptions → 可用（不是拦截）",
      responses: [fx.redirect({ status: 302, location: "https://m.youtube.com/feed/subscriptions" })],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
      },
    },
    {
      name: "302 跳到 youtu.be 短链 → 可用（白名单内）",
      responses: [fx.redirect({ status: 302, location: "https://youtu.be/dQw4w9WgXcQ" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      name: "307 跳到 googlevideo.com（视频 CDN）→ 可用（白名单内）",
      responses: [fx.redirect({ status: 307, location: "https://rr1---sn-a5m7zu7z.googlevideo.com/videoplayback?id=1" })],
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
      // 只看 host 后缀、不看「是不是自己人」的话，googlevideo.com 这类子域会被误判
      name: "302 跳到仿冒域 www.youtube.com.evil.example → 被拦截（后缀匹配不放行）",
      responses: [fx.redirect({ status: 302, location: "https://www.youtube.com.evil.example/" })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截 -> www.youtube.com.evil.example" })
      },
    },
    {
      name: "302 同域地区前缀 /ja-jp/ → 可用 (JA)",
      responses: [fx.redirect({ status: 302, location: "https://m.youtube.com/ja-jp/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JA)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 同域地区前缀 /de-de/ → 可用 (DE)",
      responses: [fx.redirect({ status: 302, location: "https://m.youtube.com/de-de/feed/trending" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)" })
      },
    },
    {
      name: "308 同域地区前缀 /kr-ko/ → 可用 (KR)",
      responses: [fx.redirect({ status: 308, location: "https://m.youtube.com/kr-ko/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (KR)" })
      },
    },
    {
      name: "200 + 'not available in your country' → 不可用",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>This video is not available in your country</html>" }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + 'not available in your region' → 不可用",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>YouTube is not available in your region</html>" }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "不可用", backgroundColor: "#FF3B30" })
      },
    },
    {
      name: "200 + 'isn't available in your region' → 不可用",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>This content isn't available in your region</html>" }),
      ],
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
      // 机房/数据中心 IP 访问移动站常见「Forbidden」：站点没锁区，只是拒绝了这次请求
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
