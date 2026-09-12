. /opt/homebrew/opt/zinit/zinit.zsh
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

export HISTFILE="$HOME/.cache/zsh_history"
setopt HIST_EXPIRE_DUPS_FIRST # 当历史记录满时，优先删除重复的旧条目
setopt HIST_IGNORE_DUPS # 不记录与上一条相同的命令
setopt HIST_IGNORE_SPACE # 不记录以空格开头的命令
setopt HIST_VERIFY # 执行历史命令前先展开，允许用户确认或修改
setopt SHARE_HISTORY # 在所有 zsh 会话间实时共享历史记录
setopt HIST_IGNORE_ALL_DUPS # 重复记录只保留最新一条

[ -x "$(command -v mise)" ] && eval "$(mise activate zsh)"
[ -x "$(command -v starship)" ] && eval "$(starship init zsh)"

export BUN_INSTALL="$HOME/.cache/bun"
export PNPM_HOME="$HOME/.cache/pnpm"
path+=(
  "$BUN_INSTALL/bin"
  "$PNPM_HOME/bin"
)

alias brew-update="brew update && brew upgrade --greedy && brew cleanup --prune 0" # 更新 Homebrew 包并清理旧版本
alias buz='brew uninstall --zap' # 卸载 Homebrew 包并清理相关文件
alias bi='brew install' # 安装 Homebrew 包
alias binfo='brew info' # 显示 Homebrew 包的信息
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
alias dns-update="sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder" # 清理 DNS 缓存
alias ip-local="ipconfig getifaddr en0" # 本机 IP 地址（局域网）
alias ip-v4-public="curl -fsSL 4.ipcheck.ing/geo | yq --output-format toml" # 获取本机 IPv4 地址（公网）
alias ip-v6-public="curl -fsSL 4.ipcheck.ing/geo | yq --output-format toml" # 获取本机 IPv6 地址（公网）
alias ip-net-public="curl -fsSL 64.ipcheck.ing/geo | yq --output-format toml" # 获取本机优先网络出口的 IP 地址（公网）
alias cdr='cd "$(git rev-parse --show-toplevel)"' # 切换到 Git 仓库的根目录
alias dsstore-clean="find . -name '.DS_Store' -type f -delete" # 清理 .DS_Store 文件

# ============================================================
# zsh 补全系统
# ============================================================
# 用户补全目录加入 fpath（目录不存在时不加，避免 fpath 混入无效路径）
[[ -d "$ZSH_COMPLETION_DIR" ]] && fpath+=("$ZSH_COMPLETION_DIR")

autoload -Uz compinit
_cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/zcompcache" # _store_cache/_retrieve_cache 缓存目录（默认 ~/.zcompcache）
_comp_dump="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/zcompdump-$ZSH_VERSION"
mkdir -p -- "${_comp_dump:h}" "$_cache_dir"

# compinit 分级加载：dump 超过 24 小时才做一次全量 compinit
# （重扫 fpath 以发现新装补全 + compaudit 安全检查 + 重建 dump），
# 日常启动走 compinit -C 直接加载 dump，明显更快。
# 注意 -C 不会发现当天新装的补全，次日全量扫描自动兜底；
# 新装补全想立即生效可执行：rm "$_comp_dump" && exec zsh
for _comp_stale in "$_comp_dump"(N.mh+24); do
  compinit -d "$_comp_dump"
done
compinit -C -d "$_comp_dump"
unset _comp_dump _comp_stale

# ---- 编辑行为（配合补全）----
setopt auto_menu                       # 多次 Tab 在备选项间循环
setopt always_to_end                   # 插入补全后光标移到词尾
setopt complete_in_word                # 光标在词中也可补全（不开则光标自动跳词尾，_prefix 补全器形同虚设）
zmodload zsh/complist                  # menu select 的交互由此模块提供
bindkey -M menuselect '\e[Z' reverse-menu-complete   # 菜单里 Shift+Tab 反向选择

# ---- 补全器（按顺序尝试，形成回退链）----
# _expand       展开通配符 / 变量 / 历史扩展
# _complete     普通补全
# _match        基于模式匹配（处理 *xxx 类的展开）
# _approximate  模糊 / 近似匹配（容错）
# _prefix       光标在词中也能补全（需配合上面的 complete_in_word）
zstyle ':completion:*' completer _expand _complete _match _approximate _prefix

# ---- 匹配规则（从精确到宽松，逐级回退）----
# 1. 精确匹配（空规则）
# 2. 大小写不敏感
# 3. 在 . _ - 处分段匹配，并允许光标后补全
zstyle ':completion:*' matcher-list \
  '' \
  'm:{[:lower:][:upper:]}={[:upper:][:lower:]}' \
  'r:|[._-]=* r:|=*'

# ---- 性能 ----
# 补全路径时逐段检查：前缀已是完整目录名就直接接受，不再试探它还能补全成什么，
# 大目录（如 node_modules、nix store）下补全提速明显
zstyle ':completion:*' accept-exact-dirs true
# _approximate 容错上限，默认 2；降为 1 模糊补全更快也更准（numeric = 按原始错误数计）
zstyle ':completion:*:approximate:*' max-errors 1 numeric

# ---- 菜单与交互 ----
zstyle ':completion:*' menu select     # 高亮选择，方向键 / Emacs 风格键可用

# ---- 列表显示 ----
# LS_COLORS 未设置（tmux / screen / ssh 等场景）回退到默认配色，避免 list-colors 为空导致无色
_zsh_ls_colors_default='no=00:fi=00:di=01;34:ln=01;36:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:ex=01;32:*.tar=01;31:*.tgz=01;31:*.zip=01;31:*.gz=01;31:*.bz2=01;31:*.deb=01;31:*.rpm=01;31:*.jar=01;31:*.jpg=01;35:*.png=01;35:*.gif=01;35:*.svg=01;35'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS:-$_zsh_ls_colors_default}"
zstyle ':completion:*' group-name ''                   # 所有匹配归入同一组，不显示分组标题
zstyle ':completion:*' insert-unambiguous true         # _match/_approximate 先插入无歧义前缀，找不到才进菜单补全
zstyle ':completion:*' verbose yes                     # 描述更详细

# ---- 布局微调 ----
zstyle ':completion:*' list-packed true                # 紧凑多列布局
zstyle ':completion:*' special-dirs true               # 允许补全 . 和 ..

# ---- 特殊场景 ----
zstyle ':completion:*:cd:*' ignore-parents parent pwd  # cd 时不显示 .. 和当前目录
zstyle ':completion:*:kill:*' command 'ps -u $USER -o pid,%cpu,cmd'  # kill 补全显示完整命令
zstyle ':completion:*:*:kill:*:processes' list-colors '=(#b) #([0-9]#)*=0=01;31'  # kill 列表 PID 列标红

zinit ice wait lucid
zinit light zdharma-continuum/fast-syntax-highlighting

zinit light zsh-users/zsh-autosuggestions
