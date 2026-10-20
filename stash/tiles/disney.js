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

// 状态码缺失时说「无响应」而不是拼出 undefined
function codeOf(status) {
  return status === undefined || status === null ? "no response" : String(status)
}

// Disney+ 浏览器端公开的 API key：
//   BEARER —— /devices 与 graphql 用（带 "Bearer " 前缀）
//   RAW    —— /token 用（不带前缀，作 authorization 头）
const BEARER = "Bearer ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84"
const RAW = "ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84"

const REFRESH_TOKEN_MUTATION =
  "mutation refreshToken($input: RefreshTokenInput!) {\n" +
  "  refreshToken(refreshToken: $input) {\n" +
  "    activeSession {\n" +
  "      sessionId\n" +
  "      inSupportedLocation\n" +
  "      location {\n" +
  "        countryCode\n" +
  "      }\n" +
  "    }\n" +
  "  }\n" +
  "}"

function parseJson(data) {
  try {
    return JSON.parse(data)
  } catch (e) {
    return undefined
  }
}

async function main() {
  // 三步串行共享同一个 TILE_BUDGET_MS，总时长永远 <= 2.5s
  const started = Date.now()

  // 1. /devices：拿设备 assertion（实测 201）
  const r1 = await request("POST", {
    url: "https://disney.api.edge.bamgrid.com/devices",
    headers: { Authorization: BEARER, "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      deviceFamily: "browser",
      applicationRuntime: "chrome",
      deviceProfile: "windows",
      attributes: {}
    }),
    timeout: 8
  }, TILE_BUDGET_MS)

  if (r1.error || !r1.response) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  const status1 = statusOf(r1.response)
  const body1 = String(r1.data || "")

  // Cloudflare 挑战页的 403 是反爬拦截，不是「地区受限」—— 必须先于下面的
  // 403 分支单独识别，否则会把所有无浏览器指纹的请求误报成地区受限
  if (isChallenge(status1, body1)) {
    $done({ content: isChinese() ? "被拦截" : "Blocked", backgroundColor: "#FF9500" })
    return
  }

  if (status1 === 403 || status1 === 451 || body1.includes("403 ERROR")) {
    $done({ content: isChinese() ? "受限" : "Restricted", backgroundColor: "#FF3B30" })
    return
  }

  const json1 = parseJson(body1)
  const assertion = json1 && json1.assertion

  if (!assertion) {
    $done({
      content: (isChinese() ? "错误 (" : "Error (") + codeOf(status1) + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  // 预算耗尽就别再发 /token
  const afterDevices = TILE_BUDGET_MS - (Date.now() - started)
  if (afterDevices <= 300) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  // 2. /token：用 assertion 换 refresh_token（实测 200）
  const r2 = await request("POST", {
    url: "https://disney.api.edge.bamgrid.com/token",
    headers: {
      authorization: RAW,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA
    },
    body:
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange&latitude=0&longitude=0&platform=browser&subject_token=" +
      assertion +
      "&subject_token_type=urn%3Abamtech%3Aparams%3Aoauth%3Atoken-type%3Adevice",
    timeout: 8
  }, afterDevices)

  if (r2.error || !r2.response) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  const status2 = statusOf(r2.response)
  const body2 = String(r2.data || "")

  // 同 /devices：CF 挑战页的 403 不能当地区封锁
  if (isChallenge(status2, body2)) {
    $done({ content: isChinese() ? "被拦截" : "Blocked", backgroundColor: "#FF9500" })
    return
  }

  // 地区封锁时 /token 会返回 forbidden-location
  if (status2 === 403 || status2 === 451 || body2.includes("forbidden-location")) {
    $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
    return
  }

  const json2 = parseJson(body2)
  const refreshToken = json2 && json2.refresh_token

  if (!refreshToken) {
    $done({
      content: (isChinese() ? "错误 (" : "Error (") + codeOf(status2) + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  // 预算耗尽就别再发 graphql
  const afterToken = TILE_BUDGET_MS - (Date.now() - started)
  if (afterToken <= 300) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  // 3. graphql refreshToken：返回 session.inSupportedLocation 与 session.location.countryCode
  const r3 = await request("POST", {
    url: "https://disney.api.edge.bamgrid.com/graph/v1/device/graphql",
    headers: { Authorization: BEARER, "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      query: REFRESH_TOKEN_MUTATION,
      variables: { input: { refreshToken } }
    }),
    timeout: 8
  }, afterToken)

  if (r3.error || !r3.response) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  const status3 = statusOf(r3.response)
  const body3 = String(r3.data || "")

  // CloudFront 的 "403 ERROR" 页本身就是 403：必须在这之前判，
  // 否则会被 status3 !== 200 分支统一吞成「不可用」（/devices 阶段是同一顺序）
  if (body3.includes("403 ERROR")) {
    $done({ content: isChinese() ? "受限" : "Restricted", backgroundColor: "#FF3B30" })
    return
  }

  if (status3 !== 200) {
    if (status3 === 403 || status3 === 451 || body3.includes("forbidden-location")) {
      $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
      return
    }

    $done({
      content: (isChinese() ? "错误 (" : "Error (") + codeOf(status3) + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  const json3 = parseJson(body3)
  const session =
    json3 && json3.data && json3.data.refreshToken && json3.data.refreshToken.activeSession

  // 有 GraphQL 错误但没有 session：保留可诊断信息
  if (!session) {
    const errors = json3 && json3.errors
    if (errors && errors.length) {
      const code = errors[0].extensions && errors[0].extensions.code
      $done({
        content: (isChinese() ? "错误 (" : "Error (") + (code || errors[0].message || "graphql") + ")",
        backgroundColor: "#FF9500"
      })
      return
    }

    $done({ content: isChinese() ? "未知" : "Unknown", backgroundColor: "#FF9500" })
    return
  }

  if (session.inSupportedLocation === false) {
    $done({ content: isChinese() ? "不可用" : "Unavailable", backgroundColor: "#FF3B30" })
    return
  }

  const country = session.location && session.location.countryCode
  if (country) {
    $done({
      content: (isChinese() ? "可用 (" : "Available (") + String(country).toUpperCase() + ")",
      backgroundColor: "#113CCF"
    })
    return
  }

  $done({ content: isChinese() ? "可用" : "Available", backgroundColor: "#113CCF" })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    })
})()
