export LANG="zh_CN.UTF-8"
export LC_ALL="zh_CN.UTF-8"

path+=("$HOME/.local/bin")

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
ensure_directory "$ZSH_COMPLETION_DIR"
unset -f ensure_directory