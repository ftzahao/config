// IPPure 的 my./api.ippure.com 对 **HTTP/2 连接**做了 TLS/ALPN 指纹判定：
// 不符合浏览器指纹的 h2 请求一律被 Cloudflare 质询页（403 + "Just a moment..."）挡下。
//
// 2026-10 实测（同一出口、同一时刻，各 10 次）：
//   浏览器 UA + HTTP/2   → 403 403 403 403 403 403 403 403 403 403
//   浏览器 UA + HTTP/1.1 → 200 200 200 200 200 200 200 200 200 200  ← 100% 稳定
//   空 UA / curl UA + HTTP/1.1 → 403（HTTP 版本是必要条件，不是充分条件）
//
// 所以这**不是**「需要执行 JS 挑战 / 需要 cf_clearance」那种托管质询 ——
// 单纯换个 HTTP 版本就能拿到完整真实 JSON。别去折腾 cookie，那是无效方向。
//
// 但 Stash 的 $httpClient 只支持 url / headers / body / timeout / auto-redirect，
// **无法指定 HTTP 版本**（见 https://stash.wiki/script/syntax-and-interface），
// 因此主请求在真机上大概率仍会 403，只能降级到 ip-api.com 并在文案标明来源。
// 若将来 Stash 支持 HTTP/1.1，把这里的 UA 直接打主请求即可拿到 IPPure 原始数据，
// 届时可以删掉整条降级链。

// 浏览器 UA 必须带上：它是 HTTP/1.1 能通过的必要条件之一（空 UA 必 403）。
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

// 共享总预算（不是每个请求各算）：主请求 1.0s 超时 → 降级 1.2s → 最坏约 2.2s，
// 给解析和渲染留出余量，避免整块面板停在「检测中...」。
const PRIMARY_BUDGET_MS = 1000
const FALLBACK_BUDGET_MS = 1200

/* ------------------- 三个 IPPure Tile 共用的 helper 块（逐字节一致） ------------------- */

async function request(method, params, budgetMs) {
  return new Promise((resolve) => {
    // 不要把 $httpClient[method] 取出来再调用：脱离宿主对象后 this 丢失，
    // 在 Stash 的运行时里可能抛 TypeError
    let settled = false
    let timer = null
    const settle = (result) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      resolve(result)
    }
    timer = setTimeout(() => settle({ error: "timeout" }), budgetMs)
    const callback = (error, response, data) => settle({ error, response, data })
    try {
      if (method === "POST") {
        $httpClient.post(params, callback)
      } else {
        $httpClient.get(params, callback)
      }
    } catch (e) {
      settle({ error: e })
    }
  })
}

function isChinese() {
  const lang = ($environment.language || "").toLowerCase()
  return lang.startsWith("zh")
}

function text(zh, en) {
  return isChinese() ? zh : en
}

function statusOf(response) {
  if (!response) return undefined
  return response.status !== undefined ? response.status : response.statusCode
}

function header(headers, name) {
  if (!headers) return undefined
  const lower = name.toLowerCase()
  for (const key in headers) {
    if (key.toLowerCase() === lower) return headers[key]
  }
  return undefined
}

// 是否被 WAF 拦截（三个来源满足其一）：
//   1. 响应头 cf-mitigated —— Cloudflare 质询的标准标记
//   2. body 里的质询页特征（Just a moment / challenge-platform / cf_chl ...）
//   3. 空 body 的 403/503 —— 同样按「被拦截」处理，别显示成「错误 (403)」
//      （实测 api.ippure.com 的 403 常常 body 为空）
function isChallenge(status, body) {
  if (body.indexOf("just a moment") >= 0) return true
  if (body.indexOf("challenge-platform") >= 0) return true
  if (body.indexOf("cf_chl") >= 0) return true
  if (body.indexOf("checking your browser") >= 0) return true
  if (body.indexOf("enable javascript") >= 0) return true
  return status === 403 || status === 503
}

// 布尔归一：true/"true"/1/"1" → true；false/"false"/0/"0" → false；其它 → null（未知）
// 不能用 Boolean(x)：Boolean("false") === true，一旦接口改成字符串就会整体判反
function asBool(value) {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  if (typeof value === "string") {
    const word = value.trim().toLowerCase()
    if (word === "true" || word === "1" || word === "yes") return true
    if (word === "false" || word === "0" || word === "no") return false
  }
  return null
}

function clean(value) {
  return typeof value === "string" ? value.trim() : ""
}

// 把一次响应归一成「能否拿到业务 JSON」的结论
function classify(result) {
  if (result.error) return { kind: "error" }
  const response = result.response
  if (!response) return { kind: "noresponse" }
  const status = statusOf(response)
  const raw = typeof result.data === "string" ? result.data : ""
  const contentType = String(header(response.headers, "content-type") || "").toLowerCase()

  if (header(response.headers, "cf-mitigated") || isChallenge(status, raw.toLowerCase())) {
    return { kind: "blocked" }
  }
  if (status === 429) return { kind: "ratelimit" }
  if (status !== 200) return { kind: "status" }
  if (!raw.trim()) return { kind: "empty" }
  // 声称 JSON 却给 HTML，多半又是拦截页/错误页
  if (contentType.indexOf("html") >= 0) return { kind: "badbody" }

  let json
  try {
    json = JSON.parse(raw)
  } catch {
    return { kind: "badjson" }
  }
  if (!json || typeof json !== "object") return { kind: "baddata" }
  return { kind: "ok", json }
}

// 统一的失败文案。content 里绝不出现 undefined / NaN
function failureDone(reason) {
  if (reason === "ratelimit") {
    $done({ content: text("请求限流", "Rate Limited"), backgroundColor: "#FF9500" })
  } else if (reason === "status") {
    $done({ content: text("接口异常", "Bad Response"), backgroundColor: "#FF9500" })
  } else if (reason === "badjson") {
    $done({ content: text("无效 JSON", "Invalid JSON"), backgroundColor: "#C44" })
  } else if (reason === "baddata") {
    $done({ content: text("无效数据", "Invalid Data"), backgroundColor: "#C44" })
  } else if (reason === "empty" || reason === "noresponse") {
    $done({ content: text("无响应", "No Response"), backgroundColor: "#FF9500" })
  } else if (reason === "badbody") {
    $done({ content: text("接口异常", "Bad Response"), backgroundColor: "#FF9500" })
  } else {
    $done({ content: text("网络错误", "Network Error"), backgroundColor: "#FF9500" })
  }
}

/* -------------------------------- 本脚本专属逻辑 -------------------------------- */

// 评分归一：接口正常是 number（0-100），也吞得下 "88" 这类字符串数字；
// 其它（null / "" / "abc" / boolean）一律 null，交给「无评分数据」分支
function toScore(value) {
  if (value === null || value === undefined) return null
  if (typeof value === "boolean") return null
  if (typeof value === "string" && value.trim() === "") return null
  const score = Number(value)
  return Number.isFinite(score) ? score : null
}

async function main() {
  const local = await request("GET", {
    url: "https://my.ippure.com/v1/info",
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeout: 10
  }, PRIMARY_BUDGET_MS)

  const primary = classify(local)
  if (primary.kind === "ok") {
    // 实测字段：fraudScore，number（0-100），例：{"fraudScore": 53}
    const score = toScore(primary.json.fraudScore)

    if (score === null) {
      $done({ content: text("无评分数据", "No Score"), backgroundColor: "#FF9500" })
      return
    }

    // 风险颜色：绿 → 黄 → 红 + 文案
    let color = "#88A788" // 默认低风险（绿色）
    let levelZh = "低风险"
    let levelEn = "Low Risk"

    if (score >= 40 && score < 70) {
      color = "#D4A017" // 中风险（黄色）
      levelZh = "中风险"
      levelEn = "Medium Risk"
    } else if (score >= 70) {
      color = "#C44" // 高风险（红色）
      levelZh = "高风险"
      levelEn = "High Risk"
    }

    $done({
      content: text(`风险评分: ${score}（${levelZh}）`, `Fraud Score: ${score} (${levelEn})`),
      backgroundColor: color
    })
    return
  }

  // 只有真正被 Cloudflare 质询才降级；普通网络错误直接用原文案，不白白多打一次请求
  if (primary.kind !== "blocked") {
    failureDone(primary.kind)
    return
  }

  // 降级源（ip-api）没有 fraudScore，也拼不出等价物：
  // hosting/proxy 是机房/代理判定，不是风险评分，拿来「折算」成 0-100 就是编数据。
  // 所以这里只做一次可达性确认，然后如实告诉用户「上游被拦截、评分不可用」。
  const fallback = await request("GET", {
    url: "http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,isp,org,as,proxy,hosting,query",
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeout: 10
  }, FALLBACK_BUDGET_MS)

  const secondary = classify(fallback)
  if (secondary.kind !== "ok" || clean(secondary.json.status) !== "success") {
    failureDone("error")
    return
  }

  $done({
    content: text("风险评分: 不可用 (IPPure 被拦截)", "Fraud Score: N/A (IPPure blocked)"),
    backgroundColor: "#8E8E93"
  })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: text("脚本错误", "Script Error"), backgroundColor: "#C44" })
    })
})()
