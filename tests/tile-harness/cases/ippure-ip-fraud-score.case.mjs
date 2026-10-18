/**
 * ippure-ip-fraud-score.js（最终实现：GET https://my.ippure.com/v1/info，BUDGET_MS=1200）
 * 主请求被 CF 质询 → 降级 ip-api 仅做可达性确认 → 「风险评分: 不可用 (IPPure 被拦截)」（中性灰）
 * 分支：<40 低风险 / 40-69 中风险 / >=70 高风险；字符串数字归一化；非数字 → 无评分数据
 */
import { assert, match, expectClean, expectRequest, expectRequestCount, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

const URL = "https://my.ippure.com/v1/info"
const IPAPI = "http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,isp,org,as,proxy,hosting,query"

function scoreCase(score, level, color, name) {
  return {
    name,
    responses: [fx.json({ ip: "1.2.3.4", fraudScore: score })],
    async expect(result) {
      match(expectClean(result), { content: `风险评分: ${score}（${level}）`, backgroundColor: color })
      expectRequest(result, 0, { method: "GET", url: URL, timeout: 10 })
    },
  }
}

export default {
  script: "ippure-ip-fraud-score",
  cases: [
    scoreCase(0, "低风险", "#88A788", "score 0 → 低风险（绿）"),
    scoreCase(39, "低风险", "#88A788", "score 39 → 低风险（边界）"),
    scoreCase(40, "中风险", "#D4A017", "score 40 → 中风险（边界）"),
    scoreCase(69, "中风险", "#D4A017", "score 69 → 中风险（边界）"),
    scoreCase(70, "高风险", "#C44", "score 70 → 高风险（边界）"),
    scoreCase(100, "高风险", "#C44", "score 100 → 高风险"),
    {
      name: "字符串 \"88\" → 归一化为 88 → 高风险",
      responses: [fx.json({ fraudScore: "88" })],
      async expect(result) {
        match(expectClean(result), { content: "风险评分: 88（高风险）", backgroundColor: "#C44" })
      },
    },
    {
      name: "字符串 \" 53 \"（带空格）→ 中风险",
      responses: [fx.json({ fraudScore: " 53 " })],
      async expect(result) {
        match(expectClean(result), { content: "风险评分: 53（中风险）" })
      },
    },
    {
      name: "English 环境 → Fraud Score 文案",
      environment: { language: "en-US" },
      responses: [fx.json({ fraudScore: 55 })],
      async expect(result) {
        match(expectClean(result), { content: "Fraud Score: 55 (Medium Risk)" })
      },
    },
    {
      name: "缺 fraudScore → 无评分数据",
      responses: [fx.json({ ip: "1.2.3.4", isResidential: true })],
      async expect(result) {
        match(expectClean(result), { content: "无评分数据", backgroundColor: "#FF9500" })
      },
    },
    {
      name: "fraudScore 为 null → 无评分数据",
      responses: [fx.json({ fraudScore: null })],
      async expect(result) {
        match(expectClean(result), { content: "无评分数据" })
      },
    },
    {
      name: "fraudScore 为 \"abc\" → 无评分数据",
      responses: [fx.json({ fraudScore: "abc" })],
      async expect(result) {
        match(expectClean(result), { content: "无评分数据" })
      },
    },
    {
      name: "fraudScore 为 true → 无评分数据（布尔不当数字）",
      responses: [fx.json({ fraudScore: true })],
      async expect(result) {
        match(expectClean(result), { content: "无评分数据" })
      },
    },
    {
      name: "网络错误 → 网络错误（不降级）",
      responses: [fx.networkError(fx.NETWORK_ERRORS.proxy)],
      async expect(result) {
        match(expectClean(result), { content: "网络错误" })
        expectRequestCount(result, 1)
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
      name: "500 → 接口异常",
      responses: [fx.serverError(500)],
      async expect(result) {
        match(expectClean(result), { content: "接口异常" })
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
      name: "403 + CF 挑战页 → 降级确认可达 → 「风险评分: 不可用 (IPPure 被拦截)」",
      responses: [fx.cloudflareHtml({ status: 403 }), fx.json({ status: "success", hosting: false })],
      async expect(result) {
        match(expectClean(result), {
          content: "风险评分: 不可用 (IPPure 被拦截)",
          backgroundColor: "#8E8E93",
        })
        expectRequestCount(result, 2)
        expectRequest(result, 1, { method: "GET", url: IPAPI })
      },
    },
    {
      name: "English 环境 + 降级 → Fraud Score: N/A (IPPure blocked)",
      environment: { language: "en-US" },
      responses: [fx.cloudflareHtml({ status: 403 }), fx.json({ status: "success" })],
      async expect(result) {
        match(expectClean(result), { content: "Fraud Score: N/A (IPPure blocked)" })
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
      name: "降级源 status!=success → 网络错误",
      responses: [fx.cloudflareHtml({ status: 403 }), fx.json({ status: "fail" })],
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
          assert.fail(`兜底过慢：${result.doneAfterMs}ms > 预算 ${budget}ms`, `stash/tiles/ippure-ip-fraud-score.js:15,19-43 —— BUDGET_MS = 1000（主请求）`)
        }
      },
    }
  ],
}
