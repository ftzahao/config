/**
 * googlejp.js（GET https://www.google.co.jp/generate_204，auto-redirect: false）
 * 定位：「纯探活端点」判定 —— 该端点对任意地区出口都返回 204，只能回答「通不通」，
 * **不含地区信息**，所以正常情况只显示「可用」，不拼 (REGION)。
 * 实测（2026-10-18 出口 KR/JP）：204，Location 为空，body 为空。
 * 与模板的差别：模板只有 200 分支，这里必须补 204 → 可用（放在挑战页判断之后、30x 之前）。
 * 附加形态：204 端点被换成 200/403 挑战页 = 真实的网关劫持，必须判被拦截。
 * 分支：error/无 response → 网络错误
 *       CF 挑战页（200/403）→ 被拦截
 *       封锁文案 → 不可用 / 451 → 不可用 / 429 → 请求限流 / >=500 → 服务端错误
 *       204 → 可用（无地区后缀）/ 30x → 白名单内可用、陌生域被拦截
 *       200 → 可用（仅当 body 里有 trace 的 loc=XX 才带后缀）/ 403 → 受限 / 其它 → 错误 (status)
 */
import { assert, match, expectClean, expectRequest } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://www.google.co.jp/generate_204"
const COLOR = "#4285F4"

export default {
  script: "googlejp",
  cases: [
    {
      // 真实形态：generate_204 恒返回 204，模板的 200 分支覆盖不到，必须单独一支
      name: "204 → 可用（无地区后缀）+ 请求形状",
      responses: [fx.noContent()],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
      },
    },
    {
      name: "English 环境 204 → Available",
      environment: { language: "en-US" },
      responses: [fx.noContent()],
      async expect(result) {
        match(expectClean(result), { content: "Available", backgroundColor: COLOR })
      },
    },
    {
      // 极少数 Google 边缘会顺手带上 trace 文本；有 loc= 才显示地区，没有就不猜
      name: "204 + trace 文本 loc=JP → 可用 (JP)",
      responses: [{ status: 204, headers: {}, body: "fl=1a2b\nip=198.51.100.7\nloc=JP\ncolo=NRT\n" }],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JP)" })
      },
    },
    {
      name: "204 + trace 文本没有 loc= → 可用（不猜地区）",
      responses: [{ status: 204, headers: {}, body: "fl=1a2b\ncolo=NRT\n" }],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      // 204 端点被顶成 200 挑战页：不是「可用」，也不是「错误 (200)」
      name: "200 + CF 挑战页 → 被拦截（204 端点被网关劫持的形态）",
      responses: [fx.cloudflareHtml({ status: 200 })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截", backgroundColor: "#FF9500" })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 8, autoRedirect: false })
      },
    },
    {
      name: "403 + CF 挑战页 → 被拦截",
      responses: [fx.cloudflareHtml({ status: 403 })],
      async expect(result) {
        match(expectClean(result), { content: "被拦截" })
      },
    },
    {
      name: "200（普通页面）→ 可用",
      responses: [fx.htmlPage({ status: 200, body: "<html><title>Google</title></html>" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      name: "302 同域跳到 / → 可用（不是拦截）",
      responses: [fx.redirect({ status: 302, location: "https://www.google.co.jp/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用", backgroundColor: COLOR })
      },
    },
    {
      name: "301 同域子域跳到 maps.google.co.jp → 可用",
      responses: [fx.redirect({ status: 301, location: "https://maps.google.co.jp/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用" })
      },
    },
    {
      // 运营商/地区网关把 google.co.jp 导去陌生域名 → 被劫持，显示落点
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
      responses: [fx.redirect({ status: 302, location: "https://www.google.co.jp/ja-jp/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (JA)", backgroundColor: COLOR })
      },
    },
    {
      name: "302 同域地区前缀 /de-de/ → 可用 (DE)",
      responses: [fx.redirect({ status: 302, location: "https://www.google.co.jp/de-de/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (DE)" })
      },
    },
    {
      name: "308 同域地区前缀 /kr-ko/ → 可用 (KR)",
      responses: [fx.redirect({ status: 308, location: "https://www.google.co.jp/kr-ko/" })],
      async expect(result) {
        match(expectClean(result), { content: "可用 (KR)" })
      },
    },
    {
      name: "200 + 'not available in your country' → 不可用",
      responses: [
        fx.htmlPage({ status: 200, body: "<html>Google is not available in your country</html>" }),
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
      responses: [fx.htmlPage({ status: 200, body: "<html>It isn't available in your region</html>" })],
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
      // 机房 IP 访问 Google 常见干净 403：站点没锁区，只是这次请求被拒
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
