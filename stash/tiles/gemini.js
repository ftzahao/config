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

// ⚠️ 这是**近似判定**，不是 Gemini 官方的地区判据。
// Gemini 自身没有可用的地区信号：
//   · gemini.google.com 不在 Cloudflare 后面，/cdn-cgi/trace 实测 404
//   · /app 与 /faq 返回几乎同样大小的 200 页面（实测 gzip 约 129 KB），
//     可用地区也没有「不支持」文案，未登录时没有任何重定向
// 因此复用 Google 生态里唯一稳定、能按出口 IP 给出国家码的来源：youtube.com 的 GL。
// 名单依据 Google 官方「Where you can use the Gemini web app」页面的
// "Supported countries & territories" 段（support.google.com/gemini/answer/13575153，2026-10 实测）：
// 该段**包含** Hong Kong、Macau、Taiwan、Iraq、Libya、Somalia、Sudan、Pakistan、Myanmar 等，
// **不包含** Russia、Belarus、Cuba、Iran、North Korea、Afghanistan、Syria —— 故下面这 7 个判受限。
// ⚠️ 切勿照抄 ChatGPT / Claude 的封锁名单：那两个服务封锁 HK / MO / CN，Gemini 不封锁。
// ⚠️ 中国大陆在该段标注为「Mainland China (Workspace only)」，属特殊情形，
//    本 tile 不做区分（CN 不列入 unsupported，避免对 Workspace 用户误报）。
const UNSUPPORTED_REGIONS = ["AF", "BY", "CU", "IR", "KP", "RU", "SY"]

async function main() {
  const { error, response, data } = await request("GET", {
    url: "https://www.youtube.com/premium",
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

  const lower = body.toLowerCase()
  if (lower.includes("not available in your country") || lower.includes("isn't available in your country")) {
    $done({ content: text("地区受限", "Region Restricted"), backgroundColor: "#FF3B30" })
    return
  }

  // INNERTUBE_CONTEXT_GL 由服务端写入；单独的 GL 会被 ?gl= 参数覆盖，仅作兜底
  const country = codeOf(body, [/"INNERTUBE_CONTEXT_GL"\s*:\s*"([A-Za-z]{2})"/, /"GL"\s*:\s*"([A-Za-z]{2})"/])

  if (!country) {
    // 页面结构变了：只能确认 YouTube(Google) 连通，不谎报地区结论
    $done({ content: text("可达·地区未知", "Reachable · Region Unknown"), backgroundColor: "#FF9500" })
    return
  }

  if (UNSUPPORTED_REGIONS.indexOf(country) >= 0) {
    $done({ content: text("地区受限", "Region Restricted") + " (" + country + ")", backgroundColor: "#FF3B30" })
    return
  }

  $done({ content: text("可用", "Available") + " (" + country + ")", backgroundColor: "#4285F4" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: text("网络错误", "Network Error"), backgroundColor: "#FF9500" })
    })
})()
