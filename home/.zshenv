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

unset -f ensure_directory