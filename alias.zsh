alias brew-update="brew update && brew upgrade --greedy && brew cleanup --prune 0"
alias buz='brew uninstall --zap'
alias bi='brew install'
alias binfo='brew info'

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

alias dns-update="sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder"
alias public-ip="curl ipinfo.io/ip ; echo"
alias public-ip-json="curl ipinfo.io/json ; echo"

alias mise-update="mise cache clear && mise upgrade --bump && mise ls"
alias mise-x64-update="curl https://mise.jdx.dev/mise-latest-macos-x64 > ~/.local/bin/mise-x64 && chmod +x ~/.local/bin/mise-x64"
alias cdr='cd "$(git rev-parse --show-toplevel)"'
alias dsstore-clean="find . -name '.DS_Store' -type f -delete"