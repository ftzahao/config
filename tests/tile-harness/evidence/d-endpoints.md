# d-endpoints.md —— 开发/游戏类 6 个 tile 的落地端点实测

> 实测时间：2026-10-18 20:19 / 20:33（CST，出口 KR/JP，`cf-ray` 后缀 `NRT` = 东京）
> 命令（只记状态码 / Location / 大小，**不落正文**）：
> ```
> curl -s -m 10 -o /dev/null \
>   -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" \
>   -w "%{http_code} %{redirect_url} size=%{size_download}\n" <url>
> ```
> 大小（size_download）每次请求有几百字节抖动（商店首页做了 A/B/emoji 注入），属正常。

## 1. 主表

| 服务 | URL | 状态码 | Location | 大小 | 预计显示 | 备注 |
|---|---|---|---|---|---|---|
| steam | `https://store.steampowered.com/` | 200 | （无） | 1,000,145 B（≈1.0 MB） | **可用**（`#1B2838`） | `server: nginx`。首页不进 CF，直连可用。未观测到 `/?cc=cn` 跳转（该跳转与出口地区相关，本出口为 200 直出）；脚本对同域 302 + 查询串已按「可用」处理并有对应用例。 |
| epic | `https://store.epicgames.com/` | **403** | （无） | 25,441 B | **被拦截**（`#FF9500`） ⚠️ 见 §2 | `server: cloudflare` + **`cf-mitigated: challenge`**，页面含 `_cf_chl_opt` / `/cdn-cgi/challenge-platform/.../chl_page` / `<span id="challenge-error-text">Enable JavaScript and cookies to continue</span>`。**这是 Cloudflare 挑战页，不是 Epic 自有 Age-gate 页**，与任务书「不是 CF 挑战页 → 判受限」的前提相反。 |
| pypi | `https://pypi.org/pypi/pip/json` | 200 | （无） | 228,494 B | **可用**（`#3775A9`） | `content-type: application/json`，`JSON.parse` 通过（顶层 keys：`info,last_serial,ownership,releases,urls,vulnerabilities`）。体积偏大但仍远在 `timeout: 8` 预算内。 |
| npm | `https://registry.npmjs.org/` | 200 | （无） | **2 B** | **可用**（`#CB3837`） | `content-type: application/json`，body 实测是 **`{}`**（不是任务书写的 `{"db_name":"registry"}`），`JSON.parse` 通过。脚本只要求「能解析」，两种 body 都判可用（用例各覆盖一条）。 |
| wikipedia | `https://www.wikipedia.org/` | 200 | （无） | 122,197 B | **可用**（`#000000`） | `server: ATS/9.2.15`（Atlanata/Apache Traffic Server，Wikimedia 自有 CDN 层）。门户页未按出口 IP 跳转，直接 200。 |
| spotify_web | `https://open.spotify.com/` | 200 | （无） | 166,423 B | **可用**（`#1DB954`） | `server: envoy`，SPA 壳页面，200 直出，未触发地区跳转。 |
| （对照）epic | `https://store.epicgames.com/en-US/` | **403** | （无） | 25,459 B | **被拦截**（同上） | 与根路径完全同形态：`cf-mitigated: challenge`，256 字节差异只是 ray/nonce。 |
| （对照）pypi | `https://pypi.org/simple/pip/` | 200 | （无） | 107,453 B | （脚本不请求此 URL） | `content-type: text/html`（Simple Index 页）。只作对照：证明「pypi 200」既有 HTML 端点也有 JSON 端点，脚本刻意选 JSON 端点并校验可解析。 |

## 2. ⚠️ 实测与任务书口径的偏差：Epic 403 是 **Cloudflare 挑战页**

任务书写的「**不是** CF 挑战页，是 Epic 自己的反爬/Age-gate」，在本出口上**不成立**。证据：

1. 响应头：`server: cloudflare`、**`cf-mitigated: challenge`**（根路径与 `/en-US/` 一致）。
2. 页面结构：**没有 `<title>`**，body 开头是 `<style>.cf_challenge_text_small { ... }</style>`，两个 `<script>` 里分别是 `window._cf_chl_opt = {...}` 和动态插入的 `/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=...`。
3. 模板 `isChallenge()` 的 4 条强特征命中情况（逐字按模板口径、大小写不敏感）：
   - `just a moment`：**0 次**
   - `enable javascript and cookies`：**1 次**（`<span id="challenge-error-text">Enable JavaScript and cookies to continue</span>`）
   - `cf-chl`：0 次
   - `checking your browser`：0 次（实际文案是 `Checking if the site connection is secure`，不含 "your browser"）

   即：**只靠这一个 `<noscript>` 文案就被 `isChallenge()` 命中**。
4. 同主域其它子域同一形态（都是 25.x KB + `cf-mitigated: challenge`）：
   - `https://www.epicgames.com/` → 403，25,439 B
   - `https://store.epicgames.com/en-US/p/fortnite` → 403，25,511 B
   - `https://dev.epicgames.com/` → 403，25,461 B
   - 带完整浏览器指纹头（`sec-ch-ua`、`sec-fetch-*`、`accept`、`upgrade-insecure-requests`）再请求根路径，仍是 403。

**当前实现的行为**（`epic.js` 逐字复用 discord 骨架，判定顺序不可改）：

| 输入 | `epic.js` 实际输出 |
|---|---|
| 真实 `store.epicgames.com/` 403 页 | `被拦截`（`#FF9500`） |
| 403 + 长 HTML 无挑战特征 | `受限`（`#FF3B30`） |

也就是说：
- 任务书要求的**硬约束**「403 + 长 HTML 无挑战特征 → 受限」已实现并有专门用例（`epic.case.mjs` 里 25KB 长 HTML 那条），**测试全绿**；
- 但**真机网络下 epic tile 会显示「被拦截」而不是「受限」** —— 因为真实页面按模板口径就是挑战页。

处置建议（需 lead 决策，我未擅自偏离模板）：
1. **推荐**：接受 `被拦截`。云盾挑战确实不是「该地区被封锁」，但模板把「反爬挑战」单列成「被拦截」（橙）是既定的语义，且 `_design.md` 明确「200/403/503 + 挑战特征 → 被拦截」。改为「受限」需要**放宽** `isChallenge()`（例如不再认 `enable javascript and cookies`），会**同时影响 discord 等所有脚本**并打翻 C3 契约，不该为单个站点做。
2. 备选：若要 Epic 显示「受限」，只能在 `epic.js` 里加**站点级**例外（例如 Epic 只在带 `cf-mitigated: challenge` **且** body 同时含 `just a moment` 时才判挑战）—— 但这属于改判定顺序、偏离统一模板，需要 lead 授权，并且要同步更新 `_design.md`。

## 3. 附：其它服务的行为确认

| 检查项 | 结果 |
|---|---|
| `pypi` JSON 端点可解析 | ✅ `PARSE_OK` |
| `npm` 根路径可解析 | ✅ `PARSE_OK`（body = `{}`） |
| npm / spotify / wiki / steam 是否被 CF 挑战 | ❌ 均无 `cf-mitigated: challenge`，均为 200 直出 |
| 6 个主 URL 是否有 30x | ❌ 本出口全部无重定向（`redirect_url` 为空） |
