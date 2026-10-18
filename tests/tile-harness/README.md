# Stash Tile 本地测试台（tests/tile-harness）

在**不需要真机**的前提下，把 `stash/tiles/*.js`（Stash 首页 Tile 脚本）放进一个模拟的
Stash 运行时里跑，用夹具（fixtures）模拟真实网络的各种边界情况，断言脚本行为。

- 零依赖：只用 Node 内置模块（`node:vm` / `node:fs` / `node:assert` 风格自实现），**不新增 npm 依赖**
- 只读引用 `stash/tiles/*.js`，**不会修改**被测脚本
- 失败时打印可读 diff（`expected vs actual` + 请求列表 + `$done` 载荷）

## 快速开始

```bash
# 仓库根目录执行，跑全部用例（退出码 0 = 全绿）
node tests/tile-harness/run-all.mjs

# 只跑某个脚本（默认不跑横切契约）
node tests/tile-harness/run-all.mjs google disney

# 只跑横切契约测试
node tests/tile-harness/run-all.mjs _contract

# 跑指定脚本 + 横切契约
node tests/tile-harness/run-all.mjs google --with-contract

# 只跑名字里含 "网络错误" 的用例
node tests/tile-harness/run-all.mjs --filter=网络错误

# 打印每个用例的请求与 $done（verbose）
node tests/tile-harness/run-all.mjs --verbose

# 机器可读（JSON），便于接 CI / 汇总
node tests/tile-harness/run-all.mjs --json > report.json

# 把已知 BUG 也当作失败（CI 用）
node tests/tile-harness/run-all.mjs --strict

# 调试：串行执行 / 调整并发度（默认 4）
node tests/tile-harness/run-all.mjs --serial
node tests/tile-harness/run-all.mjs --concurrency=8
```

退出码：**全部用例 PASS 才是 0**；有 FAIL / BUG / 用例错误 / 覆盖缺失时非 0。

> Node 版本：>= 18（已在 v26 上验证）。`bun` / `deno` 理论上也能跑，但未做兼容承诺。

## 目录结构

```
tests/tile-harness/
├── harness.mjs          # 核心：node:vm 沙箱 + Stash 全局 API 模拟 + 超时/异常捕获
├── fixtures.mjs         # 夹具库：网络错误 / CF 挑战页 / 204 / 301 / 坏 JSON / hang ...
├── assert.mjs           # 断言 + LCS diff 渲染
├── support.mjs          # 用例公共辅助：expectClean / expectRequest / expectContract ...
├── load-cases.mjs       # 用例加载 + 覆盖校验（每个 tile 必须有 case 文件）
├── run-all.mjs          # 运行器：汇总、失败定位、退出码
├── cases/
│   ├── _contract.case.mjs        # 横切契约测试（对全部脚本 × 5 条契约）
│   ├── google.case.mjs           # 每个脚本一个业务用例文件（44 个）
│   ├── disney.case.mjs
│   └── ...
├── evidence/
│   ├── _design.md                # 统一脚本模板规格（新增脚本必读）
│   ├── SUMMARY.md                # 真实网络实测总表 + 逐卡片结论
│   ├── a-endpoints.md … e-endpoints.md   # 各批次的原始实测分册
└── README.md
```

## 模拟的 Stash 运行时

`harness.mjs` 用 `node:vm` 建一个独立上下文，注入：

| 全局 | 行为 |
| --- | --- |
| `$httpClient.get/post(params, cb)` | 按顺序消费 `responses`；**回调一定异步触发**（真实网络不会同步完成）；支持 `put/delete/head/patch` |
| `$done(object)` | 记录**每一次**调用；第一个作为 `done`；调用后结束等待 |
| `$environment` | 默认 `{ language: "zh-Hans-CN" }`，可覆盖 |
| `$argument` / `$script` / `$persistentStore` | 按 TZ 语义提供 |
| `console` | 输出收集到 `logs`，不污染测试输出 |
| `setTimeout` / `setInterval` / `queueMicrotask` | 包装后捕获其中抛出的异常 |
| `JSON` / `Promise` / `URL` / `atob` / `btoa` … | 直接复用宿主内置对象（保证跨 realm 行为一致） |

**刻意没有提供 `fetch`** —— Stash 里没有这个 API，脚本用了就会在测试里暴露为 `ReferenceError`。

### 三个贴近真机的关键设计

1. **回调必定异步。** 这能暴露「回调里 throw → 外层 Promise 永远 pending → tile 卡死」这类 bug。
   同步 resolve 的假运行时会让这类 bug 永远测不出来。
2. **回调里抛出的异常被吸收**（等同真实运行时的行为），但会记录到 `errors` / `uncaught`。
3. **多请求脚本**（netflix / spotify / disney）可用 `repeatLast: true` 让每个请求都拿到同一个夹具。

## `runTileScript(options)` API

```js
import { runTileScript } from "./harness.mjs"

const result = await runTileScript({
  scriptPath: "google",              // "google" / "google.js" / "stash/tiles/google.js" / 绝对路径
  responses: [
    { status: 204, headers: {}, body: "" },       // 成功响应
    { error: "The request timed out" },            // 网络错误
    { hang: true },                                // 请求发出但永不回调
    (params, index) => ({ status: 200, body: "{}" }), // 函数形式：可按 URL 断言
  ],
  environment: { language: "en-US" }, // 可选，默认 zh-Hans-CN
  argument: "",                        // 可选
  timeoutMs: 3000,                     // 可选，等待 $done 的时限
  route: (params) => true,             // 可选：false/"reason" → 网络错误；"skip" → 请求被黑洞
  repeatLast: false,                   // 可选：多请求脚本共用最后一个夹具
})
```

返回：

```js
{
  scriptPath, scriptName,
  timedOut,            // 是否超时（或存在永不回调的请求）
  outcome,             // "done" | "timeout" | "throw" | "sync-throw"
  hungRequest,         // 是否有 { hang: true } 请求
  done,                // 第一个 $done 的参数（未调用时为 undefined）
  doneCall,            // { index, value, valueType, at }
  doneCalls,           // 全部 $done 调用 —— 可区分「未调用」与「调用了但内容为空」
  requests,            // [{ index, method, url, headers, body, timeout, "auto-redirect", raw }]
  errors, rejections, uncaught,   // 捕获到的异常（同步 / 未处理 rejection / 运行时）
  logs,                // console 输出
  durationMs,
  consumed, providedResponses,    // 夹具消费情况（用于发现请求没发出 / 发多了）
}
```

## 夹具库（`fixtures.mjs`）

| 夹具 | 说明 |
| --- | --- |
| `networkError(msg?)` | 网络错误（连接失败 / 超时 / DNS / 代理故障，见 `NETWORK_ERRORS`） |
| `hang()` | 请求发出但**永不回调**（连接黑洞），用于验证超时兜底 |
| `cloudflareHtml({status})` | Cloudflare 挑战页（`Just a moment...`，默认 403） |
| `htmlPage({status, body})` | 任意 HTML 页（200 + 拦截页这类恶劣场景） |
| `noContent()` | 204 No Content |
| `emptyBody()` / `emptyResponse()` | 200 空 body / 响应对象缺失 |
| `redirect({status, location})` | 301 / 302 / 307 / 308 + `Location` |
| `netflixOriginating({path})` | Netflix 的 `X-Originating-Url` 响应头 |
| `brokenJson()` / `truncatedJson()` / `jsonMissingField()` | JSON 解析失败的各种形态 |
| `json(obj, status?)` | 合法 JSON |
| `rateLimited()` / `serverError(status)` | 429 / 5xx |
| `AWS_403_HTML` / `CLOUDFLARE_CHALLENGE_HTML` / `REGION_BLOCK_HTML` | 真实文本语料 |

## 写一个用例文件

`cases/<script>.case.mjs`：

```js
import { match, expectClean, expectRequest, expectContract } from "../support.mjs"
import * as fx from "../fixtures.mjs"

export default {
  script: "google",           // 也可写 "google.js"
  cases: [
    {
      name: "204 → 可用",
      responses: [fx.noContent()],
      async expect(result) {
        const done = expectClean(result)           // 硬契约：无异常、未挂起、恰好 1 次 $done
        match(done, { content: "可用", backgroundColor: "#4285F4" })
        expectRequest(result, 0, { method: "GET", url: "https://www.google.com/generate_204" })
      },
    },
    {
      name: "⚠ 回调永不返回 → 应仍调用 $done",
      timeoutMs: 600,
      responses: [fx.hang()],
      async expect(result) {
        return expectContract(result, {
          expected: "$done 被调用（超时兜底）",
          assertion: (r) => !r.timedOut && r.doneCalls.length >= 1,
          location: "stash/tiles/google.js:1-7 —— request() 无超时兜底",
        })
      },
    },
  ],
}
```

### `expect` 的返回值语义

| 返回 | 状态 | 含义 |
| --- | --- | --- |
| 正常返回 | `PASS` | 断言全部成立 |
| 抛 `AssertionFailure`（`match`/`equal`/`expectClean` 等） | `FAIL` | 脚本行为不符合**期望的正确行为** |
| `expectContract(...)` 判定不满足 | `BUG` | **已知问题**：记录「期望 vs 实际 + file:line」，但不把测试改成迁就实现 |
| `{ skipReason }` | `SKIP` | 跳过（如依赖真机） |

`BUG` 是这套测试台的核心理念：**测试描述的是「正确行为」，而不是「当前行为」**。
脚本修好后，对应的 `expectContract` 用例会自动变成 `PASS`，无需改测试。

## 横切契约测试（`cases/_contract.case.mjs`）

对 `stash/tiles/` 下**每个**脚本（动态读取，新增脚本自动纳入）断言：

| 编号 | 契约 |
| --- | --- |
| C1 | 网络错误（`{error}` / `response` undefined / `data` undefined）时 `$done` 恰好 1 次，文案不含 `undefined`/`NaN`/`[object Object]`，且不误判「可用」 |
| C2 | 回调永不返回时**不得永久挂起**，须在兜底预算内（默认 ≤4.5s；`disney`/`netflix` 等串行脚本按共享总预算校验）调用 `$done` |
| C3 | HTTP 200 + Cloudflare 挑战页时不得判为「可用 / Available」 |
| C4 | happy path 下 `$done` 恰好 1 次 |
| C5 | 源码静态检查：不得用 `$httpClient[method]` / `const fn = $httpClient.get` 这种丢失 receiver 的写法 |

## 当前基线

```
$ node tests/tile-harness/run-all.mjs
用例 1272 个: 通过 1272, 失败 0, 已知 bug 0, 用例错误 0, 覆盖缺失 0, 跳过 0
全部用例通过 ✔        # 退出码 0，单次约 59s（默认 4 路并发）

$ node tests/tile-harness/run-all.mjs _contract
用例 308 个: 通过 308, 失败 0, …（44 脚本 × C1–C5 横切契约，均为 PASS）
```

覆盖 `stash/tiles/` 下全部 **44 个** tile 脚本（每脚本 19–28 条业务分支用例）+
**横切契约测试**（44 脚本 × C1–C5）。修改任何 Tile 脚本后请重跑本命令，**退出码必须为 0**。

> 📌 **新增脚本时请先读 [`evidence/_design.md`](evidence/_design.md)** —— 那是本批次统一模板的规格
> （骨架代码、判定顺序表、硬约束），44 个脚本的公共骨架（`request`/`isChallenge`/`isDomain`/
> `regionOfSegment`/`done*`）逐字一致，只有 `DOMAINS` / `COLOR` / URL / `main()` 分支不同。
>
> 真实网络下的端点实测与逐卡片结论见 [`evidence/SUMMARY.md`](evidence/SUMMARY.md)。

> **关于兜底时长的容差**：「回调永不返回」类用例断言的是脚本 `request()` 兜底预算
> （各脚本实测：`timeout*1000+400` ≈ 3.4s / 共享总预算 `TILE_BUDGET_MS` = 2.5s /
> IPPure `BUDGET_MS` = 1000ms），并留了容差吸收 `setTimeout` 调度抖动。
> 抖动来源是测试进程的 CPU 负载（并发度、CI 机器负载），**不是脚本缺陷**；
> 结果偶发不稳定时可先用 `--serial` 复跑定位。

### 时间相关字段（排查假红时看这两个）

| 字段 | 含义 |
| --- | --- |
| `doneAfterMs` | 脚本启动到**首次** `$done` 的真实耗时（ms），无 `$done` 为 `null` |
| `finishedAfterTimeout` | `$done` 是否发生在 `timeoutMs` 之后（脚本有兜底但晚于观察窗口） |

`timedOut` 的语义是「**在 `timeoutMs` 内没拿到 `$done`**」，因此即使脚本稍后补了一次兜底，
`timedOut` 也为 `true`。断言兜底耗时请用 `doneAfterMs`，不要用 `timedOut`。

## 已知限制（无法在本地验证的部分）

1. **真实网络行为**：夹具是构造出来的，无法证明某个 URL 在真实网络下的状态码。
2. **`$httpClient` 的 `this` 绑定**：C5 是静态检查（匹配 `$httpClient[` 写法），无法证明真机上一定抛
   `TypeError` —— 这是「风险」而非「确定 bug」。
3. **`$environment` 其它字段**：只模拟了 `language`，脚本若依赖其它字段需在用例里显式传入。
4. **运行时差异**：Stash 的 JS 引擎（JavaScriptCore）与 V8 在极少数 API 上可能有差异（如 `Intl`、
   正则后行断言），本测试台无法覆盖。
5. **`$argument` 的真实注入**：覆盖文件里目前没有给这些脚本传 `argument`，用例只覆盖空串。
6. **出口地区漂移**：真实出口会在 JP / KR 等地区间漂移，夹具里的地区码（`JP`/`US`/`CN`/`RU` 等）
   只用于**分支正确性**断言，不代表线上真实地区。地区相关的期望值请按「任何合法两字母码」
   的语义编写，不要把某一轮采集到的 `GL=JP` 当成唯一正确结果。
7. **IPPure 主端点已被 Cloudflare 挡死**：`my.ippure.com/v1/info` 实测恒返回 403 挑战页，
   脚本采用「主请求被拦 → 降级 ip-api.com 并在文案标注来源」的策略。夹具覆盖了
   主成功 / 主 403 + 降级成功 / 双失败三条链路；但**降级后的字段语义**（如
   `fraudScore` 不可得、`isBroadcast` 在 ip-api 里没有等价字段）只能在测试里锁定
   「不编造数据」这一行为，无法验证降级源本身的准确度。

> 一致性约定：IPPure 三个 tile 的降级文案都**必须标明来源**（`(ip-api)`），
> 且不得用 `ip-api` 的 `hosting` / `proxy` 冒充 IPPure 的 `isResidential` / `isBroadcast`。
8. **Gemini 地区为近似判定**：`gemini.google.com` 没有可用的地区端点
   （`/cdn-cgi/trace` 实测 404），脚本复用 YouTube 的 `INNERTUBE_CONTEXT_GL`。
   这属于**产品层面的近似值**，测试只能保证「解析逻辑与文案分支正确」，无法保证该近似对
   真实出口一定成立。
