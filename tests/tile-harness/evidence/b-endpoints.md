# 实测记录：AI 服务 6 个 Tile（grok / xai / perplexity / copilot / huggingface / poe）

> 对应 `_design.md` §2「主链路：域名落地（landing）」。
> **本文件只记录状态码 / Location / 大小，不落任何响应正文。**

- 实测时间：2026-10-18 20:18–20:30 CST
- 出口：海外机房出口（非中国大陆直连），同一出口下 `chatgpt.com/cdn-cgi/trace` 可 200，作为对照
- 工具 / 命令（UA 与脚本里的 `UA` 完全一致，`-o /dev/null` 不保存正文）：

```bash
curl -s -m 10 -o /dev/null \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" \
  -w "%{http_code} %{redirect_url} size=%{size_download}\n" <url>
```

## 结果

| 服务 | URL | 状态码 | Location | 大小 | 预计显示 | 备注 |
|---|---|---|---|---|---|---|
| grok | https://grok.com/ | 200 | — | 397770 B | 可用（`#1A1A1A`） | 大体积 SSR 首页；无挑战/封锁特征 |
| xai | https://x.ai/ | 403 | — | 5476 B | **受限**（`#FF3B30`） | 无挑战页特征（见下），403 不能当可用也不能当挑战页 |
| perplexity | https://www.perplexity.ai/ | 403 | — | 5653 B | **被拦截**（`#FF9500`） | 是 Cloudflare 托管挑战页（`Just a moment`），反爬拦截 |
| copilot | https://github.com/features/copilot | 200 | — | 876094 B | 可用（`#24292F`） | 未登录可读的功能页 |
| huggingface | https://huggingface.co/ | 200 | — | 177653 B | 可用（`#FFD21E`） | 公开首页 |
| poe | https://poe.com/ | 307 | https://poe.com/login?redirect_url=%2F | 0 B | 可用（`#5D3FD3`） | 同域跳登录页；`/login` 首段不是地区码，不输出后缀 |
| 对照 | https://accounts.x.ai/ | 403 | — | 5476 B | 受限 | 与 x.ai 完全一致（同一套 WAF 响应），无挑战特征 |
| 对照 | https://chatgpt.com/cdn-cgi/trace | 200 | — | 305 B | （已有 chatgpt.js 使用） | 证明该出口到 Cloudflare 链路正常，403 不是网络问题 |

两次采样（20:18 / 20:30）结果一致；`https://poe.com/` 两次都是 307 到同一 Location。

## 挑战页特征计数（只统计出现次数，不保存正文）

对 403 响应正文只做关键词计数，用来判断「403 到底是挑战页还是普通拒绝」：

| URL | `just a moment` | `enable javascript and cookies` | `cf-chl` | `checking your browser` | `challenge-platform` | 判定 |
|---|---|---|---|---|---|---|
| https://www.perplexity.ai/ | 1 | 1 | 0 | 0 | 1 | **是**挑战页 → `isChallenge()` 命中 → 被拦截 |
| https://x.ai/ | 0 | 0 | 0 | 0 | 1 | **不是**挑战页 → 受限 |
| https://accounts.x.ai/ | 0 | 0 | 0 | 0 | 1 | **不是**挑战页 → 受限 |
| https://poe.com/login?redirect_url=%2F（跟随 poe.com/ 的 307 后） | 1 | 1 | 0 | 0 | 1 | 是挑战页（但脚本不跟随重定向，见下） |

结论：

1. `x.ai` / `accounts.x.ai` 的 403 页面里只有 `challenge-platform` 的脚本引用，没有挑战页独有文案。
   按 `_design.md` §1 的定义（`challenge-platform` 单独出现不算挑战特征），脚本走「受限」分支——
   **这是预期行为**，已在 `xai.case.mjs` 用「403（无挑战页特征）→ 受限」锁定。
2. `perplexity` 的 403 确实是挑战页，脚本判「被拦截」；同一脚本的「无挑战特征 403」分支也有独立用例。
3. `poe.com/` 的 307 落到 `/login` 之后**再跟一次**会拿到 403 + 挑战页，但脚本带
   `auto-redirect: false`，只看到 307 本身，按模板「同域 30x → 可用」判定。若哪天 Poe 把首页改成
   直接 200/403 挑战页，脚本会自动落到对应分支，无需改动。

## 对脚本的影响（真实网络下的预期）

| 脚本 | 真实网络预期 | 原因 |
|---|---|---|
| `grok.js` | 可用 | 200 大页面 |
| `xai.js` | **受限** | 该出口恒 403 且无挑战特征；换成能拿到正常页面的住宅出口才会变成「可用」 |
| `perplexity.js` | **被拦截** | 403 + CF 挑战页；真实网络下只要 403 带挑战特征就 ⛔，不算可用 |
| `copilot.js` | 可用 | 200 功能页 |
| `huggingface.js` | 可用 | 200 首页 |
| `poe.js` | 可用 | 307 同域跳 `/login` |

`grok.com` 与 `x.ai` 会互跳（登录/营销链路落到 `accounts.x.ai`），所以两个脚本的 `DOMAINS` 互为包含：
无论最后落在 `grok.com` 还是 `x.ai` 都算可用，只有跳到这两个之外的域名才判「被拦截」。
