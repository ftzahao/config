# config

个人 macOS 开发环境、终端补全与网络代理配置集合，包含：

- mise、Zsh、Starship 和 Homebrew 配置
- llama.cpp 与 mlx-lm 的多 Shell 命令补全
- Stash 与 Shadowrocket 规则
- 代理分组和规则使用的图标资源

本仓库是面向个人使用环境整理的配置集合，不是通用的一键安装工具。配置中包含本机路径、代理分组和外部规则源，请先按自己的环境审阅，再选择需要的部分使用。

## 目录结构

```text
config/
├── README.md
├── mise.toml                    # 仓库级 mise 任务
├── _config/
│   ├── Brewfile                 # Homebrew、Cask 与 VS Code 扩展清单
│   ├── starship.toml            # Starship 提示符配置
│   ├── aube/                    # Aube 配置
│   └── mise/
│       ├── config.toml          # 工具、别名、Hook 与任务
│       ├── conf.d/tasks.toml    # 补全生成等 mise 任务
│       ├── .dotfiles/           # Zsh、Git 等 dotfiles
│       └── env.zsh              # Zsh 环境初始化
├── terminal-completion/
│   ├── build.sh                 # 补全生成与校验脚本
│   └── <tool>/                  # Usage 规范及生成结果
├── stash/                       # Stash 规则覆盖与直连列表
├── shadowrocket/                # Shadowrocket 配置与直连列表
└── assets/                      # PNG/SVG 图标资源
```

## 快速开始

### 构建终端补全

构建依赖：

- [mise](https://mise.jdx.dev)
- [usage CLI](https://usage.jdx.dev)
- Bash

安装 `usage` 后，在仓库根目录执行：

```bash
mise run build-t-c
```

也可以直接运行脚本：

```bash
bash terminal-completion/build.sh
```

脚本会：

1. 对每个工具的 `usage.kdl` 与 `zh-CN.usage.kdl` 执行 `usage lint`
2. 为每个工具生成 Bash、Zsh、Fish、Nushell 和 PowerShell 补全
3. 同时生成 `en_US` 与 `zh_CN` 两个语言版本

当前包含 36 个工具，共生成 360 个补全文件。生成脚本会覆盖同名的 `_*` 文件；`usage.kdl` 和 `zh-CN.usage.kdl` 才是需要维护的源文件，不要直接修改生成结果。

### 覆盖的工具

llama.cpp（19 个）：

```text
llama
llama-batched-bench
llama-bench
llama-cli
llama-completion
llama-cvector-generator
llama-download
llama-export-lora
llama-fit-params
llama-gguf-split
llama-imatrix
llama-mtmd-cli
llama-mtmd-debug
llama-perplexity
llama-quantize
llama-results
llama-server
llama-tokenize
llama-tts
```

mlx-lm（17 个）：

```text
mlx_lm.awq
mlx_lm.benchmark
mlx_lm.cache_prompt
mlx_lm.chat
mlx_lm.convert
mlx_lm.dwq
mlx_lm.dynamic_quant
mlx_lm.evaluate
mlx_lm.fuse
mlx_lm.generate
mlx_lm.gptq
mlx_lm.lora
mlx_lm.manage
mlx_lm.perplexity
mlx_lm.server
mlx_lm.share
mlx_lm.upload
```

### 补全文件命名

```text
_<tool>-<shell>-<locale>
```

其中：

- `<shell>`：`bash`、`zsh`、`fish`、`nu` 或 `powershell`
- `<locale>`：`en_US` 或 `zh_CN`

例如：

- `_llama-bash-en_US`
- `_llama-server-zsh-zh_CN`
- `_mlx_lm.chat-fish-zh_CN`

## 安装补全

生成的补全在运行时会调用 `usage`，因此目标机器上也必须安装该命令。每种 Shell 只选择一个语言版本，避免重复注册。

### Bash

```bash
mkdir -p ~/.local/share/bash-completion/completions
cp terminal-completion/llama/_llama-bash-en_US \
  ~/.local/share/bash-completion/completions/llama
```

该补全依赖 [bash-completion](https://github.com/scop/bash-completion)，需要在加载补全文件前初始化。

### Zsh

```bash
mkdir -p ~/.local/share/zsh/site-functions
cp terminal-completion/llama/_llama-zsh-en_US \
  ~/.local/share/zsh/site-functions/_llama-zsh-en_US
```

确保 `~/.zshrc` 将该目录加入 `fpath`，并在加入后执行 `compinit`：

```zsh
fpath=("$HOME/.local/share/zsh/site-functions" $fpath)
autoload -Uz compinit && compinit
```

### Fish

Fish 会按 `_<command>.fish` 的命名规则加载补全：

```bash
mkdir -p ~/.config/fish/completions
cp terminal-completion/llama/_llama-fish-en_US \
  ~/.config/fish/completions/_llama.fish
```

### Nushell

```bash
mkdir -p ~/.config/nu/completions
cp terminal-completion/llama/_llama-nu-en_US \
  ~/.config/nu/completions/llama.nu
```

重新启动 Nushell，或加载该补全文件后验证。

### PowerShell

生成文件可直接被 PowerShell 执行。可将它复制到自定义模块目录后导入，或在 PowerShell 配置文件中加载：

```powershell
$completionDir = Join-Path $HOME ".local/share/powershell/Completions"
New-Item -ItemType Directory -Force $completionDir | Out-Null
Copy-Item `
  "terminal-completion/llama/_llama-powershell-en_US" `
  (Join-Path $completionDir "llama.ps1")
New-Item -ItemType Directory -Force (Split-Path $PROFILE) | Out-Null
Add-Content $PROFILE ". '$completionDir/llama.ps1'"
```

## 其他配置

### mise 与 Shell

- `_config/mise/config.toml`：声明开发工具、环境变量、Shell 别名、Hook 与全局设置。
- `_config/mise/conf.d/tasks.toml`：包含常用 Zsh 补全生成和环境安装任务。
- `_config/mise/.dotfiles/`：Zsh、Git 和 Starship 的原始 dotfiles；`config.toml` 中的 `[dotfiles]` 定义了它们的目标路径。
- `_config/mise/env.zsh` 与 `_config/mise/.dotfiles/.zsh*`：Shell 初始化、历史记录、插件和补全加载。
- `_config/starship.toml`：Starship 提示符样式。
- `_config/aube/config.toml`：Aube 配置。

这些文件依赖 macOS、Homebrew 与本机目录结构。将配置迁移到 `~/.config/mise/` 或 dotfiles 目标位置前，请先调整路径和机器相关设置。

### Homebrew

`_config/Brewfile` 记录了 Formula、Cask、TAP 和 VS Code 扩展。安装前请审阅清单：

```bash
brew bundle check --file=_config/Brewfile
brew bundle install --file=_config/Brewfile
```

### Stash

`stash/` 包含：

- `自用规则.stoverride`：DNS、规则提供者、代理组与分流策略
- `Direct.yaml`：自定义直连域名
- `APNs.stoverride`：Apple 推送服务分流
- `RedirectGoogle.stoverride`：Google 中国域名重定向

规则通过 `cdn.jsdelivr.net` 引用仓库中的资源和第三方规则列表。修改主分支文件后，远程客户端才会读取到新版本；启用 URL Rewrite 或 MITM 时，还需在 Stash 中完成相应的证书与权限配置。

### Shadowrocket

`shadowrocket/` 包含：

- `自用配置.conf`：DNS、代理组、规则、Host 与 URL Rewrite
- `Direct.list`：自定义直连域名列表

该配置包含具体的节点筛选规则与分流偏好，使用前请替换为自己的订阅节点并检查代理组名称。

### 图标资源

`assets/` 保存代理分组和规则图标，包含 PNG 与 SVG 两种格式。`stash/自用规则.stoverride` 通过 jsDelivr URL 引用 PNG 文件；删除、移动或重命名图标会破坏现有引用。

## 更新流程

1. 修改对应的 `usage.kdl` 或 `zh-CN.usage.kdl`
2. 执行 `mise run build-t-c`
3. 检查 `git diff`，确认只有预期的规范和生成文件发生变化
4. 若图标或规则通过 CDN 引用，合并到主分支后再验证远程客户端

## 许可

本仓库是个人配置集合，暂未提供开源许可证。请勿将其中的配置视为可再分发的通用软件。
