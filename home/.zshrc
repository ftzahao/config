# export GITHUB_TOKEN=""
# https://huggingface.co/settings/tokens
# export HF_TOKEN=""
# export HF_BASE_URL=""
# https://api-docs.deepseek.com/zh-cn/quick_start/pricing
# export DEEPSEEK_API_KEY=""
# export DEEPSEEK_BASE_URL="https://api.deepseek.com"
# https://opencode.ai/docs/zh-cn/zen/
# export OPENCODE_ZEN_API_KEY=""
# export OPENCODE_ZEN_BASE_URL="https://opencode.ai/zen/"
# https://docs.bigmodel.cn/cn/api/introduction
# export GLM_API_KEY=""
# export GIM_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
# https://aistudio.google.com/app/apikey
# export GEMINI_API_KEY=""
# export GEMINI_BASE_URL="https://generativelanguage.googleapis.com/v1beta"
# https://console.groq.com/docs/rate-limits
# export GROQ_API_KEY=""
# export GROQ_BASE_URL="https://api.groq.com/openai/v1"

# PNPM_HOME 环境变量
export PNPM_HOME="$HOME/.pnpm"

autoload -Uz compinit; compinit

. /opt/homebrew/opt/zinit/zinit.zsh
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

typeset -U path PATH

path=(
  $PNPM_HOME/bin
  $HOME/.local/bin
  $path
)

zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/history.zsh'
zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/completion.zsh'
zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/activate.zsh'
zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/alias.zsh'
