# 更新 Homebrew 包并清理旧版本
alias brew-update="brew update && brew upgrade --greedy && brew cleanup --prune 0"
# 卸载 Homebrew 包并清理相关文件
alias buz='brew uninstall --zap'
# 安装 Homebrew 包
alias bi='brew install'
# 显示 Homebrew 包的信息
alias binfo='brew info'
# 列出所有已安装的 Homebrew 包，包括依赖关系和版本信息
function brews() {
  local formulae="$(brew leaves | xargs brew deps --installed --for-each)"
  local casks="$(brew list --cask 2>/dev/null)"
  local blue="$(tput setaf 4)"
  local bold="$(tput bold)"
  local off="$(tput sgr0)"
  echo "${blue}==>${off} ${bold}Formulae${off}"
  echo "${formulae}" | sed "s/^\(.*\):\(.*\)$/\1${blue}\2${off}/"
  echo "\n${blue}==>${off} ${bold}Casks${off}\n${casks}"
}
# 清理 DNS 缓存
alias dns-update="sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder"
# 本机 IP 地址（局域网）
alias ip-local="ipconfig getifaddr en0"
# 获取本机 IPv4 地址（公网）
alias ip-v4-public="curl ifconfig.me ; echo"
# 切换到 Git 仓库的根目录
alias cdr='cd "$(git rev-parse --show-toplevel)"'
# 清理 .DS_Store 文件
alias dsstore-clean="find . -name '.DS_Store' -type f -delete"