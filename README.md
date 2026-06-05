# Zsh 配置

个人 `zsh` 环境配置，主要用于 `macOS`。

## 通过 curl 执行 setup.sh

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ftzahao/zsh/refs/heads/main/setup.sh)"
```

## 初始化脚本说明

`setup.sh` 会从仓库 `home/` 目录下载配置到本机 `$HOME`：

- 必装依赖：`curl`
- 按命令存在与否做可选配置：
  - 检测到 `starship` 才下载 `~/.config/starship.toml`
  - 检测到 `mise` 才下载 `~/.config/mise/config.toml`
  - 检测到 `aube` 才下载 `~/.config/aube/config.toml`
- 其余文件（如 `~/.zshrc`、`~/.gitconfig`）默认下载

脚本是“仅在目标文件不存在时创建”，不会覆盖已有文件。

## 仓库结构

- `home/`：映射到 `macOS` 用户目录（`$HOME`）的模板文件
- `setup.sh`：初始化脚本，自动下载缺失配置
- `activate.zsh`：初始化 `mise` 与 `starship`
- `alias.zsh`：常用别名与函数（如 `brew-update`、`brews`）
- `completion.zsh`：补全规则、补全 UI 与插件加载
- `history.zsh`：历史记录相关选项

## 手动同步方式

如果你不想执行脚本，也可以手动从 `home/` 目录复制到 `$HOME`。

## brew 安装的工具

```zsh
# ==> Formulae
brew install git mise mole python-build ruby-build starship zinit gnupg swift-format bash container ffmpeg-full hf

# ==> Casks
brew install --cask adguard betterdisplay cleanmymac cleanshot coteditor crossover downie equinox google-chrome jetbrains-toolbox keka launchos mole-app ogdesign-eagle osaurus parallels popclip proxyman qq screenkite sf-symbols stash steam syntax-highlight tablepro telegram tencent-meeting typora visual-studio-code wechat wechatwebdevtools wechatwork zed@preview
```
