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
# NPM 配置
export NPM_CONFIG_USERCONFIG="$XDG_CONFIG_HOME/npm/.npmrc" # NPM 用户配置文件
export NPM_CONFIG_CACHE="$XDG_CACHE_HOME/npm" # NPM 缓存目录
# Rust 配置
export RUSTUP_HOME="$XDG_DATA_HOME"/rustup # Rustup 配置目录
export CARGO_HOME="$XDG_DATA_HOME"/cargo # Cargo 配置目录

# 创建必要的目录
mkdir -p -- "$ZDOTDIR" "$ZSH_COMPLETION_DIR" 2>/dev/null