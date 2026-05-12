# # GitHub 访问令牌
# export GITHUB_TOKEN="******"
# # Cargo Registry 访问令牌
# export CARGO_REGISTRY_TOKEN="******"
# # Hugging Face 访问令牌 https://router.huggingface.co/v1
# export HF_TOKEN="******"
# # OpenAI 访问令牌
# export OPENAI_API_KEY="******"
# # ollama 访问令牌 https://ollama.com
# export OLLAMA_API_KEY="******"

autoload -Uz compinit; compinit -d "$ZCOMPDUMP"

. /opt/homebrew/opt/zinit/zinit.zsh
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

typeset -U path
path=(
  $HOME/.local/bin
  $path
)

zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/history.zsh'
zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/completion.zsh'
zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/activate.zsh'
zinit snippet 'https://raw.githubusercontent.com/ftzahao/zsh/main/alias.zsh'
