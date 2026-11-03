# ==== 历史 ====
export HISTFILE="$HOME/.cache/zsh/zsh_history" # 设置 zsh 历史记录文件的位置
[[ -d $HISTFILE:h ]] || mkdir -p $HISTFILE:h # 历史记录目录不存在时创建它
setopt HIST_EXPIRE_DUPS_FIRST # 历史将满时优先删除重复的旧条目
setopt HIST_IGNORE_ALL_DUPS   # 重复命令只保留最新一条
setopt HIST_IGNORE_SPACE      # 不记录以空格开头的命令
setopt HIST_VERIFY            # 执行 ! 历史命令前先展开，允许确认或修改
setopt SHARE_HISTORY          # 在所有 zsh 会话间实时共享历史记录

eval "$(~/.local/bin/mise activate zsh)" # 初始化 mise 的 zsh 环境
eval "$(starship init zsh)" # 初始化 Starship 提示符

# ==== 别名 ====
function brews() {
  local formulae="$(brew leaves | xargs brew deps --installed --for-each)" # 获取已安装 formula 及其依赖
  local casks="$(brew list --cask 2>/dev/null)" # 获取已安装的 cask
  local blue="$(tput setaf 4)" # 获取蓝色终端转义码
  local bold="$(tput bold)" # 获取加粗终端转义码
  local off="$(tput sgr0)" # 获取重置终端样式的转义码
  echo "${blue}==>${off} ${bold}Formulae${off}" # 打印 formula 列表标题
  echo "${formulae}" | sed "s/^\(.*\):\(.*\)$/\1${blue}\2${off}/" # 将依赖名称显示为蓝色
  echo "\n${blue}==>${off} ${bold}Casks${off}\n${casks}" # 打印 cask 列表标题和内容
} # 列出所有已安装的 Homebrew 包，包括依赖关系和版本信息

# 存在时加载 zinit
[[ -f /opt/homebrew/opt/zinit/zinit.zsh ]] && . /opt/homebrew/opt/zinit/zinit.zsh

fpath+=(
  "$HOME/.local/share/zsh/site-functions" # 将本地 zsh 函数目录加入搜索路径
)
autoload -Uz compinit && compinit # 加载并初始化命令补全

zinit ice wait lucid # 设置下一个插件延迟加载且静默初始化
zinit light zdharma-continuum/fast-syntax-highlighting # 加载命令语法高亮插件

zinit light zsh-users/zsh-autosuggestions # 加载命令自动建议插件