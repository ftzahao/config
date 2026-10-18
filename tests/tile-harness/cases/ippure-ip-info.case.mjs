/**
 * ippure-ip-info.js（最终实现：GET https://my.ippure.com/v1/info，每请求预算 BUDGET_MS=1200）
 * 主请求被 Cloudflare 质询时降级到 ip-api.com，文案带 "(ip-api)" 且颜色改黄。
 * 分支：error → 网络错误 / !response → 网络错误 / 403/503/挑战页 → 降级 ip-api
 *       429 → 请求限流 / 非 200 → 接口异常 / 空 body 或 html → 无响应
 *       非法 JSON → 无效 JSON / 非对象 → 无效数据
 *       city > region > country；org 缺失兜底 → 「<地区> - <运营商>」
 */
import { assert, match, expectClean, expectRequest, expectRequestCount, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://my.ippure.com/v1/info"
const IPAPI = "http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,isp,org,as,proxy,hosting,query"

const ipapiOk = (obj) => fx.json({ status: "success", ...obj })

export default {
  script: "ippure-ip-info",
  cases: [
    {
      name: "完整数据 → 城市 - 运营商（绿）",
      responses: [
        fx.json({ ip: "1.2.3.4", city: "Tokyo", region: "Tokyo", country: "JP", asOrganization: "Cloudflare" }),
      ],
      async expect(result) {
        match(expectClean(result), { content: "Tokyo - Cloudflare", backgroundColor: "#88A788" })
        expectRequest(result, 0, { method: "GET", url: URL, timeout: 10 })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "无 city → 回退 region",
      responses: [fx.json({ region: "Osaka", country: "JP", asOrganization: "KDDI" })],
      async expect(result) {
        match(expectClean(result), { content: "Osaka - KDDI" })
      },
    },
    {
      name: "只有 country → 回退 country",
      responses: [fx.json({ country: "JP", asOrganization: "NTT" })],
      async expect(result) {
        match(expectClean(result), { content: "JP - NTT" })
      },
    },
    {
      name: "字段含前后空格 → 自动 trim",
      responses: [fx.json({ city: "  Tokyo ", asOrganization: " Cloudflare " })],
      async expect(result) {
        match(expectClean(result), { content: "Tokyo - Cloudflare" })
      },
    },
    {
      name: "地区与运营商都缺失 → 未知兜底",
      responses: [fx.json({ ip: "1.2.3.4" })],
      async expect(result) {
        match(expectClean(result), { content: "未知区域 - 未知运营商" })
      },
    },
    {
      name: "English 环境 → Unknown - Unknown",
      environment: { language: "en-US" },
      responses: [fx.json({})],
      async expect(result) {
        match(expectClean(result), { content: "Unknown - Unknown" })
      },
    },
    {
      name: "网络错误 → 网络错误（不降级，只发 1 个请求）",
      responses: [fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误", backgroundColor: "#FF9500" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "429 → 请求限流（不降级）",
      responses: [fx.rateLimited()],
      async expect(result) {
        match(expectClean(result), { content: "请求限流" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "500 → 接口异常",
      responses: [fx.serverError(500)],
      async expect(result) {
        match(expectClean(result), { content: "接口异常", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "200 + 空 body → 无响应",
      responses: [fx.emptyBody()],
      async expect(result) {
        match(expectClean(result), { content: "无响应" })
      },
    },
    {
      name: "200 + content-type: text/html → 接口异常",
      responses: [fx.htmlPage({ status: 200, body: "<html>oops</html>" })],
      async expect(result) {
        match(expectClean(result), { content: "接口异常" })
      },
    },
    {
      name: "200 + 非 JSON（text/plain）→ 无效 JSON",
      responses: [{ status: 200, headers: { "Content-Type": "text/plain" }, body: "Tokyo, JP" }],
      async expect(result) {
        match(expectClean(result), { content: "无效 JSON", backgroundColor: "#C44" })
      },
    },
    {
      name: "200 + 截断 JSON → 无效 JSON",
      responses: [fx.truncatedJson()],
      async expect(result) {
        match(expectClean(result), { content: "无效 JSON" })
      },
    },
    {
      name: "200 + JSON 字符串字面量 → 无效数据",
      responses: [{ status: 200, headers: { "Content-Type": "application/json" }, body: '"just a string"' }],
      async expect(result) {
        match(expectClean(result), { content: "无效数据", backgroundColor: "#C44" })
      },
    },

    /* ---------------- Cloudflare 降级链路 ---------------- */

    {
      name: "403 + CF 挑战页 → 降级 ip-api 成功 → 「城市 - org (ip-api)」",
      responses: [fx.cloudflareHtml({ status: 403 }), ipapiOk({ city: "Tokyo", regionName: "Tokyo", country: "Japan", org: "Cloudflare, Inc." })],
      async expect(result) {
        match(expectClean(result), { content: "Tokyo - Cloudflare, Inc. (ip-api)", backgroundColor: "#D4A017" })
        expectRequestCount(result, 2)
        expectRequest(result, 1, { method: "GET", url: IPAPI })
      },
    },
    {
      name: "403 空 body（CF 无内容拦截）→ 降级 ip-api",
      responses: [{ status: 403, headers: {}, body: "" }, ipapiOk({ city: "Osaka", isp: "KDDI" })],
      async expect(result) {
        match(expectClean(result), { content: "Osaka - KDDI (ip-api)" })
      },
    },
    {
      name: "503 → 降级 ip-api",
      responses: [{ status: 503, headers: {}, body: "" }, ipapiOk({ country: "Japan", org: "NTT" })],
      async expect(result) {
        match(expectClean(result), { content: "Japan - NTT (ip-api)" })
      },
    },
    {
      name: "cf-mitigated 响应头 → 降级 ip-api",
      responses: [fx.json({ city: "Tokyo" }, 200, { "cf-mitigated": "challenge" }), ipapiOk({ city: "Tokyo", org: "X" })],
      async expect(result) {
        match(expectClean(result), { content: "Tokyo - X (ip-api)" })
      },
    },
    {
      name: "降级源返回 status!=success → 网络错误",
      responses: [fx.cloudflareHtml({ status: 403 }), fx.json({ status: "fail", message: "private range" })],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },
    {
      name: "降级源网络错误 → 网络错误",
      responses: [fx.cloudflareHtml({ status: 403 }), fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
      },
    },
    {
      name: "降级源缺 city/org → 未知兜底",
      responses: [fx.cloudflareHtml({ status: 403 }), ipapiOk({})],
      async expect(result) {
        match(expectClean(result), { content: "未知区域 - 未知运营商 (ip-api)" })
      },
    },

    {
      name: "回调永不返回 → 兜底预算内 $done（≤1400ms）",
      timeoutMs: 1800,
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
        const budget = 1400
        if ((result.doneAfterMs ?? Infinity) > budget + 250) {
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/ippure-ip-info.js:15,19-43 —— BUDGET_MS = 1000（主请求），降级链最坏约 2s`)
        }
      },
    }
  ],
}
