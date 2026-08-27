# config

个人开发环境配置文件（dotfiles）仓库，基于 [mise](https://mise.jdx.dev/) 统一管理工具链与配置文件。

## 目录结构

```
config/
├── shadowrocket/
│   ├── rules.list
│   └── 自用配置.conf
├── zsh-completion/
├── README.md
└── _config/
    └── mise/
        ├── env/
        └── config.toml
```

## mise 配置

[config.toml](.config/mise/config.toml) 是核心配置，包含三部分：

- **`[tools]`** — 需要安装的工具及其版本，例如 `rust`、`node`、`python`、`uv`、`gh`、`mkcert`、`lefthook` 等，以及通过 npm / cargo 分发的工具。
- **`[settings]`** — mise 运行行为，包括 `auto_install`、`lockfile`、`dotfiles.root` 等。
- **`[env]`** — 注入到 shell 环境的环境变量，如各种 API Key（`HF_TOKEN`、`DEEPSEEK_API_KEY` 等）与 `ANTHROPIC_*` 代理配置。默认以注释形式给出占位，按需启用。

`redactions` 用于在 `mise env` 输出时屏蔽包含 `*_TOKEN`、`*_API_KEY`、`*_AUTH_TOKEN` 的敏感值，避免泄露密钥。

## 安装与使用

本仓库通过 mise 的 [dotfiles](https://mise.jdx.dev/configuration/dotfiles.html) 功能将 `.config/mise/.dotfiles` 下的文件同步到 `$HOME`。

```sh
# 安装 mise（macOS）
curl https://mise.run | sh

# 应用 `[dotfiles]` 中的 dotfiles
mise bootstrap dotfiles apply
```

之后每次 `mise` 相关操作会检查并同步 dotfiles，`mise doctor` 可查看当前状态。

## zsh 补全

[zsh-completion/](zsh-completion/) 下是 [mlx_lm](https://github.com/ml-explore/mlx-examples) 系列 CLI 工具的 zsh 补全文件，由 [usage](https://usage.jdx.dev/) 根据 `usage.kdl` 描述生成，其中 `*.zh-CN` 为中文帮助的补全版本。

修改 `usage.kdl` 后运行构建脚本重新生成补全：

```sh
./zsh-completion/build.sh
```

生成的文件需放入 zsh 的 `fpath` 目录（如 `~/.oh-my-zsh/completions` 或 `$fpath` 中的任意目录）以生效。
