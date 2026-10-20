// Spotify 不按地区封锁：拿到地区码即视为可用；此 tile 用于确认出口地区与连通性。
// 地区来源：www.spotify.com/signup 的 302 Location（/<cc>/）或 sp_m cookie，
// 兜底读 open.spotify.com 内嵌 appServerConfig 的 market。
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

// Spotify 自家域名：30x 的落地 host 必须落在这个白名单内，否则按「被劫持/被地区重定向」处理
const DOMAINS = ["spotify.com"]

// 大小写不敏感地判断 host 是否属于 DOMAINS（允许 open./www./accounts. 之类的子域）
function isDomain(host) {
  const lower = String(host || "").toLowerCase()
  if (!lower) return false
  for (let i = 0; i < DOMAINS.length; i++) {
    const domain = DOMAINS[i].toLowerCase()
    if (lower === domain || lower.endsWith("." + domain)) return true
  }
  return false
}

// 从 Location 取 host：兼容绝对 URL、协议相对（//host/...）；相对路径返回 ""
function hostOf(location) {
  const raw = String(location || "").trim()
  if (!raw) return ""
  const rest = raw.startsWith("//") ? raw.slice(2) : raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  return rest.split("/")[0].split(":")[0].toLowerCase()
}

// 纯语言代码（不是国家/地区码）：/en/xx/ 这类路径段不能当地区后缀报出去
const LANGUAGE_ONLY = { en: true, ja: true, ko: true, zh: true }

// 从 Location（如 https://www.spotify.com/sg-en/signup/）里取地区段，取不到返回 ""
function regionOfLocation(location) {
  const rest = String(location || "").startsWith("//")
    ? String(location).slice(2)
    : String(location || "").replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  const slash = rest.indexOf("/")
  if (slash < 0) return ""
  const segment = rest.slice(slash + 1).split(/[/?]/)[0].toLowerCase()
  const match = segment.match(/^([a-z]{2})(?:-[a-z]{2,})?$/)
  if (!match) return ""
  if (LANGUAGE_ONLY[match[1]]) return ""
  return match[1].toUpperCase()
}

// www.spotify.com 会 302 到 /<国家码>/...，这是官方地区判定来源；
// 不跟随重定向，才能读到 Location 与 sp_m cookie。
async function countryFromRedirect(budgetMs) {
  const { error, response, data } = await request("GET", {
    url: "https://www.spotify.com/signup",
    "auto-redirect": false,
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    timeout: 8
  }, budgetMs)

  if (error || !response) return { ok: false, region: "" }

  const headers = response.headers || {}
  const location = String(header(headers, "location") || "")
  const status = statusOf(response)

  // 跳到 Spotify 之外的站点 = 被劫持 / 被运营商地区重定向，必须判「被拦截」。
  // 必须先于地区解析：否则 https://evil.example/sg-en/ 会被解析出地区并当成「可用」。
  if (location) {
    const host = hostOf(location)
    // 相对路径（/sg-en/signup/）没有 host，属同域跳转，不在此列
    if (host && !isDomain(host)) return { ok: false, region: "", blocked: true, host }
  }

  const fromLocation = regionOfLocation(location)
  if (fromLocation) return { ok: true, region: fromLocation }

  const cookie = String(header(headers, "set-cookie") || "")
  const fromCookie = cookie.match(/sp_m=([a-z]{2})/i)
  if (fromCookie) return { ok: true, region: fromCookie[1].toUpperCase() }

  // Cloudflare 反爬拦截：既不是地区封锁，也不能当「可用」
  if (isChallenge(status, data)) return { ok: false, region: "", blocked: true }

  // 页面明写「本地区不可用」：不能因为没跳到 /<cc>/ 就当成可用
  const lower = String(data || "").toLowerCase()
  if (
    lower.includes("not available in your country") ||
    lower.includes("not available in your region") ||
    lower.includes("isn't available in your region")
  ) {
    return { ok: false, region: "", unavailable: true }
  }

  // 没跳转也没 cookie：状态码异常就说清楚，别把失败当成功
  if (status !== 200 && status !== 301 && status !== 302 && status !== 303) {
    return { ok: false, region: "", code: codeOf(status) }
  }

  // 落在注册页，说明地区靠其它信息判断；先记为可用
  return { ok: true, region: "" }
}

// open.spotify.com 首页内嵌 base64 的 appServerConfig（market / isAnonymous）
async function marketFromOpen(budgetMs) {
  const { error, response, data } = await request("GET", {
    url: "https://open.spotify.com/",
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    timeout: 8
  }, budgetMs)

  if (error || !response) return { ok: false, region: "" }

  const status = statusOf(response)

  // Cloudflare 反爬拦截：不能当「可用」
  if (isChallenge(status, data)) return { ok: false, region: "", blocked: true }
  if (status !== 200) return { ok: false, region: "" }

  const match = String(data || "").match(/<script id="appServerConfig"[^>]*>([^<]+)<\/script>/)
  if (!match) return { ok: true, region: "" }

  try {
    let raw = match[1].trim()
    while (raw.length % 4 !== 0) raw += "="

    const binary = base64Decode(raw)
    const json = JSON.parse(binary)
    const market = json.market || json.country
    return { ok: true, region: market ? String(market).toUpperCase() : "" }
  } catch (e) {
    return { ok: true, region: "" }
  }
}

// Stash 运行时不一定有 atob，这里自带一个纯 JS 的 base64 解码
function base64Decode(input) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  let buffer = 0
  let bits = 0
  let output = ""
  const cleaned = String(input).replace(/[^A-Za-z0-9+/]/g, "")

  for (let i = 0; i < cleaned.length; i++) {
    buffer = (buffer << 6) | chars.indexOf(cleaned[i])
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }

  return output
}

async function main() {
  // 两次请求共享同一个 TILE_BUDGET_MS，总时长不会因为串行翻倍
  const started = Date.now()
  const signup = await countryFromRedirect(TILE_BUDGET_MS)

  // 被劫持（跳到站外域名）/ Cloudflare 反爬拦截：既不是地区封锁，也不能当「可用」
  if (signup.blocked) {
    $done({
      content: (isChinese() ? "被拦截" : "Blocked") + (signup.host ? " -> " + signup.host : ""),
      backgroundColor: "#FF9500"
    })
    return
  }

  // 页面明写「本地区不可用」
  if (signup.unavailable) {
    $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
    return
  }

  if (!signup.ok) {
    // 状态码异常要说清楚，不能一律报「网络错误」
    const code = signup.code
    if (code === "451") {
      $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
    } else if (code === "403") {
      $done({ content: isChinese() ? "受限" : "Restricted", backgroundColor: "#FF3B30" })
    } else if (code === "429") {
      $done({ content: isChinese() ? "请求限流" : "Rate Limited", backgroundColor: "#FF9500" })
    } else if (Number(code) >= 500) {
      $done({
        content: (isChinese() ? "服务端错误 (" : "Server Error (") + code + ")",
        backgroundColor: "#FF9500"
      })
    } else {
      $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    }
    return
  }

  if (!signup.region) {
    // 预算耗尽就别再发第二个请求
    const remaining = TILE_BUDGET_MS - (Date.now() - started)
    if (remaining <= 300) {
      $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
      return
    }

    const open = await marketFromOpen(remaining)
    if (open.blocked) {
      $done({ content: isChinese() ? "被拦截" : "Blocked", backgroundColor: "#FF9500" })
      return
    }
    if (open.region) {
      $done({
        content: (isChinese() ? "可用 (" : "Available (") + open.region + ")",
        backgroundColor: "#1DB954"
      })
      return
    }

    $done({ content: isChinese() ? "可用" : "Available", backgroundColor: "#1DB954" })
    return
  }

  $done({
    content: (isChinese() ? "可用 (" : "Available (") + signup.region + ")",
    backgroundColor: "#1DB954"
  })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    })
})()
