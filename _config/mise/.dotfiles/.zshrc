# ==== 历史 ====
export HISTFILE="$HOME/.cache/zsh/zsh_history"
[[ -d $HISTFILE:h ]] || mkdir -p $HISTFILE:h
setopt HIST_EXPIRE_DUPS_FIRST # 历史将满时优先删除重复的旧条目
setopt HIST_IGNORE_ALL_DUPS   # 重复命令只保留最新一条
setopt HIST_IGNORE_SPACE      # 不记录以空格开头的命令
setopt HIST_VERIFY            # 执行 ! 历史命令前先展开，允许确认或修改
setopt SHARE_HISTORY          # 在所有 zsh 会话间实时共享历史记录

command -v mise > /dev/null && eval "$(mise activate zsh)"
command -v starship >/dev/null && eval "$(starship init zsh)"

# ==== 别名 ====
function brews() {
  local formulae="$(brew leaves | xargs brew deps --installed --for-each)"
  local casks="$(brew list --cask 2>/dev/null)"
  local blue="$(tput setaf 4)"
  local bold="$(tput bold)"
  local off="$(tput sgr0)"
  echo "${blue}==>${off} ${bold}Formulae${off}"
  echo "${formulae}" | sed "s/^\(.*\):\(.*\)$/\1${blue}\2${off}/"
  echo "\n${blue}==>${off} ${bold}Casks${off}\n${casks}"
} # 列出所有已安装的 Homebrew 包，包括依赖关系和版本信息

[[ -f /opt/homebrew/opt/zinit/zinit.zsh ]] && . /opt/homebrew/opt/zinit/zinit.zsh
fpath+=("$HOME/.local/share/zsh/site-functions" "$HOME/.local/share/mise-completions/zsh")
autoload -Uz compinit && compinit

zinit ice wait lucid
zinit light zdharma-continuum/fast-syntax-highlighting

zinit light zsh-users/zsh-autosuggestions