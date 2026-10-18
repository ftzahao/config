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

// 从 Location（如 https://www.spotify.com/jp/xx/）里取地区段，取不到返回 ""
function regionOfLocation(location) {
  const match = String(location).match(/spotify\.com\/([a-z]{2})(?:-[a-z]{2})?\//i)
  return match ? match[1].toUpperCase() : ""
}

// www.spotify.com 会 302 到 /<国家码>/...，这是官方地区判定来源；
// 不跟随重定向，才能读到 Location 与 sp_m cookie。
async function countryFromRedirect() {
  const { error, response, data } = await request("GET", {
    url: "https://www.spotify.com/signup",
    "auto-redirect": false,
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    timeout: 8
  })

  if (error || !response) return { ok: false, region: "" }

  const headers = response.headers || {}
  let location
  for (const key in headers) {
    if (key.toLowerCase() === "location") location = headers[key]
  }

  const fromLocation = location ? regionOfLocation(location) : ""
  if (fromLocation) return { ok: true, region: fromLocation }

  const cookie = String(headers["set-cookie"] || "")
  const fromCookie = cookie.match(/sp_m=([a-z]{2})/i)
  if (fromCookie) return { ok: true, region: fromCookie[1].toUpperCase() }

  const status = statusOf(response)

  // Cloudflare 反爬拦截：既不是地区封锁，也不能当「可用」
  if (isChallenge(status, data)) return { ok: false, region: "", blocked: true }

  // 没跳转也没 cookie：状态码异常就说清楚，别把失败当成功
  if (status !== 200 && status !== 302 && status !== 301) {
    return { ok: false, region: "", code: codeOf(status) }
  }

  // 落在注册页，说明地区靠其它信息判断；先记为可用
  return { ok: true, region: "" }
}

// open.spotify.com 首页内嵌 base64 的 appServerConfig（market / isAnonymous）
async function marketFromOpen() {
  const { error, response, data } = await request("GET", {
    url: "https://open.spotify.com/",
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    timeout: 8
  })

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
  const signup = await countryFromRedirect()

  // Cloudflare 反爬拦截：既不是地区封锁，也不能当「可用」
  if (signup.blocked) {
    $done({ content: isChinese() ? "被拦截" : "Blocked", backgroundColor: "#FF9500" })
    return
  }

  if (!signup.ok) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  if (!signup.region) {
    const open = await marketFromOpen()
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
