# Tile 脚本统一模板（2026-10 扩量批次）

> 这是**给写脚本的人看的规格**，不是运行时依赖。所有新脚本必须满足「本地测试台 + 横切契约 C1–C5」，
> 也就是：**无 `fetch`、不摘 `$httpClient` 方法、回调一定异步、兜底预算内必须 `$done` 恰好一次**。

## 0. 为什么要统一模板

现有 14 个脚本各写一套 `request()/isChinese()/isChallenge()`，扩到 38 个后维护成本会爆炸。
新批次统一一份「骨架」，好处是：审查只看 `DOMAINS/ENDPOINT/TIMEOUT` 三个常量 + `main()` 分支，
其余（超时兜底、挑战页识别、双语、`$done` 收口）全在骨架里，改动只改一处。

## 1. 骨架（逐字复用，只改头部配置与 main 分支）

```js
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

// ---- 本脚本配置（每个脚本唯一不同的地方）----
// 允许出现的业务域名（判断是否被地区重定向 / 被劫持）。
// 二级服务（如 discord → discord.com、hbo → max.com/hbomax.com）全部列进来。
const DOMAINS = ["example.com"]
const COLOR = "#000000"

// 整个 tile 的 $done 总预算：超过就立刻用「网络错误」收尾，绝不让面板停在「检测中…」
const TILE_BUDGET_MS = 2500

function request(method, params, budgetMs) {
  // 显式调用 $httpClient.get / $httpClient.post：不能把方法取出来再调，
  // 原生桥接对象脱离 receiver 会丢 this（真机上可能 TypeError）。
  const cap = typeof budgetMs === "number" && budgetMs > 0 ? budgetMs : TILE_BUDGET_MS
  const declared = params && Number(params.timeout) > 0 ? Number(params.timeout) * 1000 : Infinity
  const limit = Math.max(500, Math.min(declared, cap))
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

function text(zh, en) {
  return isChinese() ? zh : en
}

function statusOf(response) {
  if (!response) return undefined
  return response.status !== undefined ? response.status : response.statusCode
}

function codeOf(status) {
  return status === undefined || status === null ? "no response" : String(status)
}

// Cloudflare 挑战页：反爬拦截既不是地区封锁，也不能当「可用」，必须单列。
// 只认语义强特征（挑战页独有文案）；单独的 challenge-platform 可能出现在正常页面引用的
// 静态资源里，不作为依据。—— 任何「200 就当可用」的分支都必须先过 isChallenge()。
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

function header(headers, name) {
  const lower = String(name).toLowerCase()
  const source = headers || {}
  for (const key in source) {
    if (key.toLowerCase() === lower) return source[key]
  }
  return undefined
}

// https://www.threads.com/de-de/ → threads.com / de-de；没有前缀时 region = ""
function pathSegments(url) {
  let path = String(url || "").replace(/^https?:\/\/[^/]+/i, "")
  const query = path.indexOf("?")
  if (query >= 0) path = path.slice(0, query)
  return path.split("/").filter((part) => part.length > 0)
}

// 大小写不敏感地判断 host 是否属于 DOMAINS（允许 www./m./open. 之类的子域）
function isDomain(host) {
  const lower = String(host || "").toLowerCase()
  if (!lower) return false
  for (let i = 0; i < DOMAINS.length; i++) {
    const domain = DOMAINS[i].toLowerCase()
    if (lower === domain || lower.endsWith("." + domain)) return true
  }
  return false
}

function hostOf(location) {
  return String(location || "").replace(/^https?:\/\//i, "").split("/")[0].toLowerCase()
}

function doneAvailable(region) {
  const suffix = region ? " (" + region + ")" : ""
  $done({ content: text("可用", "Available") + suffix, backgroundColor: COLOR })
}

function doneUnavailable(region) {
  const suffix = region ? " (" + region + ")" : ""
  $done({ content: text("不可用", "Unavailable") + suffix, backgroundColor: "#FF3B30" })
}

function doneBlocked(host) {
  $done({
    content: text("被拦截", "Blocked") + (host ? " -> " + host : ""),
    backgroundColor: "#FF9500"
  })
}

function doneNetworkError() {
  $done({ content: text("网络错误", "Network Error"), backgroundColor: "#FF9500" })
}

function doneError(status) {
  $done({ content: text("错误 (", "Error (") + codeOf(status) + ")", backgroundColor: "#FF9500" })
}
```

## 2. 主链路：**域名落地（landing）** —— 默认方案

对 `https://<服务首页>` 发一次 `auto-redirect: false` 的 GET，然后按下面的**固定顺序**判定
（顺序不能变，每条分支都有对应的测试用例）：

| # | 观察到的形态 | 判定文案 | 背景色 |
|---|---|---|---|
| 1 | `error` 非空 / `response` 缺失 | 网络错误 | `#FF9500` |
| 2 | 200 + CF 挑战页（`isChallenge`） | 被拦截 | `#FF9500` |
| 3 | 200 + 页面含地区封锁文案（`not available in your country` / `not available in your region` / `isn't available in your region`） | 不可用 | `#FF3B30` |
| 4 | 451 | 不可用 | `#FF3B30` |
| 5 | 429 | 请求限流 | `#FF9500` |
| 6 | ≥500 | 服务端错误 (code) | `#FF9500` |
| 7 | 30x：Location 的 host **不在** `DOMAINS` | 被拦截 -> host | `#FF9500` |
| 8 | 30x：Location 的 host **在** `DOMAINS`，且首段是地区码（`de` / `de-de` / `kr-ko` / `ja-jp`…） | 可用 (REGION) | `COLOR` |
| 9 | 30x：Location 的 host 在 `DOMAINS`，首段不是地区码（如 `/login`） | 可用 | `COLOR` |
| 10 | 200 | 可用（可选 (REGION)，见 §3） | `COLOR` |
| 11 | 其它（4xx） | 受限（403 以外的 4xx）/ 错误 (code) | `#FF3B30` / `#FF9500` |

```js
// 地区码：/jp-en/、/de-de/、/kr-ko/、/ja-jp/ 都取第一段再取 "-" 前
function regionOfSegment(segment) {
  const match = String(segment || "").match(/^([a-z]{2})(?:-[a-z]{2,})?$/i)
  return match ? match[1].toUpperCase() : ""
}
```

**为什么不用 `generate_204` 之类**：`/generate_204`、`/cdn-cgi/trace` 在多数情况下恒返回 204，
**无法区分地区封锁**（旧的 google.js 只测连通性，明确标注了这一点）。落地域名的 30x `Location`
才是「服务端根据出口 IP 做的地区路由」——这是**唯一**能证明「地区可用」的信号。

**30x 的 host 判定必须用 DOMAINS 白名单**：很多站点会跳到自家二级站（`spotify.com → open.spotify.com`、
`music.apple.com → music.apple.com/cn`、`discord.com → discord.com/login`）。这些**不是被拦截**。
反过来，跳到陌生域名（典型是被运营商的地区重定向、或劫持页）才是「被拦截」。

## 3. 可选：地区信息（`(REGION)` 后缀）

只有当**同一次请求的同一份响应**里能稳定拿到两字母国家/地区码时才输出 `可用 (JP)`：

- 30x 的 `Location` 首段（最可靠：服务端的地区路由，见上）
- 200 页面里的 SSR 状态字段（`"countryCode":"JP"` / `"GL":"JP"` / `"loc=JP"`）
- Cloudflare trace 类纯文本响应里的 `loc=XX`

**拿不到就不输出后缀，不要猜、不要复用别的服务的地理信息**（gemini 复用 YouTube 的 GL 属于已知近似）。

## 4. 可选：trace 端点（`/cdn-cgi/trace`）

仅当服务的**业务域名本身**（而不是第三方）由 Cloudflare 代理时可用：

```js
// GET https://www.example.com/cdn-cgi/trace → 纯文本，含 "ip=" / "loc=XX" / "colo=XXX" 行
function traceLoc(body) {
  const match = String(body || "").match(/^loc=([A-Za-z]{2})$/m)
  return match ? match[1].toUpperCase() : ""
}
```

**实测（2026-10-18，出口 KR/JP）**：`chatgpt.com`、`x.com`、`claude.ai`、`api.openai.com` 有 trace；
`www.facebook.com`、`www.threads.com`（Meta）、`my.ippure.com`（被挑战）**没有**。
选 trace 前必须实测，不能凭想当然。

## 5. 硬约束（会被测试台 + CI 检查）

1. **回调一定异步**；并在 `request()` 里带兜底定时器，`params.timeout` 只喂给 Stash 自己。
2. **不得**出现 `$httpClient[...]` / `const fn = $httpClient.get`（C5 会抓到）。
3. `$done` **恰好一次**；所有异常路径走 `.catch()` 收口（骨架末尾那段 async IIFE 不要改）。
4. `content` 里**不得出现** `undefined` / `NaN` / `[object Object]`；状态码缺失时用 `codeOf()`。
5. **200 + CF 挑战页绝不能判「可用」**（C3）。任何新增的「200 即可用」分支都要先过 `isChallenge()`。
6. 串行多请求脚本共享 `TILE_BUDGET_MS` 总预算（见 netflix.js 的 `remaining` 写法）。
7. 中文环境输出中文，其它环境输出英文（`text()`）；背景色只用于区分状态，绿/品牌色=可用，橙=拦截/异常，红=不可用。

## 6. 文件命名

- 脚本：`stash/tiles/<name>.js`，`<name>` 用**小写 + 连字符**（`apple-music.js`），与 tile 的 `name` 一致。
- 用例：`tests/tile-harness/cases/<name>.case.mjs`，**每个脚本必须有一个**（覆盖检查会失败）。
- 凭证：`name: Check_<PascalCase>`（如 `Check_AppleMusic`），方便在 .stoverride 里保持既有风格。
