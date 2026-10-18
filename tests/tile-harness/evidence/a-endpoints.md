# 实测：2026-10-18 20:18 CST

环境：curl 8.7.1（LibreSSL 3.3.6），代理出口经 `proxy-status: http_request_error; e_proxy` 判定为 Facebook 内部代理（非中国大陆直连），UA 同脚本 `DESKTOP_UA`。

复现命令（不含任何响应正文）：

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
curl -s -m 10 -o /dev/null -A "$UA" -w "%{http_code} %{redirect_url}\n" <url>
```

| 服务 | 请求 | 状态码 | Location/关键响应头 | 备注（是否命中模板分支） |
|---|---|---|---|---|
| facebook | GET https://www.facebook.com/ | 400 | 无 Location；`proxy-status: http_request_error; e_proxy=…`；len=1542 | **未命中预期的 200/30x**。带该 UA 时 MockingBird 前置代理直接 400（`<h1>Sorry, something went wrong.</h1>`，非封锁文案），去掉 UA 则 200/len≈423812 —— 说明是 UA + 该出口组合触发的服务端错误。落分支 11 → `错误 (400)`（橙）。 |
| threads | GET https://www.threads.com/ | 200 | 无 Location、无 `server` 头；len≈237129 | 命中分支 10 → `可用`（Meta 自家 CDN，非 CF）。 |
| reddit | GET https://www.reddit.com/ | 403 | 无 Location；`server: snooserv`、`retry-after: 0`；正文含「You've been blocked by network security」，无 CF 挑战特征（无 `cf-chl` / `just a moment`） | 命中分支 11 → `受限`（红）。**真实出口下显示为 受限，符合预期**。 |
| discord（Lead 已完成，复核） | GET https://discord.com/ | 200 | 无 Location；`server: cloudflare`；len≈170254 | 命中分支 10 → `可用`（Discord 徽标蓝）。 |
| twitch | GET https://www.twitch.tv/ | 200 | 无 Location；len≈219034 | 命中分支 10 → `可用`。 |
| linkedin | GET https://www.linkedin.com/ | 302 | `location: https://www.linkedin.cn/` | 命中分支 7：`www.linkedin.cn` 不在 `DOMAINS=["linkedin.com"]` 内 → `被拦截 -> www.linkedin.cn`（橙）。这是出口被路由到大陆站的**正确**表现，已由用例锁定。 |

## 附：favicon 互通性验证（真实网络）

「facebook 带 UA 恒 400」这类 UA 敏感站点若直接判 `错误 (400)`，会把「网络其实通」误报成「服务挂了」。
fbcdn.net 属 Facebook 自有域名，故实测 favicon 是否走同一套代理链路：

| 请求 | 状态码 | 字节数 | 结论 |
|---|---|---|---|
| GET https://www.facebook.com/favicon.ico | 200 | 20366 | 同一出口、同一 UA 走 favicon 通 → 可用 `400` 兜底区分「站点可达，但首页拒绝该 UA」与「网络不通」 |
| GET https://www.threads.com/favicon.ico | 200 | 235265 | 通（返回整页而非图标，体积不可作依据） |
| GET https://www.reddit.com/favicon.ico | 200 | 2441 | 通 —— 但首页 403 是「受限」语义，**不**用 favicon 复查，避免把受限洗成可用 |
| GET https://www.twitch.tv/favicon.ico | 200 | 4286 | 通 |
| GET https://www.linkedin.com/favicon.ico | 200 | 24838 | 通 |

结论：只有 facebook 需要 favicon 复查（其首页 400 是 UA 敏感，不是地区/服务问题）；其余站点实测均命中明确的模板分支，不引入额外请求。
