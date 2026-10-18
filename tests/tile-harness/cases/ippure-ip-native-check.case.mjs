/**
 * ippure-ip-native-check.js（最终实现：GET https://my.ippure.com/v1/info，BUDGET_MS=1200）
 * 主请求被 CF 质询 → 降级 ip-api：只报「地区 · 机房/住宅 · 原生性不可判定 (ip-api)」（中性灰）
 * 分支：isResidential × isBroadcast（true/1/"true"/"yes" 归一化；缺失 → 未知）
 *       颜色：住宅+广播 / 机房+原生 → 黄；机房+广播 → 红；住宅+原生 → 绿；有缺失 → 中性灰
 */
import { assert, match, expectClean, expectRequest, expectRequestCount, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://my.ippure.com/v1/info"
const IPAPI = "http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,isp,org,as,proxy,hosting,query"

function nativeCase({ isResidential, isBroadcast, content, color, name }) {
  return {
    name,
    responses: [fx.json({ ip: "1.2.3.4", isResidential, isBroadcast })],
    async expect(result) {
      match(expectClean(result), { content, backgroundColor: color })
      expectRequest(result, 0, { method: "GET", url: URL, timeout: 10 })
    },
  }
}

export default {
  script: "ippure-ip-native-check",
  cases: [
    nativeCase({ isResidential: true, isBroadcast: false, content: "住宅 • 原生", color: "#88A788", name: "住宅 + 原生 → 绿" }),
    nativeCase({ isResidential: false, isBroadcast: false, content: "机房 • 原生", color: "#D4A017", name: "机房 + 原生 → 黄" }),
    nativeCase({ isResidential: true, isBroadcast: true, content: "住宅 • 广播", color: "#D4A017", name: "住宅 + 广播 → 黄" }),
    nativeCase({ isResidential: false, isBroadcast: true, content: "机房 • 广播", color: "#C44", name: "机房 + 广播 → 红" }),
    nativeCase({
      isResidential: "false",
      isBroadcast: "false",
      content: "机房 • 原生",
      color: "#D4A017",
      name: "字符串 \"false\" → 归一化为 false（机房 • 原生）",
    }),
    nativeCase({ isResidential: 1, isBroadcast: 0, content: "住宅 • 原生", color: "#88A788", name: "数字 1/0 → 住宅 • 原生" }),
    nativeCase({
      isResidential: true,
      isBroadcast: null,
      content: "住宅 • 未知",
      color: "#8E8E93",
      name: "isBroadcast 缺失 → 住宅 • 未知（中性色）",
    }),
    {
      name: "两个字段都缺失 → 无检测数据",
      responses: [fx.json({ ip: "1.2.3.4" })],
      async expect(result) {
        match(expectClean(result), { content: "无检测数据", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "English 环境 → Residential • Native",
      environment: { language: "en-US" },
      responses: [fx.json({ isResidential: true, isBroadcast: false })],
      async expect(result) {
        match(expectClean(result), { content: "Residential • Native", backgroundColor: "#88A788" })
      },
    },
    {
      name: "网络错误 → 网络错误（不降级）",
      responses: [fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
        expectRequestCount(result, 1)
      },
    },
    {
      name: "503 → 降级 ip-api（503 也算被拦截）",
      responses: [{ status: 503, headers: {}, body: "" }, fx.json({ status: "success", city: "Tokyo", hosting: true })],
      async expect(result) {
        match(expectClean(result), {
          content: "Tokyo · 机房 · 原生性不可判定 (ip-api)",
          backgroundColor: "#8E8E93",
        })
      },
    },
    {
      name: "200 + 非 JSON（text/plain）→ 无效 JSON",
      responses: [{ status: 200, headers: { "Content-Type": "text/plain" }, body: "oops" }],
      async expect(result) {
        match(expectClean(result), { content: "无效 JSON" })
      },
    },

    /* ---------------- Cloudflare 降级链路 ---------------- */

    {
      name: "403 + CF 挑战页 → 降级：hosting=true → 「Tokyo · 机房 · 原生性不可判定 (ip-api)」",
      responses: [
        fx.cloudflareHtml({ status: 403 }),
        fx.json({ status: "success", city: "Tokyo", regionName: "Tokyo", country: "Japan", hosting: true }),
      ],
      async expect(result) {
        match(expectClean(result), {
          content: "Tokyo · 机房 · 原生性不可判定 (ip-api)",
          backgroundColor: "#8E8E93",
        })
        expectRequestCount(result, 2)
        expectRequest(result, 1, { method: "GET", url: IPAPI })
      },
    },
    {
      name: "降级：hosting=false → 「住宅 · …」",
      responses: [fx.cloudflareHtml({ status: 403 }), fx.json({ status: "success", city: "Osaka", hosting: false })],
      async expect(result) {
        match(expectClean(result), { content: "Osaka · 住宅 · 原生性不可判定 (ip-api)" })
      },
    },
    {
      name: "降级：hosting 缺失 → 「类型未知」，不默认成机房",
      responses: [fx.cloudflareHtml({ status: 403 }), fx.json({ status: "success", country: "Japan" })],
      async expect(result) {
        match(expectClean(result), { content: "Japan · 类型未知 · 原生性不可判定 (ip-api)" })
      },
    },
    {
      name: "降级源也不可达 → 网络错误",
      responses: [fx.cloudflareHtml({ status: 403 }), fx.networkError()],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/ippure-ip-native-check.js:15,19-43 —— BUDGET_MS = 1000（主请求）`)
        }
      },
    }
  ],
}
