source $HOME/.config/mise/env.zsh

export BUN_INSTALL="$HOME/.cache/bun"
export PNPM_HOME="$HOME/.cache/pnpm"

path+=(
  "$HOME/.local/bin"
  "$BUN_INSTALL/bin"
  "$PNPM_HOME/bin"
)
typeset -U path
