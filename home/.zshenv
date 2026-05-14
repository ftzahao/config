# 语言环境
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8
# ZSH 配置
export ZCOMPCACHE="$HOME/.cache/zsh/.zcompcache" # ZSH 补全缓存目录
export ZSH_COMPLETION_DIR="$HOME/.cache/zsh/site-functions" # ZSH 补全脚本目录

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