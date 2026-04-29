# Zsh 配置

自用配置

## ~/.zshenv

```zsh
. "$HOME/.config/zsh/.zshenv"
```

## ~/.config/zsh/.zprofile

```zsh
eval "$(/opt/homebrew/bin/brew shellenv zsh)"
eval "$(mise activate zsh --shims)"
```

## ~/.config/zsh/.zshenv

```zsh
# XDG基本目录规范
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}" # 默认配置目录为 ~/.config
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}" # 默认缓存目录为 ~/.cache
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}" # 默认数据目录为 ~/.local/share
export XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}" # 默认状态目录为 ~/.local/state
export XDG_BIN_HOME="${XDG_BIN_HOME:-$HOME/.local/bin}" # 默认可执行文件目录为 ~/.local/bin

# 把所有 zsh 配置移到 XDG 配置目录下
export ZDOTDIR="${XDG_CONFIG_HOME}/zsh"
# 补全缓存目录和转储文件路径
export ZCOMPCACHE="${ZDOTDIR}/.zcompcache"
export ZCOMPDUMP="${ZDOTDIR}/.zcompdump"
# 补全函数目录
export ZSH_COMPLETION_DIR="${XDG_DATA_HOME}/zsh/site-functions"

mkdir -p -- "$ZDOTDIR" "$XDG_STATE_HOME/zsh" "$XDG_CACHE_HOME/zsh" "$ZSH_COMPLETION_DIR" 2>/dev/null

export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

export RUSTUP_HOME="$XDG_DATA_HOME"/rustup
export CARGO_HOME="$XDG_DATA_HOME"/cargo
```

## ~/.config/zsh/.zshrc

```zsh
. /opt/homebrew/opt/zinit/zinit.zsh
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

typeset -U path
path=(
  $HOME/.local/bin
  $path
)
# 自定义补全目录
fpath=($ZSH_COMPLETION_DIR $fpath)

# autoload -Uz compinit; compinit
# 加载补全系统（使用 -d 明确指定 dumpfile，避免默认路径混乱）
autoload -Uz compinit
# 如果 dumpfile 存在且创建时间在 24 小时之内，则使用 -C 加速
if [[ -f "$ZCOMPDUMP" && -n "$ZCOMPDUMP"(#qN.mh+24) ]]; then
    compinit -C -d "$ZCOMPDUMP"
else
    compinit -d "$ZCOMPDUMP"
fi
# 启用 Bash 补全兼容（让很多 Bash 工具的补全能直接用）
autoload -Uz bashcompinit && bashcompinit

zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/history.zsh'
zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/plugin.zsh'
zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/completion.zsh'

## GitHub 访问令牌
export GITHUB_TOKEN="******"
## Cargo Registry 访问令牌
export CARGO_REGISTRY_TOKEN="******"
## Hugging Face 访问令牌 https://router.huggingface.co/v1
export HF_TOKEN="******"
## OpenAI 访问令牌
export OPENAI_API_KEY="******"

zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/dev-init.zsh'
zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/alias.zsh'
```

## brew 安装的工具

```zsh
brew install bash container ffmpeg git mise mole python-build ruby-build sevenzip starship swift-format zinit

brew install --cask adguard betterdisplay cleanmymac cleanshot coteditor crossover downie firefox font-maple-mono-nf-cn font-new-york font-sf-mono github-copilot-for-xcode google-chrome jetbrains-toolbox keka launchos ogdesign-eagle parallels permute pixelsnap popclip proxyman qlmarkdown qq sf-symbols stash syntax-highlight tablepro tencent-meeting typora visual-studio-code wechat wechatwebdevtools wechatwork zed@preview
```

## .config/mise/config.toml

```toml
redactions = ["*_TOKEN", "*_API_KEY"]

[tools]
aube = { version = "latest", postinstall = "aube completion zsh > $ZSH_COMPLETION_DIR/_aube" }
bat = { version = "latest", postinstall = "bat --completion zsh > $ZSH_COMPLETION_DIR/_bat" }
bun = { version = "latest", postinstall = "bun completions zsh > $ZSH_COMPLETION_DIR/_bun" }
"cargo:cargo-cache" = "latest"
"cargo:lsd" = "latest"
"cargo:miniserve" = { version = "latest", postinstall = "miniserve --print-completions zsh > $ZSH_COMPLETION_DIR/_miniserve" }
cocoapods = "latest"
deno = { version = "latest", postinstall = "deno completions zsh > $ZSH_COMPLETION_DIR/_deno" }
dust = "latest"
fd = { version = "latest", postinstall = "fd --gen-completions zsh > $ZSH_COMPLETION_DIR/_fd" }
gh = { version = "latest", postinstall = "gh completion -s zsh > $ZSH_COMPLETION_DIR/_gh" }
go = "latest"
java = "latest"
mkcert = "latest"
node = { version = "latest", postinstall = "npm completion > $ZSH_COMPLETION_DIR/_npm" }
"npm:@github/copilot" = "latest"
"npm:@vscode/vsce" = "latest"
"npm:npkill" = "latest"
"npm:nrm" = "latest"
pkl = { version = "latest", postinstall = "pkl shell-completion zsh > $ZSH_COMPLETION_DIR/_pkl" }
pnpm = { version = "latest", postinstall = "pnpm completion zsh > $ZSH_COMPLETION_DIR/_pnpm" }
python = { version = "latest", postinstall = "pip completion --zsh > $ZSH_COMPLETION_DIR/_pip" }
rg = { version = "latest", postinstall = "rg --generate complete-zsh > $ZSH_COMPLETION_DIR/_rg" }
ruby = "latest"
rust = "latest"
tokei = "latest"
usage = { version = "latest", postinstall = "usage --completions zsh > $ZSH_COMPLETION_DIR/_usage" }
uv = { version = "latest", postinstall = "uv generate-shell-completion zsh > $ZSH_COMPLETION_DIR/_uv" }
vp = "latest"
watchexec = { version = "latest", postinstall = "watchexec --completions zsh > $ZSH_COMPLETION_DIR/_watchexec" }
yarn = "latest"
zig = "latest"

[settings]
idiomatic_version_file_enable_tools = ["node", "python", "ruby", "go", "java"]
lockfile = true
auto_install = false
experimental = true
python.uv_venv_auto = "source"

[env]
ZSH_COMPLETION_DIR = "{{env.HOME}}/.local/share/zsh/site-functions"

[tasks.generate-completions]
description = "生成所有常用工具的zsh补全"
run = '''
#!/usr/bin/env zsh
set -euo pipefail

# 清理旧的补全文件，避免过期或冲突
rm -f -- $ZSH_COMPLETION_DIR/_* 2>/dev/null || true

echo "🔄 生成所有工具的zsh补全..."

# ==================== 以下是所有工具的 completion ====================
[ -x "$(command -v aube)" ] && aube completion zsh > "$ZSH_COMPLETION_DIR/_aube" 2>/dev/null || true
[ -x "$(command -v bat)" ] && bat --completion zsh > "$ZSH_COMPLETION_DIR/_bat" 2>/dev/null || true
[ -x "$(command -v bun)" ] && bun completions zsh > "$ZSH_COMPLETION_DIR/_bun" 2>/dev/null || true
[ -x "$(command -v miniserve)" ] && mise x miniserve -- miniserve --print-completions zsh > "$ZSH_COMPLETION_DIR/_miniserve" 2>/dev/null || true
[ -x "$(command -v deno)" ] && deno completions zsh > "$ZSH_COMPLETION_DIR/_deno" 2>/dev/null || true
[ -x "$(command -v fd)" ] && fd --gen-completions zsh > "$ZSH_COMPLETION_DIR/_fd" 2>/dev/null || true
[ -x "$(command -v gh)" ] && gh completion -s zsh > "$ZSH_COMPLETION_DIR/_gh" 2>/dev/null || true
[ -x "$(command -v npm)" ] && npm completion > "$ZSH_COMPLETION_DIR/_npm" 2>/dev/null || true
[ -x "$(command -v pkl)" ] && mise x pkl -- pkl shell-completion zsh > "$ZSH_COMPLETION_DIR/_pkl" 2>/dev/null || true
[ -x "$(command -v pnpm)" ] && pnpm completion zsh > "$ZSH_COMPLETION_DIR/_pnpm" 2>/dev/null || true
[ -x "$(command -v pip)" ] && pip completion --zsh > "$ZSH_COMPLETION_DIR/_pip" 2>/dev/null || true
[ -x "$(command -v rg)" ] && mise x rg -- rg --generate complete-zsh > "$ZSH_COMPLETION_DIR/_rg" 2>/dev/null || true
[ -x "$(command -v usage)" ] && mise x usage -- usage --completions zsh > "$ZSH_COMPLETION_DIR/_usage" 2>/dev/null || true
[ -x "$(command -v uv)" ] && mise x uv -- uv generate-shell-completion zsh > "$ZSH_COMPLETION_DIR/_uv" 2>/dev/null || true
[ -x "$(command -v watchexec)" ] && mise x watchexec -- watchexec --completions zsh > "$ZSH_COMPLETION_DIR/_watchexec" 2>/dev/null || true
# [ -x "$(command -v pitchfork)" ] && mise x pitchfork -- pitchfork completion zsh > "$ZSH_COMPLETION_DIR/_pitchfork" 2>/dev/null || true

echo "✅ 所有补全内容已生成至 $ZSH_COMPLETION_DIR"
# autoload -Uz compinit; compinit
'''

[hooks]
postinstall = "mise run generate-completions"
```
