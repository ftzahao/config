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

// 从 URL 的第 3 段取地区：https://www.netflix.com/jp-en/title/... → jp
// 没有地区前缀（登录态下会直接给 /title/...）时返回 ""
function regionOfUrl(url) {
  if (!url) return ""
  let path = String(url).replace(/^https?:\/\/[^/]+/i, "")
  const query = path.indexOf("?")
  if (query >= 0) path = path.slice(0, query)

  const segment = path.split("/").filter((part) => part.length > 0)[0]
  if (!segment || segment === "title" || segment === "browse" || segment === "login") return ""

  const match = segment.match(/^([a-z]{2})(?:-[a-z]{2,})?$/i)
  return match ? match[1].toUpperCase() : ""
}

async function checkTitle(id, budgetMs) {
  // 不跟随重定向：未登录访问 /title/ 会 301 到 /<地区>-<语言>/title/...，
  // 地区码只在 Location / X-Originating-Url 里。
  const { error, response, data } = await request("GET", {
    url: "https://www.netflix.com/title/" + id,
    "auto-redirect": false,
    headers: {
      "User-Agent": UA
    },
    timeout: 8
  }, budgetMs)

  // network=true 表示根本没连上，与「连上了但拿不到地区」要区分开
  if (error) return { ok: false, network: true, region: "" }
  if (!response) return { ok: false, network: true, region: "" }

  const status = statusOf(response)
  const headers = response.headers || {}

  // 地区来源优先级：Location（跳目标）> X-Originating-Url（回源地址）
  const candidates = [
    header(headers, "location"),
    header(headers, "x-originating-url")
  ]

  for (const candidate of candidates) {
    const region = regionOfUrl(candidate)
    if (region) return { ok: true, network: false, region }
  }

  // 没跳转/没头：若直接 200 且是登录态无前缀 URL，说明地区就是本出口但不带码
  if (status === 200) return { ok: true, network: false, region: "" }

  // 未跳转却返回 403：Cloudflare 反爬拦截，不是「不可用」
  if (isChallenge(status, data)) return { ok: false, network: false, region: "", blocked: true }

  return { ok: false, network: false, region: "", code: codeOf(status) }
}

async function main() {
  // 两次请求共享 TILE_BUDGET_MS，总时长永远 <= 2.5s，不会因为串行拖到 20s
  const started = Date.now()
  const full = await checkTitle(70143836, TILE_BUDGET_MS)

  if (full.region) {
    $done({
      content: (isChinese() ? "无限制 (" : "Full (") + full.region + ")",
      backgroundColor: "#E50914"
    })
    return
  }

  if (full.ok) {
    $done({ content: isChinese() ? "无限制" : "Full", backgroundColor: "#E50914" })
    return
  }

  // Cloudflare 反爬拦截：既不是地区封锁，也不能当「不可用」
  if (full.blocked) {
    $done({ content: isChinese() ? "被拦截" : "Blocked", backgroundColor: "#FF9500" })
    return
  }

  // 预算已经耗尽就不必再发第二个请求，直接按网络错误收尾
  const remaining = TILE_BUDGET_MS - (Date.now() - started)
  if (remaining <= 300) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  const originals = await checkTitle(80197526, remaining)

  if (originals.region) {
    $done({
      content: (isChinese() ? "仅原创 (" : "Originals Only (") + originals.region + ")",
      backgroundColor: "#FF9500"
    })
    return
  }

  if (originals.ok) {
    $done({ content: isChinese() ? "仅原创" : "Originals Only", backgroundColor: "#FF9500" })
    return
  }

  // 两次都没连上才算网络错误，连上了但无地区信息才是「不可用」
  if (full.network && originals.network) {
    $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    return
  }

  // 第二次也被反爬拦截
  if (originals.blocked) {
    $done({ content: isChinese() ? "被拦截" : "Blocked", backgroundColor: "#FF9500" })
    return
  }

  // 连上了但没有地区信息：带状态码，便于区分「地区判定失效」和「真的不可用」
  const code = full.code || originals.code
  $done({
    content: code && code !== "200"
      ? (isChinese() ? "错误 (" : "Error (") + code + ")"
      : isChinese() ? "不可用" : "Unavailable",
    backgroundColor: code && code !== "200" ? "#FF9500" : "#FF3B30"
  })
}

;(async () => {
  main()
    .then((_) => {})
    .catch((error) => {
      $done({ content: isChinese() ? "网络错误" : "Network Error", backgroundColor: "#FF9500" })
    })
})()
