# 语言环境
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8
# XDG 目录规范
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_STATE_HOME="$HOME/.local/state"
export XDG_BIN_HOME="$HOME/.local/bin"
# ZSH 配置
export ZCOMPCACHE="${XDG_CACHE_HOME}/zsh/.zcompcache" # ZSH 补全缓存目录
export ZCOMPDUMP="${XDG_CACHE_HOME}/zsh/.zcompdump" # ZSH 补全缓存文件
export ZSH_COMPLETION_DIR="${XDG_CACHE_HOME}/zsh/site-functions" # ZSH 补全脚本目录
# NPM 配置
export NPM_CONFIG_USERCONFIG="$XDG_CONFIG_HOME/npm/npmrc"
export NPM_CONFIG_CACHE="$XDG_CACHE_HOME/npm"
# Rust 配置
export RUSTUP_HOME="$XDG_DATA_HOME"/rustup
export CARGO_HOME="$XDG_DATA_HOME"/cargo
# Go 配置
export GOPATH="$XDG_DATA_HOME"/go
export GOMODCACHE="$XDG_CACHE_HOME"/go/mod
# Ollama 配置
export OLLAMA_MODELS=$XDG_DATA_HOME/ollama/models
# GPG 配置
export GNUPGHOME="$XDG_DATA_HOME"/gnupg
# Bundler 配置
export BUNDLE_USER_CACHE=$XDG_CACHE_HOME/bundle
export BUNDLE_USER_CONFIG=$XDG_CONFIG_HOME/bundle/config
export BUNDLE_USER_PLUGIN=$XDG_DATA_HOME/bundle

function ensure_directory() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    mkdir -p -- "$dir" 2>/dev/null || {
      echo "Error: Failed to create directory '$dir'" >&2
      return 1
    }
  fi
}
# 创建必要的目录
ensure_directory "$ZSH_COMPLETION_DIR"
ensure_directory "$GNUPGHOME"

unset -f ensure_directory