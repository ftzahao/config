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

// OpenAI 官方「Supported countries and territories」里**没有**的地区
// （developers.openai.com/api/docs/supported-countries，实测 208 个国家/地区）。
// 注意 Afghanistan / Myanmar / Yemen / Turkmenistan 在 OpenAI 名单里是支持的，
// 与 Anthropic、Gemini 的名单都不同，不要互相照抄。
const BLOCKED_REGIONS = ["BY", "CN", "CU", "HK", "IR", "KP", "MO", "RU", "SY", "VE"]

async function main() {
  // chatgpt.com 首页 / backend-api 全部被 Cloudflare 托管挑战拦住（403 无 JS 页面），
  // 只有 cdn-cgi/trace 是纯文本、能稳定给出出口地区：loc=XX
  const { error, response, data } = await request("GET", {
    url: "https://chatgpt.com/cdn-cgi/trace",
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

  if (status === 429) {
    $done({ content: text("请求限流", "Rate Limited"), backgroundColor: "#FF9500" })
    return
  }

  if (status !== 200) {
    $done({ content: text("错误 (", "Error (") + (status || "?") + ")", backgroundColor: "#FF9500" })
    return
  }

  // trace 是每行 key=value 的纯文本
  const country = codeOf(body, [/^loc=([A-Za-z]{2})$/m])

  if (!country) {
    $done({ content: text("地区未知", "Region Unknown"), backgroundColor: "#FF9500" })
    return
  }

  if (BLOCKED_REGIONS.indexOf(country) >= 0) {
    $done({ content: text("被封锁", "Blocked") + " (" + country + ")", backgroundColor: "#FF3B30" })
    return
  }

  $done({ content: text("可用", "Available") + " (" + country + ")", backgroundColor: "#10A37F" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: text("网络错误", "Network Error"), backgroundColor: "#FF9500" })
    })
})()
