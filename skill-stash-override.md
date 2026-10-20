---
description: "覆写文件（Override）用于修改托管或订阅配置中的部分字段。介绍声明方式、多个覆写文件从上到下的叠加顺序，以及让用户自行填写的覆写参数。"
---

# 覆写文件（Override）

覆写文件（Override）允许用户修改配置文件的部分字段，常用于修改托管、订阅的配置内容。Stash 支持同时启用多个覆写文件，配置将按照从上到下的顺序依次覆盖。

最佳实践建议：为便于单独控制开关和分享，建议按功能点划分覆写文件。

## 语法参考

- 覆写文件使用 YAML 格式，文件后缀为 `.stoverride`
- 通常使用 `name` 和 `desc` 字段作为覆写文件的名称和描述，这两个字段仅用于展示
- 覆写文件对配置文件的修改遵循以下规则：
  - 对于简单类型（string、number、boolean）的同名键，直接覆盖原值
  - 对于字典类型的同名键，采用递归键值合并
  - 对于数组类型的同名键，覆写文件的数组会插入到原数组前面
  - 对于字典类型和数组类型的键，若添加注释 `#!replace`，则采用完全覆盖方式合并
  - 对于数组类型的键，若添加注释 `#!append`，覆写文件的数组会追加到原数组后面

import { Callout } from 'nextra/components'

<Callout emoji="⚠️">
  当前版本暂不支持修改数组中的特定元素，后续版本将提供相关语法支持。
</Callout>

## 常见覆写示例

```yaml
name: "📺 BiliBili: 🔀 Redirect"
desc: |-
  哔哩哔哩：重定向
  中国站CDN自定义
openUrl: "http://boxjs.com/#/app/BiliBili.Redirect"
author: |-
  VirgilClyne[https://github.com/VirgilClyne]
homepage: "https://Redirect.BiliUniverse.io"
icon: "https://github.com/BiliUniverse/Redirect/raw/main/src/assets/icon_rounded.png"
category: "🪐 BiliUniverse"
date: "2024-12-10 07:13:21"
version: "0.2.12"

http:
  force-http-engine:
    - "*.bilivideo.cn:80"
    - "*.bilivideo.com:80"
    - upos-hz-mirrorakam.akamaized.net:80
    - "*:4480"
    - "*:8000"
    - "*:8082"
    - "*.mcdn.bilivideo.cn:9102"
  mitm:
    - "*.bilivideo.cn:443"
    - "*.bilivideo.com:443"
    - "*.mcdn.bilivideo.com:4483"
    - "*.mcdn.bilivideo.cn:4483"
    - "*.mcdn.bilivideo.cn:8082"
    - "*.mcdn.bilivideo.com:8082"
    - "upos-*-mirrorakam.akamaized.net:443"
  script:
    - match: ^https?:\/\/.+\.bilivideo\.com\/upgcxcode\/
      name: "📺 BiliBili.Redirect.request"
      type: request
    - match: ^https?:\/\/(.+):(8000|8082)\/v1\/resource\/
      name: "📺 BiliBili.Redirect.request"
      type: request
      argument:
    - match: ^https?:\/\/[xy0-9]+\.mcdn\.bilivideo\.(cn|com):(4483|9102)\/upgcxcode\/
      name: "📺 BiliBili.Redirect.request"
      type: request
      argument:
    - match: ^https?:\/\/(.+):4480\/upgcxcode\/
      name: "📺 BiliBili.Redirect.request"
      type: request
      argument:
    - match: ^https?:\/\/upos-(hz|bstar1)-mirrorakam\.akamaized\.net/upgcxcode\/
      name: "📺 BiliBili.Redirect.request"
      type: request
      argument:
script-providers:
  "📺 BiliBili.Redirect.request":
    url: https://github.com/BiliUniverse/Redirect/releases/download/v0.2.12/request.bundle.js
    interval: 86400
```

## 使用 `#!replace` 语法的覆写示例

```yaml {4}
name: 仅使用 CloudFlare DNS
dns:
  # 将完全覆盖原有 default-nameserver
  default-nameserver: #!replace
    - system
    - 223.5.5.5
    - 1.0.0.1
  # 将完全覆盖原有 nameserver
  nameserver: #!replace
    - https://1.0.0.1/dns-query # CF IPv4
    - https://[2606:4700:4700::1111]/dns-query # CF IPv6
```

## 使用 `#!append` 语法的覆写示例

数组默认插入到原数组前面，这让覆写的规则先于配置文件的规则匹配；但覆写添加的代理组也会因此排在最前。在键后添加 `#!append`，数组就会追加到原数组后面：

```yaml {2}
name: 游戏分组
proxy-groups: #!append
  # 排在配置文件已有代理组之后
  - name: 🎮 Game
    type: select
    proxies:
      - DIRECT
      - Proxy
```

`#!append` 对任意数组都有效，例如在 `rules` 上使用可以把覆写的规则放在最后作兜底。不支持该语法的旧版本 Stash 会忽略这条注释，仍将数组插入到前面。

## 合并示例

原始配置文件 `config.yaml`：

```yaml
dict:
  k1: true
  k2: 1
  k3:
    - 1
    - 2
    - 3
  k4:
    - 1
    - 2
    - 3
```

覆写文件：

```yaml
key: value
dict:
  k3:
    - 0
  k4: #!replace
    - 1
  k5: null
```

合并后结果：

```yaml
key: value
dict:
  k1: true
  k2: 1
  k3:
    - 0
    - 1
    - 2
    - 3
  k4:
    - 1
  k5: null
```

## 覆写参数

<VersionRequirement ios="3.7" mac="4.4" beta />

覆写参数让作者把覆写中需要因人而异的值声明为参数，例如 DNS 地址、地区或某项功能的开关。Stash 根据声明自动生成参数表单，用户在 App 中填写或选择即可使用，无需修改覆写源码。

- 参数值随每个已安装的覆写单独保存在本设备上，覆写远程更新时会保留用户的设置
- 分享或导出覆写时只包含原始文件，接收方按自己的需要重新填写
- 同一覆写中的参数只在该覆写内生效，不会影响其他覆写

### 声明参数

在覆写文件顶层同时添加 `arguments-version` 和 `arguments`，正文中使用 `${args.参数名}` 引用参数：

```yaml {3-25}
name: 自定义 DNS
desc: 设置 DNS 地址、日志级别和 IPv6
arguments-version: 1
arguments:
  dns_server:
    type: input
    title: DNS 地址
    description: 填写上游 DNS 地址
    default: https://dns.alidns.com/dns-query
    required: true
    max-length: 2048
  log_level:
    type: select
    title: 日志级别
    default: info
    options:
      - value: info
        label: 普通
      - value: debug
        label: 调试
  ipv6_enabled:
    type: switch
    title: 启用 IPv6
    default: false

dns:
  nameserver: #!replace
    - "${args.dns_server}"
log-level: "${args.log_level}"
ipv6: "${args.ipv6_enabled}"
```

- `arguments-version` 固定为 `1`
- `arguments` 中的每一项是一个参数，键名即参数名，表单按声明顺序显示
- 参数名以英文字母开头，可包含英文字母、数字和下划线，最长 64 个字符，区分大小写
- `arguments` 和 `arguments-version` 只用于生成表单，不会进入最终配置

### 参数类型

参数通过 `type` 指定控件类型：

| `type`   | 控件     | 值类型                                      |
| -------- | -------- | ------------------------------------------- |
| `input`  | 输入框   | 字符串；设置 `value-type: integer` 后为整数 |
| `select` | 单选列表 | 字符串或整数，由选项决定                    |
| `switch` | 开关     | 布尔值                                      |

所有类型都支持以下字段：

| 字段          | 说明                           |
| ------------- | ------------------------------ |
| `title`       | 必填，表单中显示的参数名称     |
| `description` | 可选，参数说明                 |
| `default`     | 可选，默认值，类型需与参数一致 |

`input` 和 `select` 还支持 `required: true`，表示用户必须提供该值；必填的文本参数不能为空或只包含空白字符。

#### 输入框

```yaml
arguments:
  region:
    type: input
    title: 地区标识
    default: HK
    min-length: 2
    max-length: 8
  port:
    type: input
    value-type: integer
    title: 监听端口
    default: 7890
    minimum: 1024
    maximum: 65535
```

| 字段                        | 说明                             |
| --------------------------- | -------------------------------- |
| `value-type`                | `string`（默认）或 `integer`     |
| `min-length` / `max-length` | 字符串的最少、最多字符数         |
| `minimum` / `maximum`       | 整数的最小值和最大值（包含边界） |

未设置默认值的文本参数，其值为空字符串。

#### 单选列表

```yaml
arguments:
  region:
    type: select
    title: 地区
    default: HK
    options:
      - value: HK
        label: 香港
      - value: JP
        label: 日本
      - value: US
```

- `options` 列出可选项，每项的 `value` 是实际写入配置的值，`label` 是表单中显示的文字，省略时显示 `value`
- 同一列表中的 `value` 不能重复，且须同为字符串或同为整数
- `default` 必须是 `options` 中的某个 `value`；未设置默认值时由用户自行选择

#### 开关

```yaml
arguments:
  enabled:
    type: switch
    title: 启用功能
    default: true
```

开关未设置默认值时为关闭（`false`）。

### 引用参数

参数只能在覆写正文的值中引用，写法为 `${args.参数名}`。引用需要写在 YAML 字符串中，建议加上引号。

| 写法                           | 结果                                               |
| ------------------------------ | -------------------------------------------------- |
| `ipv6: '${args.ipv6_enabled}'` | 值仅由一个引用组成时，保留参数的类型，此处为布尔值 |
| `port: '${args.port}'`         | 整数参数得到整数                                   |
| `name: '节点 ${args.region}'`  | 与其他文字组合时，结果为字符串                     |
| `text: '$${args.region}'`      | 转义，得到字面文字 `${args.region}`                |

- 引用的参数必须已在 `arguments` 中声明
- 用户填写的内容按原样代入，即使其中包含 `${args.xxx}` 也不会再次展开
- `name`、`desc`、`category`、`icon` 等展示字段以及参数声明本身中的文字按原样显示，不展开引用
- 覆写中的注释和 `#!replace` 会保留，合并规则与普通覆写一致

### 向脚本传递参数

脚本的 `argument` 是字符串。需要向脚本传递多个参数时，可以使用 `|json` 把参数编码为 JSON 值，再在脚本中解析：

```yaml
arguments-version: 1
arguments:
  region:
    type: select
    title: 地区
    default: CN
    options:
      - value: CN
      - value: US
  enabled:
    type: switch
    title: 启用
    default: true

cron:
  script:
    - name: parameter-example
      cron: "*/5 * * * *"
      argument: '{"region":${args.region|json},"enabled":${args.enabled|json}}'
      timeout: 10
```

```javascript
const options = JSON.parse($argument)
// options.region === 'CN', options.enabled === true
```

`|json` 会把字符串编码为带引号的 JSON 字符串，并转义其中的特殊字符；整数和布尔值按 JSON 原样输出。

### 在 App 中设置参数

- 安装带参数的覆写时，预览页会显示参数摘要。可以选择「安装并启用」，或先「仅安装」稍后再设置；必填参数未填写时，需要先完成设置才能启用
- 在已安装覆写的详情中进入「参数」修改设置。每个参数会标明当前使用的是默认值还是自定义值，可以单独或全部恢复默认值
- 覆写已启用且 Stash 正在运行时，点击「保存并应用」后立即生效；Stash 未运行时，保存的设置会在下次连接时使用
- 恢复默认值后，该参数会跟随作者在后续更新中设置的新默认值；自定义的值则一直保留

覆写远程更新后，Stash 会保留新版本仍然适用的设置。新版本新增了没有默认值的必填参数，或原来选中的选项已被移除时，Stash 会提示补充设置，在此之前继续使用旧版本。
