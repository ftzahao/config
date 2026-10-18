# 实测记录：流媒体 / 国内服务 6 个 Tile（hbo / primevideo / bilibili / iqiyi / wechat / apple-music）

> 对应 `_design.md` §2「主链路：域名落地（landing）」。
> **本文件只记录状态码 / Location / 大小，不落任何响应正文。**

## 0. 实测环境

| 项 | 值 |
|---|---|
| 实测时间（UTC） | 2026-10-18T12:27Z（本地 2026-10-18 20:27 +08:00） |
| 出口 IP | `3.39.243.194` |
| 出口归属 | **KR（韩国）**，Incheon，AS16509 Amazon.com |
| UA | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`（与脚本内 `UA` 常量逐字一致） |
| 命令 | `curl -s -m 10 -o /dev/null -A "<UA>" -w "%{http_code} %{redirect_url} size=%{size_download}\n" <url>` |
| 说明 | `size_download` 为本机实测字节数；`bilibili.com` 首页大小在多次采样间有 ~2% 波动（169KB–172KB），属正常动态内容差异，不影响判定 |

跑两轮（20:27 / 20:29），状态码与 Location **全部一致**，下表取第二轮。

## 1. 实测表

| 服务 | URL | 状态码 | Location | 大小 | 预计显示 | 备注 |
|---|---|---|---|---|---|---|
| hbo | `https://www.max.com/` | **301** | `https://www.hbomax.com/` | 0 B | **可用**（HBO 蓝 `#002BE7`） | 品牌合并：max.com → hbomax.com。**跨域，但两端都在 `DOMAINS` 内** → 正常迁移，判可用。落点无路径段 → 无地区后缀 |
| hbo（落点对照） | `https://www.hbomax.com/` | **200** | —（不跳转） | 2,890,345 B（2.9 MB） | **可用** | 按脚本逻辑不会走到这里（`auto-redirect: false` 只拿到 301）。**未跟随该跳转**，因此这一项**不构成「跟随后仍可用」的实测结论** |
| primevideo | `https://www.primevideo.com/` | **302** | `https://www.primevideo.com/offers/nonprimehomepage?ref_=dv_web_force_root` | 0 B | **可用**（Prime 蓝 `#00A8E1`） | 同域跳转（未订阅首页）。首段 `offers` 不是地区码 → **无地区后缀** |
| bilibili | `https://www.bilibili.com/` | **200** | — | 169,339 B（~169 KB） | **可用**（哔哩哔哩蓝 `#00A1D6`） | 直接 200，无跳转，无地区信息 → 只显示「可用」。正文封锁文案 / CF 挑战特征命中数 = **0** |
| iqiyi | `https://www.iqiyi.com/` | **200** | — | 8,631 B（8.6 KB） | **可用**（爱奇艺绿 `#00BE06`） | 直接 200，壳页（体积小属正常，前端 boot 后再拉资源）。封锁文案命中数 = **0** |
| wechat | `https://weixin.qq.com/` | **200** | — | 112,630 B（~110 KB） | **可用**（微信绿 `#07C160`） | 直接 200，**未出现**「not available in your country」说明页（KR 出口正常）。封锁文案命中数 = **0** |
| apple-music | `https://music.apple.com/` | **302** | `https://music.apple.com/cn` | 0 B | **可用 (CN)**（Apple Music 红 `#FA243C`） | **地区段是不带语言后缀的 `/cn`**，与 spotify 的 `/kr-ko` 写法不同；`regionOfSegment` 两种都认，故输出 `(CN)` 而非空后缀 |

## 2. 由实测推出的判定要点

1. **hbo 必须是「跨域白名单」而不是「同域白名单」**：`max.com` → `hbomax.com` 是跨域跳转，
   若 `DOMAINS` 只写 `max.com`，本面板会在**真实网络下**把 HBO 误报成「被拦截 -> www.hbomax.com」。
   这是本批次最容易写错的一条，已固定为 `hbo.case.mjs` 中一条独立用例（同域/跨域各一条）。
2. **apple-music 的地区后缀只来自 302 Location**：实测 `/cn` 无语言后缀；`/jp`、`/us/album/x` 同理。
   若实现里假定「地区段必须是 `xx-yy` 两段式」，`music.apple.com` 会永远丢掉 `(CN)`。
3. **primevideo 的 302 是同域、且首段是业务路径**：不能把「跳转」本身当异常，
   也不能把 `offers` 之类的业务段读成地区码。
4. **bilibili / iqiyi / wechat 全部 200**：这类服务的可用性证据只有状态码 + 「页面里没有封锁文案」，
   地区信息**拿不到就不输出**（不猜、不复用别的地理信息）。

## 3. 局限 / 未验证项

- 出口是 **KR**：`apple-music` 实测得到 `(CN)`，是 Apple 按**账号/语言偏好**路由的结果，不代表出口国家。
  tile 如实显示服务端给的地区段，不自行纠正 —— 这是设计选择，需知悉。JP 出口下应显示 `(JP)`（`/jp`，用例已覆盖）。
- 未实测「被地区封锁」的真实样本：本次 6 个 URL 在 KR 出口全部可落地，
  封锁文案 / 451 / CF 挑战页分支只由测试台夹具覆盖（`tests/tile-harness/cases/*.case.mjs`）。
- `curl` 不跟随重定向（未加 `-L`），仅 `www.hbomax.com` 一项是单独直连采样，见上表备注。
