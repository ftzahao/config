# 补充批次端点实测（e-endpoints）

> 实测时间：2026-10-18（出口 KR/JP）。方法：只记状态码 / Location / 大小，
> **不落正文**；正文只用于数「挑战页特征出现次数」，不保存、不引用。
>
> ```bash
> curl -s -m 10 -o /dev/null -A "<对应用 UA>" -w "%{http_code} %{redirect_url} size=%{size_download}\n" <url>
> ```

## 1. 实测结果

| 服务 | URL | 状态码 | Location | 大小 | 预计显示 | 备注 |
|---|---|---|---|---|---|---|
| hulu | `https://www.hulu.com/` | 301 | `https://www.hulu.com/welcome` | 0 | **可用**（`#1CE783`） | 同域跳转，DOMAINS 含 `hulu.com` 即判可用。⚠️ 本次复测（18 日 20:2x，同一台机器）拿到的是 `302 → https://www.disneyplus.com/`，见 §3 |
| youtube_mobile | `https://m.youtube.com/` | 200 | — | 352956 | **可用**（`#FF0000`） | 必须带移动 UA。带桌面 UA 时同一 URL → `302 → https://www.youtube.com/?app=desktop`，也判「可用」（同品牌跨子域，DOMAINS 含 `youtube.com`）；不带移动 UA 测的是桌面站而不是移动站 |
| googlejp | `https://www.google.co.jp/generate_204` | 204 | — | 0 | **可用**（`#4285F4`，无地区后缀） | 纯探活端点：204 即通，且**不含任何地区信息**，脚本不输出 `(REGION)` |
| reddit_api | `https://www.reddit.com/.json` | 403 | — | 190240 | **受限**（`#FF3B30`） | HTML 拦截页。挑战页强特征出现次数全为 0（`just a moment` / `cf-chl` / `checking your browser` / `enable javascript and cookies`），按模板 403 分支判「受限」 |
| poe_api | `https://api.poe.com/` | 403 | — | 1486 | **受限**（`#FF3B30`） | 三次复测均为 403/1486B，无挑战页特征；脚本 200 分支要求 `JSON.parse` 成功，403 仍走模板「受限」 |
| epic_store | `https://store.epicgames.com/` | 403 | — | 25439 | **不可用**（`#FF3B30`） | 与 epic.js 同 URL、同响应，但本脚本把 403 判「不可用」（epic.js 判「受限」）。welcome 页带 `challenge-platform`，**但四类强特征一个都不命中**，所以不会误判成「被拦截」，见 §2 |

## 2. 挑战页特征核对（决定「403 → 受限/不可用」还是「403 → 被拦截」）

脚本里的 `isChallenge()` 只认语义强特征，不认单独的 `challenge-platform`（正常页面也会引用它）：

| 页面 | `just a moment` | `checking your browser` | `enable javascript and cookies` | `cf-chl` | `challenge-platform` | 判定 |
|---|---|---|---|---|---|---|
| reddit_api 403 页 | 0 | 0 | 0 | 0 | 0 | 受限 |
| poe_api 403 页 | 0 | 0 | 0 | 0 | 0 | 受限 |
| epic_store 403 页 | 0 | 0 | 1 | 0 | 1 | 不可用（本脚本）/ 受限（epic.js） |

> epic_store 的 HTML 里确实有 `challenge-platform`，但缺少任何强特征，
> 符合 `_design.md` §1 的约定：「单独的 challenge-platform 可能出现在正常页面引用的静态资源里，不作为依据」。
> 用真实响应体直接跑脚本的 `isChallenge(403, body)` 得到 `false`，也就是会落到 403 分支。

## 3. 与任务书给的实测事实的出入（需要 Lead 拍板）

1. **hulu 的落地目标会漂移**：任务书记录 `301 → www.hulu.com/welcome`，本次复测同一台机器拿到
   `302 → https://www.disneyplus.com/`（size 0）。两种都真实存在（取决于 Disney+/Hulu 的灰度与出口）。
   - 按当前 DOMAINS（`["hulu.com"]`），第二种形态会被判 **被拦截 -> www.disneyplus.com**。
   - 这符合模板语义（跳到白名单外的域名 = 被地区重定向/合并），但和「Hulu 可用」的直觉相反。
   - 建议：保留 `["hulu.com"]` 并接受两种显示，或者把 `hulu.com` 与 `disneyplus.com` 一起列进 DOMAINS
     （若认为合并跳转也算 Hulu 可用）。**本次按任务书给定的 DOMAINS 实现，未擅自扩白名单。**
2. **youtube_mobile 带移动 UA 时是 200**（352KB HTML），不是跳转；跳转到
   `www.youtube.com/?app=desktop` 只在桌面 UA 下出现。两条路径脚本都判「可用」，
   用例里两条都覆盖了，移动 UA 用 `expectRequest(..., headersInclude)` 锁死。

## 4. 与本次新建脚本的对应关系

| 脚本 | 用例数 | 契约（C1–C5） | 真实网络下预计显示 |
|---|---|---|---|
| `stash/tiles/hulu.js` | 22 | 7/7 PASS | 可用（若跳到 disneyplus.com 则「被拦截 -> www.disneyplus.com」） |
| `stash/tiles/youtube_mobile.js` | 25 | 7/7 PASS | 可用 |
| `stash/tiles/googlejp.js` | 25 | 7/7 PASS | 可用（无地区后缀） |
| `stash/tiles/reddit_api.js` | 27 | 7/7 PASS | 受限 |
| `stash/tiles/poe_api.js` | 26 | 7/7 PASS | 受限 |
| `stash/tiles/epic_store.js` | 23 | 7/7 PASS | 不可用（与 epic.js 的「受限」对照） |
