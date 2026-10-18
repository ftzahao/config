# 第三方服务检测端点 · 实测报告

> **实测时间**：2026-10-18 19:05–19:20 (UTC+8)，**两轮**
> **实测工具**：`curl 8.7.1`；所有请求均带 `-m 20`
> **当前出口**：AWS 东京机房，但**公网 IP 会漂移**（同一次会话内观察到两个出口）
> - 第 1 轮：`54.178.179.101` / `3.112.217.125` → Cloudflare `colo=NRT`，**地区 = JP**
> - 第 2 轮：`3.39.243.194` → Cloudflare `colo=ICN`，**地区 = KR**（Incheon，AS16509，hosting=true）
> - ✅ 这次漂移反而是最好的验证，见下方「关键验证」
> **测试 UA**：`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`
> **测试语言头**：`Accept-Language: zh-CN,zh;q=0.9,en;q=0.8`
> **⚠️ 判定前提**：因为当前出口是 **JP / KR（都是「服务全可用」的地区）**，所以本报告中「200/正常返回」**只能证明接口本身没坏**，不能证明脚本能区分「地区受限」。凡是「地区受限」的判定逻辑，必须靠**能吐出国家码的字段**来验证 —— 下面逐条给出该字段是否真实存在。

### 🔑 关键验证：出口地区从 JP 漂移到 KR 时的字段追踪

测量过程中出口 IP 意外从东京漂到韩国，于是把**同一批端点在新地区重测了一遍**。所有推荐字段**同步翻转为 `KR`**，而**脚本里那两条错误写法仍然抓错** —— 这是本报告最有力的证据：

| 端点 / 字段 | JP 时 | KR 时 | 是否跟随真实地区 |
|---|---|---|---|
| YouTube `/premium` → `"GL"` | `JP` | **`KR`** | ✅ |
| TikTok → `webapp.app-context.region` | `JP` | **`KR`** | ✅ |
| TikTok → 脚本原正则 `"region"` 首个命中 | `ALISG` | **`ALISG`（没变！）** | ❌ **抓的是机房，不是地区** |
| Instagram → `"country_code"` | `JP` | **`KR`** | ✅ |
| Netflix → `location` 里的国家段 | `jp-en` | **`kr-en`** | ✅ |
| Netflix → 脚本读的 `x-originating-url` | `.../title/...` | **`.../title/...`（没变）** | ❌ **永远解析出 `"us"`** |
| Spotify → `/premium/` 的 302 Location | `/jp/premium/` | **`/kr-ko/premium/`** | ✅（**注意 `kr-ko` 带语言后缀！**） |
| Disney+ → `"countryCode"` | `JP` | **`KR`** | ✅ |
| `claude.ai/cdn-cgi/trace` → `loc` | `JP` | **`KR`** | ✅ |
| `api.openai.com/cdn-cgi/trace` → `loc` | `JP` | **`KR`** | ✅ |
| `x.com/cdn-cgi/trace` → `loc` | `JP` | **`KR`** | ✅ |

**两条铁证：**
1. **TikTok 的 `region:ALISG` 在 JP 和 KR 下都不变** ⇒ 它 100% 不是地区字段（是 `idc=my` 马来西亚机房代码），脚本必改。
2. **Netflix 的 `x-originating-url` 在 JP 和 KR 下都不变** ⇒ 脚本 `split("/")[3] === "title"` 恒真 ⇒ **无论你在哪个国家都显示「US」**。这就是用户说「Netflix 测试不正常」的根因。

> 另一个坑：Spotify 的 Location 段是 **`kr-ko`**（国家-语言），JP 下是 `jp`（无语言后缀）—— 所以**必须 `split("-")[0]`**，不能直接用整段。

---

## 结论速览

| # | 服务 | 脚本当前用的端点 | 实测状态 | 能否判定地区 | 建议 |
|---|------|-----------------|---------|-------------|------|
| 1 | IPPure | `GET https://my.ippure.com/v1/info` | **403**（CF 托管质询 `cf-mitigated: challenge`，UA/空UA/Origin/Referer 全试过均 403） | ❌ 拿不到 JSON | **端点本身没错**（官方文档确认就是这个），但被 Cloudflare 挡死。见 §1 三套备选 |
| 2 | ChatGPT | `GET https://api.openai.com/compliance/cookie_requirements` | **200** `{"cookie_consent_required":false}` | ⚠️ 永远不含国家信息；`unsupported_country` 在本地区**不会出现** | 保留（判存活），**另加** `https://api.openai.com/cdn-cgi/trace` 取 `loc=` |
| 3 | Claude | `GET https://api.anthropic.com/v1/models` + `x-api-key:test` | **401** `{"type":"authentication_error","message":"invalid x-api-key"}`（稳定，空UA 同样 401） | ❌ 401 只证明可达，不证明地区支持 | 换 `https://claude.ai/cdn-cgi/trace` 取 `loc=` + 支持国家白名单 |
| 4 | Gemini | `GET https://gemini.google.com/generate_204` | **204**（空 UA 也是 204） | ❌ **完全无法区分**，见 §4 | 换 `https://gemini.google.com/` 首页 + 白名单，或接受「仅探活」 |
| 5 | Google | `GET https://www.google.com/generate_204` | **204** | ❌ 同理，`generate_204` 从 CN 也通常返回 204 | 保留探活；地区判定需另找 |
| 6 | X | `GET https://x.com/i/api/1.1/branch/init.json` | **403**，且 **body 为空（0 字节）** | ❌ 空 403 无法区分「未授权」和「地区封禁」 | 换 `https://x.com/cdn-cgi/trace` 取 `loc=`（已验证 JP→`loc=JP`、KR→`loc=KR`） |
| 7 | Instagram | `GET https://www.instagram.com/` | **200**（有 UA）/ **302 → `facebook.com/unsupportedbrowser`**（空 UA） | ⚠️ 脚本靠 `body.includes("instagram")` 判 200 ⇒ **几乎恒真**；`not available in your country` **实测 0 次命中** | 用 body 里的 `"country_code"`（`PolarisSiteData` 内；JP轮=`JP`、KR轮=`KR`）；**不要**用 302 判「不可用」 |
| 8 | TikTok | `GET https://www.tiktok.com/explore` + `/\"region\"\s*:\s*\"(\w+)\"/` | **200**，正则命中，但抓到 `"region":"ALISG"` | ❌ **抓错字段** | 改抓 `__DEFAULT_SCOPE__["webapp.app-context"].region`（JP轮=`JP`、KR轮=`KR`；`ALISG` 两轮都不变） |
| 9 | YouTube | `GET https://www.youtube.com/premium` + `"GL":"([A-Z]{2})"` | **200**，`"GL":"JP"`／KR轮 `"GL":"KR"` | ✅ **字段可靠**（`?gl=CN` 强制参数无效，仍跟随 IP） | 保留；建议顺带检测 `www.google.cn` |
| 10 | Netflix | `GET /title/70143836`、`/title/80197526` + 读 `x-originating-url` | **301**，JP轮 `location: .../jp-en/title/...`、KR轮 `.../kr-en/...` | ⚠️ 地区码在 **`location`** 里，但脚本读错了字段 → 见 §10 | **改读 `location`**，按 `/` 切段取第 4 段再取 `-` 前 |
| 11 | Disney+ | `/devices` → `/token` → `/graph/v1/device/graphql` | **201 → 200 → 200**，全链路通；`"inSupportedLocation":true`、`"countryCode":"JP"`（KR轮=`KR`） | ✅ **完全可用**，脚本逻辑正确 | **保留，无需改** |
| 12 | Spotify | `POST https://spclient.wg.spotify.com/signup/public/v1/account` | **200** `{"status":320,...proxy service...}` | ❌ **status 320 ≠ 国家未开通**（脚本误判成 Unavailable） | 用 `https://www.spotify.com/premium/` 的 **302 Location 里的国家段** |

---

## 1. IPPure（3 个 Tile 共用）

### 实测

| 请求 | 状态码 | 备注 |
|------|--------|------|
| `https://my.ippure.com/v1/info` + 桌面 UA | **403** | `cf-mitigated: challenge`，`server: cloudflare`，body 是 `Just a moment...`（5563 B） |
| 同上，`-A ""`（空 UA） | **403** | 5221 B，同样质询页 |
| 加 `Accept-Language` / `Origin: https://ippure.com` / `Referer` | **403** | 无效 |
| `https://api.ippure.com/v1/info` | **403** | 同样 `cf-mitigated: challenge` |
| `https://api.ippure.com/api/info/ip-basic/` | **403** | 同样 |
| `https://ippure.com/api/info/ip-basic/` | **404** | 只是 VitePress 静态站，没有 API |
| `https://ippure.com/` | **200** | 静态文档站可访问 |

**结论：不是 UA 问题，是 Cloudflare Managed Challenge（`cType: 'managed'`）。** 任何 curl / Stash `$httpClient` 都过不去 —— 它需要执行 JS 挑战 + 拿到 `cf_clearance` cookie。**脚本逻辑没问题，是端点现在被 WAF 保护了。**

### 官方文档确认（重要）

`https://ippure.com/MyIP-Info-API`（注意：`.html` 会 **308** 跳到无后缀地址）写明：

> 接口地址：`https://my.ippure.com/v1/info`
> 示例输出：见下

```json
{
  "ip": "104.28.123.123",
  "asn": 13335,
  "asOrganization": "Cloudflare, Inc.",
  "country": "United States",
  "countryCode": "US",
  "region": "California",
  "regionCode": "CA",
  "city": "Los Angeles",
  "timezone": "America/Los_Angeles",
  "longitude": "-118.24368",
  "latitude": "34.05223",
  "postalCode": "90012",
  "fraudScore": 75,
  "isResidential": false,
  "isBroadcast": false,
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}
```

**关于字段类型（脚本必须注意的坑）：**
- `fraudScore` 是 **number**（0–100），`json.fraudScore` 直接可用 ✅
- `isResidential` / `isBroadcast` 是 **boolean**（`false` / `true`），**不是字符串 `"true"`** ✅
  - 但 `ippure-ip-native-check.js` 里用了 `Boolean(json.isResidential)` —— 如果某天变成字符串 `"false"`，`Boolean("false") === true` **会判反**。建议改成 `json.isResidential === true || json.isResidential === "true"`。
- `city` / `region` / `country` / `asOrganization` 都是 **string** ✅
- 文档自注：**「该接口尚处在测试阶段，可能会有变动」**

### 替代方案（按推荐度排序）

**A. 换用 ipwho.is（最推荐：免费、无 key、返回字段齐全）**

- 端点：`https://ipwho.is/`（实测 **200**，1.07 s）
- 实测返回：`{"ip":"54.178.179.101","success":true,"type":"IPv4","continent":"Asia","continent_code":"AS","country":"Japan","country_code":"JP","region":"Tokyo",...}`
- 字段：`country_code`（→ `countryCode`）、`connection.isp` / `connection.org`（→ `asOrganization`）
- ⚠️ 无 `fraudScore` / `isResidential` / `isBroadcast`，**风险分和原生IP检测做不了**

**B. 换用 ip-api.com（免费、字段最全，含风险信号）** ⭐ 风险检测首选

- 端点：`http://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,isp,org,as,asname,mobile,proxy,hosting,query`
- 实测 **200**，0.42 s，返回：
  ```json
  {"status":"success","country":"Japan","countryCode":"JP","region":"13","regionName":"Tokyo",
   "city":"Tokyo","isp":"Amazon.com, Inc.","org":"AWS EC2 (ap-northeast-1)","as":"AS16509 Amazon.com, Inc.", ...}
  ```
- **关键**：`proxy`（bool）、`hosting`（bool，实测 `true` —— 对 AWS 出口判定正确）、`mobile`（bool）
- 映射关系：`hosting:true` ⇒ 机房 IP（≈ `isResidential:false`）；`proxy:true` ⇒ 代理/广播风险
- ⚠️ 必须用 **http**（https 免费版需付费）；免费 45 req/min

**C. 换用 ifconfig.co**

- 端点：`https://ifconfig.co/json`（实测 **200**，0.75 s）
- 字段：`ip`、`country`、`country_iso`（→ countryCode）、`region_name`、`city`、`asn_org`
- 无风险分

**D. 保留 IPPure 但加降级链**：请求 `my.ippure.com/v1/info` → 若 403 或 body 含 `Just a moment`，fallback 到 ipwho.is / ip-api.com，并在 tile 上标注「IPPure 不可达」。

> 不建议再用 `https://api.ippure.com` 系列 —— 实测同样 403。
> 也不要尝试 `scamalytics.com`（HTML 页面，需正则爬，返回 35 KB）。

---

## 2. ChatGPT / OpenAI

| 请求 | 状态码 | body |
|------|--------|------|
| `GET https://api.openai.com/compliance/cookie_requirements` + UA | **200** | `{"cookie_consent_required":false}`（38 B） |
| 同上，空 UA | **200** | 同上 |
| `GET https://api.openai.com/v1/models` | 401 | `Missing bearer authentication in header` |
| `GET https://api.openai.com/compliance/legal_acceptance` | 404 | `Invalid URL (GET /compliance/legal_acceptance)` |

- 脚本判 `status !== 200` → 报错；`body.includes("unsupported_country")` → 被封锁。
- **在本地区（JP）实测不会出现 `unsupported_country`**，所以只能验证「不误报」，无法验证「能检出封锁」。
- 该端点**本身不携带任何地区信息**，属于纯探活。

### 替代/增强：`https://api.openai.com/cdn-cgi/trace` ✅

- 实测 **200**，310 B，纯文本，空 UA 也 **200**，连测 3 次稳定 `loc=JP`
- 返回：
  ```
  fl=1008f17
  h=api.openai.com
  ip=54.178.179.101
  ts=1792321897.000
  visit_scheme=https
  uag=Mozilla/5.0 ...
  colo=NRT
  sliver=050-tier1
  http=http/2
  loc=JP          ← 国家码
  tls=TLSv1.3
  sni=plaintext
  warp=off
  gateway=off
  ```
- **解析**：`/^loc=([A-Z]{2}|T1)$/m` → `JP`；`T1` = Tor 出口
- 同源 `chatgpt.com/cdn-cgi/trace` 也可用（实测 200，`loc=JP`），但 `chatgpt.com/` 首页实测超时（20 s 无响应，rc=28），**建议仍用 `api.openai.com` 而不是 `chatgpt.com`**

**推荐逻辑**：先请求 `cdn-cgi/trace` 取 `loc`，再对照 OpenAI 支持国家表（或只在 `loc` ∈ 黑名单 {CN, HK, RU, IR, KP, SY, CU} 时判「被封锁」）。

---

## 3. Claude / Anthropic

| 请求 | 状态码 | body |
|------|--------|------|
| `GET https://api.anthropic.com/v1/models` + `x-api-key:test` + `anthropic-version:2023-06-01` | **401** | `{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"..."}` |
| 同上，空 UA | **401** | 同上（稳定） |
| `POST https://api.anthropic.com/v1/messages` + `x-api-key:test` | **401** | 同上 authentication_error |
| `GET https://claude.ai/` | **403** | Cloudflare `Just a moment...`（`cf-mitigated: challenge`） |
| `GET https://claude.ai/api/organizations` | **403** | 同样质询页 |
| `GET https://claude.ai/cdn-cgi/trace` | **200** | `loc=JP`（空 UA 也 200） |

- 401 是**稳定行为**，脚本把它判「可用」在 JP 上是对的；但在**被封锁地区**，`api.anthropic.com` 通常也会返回 401（因为它先做鉴权、不按地区拒），所以**401 无法区分地区**。
- `claude.ai/` 首页被 WAF 挡住，**不能**用作替代。

### 替代方案：`https://claude.ai/cdn-cgi/trace` + 支持国家白名单

```js
// 取 loc
const m = body.match(/^loc=(\w+)$/m)
const loc = m ? m[1] : ""
// loc === "T1" -> Tor 出口，可用
// 否则查白名单
```

支持国家白名单（参考社区公认实现 `MediaUnlockTest`，含 160+ 国家；**不含 CN / HK / MO / RU / IR / KP**）：

```
AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BE BZ BJ BT BO BA BW BR BN BG BF BI
CV KH CM CA TD CL CO KM CG CR CI HR CY CZ DK DJ DM DO EC EG SV GQ EE SZ FJ FI
FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IQ IE IL IT JM JP JO KZ
KE KI KW KG LA LV LB LS LR LI LT LU MG MW MY MV MT MH MR MU MX FM MD MC MN ME
MA MZ NA NR NP NL NZ NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RW KN
LC VC WS SM ST SA SN RS SC SL SG SK SI SB ZA KR ES LK SR SE CH TW TJ TZ TH TL
TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VN ZM ZW
```

**推荐逻辑**：`cdn-cgi/trace` 取 `loc` → 若 `loc` 在白名单 ⇒ 可用 + 显示国家；`T1` ⇒ 「Tor」；否则 ⇒ 被封锁。

---

## 4. Gemini ⚠️ 重点：`generate_204` 无法判定地区

| 请求 | 状态码 | size |
|------|--------|------|
| `GET https://gemini.google.com/generate_204` + UA | **204** | 0 |
| 同上，空 UA | **204** | 0 |
| `GET https://gemini.google.com/` + UA | **200** | 813 754 B（HTML，`lang="zh-CN"`） |
| `GET https://gemini.google.com/app` | 200 | 813 732 B |

**为什么 `generate_204` 不可靠：**
1. 它只是一个「连通性探针」，Google 用它做联网检测，**对任何能连到 Google 边缘节点的 IP 都返回 204**，不查询业务地区。
2. 它的响应体恒为 0 字节，**没有任何可解析的字段**，脚本里 `status === 200` 的分支、`body.includes("unavailable")` 的分支**永远走不到**（死代码）。
3. `gemini.google.com/` 首页 HTML 中**也没有任何国家字段**（实测只找到 `"cfb2h":"boq_gemini-web-uiserver_20261016.00_p0"` 这一个与地区无关的构建版本号；`unavailable` / `not supported` 均 0 命中）。
4. `gemini.google.com/cdn-cgi/trace` **不可用**（返回 404，该域不走 Cloudflare）。

**结论：Gemini 没有「一个 GET 就能拿到国家码」的轻量端点。** 现实中 Gemini 的地区限制体现在「访问时重定向到 `support.google.com` 说明页 / 返回 403」，而不体现在 `generate_204` 上。

### 建议
- **方案 A（推荐，简单可靠）**：用 `https://gemini.google.com/generate_204` 或 `https://gemini.google.com/` 做**探活**，Tile 文案改成「可达 / 不可达」，**不要**声称「可用 / 不可用」。
- **方案 B（要显示地区）**：复用 §5 Google 的国家判定（见下），因为 Gemini 与 Google 账号地区强相关。
- **方案 C**：请求 `https://gemini.google.com/app` 并检查响应是否 302 到 `https://support.google.com/gemini/answer/13575153`（地区不支持说明页）—— 本地区无法验证该分支，属**未验证**方案，需在受限地区实测。

---

## 5. Google

| 请求 | 状态码 |
|------|--------|
| `GET https://www.google.com/generate_204` + UA | **204**（0 B） |
| 同上，空 UA | **204** |
| `GET https://www.google.com/` | 200（213 KB，`lang="zh-CN"` 跟随 Accept-Language） |
| `GET https://www.google.com/cdn-cgi/trace` | **404**（不支持） |
| `GET https://accounts.google.com/Generate_204` | **404**（注意大写 G，不是这个） |

- 与 Gemini 同理：`generate_204` 只能探活。
- 脚本里 `status === 200` 时判 captcha、`302/301` 判不可用 —— 在 JP 全都不触发。
- **Google 的地区判定**通常用 `https://www.google.com/search?q=...` 的 `lang`/`gl` 或 `region` cookie，但没有稳定轻量端点；建议**保持探活语义**，Tile 文案改为「可达」。

---

## 6. X (Twitter)

| 请求 | 状态码 | body |
|------|--------|------|
| `GET https://x.com/i/api/1.1/branch/init.json` + UA | **403** | **0 字节（空）** |
| 同上，空 UA | **403** | 0 字节 |
| `POST https://api.x.com/1.1/guest/activate.json` | **403** | `{"code":200,"message":"Forbidden."}`（35 B） |
| `POST https://x.com/i/api/1.1/guest/activate.json` | **403** | 0 字节 |
| `GET https://x.com/i/api/graphql/.../UserByScreenName` | **403** | 0 字节 |
| `GET https://x.com/` + UA | **200** | 40 982 B，`<html lang="zh-cn">`（跟随 Accept-Language） |
| `GET https://x.com/` + `Accept-Language: ja-JP` | 200 | `<html lang="ja">` |
| `GET https://x.com/cdn-cgi/trace` | **200** | `loc=JP`（空 UA 也 200） |

**问题诊断：**
1. `branch/init.json` 的 403 **body 为空**，脚本拿不到任何可判别信息；它是「未带认证头的内部 API」，403 属常态，**在世界任何地区都是 403**，因此**完全没有地区区分能力**。脚本把「401/403 判为可用」虽然歪打正着，但这个端点本身就是无效信号。
2. `x.com` 首页 HTML 中唯一的 country 字段是 `window.__INITIAL_DATA__.appMetadata.country`，**实测值为 `"country":"XX"`** —— 这是匿名访客的占位值，**不是真实出口地区**，不可用。
3. `lang` 属性只跟随 `Accept-Language`，与 IP 地区无关，也不可用。

### 替代方案：`https://x.com/cdn-cgi/trace` ✅（已验证）

```
loc=JP
colo=NRT
ip=54.178.179.101
warp=off
gateway=off
```

**推荐逻辑**：
- 取 `loc`，若为 `T1` ⇒ Tor 出口（X 通常也受限）
- X 受限国家黑名单：`CN IR MM KP RU TM`（社区公认实现）
- 若 `loc` ∈ 黑名单 ⇒ 被封锁；否则 ⇒ 可用 + 显示 `loc`

> 备选：`https://api.x.com/cdn-cgi/trace` 同域，但实测 `x.com` 更稳。

---

## 7. Instagram

| 请求 | 状态码 | 备注 |
|------|--------|------|
| `GET https://www.instagram.com/` + 桌面 UA | **200** | 598 607 B，`<html lang="zh-cn">` |
| 同上，**空 UA** | **302** | `location: https://www.facebook.com/unsupportedbrowser` |
| `GET https://www.instagram.com/cdn-cgi/trace` | 200（HTML） | **不支持**，返回的是首页 HTML |
| `GET https://www.instagram.com/api/v1/web/get_ruling_for_content/...` | 400 | `{"message":"useragent mismatch","status":"fail"}` |

### 脚本存在的两个真实缺陷

1. **`body.includes("instagram")` 几乎恒真** —— 任何 200 页面（包括「不可用」提示页）都含 "instagram"，所以 `status === 200 && body.includes("instagram")` ⇒ 永远判「可用」。这个条件是**空的**。
2. **空 UA 会 302 到 `facebook.com/unsupportedbrowser`**，脚本走到 `status === 302 → 判「不可用」`，**会把「UA 不合适」误报成「地区封锁」**。Stash `$httpClient` 默认 UA 不是浏览器 UA，**极易触发这条误判** ← 这很可能就是用户反馈「不能正常测试」的直接原因之一。
3. 实测 `"not available in your country"` 在 200 页面里 **0 次命中**，`"region blocked"` 也 0 命中 —— 这两条分支在本地区无法验证，且 Meta 英文文案实际并不是这个措辞。

### 替代方案：解析 body 中的 `"country_code"` ✅

在 200 响应里定位（实测命中）：

```
["PolarisSiteData",[],{"data":null,"id":null},7365],
["PolarisSiteData",[],{"country_code":"JP","device_id":"F88D5328-...","ig_mweb_zr_skip_applink":false,...}
```

- **正则**：`/"country_code"\s*:\s*"([A-Za-z]{2})"/` → `JP`
- **务必带浏览器 UA**（不带会 302，见上）
- Instagram 不可用国家（社区公认）：**CN, IR, KP, SY, CU** 等
- 另一种更稳的信号：拿不到 `country_code` 时退回 `"should_mute_audio":true`（社区 `${MediaUnlockTest}` 用 IG GraphQL 接口返回该字段判「不可用」），但需要带完整 cookie 头，**太重，不建议**在 Tile 里用

**推荐逻辑**：
```
UA = 桌面 Chrome
GET https://www.instagram.com/
if 302 && location 含 "unsupportedbrowser" -> 明确是 UA 问题，重试/标注，不要判地区
country = body.match(/"country_code":"([A-Z]{2})"/)?.[1]
```

---

## 8. TikTok ⚠️ 正则抓错字段

实测 `GET https://www.tiktok.com/explore` → **200**，392 390 B，有 UA / 空 UA 都是 200。

页面里 **`"region"` 出现 2 次**，含义完全不同：

| # | 上下文 | 实测值 | 真实含义 |
|---|--------|--------|---------|
| 1 | `"tea":{"abDomain":"https://libraweb-sg.tiktok.com","reportDomain":"https://mcs-sg.tiktokv.com"},"idc":"my","vdc":"my","region":"ALISG"` | **`ALISG`** | **机房/数据中心代码**（`idc=my` 表示马来西亚）—— 与用户地区**无关** |
| 2 | `"webapp.app-context":{"language":"zh-Hans","region":"JP","appId":1180,...,"clusterRegion":"ALL_SG",...}` | **`JP`** | ✅ **真实用户地区** |

`region:ALISG` 排在前面，所以脚本的正则 `/"region"\s*:\s*"(\w+)"/` **先命中 ALISG**，Tile 上显示 `(ALISG)`，用户看到的就是「测试不正常」。

### 正确的解析方式

TikTok 把这些数据放在 `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">` 里，可**直接 JSON.parse**：

```js
// 方案 A：直接解析 JSON（最稳）
const m = body.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
let region = ""
if (m) {
  try { region = JSON.parse(m[1]).__DEFAULT_SCOPE__["webapp.app-context"].region } catch (e) {}
}
// 实测 region === "JP"
```

```js
// 方案 B：正则（轻量，够用）
const m = body.match(/"webapp\.app-context":\{[^}]*?"region":"(\w+)"/)
const region = m ? m[1] : ""
// 实测命中 "JP"
```

**务必不要**用 `/"region"\s*:\s*"(\w+)"/`（会抓到 `ALISG`），也**不要**用 `clusterRegion`（实测 `ALL_SG`，同样是机房概念）。

**其他补充：**
- 脚本里 `location.includes("/notfound")` 分支：实测本地区 `/explore` 与 `/` 都**不重定向**（`tiktok.com/` 根路径 200，仅 1462 B 的极简页面，但 `/explore` 是完整 392 KB 页面，**用 `/explore` 是对的**）。
- 空 UA 也能 200 且含 region，**TikTok 对本检测最友好**。

---

## 9. YouTube

| 请求 | 状态码 | 字段 |
|------|--------|------|
| `GET https://www.youtube.com/premium` + UA | **200** | `"GL":"JP"`（967 023 B） |
| 同上，空 UA | **200** | `"GL":"JP"` |
| `GET https://www.youtube.com/premium?gl=CN` | **200** | 仍然 `"GL":"JP"` ✅ **证明 `GL` 由 IP 决定，不被参数伪造** |
| `GET https://www.youtube.com/watch?v=dQw4w9WgXcQ` | **302** | → `https://www.google.com/sorry/index?continue=...`（Google 人机校验），跟随为 **429** |

- **`"GL":"JP"` 是可靠的国家码字段** ✅。上下文：
  `...,"GAPI_LOCALE":"zh_CN","GL":"JP","GOOGLE_FEEDBACK_PRODUCT_ID":"59",...`
  用 `/"GL"\s*:\s*"([A-Z]{2})"/` 即可，实测**唯一命中一次**。
- 脚本的正则 `/"GL"\s*:\s*"([A-Z]{2})"/i` 是**正确的**，不用改。
- 建议补一行 `body.includes("www.google.cn")` ⇒ 判 CN（社区公认实现用这条识别大陆出口）。
- ⚠️ **不要**去请求 `/watch?v=` 页面做检测，会触发 Google 人机校验（302 → sorry/index，429）。

---

## 10. Netflix ⚠️ 脚本读错字段

| 请求 | 状态码 | 关键响应头 |
|------|--------|-----------|
| `GET https://www.netflix.com/title/70143836`（`--max-redirs 0`，JP 出口） | **301** | `location: https://www.netflix.com/jp-en/title/70143836`<br>`x-originating-url: http://www.netflix.com/title/70143836` |
| 同上（KR 出口） | **301** | `location: https://www.netflix.com/kr-en/title/70143836`<br>`x-originating-url: http://www.netflix.com/title/70143836`（**不变**） |
| `GET /title/80197526`（JP） | **301** | `location: https://www.netflix.com/jp-en/title/80197526` |
| `GET /title/81280792`、`/title/80018499`（KR） | **301** | `location: https://www.netflix.com/kr-en/title/...` |

- 四个 title **全部 301**，响应体 0 字节。
- `server: envoy`，`via: ... c000.tyo001.ix.nflxvideo.net`（东京边缘节点）。

### 脚本的 BUG（已确证）

```js
const url = headers["X-Originating-Url"] || headers["x-originating-url"] || ""
const loc = url.split("/")[3]     // ← "http://www.netflix.com/title/70143836".split("/")[3] === "title"
if (loc === "title") return "us"  // ← 恒真！永远返回 "us"
```

`x-originating-url` 的值是 `http://www.netflix.com/title/70143836`：
`split("/")` → `["http:", "", "www.netflix.com", "title", "70143836"]` → `[3]` = **`"title"`** → 函数**永远返回 `"us"`**，于是 Tile 永远显示 `无限制 (US)`，**从来没读过真实地区**。

### 修复：改读 `location`

```js
const headers = response.headers || {}
const loc = header(headers, "location") || ""   // https://www.netflix.com/jp-en/title/70143836
const parts = loc.split("/")                     // ["https:","","www.netflix.com","jp-en","title","70143836"]
const seg = parts[3] || ""                       // "jp-en"
const country = seg.split("-")[0].toLowerCase()  // "jp"
```

**地区码位置确认：`jp-en` 在第 4 段（index 3），取 `-` 之前 ⇒ `jp`。**

### 用哪个 title 区分「无限制 / 仅原创」？

- 社区公认实现（`MediaUnlockTest`）的做法更完整，**三家 title 交叉判断**：
  - `81280792`（乐高电影）、`70143836`（绝命毒师）、`80018499`（测试片）
  - 若两个都 **404** ⇒ Originals Only；都 **403** ⇒ IP 被封
  - 否则取 `location` 第 4 段的国家码
- 本地区（JP）三个都 301，**无法实测 404 分支**，需在「仅原创」地区验证。
- **强烈建议**至少在 403/429 时把 Tile 标成「受限」而不是当成国家码解析失败。

> 另外记录：社区实现还提供了 `https://api.fast.com/netflix/speedtest/v2?https=true&token=YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm&urlCount=5`（返回 `targets[].location.country`）作为地区/CDN 判定，本报告**未测**（超出本任务范围）。

---

## 11. Disney+ ✅ 全链路可用

完整复现脚本的三步调用，**全部成功**：

| 步骤 | 请求 | 状态码 | 关键结果 |
|------|------|--------|---------|
| 1 | `POST https://disney.api.edge.bamgrid.com/devices`<br>`Authorization: Bearer ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84`<br>`{"deviceFamily":"browser","applicationRuntime":"chrome","deviceProfile":"windows","attributes":{}}` | **201** | `assertion`（431 字符 JWT） |
| 2 | `POST https://disney.api.edge.bamgrid.com/token`<br>表单 `grant_type=urn:ietf:params:oauth:grant-type:token-exchange&...&subject_token=<assertion>&subject_token_type=urn:bamtech:params:oauth:token-type:device` | **200** | `refresh_token`（2809 字符），另有 `access_token` / `expires_in:14400` |
| 3 | `POST https://disney.api.edge.bamgrid.com/graph/v1/device/graphql`<br>`Authorization: Bearer ZGlzbmV5...`（**注意：带 Bearer 前缀**）<br>`mutation refreshToken(...)` | **200** | 12 765 B，含 `"inSupportedLocation":true`、`"countryCode":"JP"`（KR轮=`KR`） |

- 实测 `"inSupportedLocation":true` **出现 1 次**，`"countryCode":"JP"` **出现 1 次** —— 脚本的正则 `/\"inSupportedLocation\"\s*:\s*true/` 和 `/\"countryCode\"\s*:\s*\"([^\"]+)\"/` **都能正确命中** ✅
- 响应头 `x-bamtech-region: eu-central-1`（这是**服务端集群**，不是用户地区，别用）
- 已知坑：第 3 步的 `Authorization` 必须是 `Bearer <BAM_BASE64>`，而第 2 步只需要**裸** `BAM_BASE64`（脚本这里写对了）。第 3 步 `--data @file` 提交时如果 `refresh_token` 过长要确保 `Content-Type: application/json`。
- 另一个已知坑：脚本第 1 步用 `Authorization` 大写、第 2 步用 `authorization` 小写 —— **HTTP 头名不区分大小写，无影响**，已实测两种都能通过。

**结论：disney.js 无需修改，是三段式链路里唯一完全正确的一个。**

---

## 12. Spotify ⚠️ status 320 被误判

| 请求 | 状态码 | body |
|------|--------|------|
| `POST https://spclient.wg.spotify.com/signup/public/v1/account`（脚本原样的表单） | **200** | `{"status":320,"errors":{"generic_error":"You seem to be using a proxy service. Please turn off these services and try again. For more help, please contact customer service."},"push-notifications":false}` |
| 重试 ×3 | 200 | **完全一致，稳定** |

### status 320 的确切含义

**`320` = Spotify 判定该 IP 为代理/数据中心，拒绝注册**，**不是**「国家未开通」。

证据：多家社区公认实现（`MediaUnlockTest` 的 Python/Go/各语言移植）对该端点使用同一套判定：

```go
if res.Status == 320               { return StatusNo }                    // 拒绝（代理/风控）
if res.Status == 311 && IsCountryLaunched { return OK, region: res.Country } // 可用
```

即：
- **`311` + `is_country_launched:true`** ⇒ 可用，`country` 是两位国家码
- **`320`** ⇒ **不可用（风控/代理）** —— 与本地区是否开通**无关**

**脚本的 BUG：**
```js
if (json.status === 320 || json.message === "country not launched") {
  $done({ content: "不可用" })   // ← 把「代理被拒」当成了「地区未开通」
}
```
把 320 归到「不可用」在**结果上**不算错（确实不可用），但**原因是错的** —— 用户看到「不可用」会以为地区不支持，实际是**这个节点被 Spotify 识别成了代理**（本测试出口是 AWS 东京机房，符合 `proxy service` 判定）。且脚本**没有处理 status 311**（`311` 才是国家判定分支，脚本里虽然写了 `json.status === 311 && json.is_country_launched`，但实测从未返回过 311）。
另外 `json.message === "country not launched"` 这个字段**在这个端点的响应结构里并不存在**（顶层只有 `status` / `errors` / `push-notifications`），是死代码。

### 替代方案：`https://www.spotify.com/premium/` 的 302 Location ✅（推荐）

| 请求 | 状态码 | Location |
|------|--------|----------|
| `GET https://www.spotify.com/premium/`（`--max-redirs 0`） | **302** | `https://www.spotify.com/jp/premium/` |
| 同上，**空 UA** | **302** | `https://www.spotify.com/jp/premium/`（UA 无关，稳） |
| `GET https://www.spotify.com/get_access_token?reason=transport&productType=web_player` | **302** | `https://www.spotify.com/jp/get_access_token/?reason=transport&productType=web_player` |
| `GET https://www.spotify.com/download/` | 302 | `https://www.spotify.com/jp/download/` |
| `GET https://www.spotify.com/`（根） | 301 | `https://open.spotify.com/`（**根路径不带国家，别用**） |
| `GET https://open.spotify.com/` | 200 | 166 KB HTML，**无 country 字段** |
| `GET https://open.spotify.com/get_access_token?...` | **403** | `403 URL Blocked`（Varnish），**不可用** |

- **`/premium/` 与 `/download/` 的 302 都会插入国家段**，格式：`https://www.spotify.com/<国家>/<path>` ⇒ 取 `location.split("/")[3]` = `jp`
- ⚠️ **实测两种格式都要兼容**：JP 下是 `/jp/premium/`（裸国家码），KR 下是 **`/kr-ko/premium/`**（国家码 + 语言）。所以必须 `seg.split("-")[0]`。
- 实测响应快（0.24 s）且**与 UA 无关**，最适合 Tile
- ⚠️ 注意：跟着跳到 `/jp/premium/` 是 **200**（正常页面），但 `/jp/get_access_token/` 是 **404**。所以**只用 Location 推断国家，不要跟跳**。

**推荐逻辑**：
```js
const r = await request("GET", { url: "https://www.spotify.com/premium/", "auto-redirect": false })
const loc = header(r.response.headers, "location") || ""
const seg = loc.split("/")[3] || ""          // "jp" / "kr-ko"
const country = seg.split("-")[0].toLowerCase()   // "jp" / "kr"
// 再用 Spotify 已开通国家表判断
```
Spotify 已开通国家/地区黑名单（**未开通**）：`CN`、`KP`、`IR`、`SY`、`CU`、`RU`（2022 起退出）、以及部分非洲/中东国家。若不是黑名单成员 ⇒ 可用 + 显示 `country`。

**备选**：保留 `spclient.wg.spotify.com/signup/public/v1/account`，但把判定改成
- `status === 311 && is_country_launched` ⇒ 可用（显示 `country`）
- `status === 320` ⇒ **「节点被识别为代理」**（文案区分开，颜色用黄而非红）
- 其他 ⇒ 未知

---

## 替代方案推荐（汇总）

### 一张表决定「改什么」

| 服务 | 一行结论 | 新端点 | 新字段 / 正则 |
|------|---------|--------|--------------|
| IPPure ×3 | CF 挡死，换源 | `https://ipwho.is/` 或 `http://ip-api.com/json/?fields=...` | `country_code` / `city` / `connection.isp`；`proxy` / `hosting` |
| ChatGPT | 加地区码 | `https://api.openai.com/cdn-cgi/trace` | `^loc=([A-Z]{2}\|T1)$` |
| Claude | 换地区码 | `https://claude.ai/cdn-cgi/trace` | `^loc=(\w+)$` + 国家白名单 |
| Gemini | 只能探活 | `https://gemini.google.com/generate_204`（保留） | 无（建议文案改「可达」） |
| Google | 只能探活 | `https://www.google.com/generate_204`（保留） | 无 |
| X | 换地区码 | `https://x.com/cdn-cgi/trace` | `^loc=(\w+)$` + 黑名单 `CN IR MM KP RU TM` |
| Instagram | 修正则 + 修 302 | `https://www.instagram.com/`（保留） | `"country_code"\s*:\s*"([A-Z]{2})"` |
| TikTok | 修正则 | `https://www.tiktok.com/explore`（保留） | `"webapp\.app-context":\{[^}]*?"region":"(\w+)"` |
| YouTube | 不用改 | `https://www.youtube.com/premium`（保留） | `"GL":"([A-Z]{2})"` ✅ |
| Netflix | 改读 `location` | `/title/70143836`、`/title/80197526`（保留） | `location` 第 4 段 `/-/` 前 |
| Disney+ | 不用改 | 三步链路（保留） | `"inSupportedLocation":true`、`"countryCode":"xx"` ✅ |
| Spotify | 换 302 国家 | `https://www.spotify.com/premium/`（`auto-redirect:false`） | `location` 第 4 段 |

### 通用建议（写给修正脚本的人）

1. **`cdn-cgi/trace` 是最通用的地区码来源**。实测在 `api.openai.com`、`claude.ai`、`x.com`、`chatgpt.com` 上全部 **200**，且 **JP 轮返回 `loc=JP`、KR 轮返回 `loc=KR`**，**空 UA 也正常**。凡是被 Cloudflare 前置的服务，都可以先试 `/cdn-cgi/trace`：
   ```js
   const m = (body || "").match(/^loc=([A-Z]{2}|T1)$/m)
   const loc = m ? m[1] : ""   // "JP"/"KR"… / "T1"(Tor) / 空(不支持)
   ```
2. **`generate_204` 只能判「通/不通」，绝不能判「地区可用」**。`google.js` / `gemini.js` 的 `status===200`、`body.includes("captcha")`、`body.includes("unavailable")` 等分支**永远不会执行**（204 响应体为 0 字节）。至少把它们删掉或明确标注为「探活」。
3. **统一带上浏览器 UA**。实测空 UA 会导致：Instagram **302 → facebook/unsupportedbrowser**、TikTok/X 不受影响。建议所有脚本共用同一个 `USER_AGENT` 常量。
4. **区分「网络错误 / 风控 / 地区受限」三种红色**。Spotify 320（代理）、Netflix 403（IP 被封）、Cloudflare 403（WAF）都不是「地区不支持」，用不同文案和颜色（黄 vs 红）能大幅减少「测试不正常」的困惑。
5. **超时预算**：实测 `/premium`（YouTube 1.0–1.7 s）、`instagram.com`（~1.0 s）较慢；整体都在 8 s 内，但**TikTok / YouTube 建议给到 10 s**。
6. **复查 `Boolean(json.isResidential)`**：IPPure 文档说该字段是 boolean，但脚本用 `Boolean()` 包裹，若某天变字符串会判反，建议改成显式比较。

---

## 附：本次未验证项（受「出口 = JP/KR 均为可用地区」限制）

> 两轮出口分别落在 **JP** 和 **KR**，两者都是「这些服务全部可用」的地区，因此**一切「地区受限」分支都未能触发**。下表明确列出未验证项 —— 修正脚本时对这几条要谨慎，不要凭本报告假定其行为。

| 项目 | 原因 | 建议 |
|------|------|------|
| Gemini 地区受限时的真实响应 | JP/KR 均不受限，看不到 403/重定向 | 需在 CN/HK 节点实测 |
| Instagram `should_mute_audio` 分支 | 需要完整 IG cookie 头 | 用 `country_code` 即可规避 |
| Netflix 404（Originals Only）分支 | JP/KR 下四个 title 全部 301 | 需在「仅原创」地区实测 |
| Spotify status 311 成功分支 | 两轮出口都是机房 IP，均被判代理返回 320 | 需在住宅 IP 环境实测 |
| ChatGPT `unsupported_country` 分支 | JP/KR 下不出现 | 需在 CN 节点实测 |
| X 403 的「地区封禁」形态 | JP/KR 下 `x.com/` 为 200 | 需在 CN/RU 节点实测 |
| IPPure 该 API 的其他出口表现 | 两个出口都是 403（CF 质询），与地区无关 | 与出口无关，确认是 WAF 问题 |

### 关于出口 IP 漂移的提醒

本次会话内观察到出口从 `54.178.179.101`（JP）漂到 `3.39.243.194`（KR）。这说明：

- 若脚本某天出现「结果时好时坏」，**未必是脚本 bug**，可能是节点出口漂到了另一个国家 —— 本报告中的字段规则（`cdn-cgi/trace` 的 `loc`、YouTube `GL`、`country_code`、`location` 国家段）**都正确跟随了这些漂移**，可以作为排查的「基准真值」。
- 反过来，**TikTok 的 `region:ALISG` 和 Netflix 的 `x-originating-url` 在两次漂移中都没有变化** —— 这正是判定这两个写法无效的决定性证据。
