#!/usr/bin/env sh

set -u

BASE_URL="https://raw.githubusercontent.com/ftzahao/zsh/refs/heads/main/home"
created_count=0
skipped_count=0
failed_count=0

now() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  level="$1"
  shift
  printf '%s [%s] %s\n' "$(now)" "$level" "$*"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

download_if_missing() {
  target="$1"
  url="$2"

  if [ -f "$target" ]; then
    skipped_count=$((skipped_count + 1))
    log "INFO" "已存在，跳过: $target"
    return 0
  fi

  parent_dir=$(dirname "$target")
  if [ ! -d "$parent_dir" ]; then
    log "INFO" "创建目录: $parent_dir"
    if ! mkdir -p "$parent_dir"; then
      failed_count=$((failed_count + 1))
      log "ERROR" "目录创建失败: $parent_dir"
      return 1
    fi
  fi

  tmp_file="${target}.tmp.$$"
  log "INFO" "开始下载: $url"
  if curl --fail --location --silent --show-error --output "$tmp_file" "$url"; then
    if mv "$tmp_file" "$target"; then
      created_count=$((created_count + 1))
      log "INFO" "已创建: $target"
      return 0
    fi
    rm -f "$tmp_file"
    failed_count=$((failed_count + 1))
    log "ERROR" "写入目标文件失败: $target"
    return 1
  fi

  rm -f "$tmp_file"
  failed_count=$((failed_count + 1))
  log "ERROR" "下载失败: $url"
  return 1
}

download_if_cmd_exists() {
  cmd="$1"
  target="$2"
  url="$3"

  if has_cmd "$cmd"; then
    log "INFO" "检测到命令 ${cmd}，开始处理: ${target}"
    download_if_missing "$target" "$url"
  else
    skipped_count=$((skipped_count + 1))
    log "WARN" "未检测到命令 ${cmd}，跳过: ${target}"
  fi
}

main() {
  log "INFO" "初始化开始"

  if ! has_cmd curl; then
    log "ERROR" "缺少依赖命令 curl，无法继续"
    exit 1
  fi

  download_if_cmd_exists "starship" "$HOME/.config/starship.toml" "$BASE_URL/.config/starship.toml"
  download_if_missing "$HOME/.gitconfig" "$BASE_URL/.gitconfig"
  download_if_missing "$HOME/.gitignore_global" "$BASE_URL/.gitignore_global"
  download_if_cmd_exists "mise" "$HOME/.config/mise/config.toml" "$BASE_URL/.config/mise/config.toml"
  download_if_cmd_exists "aube" "$HOME/.config/aube/config.toml" "$BASE_URL/.config/aube/config.toml"
  download_if_missing "$HOME/.zshrc" "$BASE_URL/.zshrc"
  download_if_missing "$HOME/.zprofile" "$BASE_URL/.zprofile"
  download_if_missing "$HOME/.zshenv" "$BASE_URL/.zshenv"

  log "INFO" "初始化完成: created=$created_count skipped=$skipped_count failed=$failed_count"

  if [ "$failed_count" -gt 0 ]; then
    log "ERROR" "存在失败项，请检查日志后重试"
    exit 1
  fi

  exit 0
}

main