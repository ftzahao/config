_load_zsh_files() {
  local dir="$1"
  shift

  local f
  for f in "$@"; do
    [[ -f "$dir/$f.zsh" ]] && source "$dir/$f.zsh"
  done
}

_load_zsh_files "$HOME/.config/zsh/env" \
  github \
  rust \
  npm \
  homebrew \
  copilot \
  k9s \
  modelscope \
  deepseek \
  xiaomi \
  z \
  hf \
  tavily \
  exa \
  tinyfish \
  hermes \
  claude

unset -f _load_zsh_env

path+=("$HOME/.local/bin")