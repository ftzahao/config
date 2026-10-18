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

// 只探测 Google 的**通用连通性**，不代表地区可用性：
// www.google.com/generate_204 与 www.gstatic.com/generate_204 实测都是裸 204，
// 不含任何地区信息，也不会跳到 google.com.hk 之类的地区站
// （www.google.com 本身接受任意地区）。因此这里不做地区判定。
async function main() {
  // 关闭跟随：万一真出现 30x，也能看到真实的 3xx 与 Location 而不是被吞掉
  const { error, response, data } = await request("GET", {
    url: "https://www.google.com/generate_204",
    "auto-redirect": false,
    headers: { "User-Agent": UA },
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

  if (status === 204) {
    $done({ content: text("可用", "Available"), backgroundColor: "#4285F4" })
    return
  }

  if (isChallenge(status, body)) {
    $done({ content: text("被拦截", "Blocked"), backgroundColor: "#FF9500" })
    return
  }

  if (status === 429) {
    $done({ content: text("请求限流", "Rate Limited"), backgroundColor: "#FF9500" })
    return
  }

  // 30x 也算连着（也许是被网络设备改写了请求），但不是 204 就该如实说明
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    const host = String(header(response.headers, "location") || "")
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
    $done({
      content: text("重定向 ", "Redirect ") + (host || "(" + status + ")"),
      backgroundColor: "#FF9500"
    })
    return
  }

  if (status === 200) {
    // generate_204 正常不该有 body；给了 200 说明链路被中间设备改写了
    $done({ content: text("异常 (200)", "Unexpected (200)"), backgroundColor: "#FF9500" })
    return
  }

  $done({ content: text("错误 (", "Error (") + (status || "?") + ")", backgroundColor: "#FF9500" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: text("网络错误", "Network Error"), backgroundColor: "#FF9500" })
    })
})()
