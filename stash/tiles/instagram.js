const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

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

// 页面内嵌的 PolarisSiteData 模块带 country_code（真实出口国家码），
// 例如 ["PolarisSiteData",[],{"country_code":"JP",...}]
function regionOf(body) {
  const data = body.match(/\["PolarisSiteData",\[\],\{"country_code"\s*:\s*"([A-Za-z]{2})"/)
  if (data) return data[1].toUpperCase()

  const loose = body.match(/"country_code"\s*:\s*"([A-Za-z]{2})"/)
  return loose ? loose[1].toUpperCase() : ""
}

async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://www.instagram.com/",
    "auto-redirect": false,
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9"
    },
    timeout: 8
  })

  if (error) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  const status = statusOf(response)
  const headers = (response && response.headers) || {}
  const location = header(headers, "location") || ""
  const body = data || ""
  const lower = body.toLowerCase()

  // Cloudflare 反爬拦截：既不是地区封锁，也不能当「可用」。
  // 必须在「isApp」判定之前，否则含 Polaris 字样的挑战页会被误判为可用。
  if (isChallenge(status, lower)) {
    $done({ content: isChinese() ? "被拦截" : "Blocked", backgroundColor: "#FF9500" })
    return
  }

  if (
    lower.includes("not available in your country") ||
    lower.includes("isn't available in your country") ||
    lower.includes("is not available in your region") ||
    lower.includes('"is_country_blocked":true')
  ) {
    $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
    return
  }

  if (status === 301 || status === 302 || status === 307 || status === 308) {
    // 跳到登录/checkpoint 属于正常；跳到 Meta 之外的站点说明被拦
    if (
      location &&
      !/^https?:\/\/([a-z0-9-]+\.)?(instagram\.com|facebook\.com|meta\.com|cdninstagram\.com)/i.test(
        location
      )
    ) {
      $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
      return
    }
    $done({
      content: (isChinese() ? "重定向 (" : "Redirect (") + status + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  if (status === 429 || lower.includes("too many requests")) {
    $done({ content: isChinese() ? "请求限流" : "Rate Limited", backgroundColor: "#FF9500" })
    return
  }

  if (status === 403 || status === 451) {
    $done({ content: isChinese() ? "受限" : "Restricted", backgroundColor: "#FF3B30" })
    return
  }

  if (status >= 500) {
    $done({
      content: (isChinese() ? "服务端错误 (" : "Server Error (") + codeOf(status) + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  if (status === 200) {
    // 真正的首页带 Polaris 应用外壳；只有衡量的占位页视为未知
    const isApp = lower.includes("polaris") || lower.includes("instagram.com/static")
    if (!isApp) {
      $done({ content: isChinese() ? "未知" : "Unknown", backgroundColor: "#FF9500" })
      return
    }

    const region = regionOf(body)
    if (region) {
      $done({
        content: (isChinese() ? "可用 (" : "Available (") + region + ")",
        backgroundColor: "#E1306C"
      })
      return
    }

    $done({ content: isChinese() ? "可用" : "Available", backgroundColor: "#E1306C" })
    return
  }

  $done({
    content: (isChinese() ? "错误 (" : "Error (") + codeOf(status) + ")",
    backgroundColor: "#FF9500"
  })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    })
})()
