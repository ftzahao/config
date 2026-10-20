// 这里必须是移动端 UA：m.youtube.com 只要看到桌面 UA 就直接 302 到
// www.youtube.com/?app=desktop，这样就测不到移动站本身了。常量名仍沿用 UA。
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

// ---- 本脚本配置 ----
// 允许出现的业务域名：youtube.com 用来放行 www./m. 之间的同品牌跨子域跳转，
// youtu.be 是分享短链、googlevideo.com 是视频 CDN，都属于 YouTube 自家落地目标。
const DOMAINS = ["youtube.com", "youtu.be", "googlevideo.com"]
const COLOR = "#FF0000"

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
  // 协议相对（//host/path）也要取出 host：否则 host 为空会让
  // 「跳到陌生域名 → 被拦截」的分支失效，把劫持页误报成「可用」。
  const raw = String(location || "").trim()
  if (!raw) return ""
  const rest = raw.startsWith("//") ? raw.slice(2) : raw.replace(/^https?:\/\//i, "")
  return rest.split("/")[0].split(":")[0].toLowerCase()
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

// 落地域名判定：不跟随重定向，直接看服务端把请求路由到了哪个地区/站点。
// 移动站被判定为「该走桌面站」时会 302 到 www.youtube.com/?app=desktop（同品牌跨子域），
// 这不是封锁；只有跳到 youtube.com / youtu.be / googlevideo.com 之外的域名才判被拦截。
async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://m.youtube.com/",
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

  if (status === 200) {
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
