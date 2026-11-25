# 历史记录设置
export HISTFILE="$HOME/.local/share/zsh/history"
[[ -d $HISTFILE:h ]] || mkdir -p $HISTFILE:h
setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_VERIFY
setopt SHARE_HISTORY

# 列出所有已安装的 Homebrew 包
function brews() {
  local formulae="$(brew leaves | xargs brew deps --installed --for-each)" # 获取已安装 formula 及其依赖
  local casks="$(brew list --cask 2>/dev/null)" # 获取已安装的 cask
  local blue="$(tput setaf 4)" # 获取蓝色终端转义码
  local bold="$(tput bold)" # 获取加粗终端转义码
  local off="$(tput sgr0)" # 获取重置终端样式的转义码
  echo "${blue}==>${off} ${bold}Formulae${off}" # 打印 formula 列表标题
  echo "${formulae}" | sed "s/^\(.*\):\(.*\)$/\1${blue}\2${off}/" # 将依赖名称显示为蓝色
  echo "\n${blue}==>${off} ${bold}Casks${off}\n${casks}" # 打印 cask 列表标题和内容
}

eval "$(~/.local/bin/mise activate zsh)"
eval "$(starship init zsh)"

source /opt/homebrew/opt/zinit/zinit.zsh

fpath+=("$HOME/.local/share/zsh/site-functions") && typeset -U fpath
autoload -Uz compinit && compinit # 加载并初始化命令补全

zinit ice wait lucid
zinit light zdharma-continuum/fast-syntax-highlighting

zinit light zsh-users/zsh-autosuggestions
