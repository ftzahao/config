# zsh

个人 `zsh` 环境配置

## 目录结构

- `.config/mise/config.toml`：仓库主配置文件，定义了工具版本、`mise` 设置、环境变量、Bootstrap 包和 dotfiles 内容。
- `.config/mise/.dotfiles`：`mise` 管理的 dotfiles 根目录（在配置中映射到 `~/.config/mise/.dotfiles`）。

## 主要功能

- 统一管理 shell 工具版本和自动激活策略
- 定义 Zsh 相关环境变量、路径和别名
- 配置 Zsh 补全目录、缓存目录和 `compinit` 加速
- 通过 `mise` 生成并同步用户 home 目录下的 dotfiles

## 使用方式

1. 安装 `mise`: `brew install mise`
2. 运行 `mise dotfiles apply` 应用 dotfiles
3. 按需修改 `.config/mise/config.toml` 中的工具列表、插件和环境变量。
