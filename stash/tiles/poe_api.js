const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

// ---- 本脚本配置 ----
// 允许出现的业务域名：api.poe.com 未授权时可能 30x 到 poe.com 自家站点（如 /login），
// 这属于正常落地；只有跳到 poe.com 之外的域名才判被地区重定向或劫持。
const DOMAINS = ["poe.com"]
const COLOR = "#5D3FD3"

// 整个 tile 的 $done 总预算：超过就立刻用「网络错误」收尾，绝不让面板停在「检测中…」
const TILE_BUDGET_MS = 2500

function request(method, params, budgetMs) {
  // 显式调用 $httpClient.get / $httpClient.post：不能把方法取出来再调，
  // 原生桥接对象脱离 receiver 会丢 this（真机上可能 TypeError）。
  const cap = typeof budgetMs === "number" && budgetMs > 0 ? budgetMs : TILE_BUDGET_MS
  // params.timeout 只留给 Stash 自己用；这里的兜底时刻取「声明超时」与「剩余预算」的较小值
  const declared = params && Number(params.timeout) > 0 ? Number(params.timeout) * 1000 : Infinity
  const limit = Math.max(500, Math.min(declared, cap))
  // 运行时没有 setTimeout 时退化为「不超时」，至少不让脚本整体崩溃
  const later = typeof setTimeout === "function" ? setTimeout : (fn, ms) => {}

  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      if (typeof clearTimeout === "function") clearTimeout(timer)
      resolve(value)
    }

    const timer = later(() => finish({ error: "timeout" }), limit)
    const callback = (error, response, data) => finish({ error, response, data })
    const upper = String(method || "").toUpperCase()
    if (upper === "POST") $httpClient.post(params, callback)
    else $httpClient.get(params, callback)
  })
}

function isChinese() {
  const lang = ($environment.language || "").toLowerCase()
  return lang.startsWith("zh")
}

function text(zh, en) {
  return isChinese() ? zh : en
}

// response 缺失时不要抛 TypeError，交给分支判断
function statusOf(response) {
  if (!response) return undefined
  return response.status || response.statusCode
}

// 状态码缺失时说「无响应」而不是拼出 undefined
function codeOf(status) {
  return status === undefined || status === null ? "no response" : String(status)
}

// Cloudflare 挑战页：反爬拦截既不是地区封锁，也不能当「可用」，必须单列。
// 只认语义强特征（挑战页独有文案）；单独的 challenge-platform 可能出现在
// 正常页面引用的静态资源里，不作为依据。
function isChallenge(status, body) {
  const lower = String(body || "").toLowerCase()
  const strong =
    lower.includes("just a moment") ||
    lower.includes("enable javascript and cookies") ||
    lower.includes("cf-chl") ||
    lower.includes("checking your browser")
  if (!strong) return false
  return status === 200 || status === 403 || status === 503 || status === undefined
}

// 大小写不敏感地读响应头
function header(headers, name) {
  const lower = String(name).toLowerCase()
  const source = headers || {}
  for (const key in source) {
    if (key.toLowerCase() === lower) return source[key]
  }
  return undefined
}

// 大小写不敏感地判断 host 是否属于 DOMAINS（允许 www. / m. 之类的子域）
function isDomain(host) {
  const lower = String(host || "").toLowerCase()
  if (!lower) return false
  for (let i = 0; i < DOMAINS.length; i++) {
    const domain = DOMAINS[i].toLowerCase()
    if (lower === domain || lower.endsWith("." + domain)) return true
  }
  return false
}

function hostOf(location) {
  return String(location || "").replace(/^https?:\/\//i, "").split("/")[0].toLowerCase()
}

// 地区码：/de-de/、/jp-en/、/kr-ko/ 都取第一段再取 "-" 前，避免把语言后缀当地区
function regionOfSegment(segment) {
  const match = String(segment || "").match(/^([a-z]{2})(?:-[a-z]{2,})?$/i)
  return match ? match[1].toUpperCase() : ""
}

function regionOfPath(url) {
  let path = String(url || "").replace(/^https?:\/\/[^/]+/i, "")
  const query = path.indexOf("?")
  if (query >= 0) path = path.slice(0, query)
  const segments = path.split("/").filter((part) => part.length > 0)
  return segments.length ? regionOfSegment(segments[0]) : ""
}

// JSON 端点若在同一份响应里带了出口地区（"countryCode"/"loc"/"GL" 这类两字母字段），
// 就直接用；读不到返回空串，不要从业务数据里推断地区。
function regionOfJson(parsed) {
  if (!parsed || typeof parsed !== "object") return ""
  const slots = ["countryCode", "loc", "GL"]
  for (let i = 0; i < slots.length; i++) {
    const value = parsed[slots[i]]
    if (/^[A-Za-z]{2}$/.test(String(value || ""))) return String(value).toUpperCase()
  }
  return ""
}

function doneAvailable(region) {
  $done({
    content: text("可用", "Available") + (region ? " (" + region + ")" : ""),
    backgroundColor: COLOR
  })
}

function doneUnavailable(region) {
  $done({
    content: text("不可用", "Unavailable") + (region ? " (" + region + ")" : ""),
    backgroundColor: "#FF3B30"
  })
}

function doneBlocked(host) {
  $done({
    content: text("被拦截", "Blocked") + (host ? " -> " + host : ""),
    backgroundColor: "#FF9500"
  })
}

function doneNetworkError() {
  $done({ content: text("网络错误", "Network Error"), backgroundColor: "#FF9500" })
}

function doneError(status) {
  $done({ content: text("错误 (", "Error (") + codeOf(status) + ")", backgroundColor: "#FF9500" })
}

// JSON 端点「可用」：品牌色 + 明确写出 JSON 正常，避免让人以为是在测网页能否打开。
function doneJsonOk(region) {
  $done({
    content: text("可用 (JSON 正常)", "Available (JSON OK)") + (region ? " (" + region + ")" : ""),
    backgroundColor: COLOR
  })
}

// JSON 端点 200 但解析失败：多半是网关错误页或响应被截断。
// 状态码正常、内容不可用，属于「异常」而不是 HTTP 错误，也不是封锁。
function doneJsonBroken() {
  $done({
    content: text("异常 (JSON 解析失败)", "Malformed (Invalid JSON)"),
    backgroundColor: "#FF9500"
  })
}

// JSON API 端点判定：api.poe.com 这类地址没有可看的落地页面，只能看响应内容本身。
// 判定顺序与模板一致，额外只在 200 这一支加「必须能 JSON.parse」：
//   CF 挑战页 → 封锁文案 → 451 → 429 → >=500 → 30x（DOMAINS 白名单）→ 200（parse）→ 403 → 其它。
async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://api.poe.com/",
    "auto-redirect": false,
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    timeout: 8
  })

  if (error || !response) {
    doneNetworkError()
    return
  }

  const status = statusOf(response)
  const body = String(data || "")
  const lower = body.toLowerCase()

  if (isChallenge(status, lower)) {
    doneBlocked("")
    return
  }

  if (
    lower.includes("not available in your country") ||
    lower.includes("not available in your region") ||
    lower.includes("isn't available in your region")
  ) {
    doneUnavailable("")
    return
  }

  // 451：因法律/地区原因不可用（机房 IP 的典型表现）
  if (status === 451) {
    doneUnavailable("")
    return
  }

  if (status === 429) {
    $done({ content: text("请求限流", "Rate Limited"), backgroundColor: "#FF9500" })
    return
  }

  if (status >= 500) {
    $done({
      content: text("服务端错误 (", "Server Error (") + codeOf(status) + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    const location = String(header(response.headers, "location") || "")
    const host = hostOf(location)

    // 跳到陌生域名：被地区重定向 / 被劫持，不能判可用
    if (host && !isDomain(host)) {
      doneBlocked(host)
      return
    }

    doneAvailable(regionOfPath(location))
    return
  }

  // 200：JSON 端点唯一算「可用」的形态，前提是 body 真能解析。
  // 解析失败说明对端给了 HTML 错误页 / 截断响应，判异常（橙色），不能算可用。
  if (status === 200) {
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch (error) {
      doneJsonBroken()
      return
    }
    doneJsonOk(regionOfJson(parsed))
    return
  }

  if (status === 403) {
    $done({ content: text("受限", "Restricted"), backgroundColor: "#FF3B30" })
    return
  }

  doneError(status)
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: text("网络错误", "Network Error"), backgroundColor: "#FF9500" })
    })
})()
