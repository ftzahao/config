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
export ZDOTDIR="${XDG_CONFIG_HOME}/zsh" # ZSH 配置文件目录
export ZCOMPCACHE="${ZDOTDIR}/.zcompcache" # ZSH 补全缓存目录
export ZCOMPDUMP="${ZDOTDIR}/.zcompdump" # ZSH 补全缓存文件
export ZSH_COMPLETION_DIR="${ZDOTDIR}/site-functions" # ZSH 补全脚本目录
# Node REPL 历史记录
export NODE_REPL_HISTORY="$XDG_DATA_HOME"/node_repl_history
# NPM 配置
export NPM_CONFIG_USERCONFIG="$XDG_CONFIG_HOME/npm/npmrc"
export NPM_CONFIG_CACHE="$XDG_CACHE_HOME/npm"
# Rust 配置
export RUSTUP_HOME="$XDG_DATA_HOME"/rustup
export CARGO_HOME="$XDG_DATA_HOME"/cargo
# Go 配置
export GOPATH="$XDG_DATA_HOME"/go
export GOMODCACHE="$XDG_CACHE_HOME"/go/mod
# NVM 配置
export NVM_DIR="$XDG_DATA_HOME"/nvm
# NuGet 配置
export NUGET_PACKAGES="$XDG_CACHE_HOME"/NuGetPackages
# Parallel 配置
export PARALLEL_HOME="$XDG_CONFIG_HOME"/parallel
# Pyenv 配置
export PYENV_ROOT=$XDG_DATA_HOME/pyenv
# Ollama 配置
export OLLAMA_MODELS=$XDG_DATA_HOME/ollama/models
# Kubernetes 配置
export KUBECONFIG="$XDG_CONFIG_HOME/kube"
export KUBECACHEDIR="$XDG_CACHE_HOME/kube"
# GPG 配置
export GNUPGHOME="$XDG_DATA_HOME"/gnupg
# GNU Radio 配置
export GR_PREFS_PATH="$XDG_CONFIG_HOME"/gnuradio
export GRC_PREFS_PATH="$XDG_CONFIG_HOME"/gnuradio/grc.conf
# FFMPEG 配置
export FFMPEG_DATADIR="$XDG_CONFIG_HOME"/ffmpeg
# Docker 配置
export DOCKER_CONFIG="$XDG_CONFIG_HOME"/docker
# Docker Machine 配置
export MACHINE_STORAGE_PATH="$XDG_DATA_HOME"/docker-machine
# Bundler 配置
export BUNDLE_USER_CACHE=$XDG_CACHE_HOME/bundle
export BUNDLE_USER_CONFIG=$XDG_CONFIG_HOME/bundle/config
export BUNDLE_USER_PLUGIN=$XDG_DATA_HOME/bundle
# Rbenv 配置
export RBENV_ROOT="$XDG_DATA_HOME"/rbenv
# Pyenv 配置
export PYENV_ROOT=$XDG_DATA_HOME/pyenv
# Codex 配置
export CODEX_HOME="$XDG_CONFIG_HOME"/codex
# NVM 配置
export NVM_DIR="$XDG_DATA_HOME"/nvm
# Nodenv 配置
export NODENV_ROOT="$XDG_DATA_HOME"/nodenv
# K9s 配置
export K9SCONFIG="$XDG_CONFIG_HOME"/k9s
# Gradle 配置
export GRADLE_USER_HOME="$XDG_DATA_HOME"/gradle

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
ensure_directory "$ZDOTDIR"
ensure_directory "$ZSH_COMPLETION_DIR"
ensure_directory "$GNUPGHOME"

unset -f ensure_directory