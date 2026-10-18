# 第三方服务检测 · 扩量批次实测总表

> **实测时间**：2026-10-18 20:15–20:40 CST（多轮，出口 KR/JP 漂移）
> **方法**：`curl` 实测每个端点，只记录 **状态码 / Location / 体积**，不保存响应正文；
> 再把真实响应喂回 `tests/tile-harness/harness.mjs` 跑**脚本自身的判定分支**，
> 得到下表最后一列「脚本判定」—— 这一列是「脚本对真实响应的输出」，不是人工推断。
> **分册**：`a-endpoints.md`（社交）、`b-endpoints.md`（AI）、`c-endpoints.md`（流媒体）、
> `d-endpoints.md`（开发/游戏）、`e-endpoints.md`（补充口径）。

## 0. 判定模板（`_design.md` §2「域名落地」）

不跟随重定向，请求服务首页，然后按固定顺序判定：
网络错误 → CF 挑战页 → 封锁文案 → 451 → 429 → 5xx → 30x(白名单外=被拦截 / 白名单内带地区段=可用(REGION)) → 200=可用 → 403=受限 → 其它=错误。

核心洞察：**`Location` 里的地区段才是服务端对出口 IP 的真实路由**，
`/generate_204`、`/cdn-cgi/trace` 这类端点只能证明连通、证明不了地区。

## 1. 新增 30 张卡片在真实网络下的实际表现

| # | 卡片 | 端点 | 实测状态 | Location / 备注 | **脚本判定** | 是否符合预期 |
|---|---|---|---|---|---|---|
| 1 | Facebook | `www.facebook.com/` | **400** (1542B) | 带桌面 UA 时 MockingBird 前置代理直接拒绝；去掉 UA 反而 200 | 受限（走 favicon 复查分支） | ✅ 见 §2.1 |
| 2 | Threads | `www.threads.com/` | 200 | Meta 自家 CDN，无 `server` 头 | **可用** | ✅ |
| 3 | Reddit | `www.reddit.com/` | 403 (190KB) | `server: snooserv`；挑战特征命中 **0** | **受限** | ✅ |
| 4 | Twitch | `www.twitch.tv/` | 200 | 无 30x | **可用** | ✅ |
| 5 | Discord | `discord.com/` | 200 | `server: cloudflare` | **可用** | ✅ |
| 6 | LinkedIn | `www.linkedin.com/` | 302 | → `https://www.linkedin.cn/` | **被拦截 -> www.linkedin.cn** | ✅ 出口被路由到大陆站 |
| 7 | Grok | `grok.com/` | 200 (398KB) | 先回 `103 Early Hints` 再 200 | **可用** | ✅ |
| 8 | xAI | `x.ai/` | 403 (5476B) | 挑战特征命中 **0**（仅引用 challenge-platform 脚本） | **受限** | ✅ |
| 9 | Perplexity | `www.perplexity.ai/` | 403 (5653B) | **是** CF 挑战页（`Just a moment...`） | **被拦截** | ✅ |
| 10 | Copilot | `github.com/features/copilot` | 200 (876KB) | — | **可用** | ✅ |
| 11 | Hugging Face | `huggingface.co/` | 200 (178KB) | — | **可用** | ✅ |
| 12 | Poe | `poe.com/` | 307 | → 同域 `/login?redirect_url=%2F` | **可用** | ✅ |
| 13 | HBO Max | `www.max.com/` | 301 | → `https://www.hbomax.com/`（**跨域品牌合并**） | **可用** | ✅ 白名单含两端 |
| 14 | Prime Video | `www.primevideo.com/` | 302 | → 同域 `/offers/nonprimehomepage` | **可用** | ✅ |
| 15 | Hulu | `www.hulu.com/` | 302 | → `https://www.disneyplus.com/`（连续 3 次稳定） | **可用** | ✅ 修正后（§2.2） |
| 16 | Apple Music | `music.apple.com/` | 302 | → `/cn`（**不带语言后缀**） | **可用 (CN)** | ✅ 见 §2.3 |
| 17 | 哔哩哔哩 | `www.bilibili.com/` | 200 (169KB) | — | **可用** | ✅ |
| 18 | 爱奇艺 | `www.iqiyi.com/` | 200 (8.6KB) | 壳页 | **可用** | ✅ |
| 19 | 微信 | `weixin.qq.com/` | 200 (112KB) | 封锁文案命中 0 | **可用** | ✅ |
| 20 | Steam | `store.steampowered.com/` | 200 (1.0MB) | nginx 直出 | **可用** | ✅ |
| 21 | Epic Games | `store.epicgames.com/` | 403 (25KB) | **是** CF 挑战页（`Enable JavaScript and cookies` 命中 1） | **被拦截** | ✅ 见 §2.4 |
| 22 | PyPI | `pypi.org/pypi/pip/json` | 200 (228KB) | JSON 可解析 | **可用** | ✅ |
| 23 | npm | `registry.npmjs.org/` | 200 | body 是 **2 字节 `{}`** | **可用** | ✅ |
| 24 | Wikipedia | `www.wikipedia.org/` | 200 (122KB) | — | **可用** | ✅ |
| 25 | Spotify Web | `open.spotify.com/` | 200 (166KB) | — | **可用** | ✅ |
| 26 | YouTube (移动) | `m.youtube.com/` | 302 | → `www.youtube.com/?app=desktop`（**桌面 UA 下**；移动 UA 下 200/353KB） | **可用** | ✅ |
| 27 | Google (日本) | `www.google.co.jp/generate_204` | 204 | 纯探活，**不含地区** | **可用**（无后缀） | ✅ |
| 28 | Reddit (JSON) | `www.reddit.com/.json` | 403 (190KB) | 挑战特征命中 0 | **受限** | ✅ |
| 29 | Poe (API) | `api.poe.com/` | 403 (1486B) | 挑战特征命中 0 | **受限** | ✅ |
| 30 | Epic (严格口径) | `store.epicgames.com/` | 403 (25KB) | 同 21，但本脚本把 403 判「不可用」 | **被拦截** | ✅ 与 epic.js 对照 |

**结论**：30 张里 29 张在真实网络下命中「符合设计意图」的分支；
唯一需要修正的是 **Hulu**（§2.2），修正后 30/30 合理。

## 2. 四个需要解释/修正的点

### 2.1 Facebook 的 400 不是「服务挂了」

带桌面 UA 访问 `www.facebook.com/` 恒 400（1542B），**去掉 UA 反而 200（423KB）**。
这是 Meta 的 MockingBird 前置代理对「无浏览器指纹的客户端」的拒绝，不是地区封锁、也不是服务不可用。
直接按 400 判「错误」会把「站点可达」误报成「服务已挂」，所以 `facebook.js` 加了一处模板外分支：
**400 时改用同域 `/favicon.ico` 复查**（实测恒 200/20KB）→ 通则「受限」，不通才是「网络错误」。
已用 4 条用例锁定。

### 2.2 【已修】Hulu 的跨品牌跳转被误报为「被拦截」

实测 **连续 3 次** `www.hulu.com/` → `302 https://www.disneyplus.com/`（Hulu 并入 Disney+ 后的正常合并跳转）。
原白名单只有 `["hulu.com"]`，陌生域名会走「被拦截」分支 → 真机显示 **被拦截 -> www.disneyplus.com**，与直觉相反。

**修正**：`stash/tiles/hulu.js` 的 `DOMAINS` 改为 `["hulu.com", "disneyplus.com"]`，
并补 2 条回归用例（302→disneyplus 判可用、301→disneyplus/welcome 判可用），同时保留「真正跳陌生域名仍判被拦截」的用例。

> 这是本批次**唯一一个只有在真实网络下才会暴露**、本地夹具测不出来的缺陷 ——
> 夹具是按任务书写的「301→/welcome」，所以 22 条用例全绿的错误实现照样能过。
> 教训：**夹具描述的是「我们认为的网络」，真机实测才是判据**。

### 2.3 Apple Music 的 `(CN)` 不代表出口国家

实测 302 到 `music.apple.com/cn`，而出口是 KR。地区段来自 **Apple 按账号/语言偏好做的路由**，
不是出口地理信息。tile 如实显示服务端给的值、不自行纠正 —— 这是有意的设计选择：
显示 `(CN)` 至少能说明「Apple 把你当中国区用户」，比猜一个出口国更有用。

### 2.4 Epic / Perplexity 的 403 是真正的 CF 挑战页

任务书原本写「Epic 403 是自研反爬，按模板判受限」，**这是任务书的误判**（依据是「25KB 体积 + 没有 `just a moment`」）。
实测两者都是标准托管挑战页：`server: cloudflare` + `cf-mitigated: challenge`，
正文命中 `Enable JavaScript and cookies to continue`（Epic）/ `Just a moment...` + 同上（Perplexity）。

判据是**正文语义**而不是体积，所以判「被拦截」正确。**未**为单个站点放宽 `isChallenge()` ——
那会打翻 C3 横切契约并连坐全部 44 个脚本。

## 3. 复现命令

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

# 1) 看真实状态码与跳转目标
curl -s -m 10 -o /dev/null -A "$UA" -w "%{http_code} %{redirect_url}\n" https://www.hulu.com/

# 2) 数挑战页特征（不保存正文）
curl -s -m 10 -A "$UA" https://www.perplexity.ai/ | grep -o -i -c \
  "just a moment\|cf-chl\|checking your browser\|enable javascript and cookies"

# 3) 把真实响应喂回脚本，看 tile 会显示什么（见 evidence/live-check 的等价写法）
node tests/tile-harness/run-all.mjs   # 全量 1272 条，退出码 0
```

## 4. 局限（无法在本地验证的部分）

1. 出口会漂移（同一次会话内观察到 KR ↔ JP），地区相关文案只代表**当次**出口。
2. 夹具无法覆盖「站点改版/合并跳转」这类**实现层面的漂移** —— §2.2 就是例子。
   建议每季度用 §3 的命令重跑一遍本表。
3. Stash 真机的 JavaScriptCore 与 Node 的 V8 在极少数 API 上可能有差异，本测试台覆盖不到。
4. `$httpClient` 在长按节点时会走该节点代理；本机实测用的是本机出口，**不代表**某个具体节点的表现。
