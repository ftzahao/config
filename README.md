# config

个人配置文件集合，包含终端补全、代理配置、工具配置等。

## 目录结构

```
config/
├── README.md              # 项目说明
├── mise.toml              # mise 任务配置
├── _config/               # 主配置目录
│   ├── Brewfile           # Homebrew 依赖
│   ├── starship.toml      # Starship 提示符配置
│   ├── aube/              # Aube 配置
│   ├── cli-proxy-api/     # CLI 代理 API 配置
│   └── mise/              # mise 环境配置
├── shadowrocket/          # Shadowrocket 代理配置
│   ├── 自用配置.conf       # 主配置文件
│   └── rules.list         # 规则列表
└── terminal-completion/   # 终端补全文件
    ├── build.sh           # 构建脚本
    ├── llama/             # llama.cpp 工具补全
    ├── llama-*/           # llama.cpp 子工具补全
    ├── mlx_lm.*/          # mlx-lm 工具补全
    └── ...
```

## terminal-completion

终端补全文件集合，支持多种 shell 和语言。基于 [usage-cli](https://usage.jdx.dev) 生成，提供智能命令补全功能。

### 支持的工具

| 工具类别      | 工具名称                  | 说明                   |
| ------------- | ------------------------- | ---------------------- |
| **llama.cpp** | `llama`                   | llama.cpp 多工具启动器 |
|               | `llama-cli`               | llama.cpp 命令行界面   |
|               | `llama-server`            | llama.cpp 服务器       |
|               | `llama-bench`             | 性能基准测试           |
|               | `llama-quantize`          | 模型量化工具           |
|               | `llama-perplexity`        | 困惑度计算             |
|               | `llama-gguf-split`        | GGUF 文件分割          |
|               | `llama-imatrix`           | 重要性矩阵计算         |
|               | `llama-mtmd-cli`          | 多模态 CLI             |
|               | `llama-mtmd-debug`        | 多模态调试工具         |
|               | `llama-completion`        | 补全工具               |
|               | `llama-cvector-generator` | 上下文向量生成器       |
|               | `llama-export-lora`       | LoRA 导出              |
|               | `llama-fit-params`        | 参数优化               |
|               | `llama-results`           | 结果处理               |
|               | `llama-tokenize`          | 分词工具               |
|               | `llama-tts`               | 文本转语音             |
|               | `llama-batched-bench`     | 批处理基准测试         |
|               | `llama-download`          | 模型下载工具           |
| **mlx-lm**    | `mlx_lm.server`           | MLX 服务器             |
|               | `mlx_lm.chat`             | MLX 聊天界面           |
|               | `mlx_lm.convert`          | 模型转换工具           |
|               | `mlx_lm.benchmark`        | MLX 基准测试           |
|               | `mlx_lm.cache_prompt`     | 提示缓存工具           |
|               | `mlx_lm.evaluate`         | 模型评估               |
|               | `mlx_lm.fuse`             | 模型融合               |
|               | `mlx_lm.generate`         | 文本生成               |
|               | `mlx_lm.lora`             | LoRA 微调              |
|               | `mlx_lm.manage`           | 模型管理               |
|               | `mlx_lm.perplexity`       | 困惑度计算             |
|               | `mlx_lm.awq`              | AWQ 量化               |
|               | `mlx_lm.dwq`              | DWQ 量化               |
|               | `mlx_lm.gptq`             | GPTQ 量化              |
|               | `mlx_lm.upload`           | 模型上传               |
|               | `mlx_lm.share`            | 模型分享               |
|               | `mlx_lm.dynamic_quant`    | 动态量化               |

### 支持的 Shell

| Shell          | 文件格式                      | 说明                                                            |
| -------------- | ----------------------------- | --------------------------------------------------------------- |
| **Bash**       | `_*-bash-{en_US,zh_CN}`       | 需要 [bash-completion](https://github.com/scop/bash-completion) |
| **Zsh**        | `_*-zsh-{en_US,zh_CN}`        | 支持原生补全系统                                                |
| **Fish**       | `_*-fish-{en_US,zh_CN}`       | Fish shell 原生格式                                             |
| **Nushell**    | `_*-nu-{en_US,zh_CN}`         | Nushell 原生格式                                                |
| **PowerShell** | `_*-powershell-{en_US,zh_CN}` | PowerShell 模块格式                                             |

### 语言支持

每个工具提供两种语言版本：

- `en_US`：英文版本
- `zh_CN`：中文版本

### 文件命名规则

```
_<tool>-<shell>-<locale>
```

示例：

- `_llama-bash-en_US`：llama 工具的 Bash 英文补全
- `_llama-server-zh_CN`：llama-server 工具的 Zsh 中文补全
- `_mlx_lm.chat-fish-en_US`：mlx_lm.chat 工具的 Fish 英文补全

### 构建方法

使用 [mise](https://mise.jdx.dev) 构建：

```bash
mise run build-t-c
```

或手动执行构建脚本：

```bash
cd terminal-completion
./build.sh
```

构建脚本会：

1. 验证每个工具的 `usage.kdl` 和 `zh-CN.usage.kdl` 文件
2. 为每个工具生成 5 种 shell × 2 种语言 = 10 个补全文件

### 安装方法

#### Bash

```bash
# 复制到 bash-completion 目录
cp _llama-bash-en_US /usr/local/share/bash-completion/completions/llama

# 或添加到现有加载路径
source /path/to/_llama-bash-en_US
```

#### Zsh

```bash
# 复制到 $fpath 目录
cp _llama-zsh-en_US ~/.zsh/completions/
# 确保 ~/.zshrc 中有以下内容
# fpath=(~/.zsh/completions $fpath)
# autoload -Uz compinit && compinit
```

#### Fish

```bash
# 复制到 Fish completions 目录
cp _llama-fish-en_US ~/.config/fish/completions/
```

#### Nushell

```bash
# 复制到 Nushell completions 目录
cp _llama-nu-en_US ~/.config/nu/completions/
```

#### PowerShell

```powershell
# 复制到 PowerShell 模块路径
$modulePath = (Get-Module -ListAvailable).ModuleBase | Select-Object -First 1
Copy-Item _llama-powershell-en_US "$modulePath/llama.psm1"
```

### 使用的工具

- [usage-cli](https://usage.jdx.dev)：命令行接口规范和补全生成工具
- [mise](https://mise.jdx.dev)：开发环境管理工具

## 其他配置

### mise.toml

定义了项目任务：

- `build-t-c`：构建 terminal-completion 补全文件

### shadowrocket/

包含 Shadowrocket 代理客户端的配置文件。

## 许可

个人配置文件，仅供学习参考。
