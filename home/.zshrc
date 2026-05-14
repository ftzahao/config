# GitHub 访问令牌
# OpenAI BASE URL: https://models.github.ai/
# 模型列表: https://models.github.ai/v1/models
# export GITHUB_TOKEN=""

# Cargo Registry 访问令牌
# export CARGO_REGISTRY_TOKEN=""

# Hugging Face 访问令牌
# 文档: https://huggingface.co/docs/inference-providers/index?python-clients=openai
# 账单文档: https://huggingface.co/settings/billing
# OpenAI BASE URL: https://router.huggingface.co
# 模型列表: https://router.huggingface.co/v1/models
# export HF_TOKEN=""

# OpenAI 访问令牌
# 文档: https://developers.openai.com/api/reference/overview
# OpenAI BASE URL: https://api.openai.com
# export OPENAI_API_KEY=""

# ollama 访问令牌
# 文档: https://docs.ollama.com/integrations
# 账单文档: https://ollama.com/settings
# OpenAI BASE URL: https://ollama.com
# 模型列表: https://ollama.com/v1/models
# export OLLAMA_API_KEY=""

# DeepSeek 访问令牌
# 文档: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
# OpenAI BASE URL: https://api.deepseek.com
# Anthropic BASE URL: https://api.deepseek.com/anthropic
# export DEEPSEEK_API_KEY=""

# OpenCode 访问令牌
# 文档: https://opencode.ai/docs/zh-cn/zen/
# OpenAI BASE URL: https://opencode.ai/zen/
# OpenAI BASE URL: https://opencode.ai/zen/go/
# 模型列表: https://opencode.ai/zen/v1/models
# 模型列表: https://opencode.ai/zen/go/v1/models
# export OPENCODE_API_KEY=""

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
