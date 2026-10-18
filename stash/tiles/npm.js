const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

// ---- 本脚本配置 ----
// 允许出现的业务域名：registry 在 npmjs.org，官网/文档在 npmjs.com。
// 端点选 registry 根路径（实测返回 {}，也可能是 {"db_name":"registry"}）：
// 体积最小，且不会被官网前端改版影响。
const DOMAINS = ["npmjs.org", "npmjs.com"]
const COLOR = "#CB3837"

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

// 大小写不敏感地判断 host 是否属于 DOMAINS（允许 www. / open. 之类的子域）
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

// JSON 端点的「拿到 200」不等于「服务正常」：网关/中间设备可以把 body 换成 HTML 拦截页
// 但保留 200。只有真能 JSON.parse 出来的 body 才是本服务的数据。
// 用 try/catch 而不是只看首个字符：截断的 JSON 也以 { 开头，必须整体解析。
function isJson(body) {
  try {
    JSON.parse(String(body || ""))
    return true
  } catch (error) {
    return false
  }
}

// 200 但内容不可信：既不是可用也不是封锁，用橙色「异常」把这类假 200 标出来
function doneUnexpected() {
  $done({ content: text("异常", "Unexpected"), backgroundColor: "#FF9500" })
}

// 落地域名判定：不跟随重定向，直接看服务端把请求路由到了哪个地区/站点。
// 本脚本请求的是 JSON 端点，所以 200 分支额外要求 body 能解析（见 isJson）。
// registry.npmjs.org 根路径只会 301 到 /-/ping 之类的同域路径，不会跳去别处。
async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://registry.npmjs.org/",
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

  // 顺序不能变：挑战页、封锁文案必须排在「200 即可用」之前
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

  // 451：因法律/地区原因不可用
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

  if (status === 200) {
    // JSON 端点必须真的能解析：公司网关/运营商改写 body 时状态码仍是 200，
    // 那个 200 不能证明 npm registry 可用。
    if (!isJson(body)) {
      doneUnexpected()
      return
    }

    doneAvailable("")
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
