const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

// 回调永不返回时 tile 会永久停在「检测中…」，因此 request() 自带超时兜底。
// 预算取 params.timeout（Stash 自己用它当请求上限）再放宽 400ms：
//   · 不能比 Stash 先放弃 —— 否则慢但成功的请求会被误报成「网络错误」
//   · 也不能无限等 —— 否则面板一直转圈
// 超时统一以 { error: "timeout" } 收口，交给各脚本已有的网络错误分支处理。
function request(method, params) {
  const limit = ((params && Number(params.timeout) > 0 ? Number(params.timeout) : 8) * 1000) + 400
  const later = typeof setTimeout === "function" ? setTimeout : null
  const cancel = typeof clearTimeout === "function" ? clearTimeout : null
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      if (cancel && timer) cancel(timer)
      resolve(value)
    }
    const timer = later ? later(() => finish({ error: "timeout" }), limit) : null
    const callback = (error, response, data) => finish({ error, response, data })
    // 不要先把方法取出来再调用：脱离 $httpClient 后 this 会丢失。
    // 方法名统一归一为大写，避免传 "post" 时静默走成 GET。
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

// 按顺序尝试多个正则，返回第一个命中并归一为大写的两字母国家码
function codeOf(body, patterns) {
  const source = String(body || "")
  for (let i = 0; i < patterns.length; i++) {
    const match = source.match(patterns[i])
    if (match) return match[1].toUpperCase()
  }
  return ""
}

// Cloudflare 挑战页识别（组合判断，避免误伤正常页面）：
//   · 200 + 挑战页是真实存在的形态（部分请求 CF 直接回 200），必须判为「被拦截」，
//     否则会被当成「可用」——这是最严重的一类误报。
//   · 但正常页面也可能引用 CF 资源而出现 "challenge-platform" 字样，
//     因此它只作为「辅助特征」，必须再叠加一条语义强特征才算数。
function isChallenge(status, body) {
  const lower = String(body || "").toLowerCase()
  // 语义强特征：挑战页独有文案，正常页面几乎不可能出现
  const strong =
    lower.includes("just a moment") ||
    lower.includes("enable javascript and cookies") ||
    lower.includes("cf-chl") ||
    lower.includes("checking your browser")
  // "challenge-platform" 等辅助特征单独出现不算数，必须同时命中一条语义强特征
  if (!strong) return false
  return status === 200 || status === 403 || status === 503 || status === undefined
}

// Anthropic 官方「Supported Regions Policy」（anthropic.com/legal/supported-regions，
// 2026-11-12 生效版实测，共 185 个国家/地区）里**没有**的地区。
// 注意：Iraq / Libya / Sudan / Somalia / Pakistan / Palestine 等在该名单里是支持的，
// 不要想当然地当作封锁区。
const BLOCKED_REGIONS = [
  "AF", "BY", "CN", "CU", "HK", "IR", "KP", "MM", "MO", "RU", "SY", "TM", "VE", "YE"
]

// claude.ai 整站（含 /login）被 Cloudflare 托管挑战挡住，浏览器之外拿不到任何地区信息。
// platform.claude.com 会服务端渲染 Anthropic 自己的出口地区判断：\"ipCountry\":\"XX\"
function countryOf(html) {
  return codeOf(html, [/ipCountry\\*"\s*:\s*\\*"([A-Za-z]{2})\\*"/])
}

async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://platform.claude.com/login",
    "auto-redirect": false,
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    timeout: 3
  })

  if (error) {
    $done({ content: text("网络错误", "Network Error"), backgroundColor: "#FF9500" })
    return
  }

  if (!response) {
    $done({ content: text("无响应", "No Response"), backgroundColor: "#FF9500" })
    return
  }

  const status = statusOf(response)
  const body = String(data || "")

  if (isChallenge(status, body)) {
    $done({ content: text("被拦截", "Blocked"), backgroundColor: "#FF9500" })
    return
  }

  // 页面明写「本地区不可用」：不能因为 ipCountry 解析不出来就判「可用」
  const lower = body.toLowerCase()
  if (
    lower.includes("not available in your country") ||
    lower.includes("not available in your region") ||
    lower.includes("isn't available in your region")
  ) {
    $done({ content: text("不可用", "Unavailable"), backgroundColor: "#FF3B30" })
    return
  }

  if (status === 429) {
    $done({ content: text("请求限流", "Rate Limited"), backgroundColor: "#FF9500" })
    return
  }

  // console.anthropic.com → platform.claude.com 之类的正常搬家，不是地区封锁；
  // 但跳到 Anthropic 体系之外的域名说明被劫持/被拦，不能判「可用」
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    const location = String(header(response.headers, "location") || "").trim()
    // 协议相对（//host/path）也要取出 host：否则 host 为空会让下面的站外判定失效
    const host = (location.startsWith("//")
      ? location.slice(2)
      : location.replace(/^https?:\/\//i, "")
    )
      .split("/")[0]
      .split(":")[0]
      .toLowerCase()

    if (host && !/(^|\.)(claude\.ai|claude\.com|anthropic\.com)$/i.test(host)) {
      $done({ content: text("被拦截", "Blocked") + " -> " + host, backgroundColor: "#FF9500" })
      return
    }

    $done({
      content: text("可用 ", "Available ") + "-> " + (host || "?"),
      backgroundColor: "#D97757"
    })
    return
  }

  if (status !== 200) {
    $done({ content: text("错误 (", "Error (") + (status || "?") + ")", backgroundColor: "#FF9500" })
    return
  }

  const country = countryOf(body)

  // 200 但没解析到 ipCountry：页面结构变了，只能确认「连得上 Anthropic」
  if (!country) {
    $done({ content: text("可用", "Available"), backgroundColor: "#D97757" })
    return
  }

  if (BLOCKED_REGIONS.indexOf(country) >= 0) {
    $done({ content: text("被封锁", "Blocked") + " (" + country + ")", backgroundColor: "#FF3B30" })
    return
  }

  $done({ content: text("可用", "Available") + " (" + country + ")", backgroundColor: "#D97757" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: text("网络错误", "Network Error"), backgroundColor: "#FF9500" })
    })
})()
