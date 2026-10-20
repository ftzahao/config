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

// 从 Location 取 host：
//   · 绝对 URL https://x.com/i/flow/login → x.com
//   · 协议相对 //x.com/i/flow/login       → x.com
//   · 相对路径 /i/flow/login              → ""（同域跳转，没有 host 可判）
// 直接用前缀正则匹配整个 Location 会把 x.com.evil.example 误当成同品牌。
function locationHost(location) {
  const raw = String(location || "").trim()
  if (!raw) return ""
  const rest = raw.startsWith("//") ? raw.slice(2) : raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  return rest.split("/")[0].split(":")[0].toLowerCase()
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

// x.com/ 首页：200 且拿到正常首页 HTML 才算可用。
// 不再用 /i/api/1.1/branch/init.json —— 它无 guest token 时恒为 403，无法区分地区封锁。
async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://x.com/",
    "auto-redirect": false,
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9"
    },
    timeout: 8
  })

  if (error || !response) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  const status = statusOf(response)
  const headers = (response && response.headers) || {}
  const location = header(headers, "location") || ""
  const body = String(data || "").toLowerCase()

  // Cloudflare 反爬拦截：既不是地区封锁，也不能当「可用」
  if (isChallenge(status, body)) {
    $done({ content: isChinese() ? "被拦截" : "Blocked", backgroundColor: "#FF9500" })
    return
  }

  // 被墙/被地区重定向到其它站点
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    const host = locationHost(location)
    // x.com 与 twitter.com 是同一品牌（x.com 会往 twitter.com 跳）；
    // 只有「确实跳到站外」才算被拦，相对路径（/i/flow/login）不是被拦。
    if (host && !/^(.*\.)?(x\.com|twitter\.com)$/i.test(host)) {
      $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
      return
    }
    $done({
      content: (isChinese() ? "重定向 (" : "Redirect (") + status + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  if (status === 429) {
    $done({ content: isChinese() ? "请求限流" : "Rate Limited", backgroundColor: "#FF9500" })
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
    // 正常首页会带 app shell 标记；出现封锁/错误文案则判不可用
    const blocked =
      body.includes("not available in your country") ||
      body.includes("not available in your region") ||
      body.includes("isn't available in your region") ||
      body.includes("region blocked") ||
      body.includes("this site is not available")

    if (blocked) {
      $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
      return
    }

    // 正常首页会带 app shell 标记（data-app-env / og:site_name 等）。
    // 不能只凭长度判可用：错误页和拦截页往往也 >1000 字节。
    // 注意 body 已 toLowerCase，标记串必须一律小写。
    const appShell =
      body.includes("data-app-env") ||
      body.includes('property="og:site_name"') ||
      body.includes("(formerly twitter)") ||
      body.includes("__initial_state__") ||
      body.includes("web-app")

    if (!appShell) {
      $done({ content: isChinese() ? "未知" : "Unknown", backgroundColor: "#FF9500" })
      return
    }

    $done({ content: isChinese() ? "可用" : "Available", backgroundColor: "#1D9BF0" })
    return
  }

  if (status === 403 || status === 451) {
    $done({ content: isChinese() ? "受限" : "Restricted", backgroundColor: "#FF3B30" })
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
