#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

tools=(
  llama
  llama-batched-bench
  llama-bench
  llama-cli
  llama-completion
  llama-cvector-generator
  llama-download
  llama-export-lora
  llama-fit-params
  llama-gguf-split
  llama-imatrix
  llama-mtmd-cli
  llama-mtmd-debug
  llama-perplexity
  llama-quantize
  llama-results
  llama-server
  llama-tokenize
  llama-tts
  mlx_lm.awq
  mlx_lm.benchmark
  mlx_lm.cache_prompt
  mlx_lm.chat
  mlx_lm.convert
  mlx_lm.dwq
  mlx_lm.dynamic_quant
  mlx_lm.evaluate
  mlx_lm.fuse
  mlx_lm.generate
  mlx_lm.gptq
  mlx_lm.lora
  mlx_lm.manage
  mlx_lm.perplexity
  mlx_lm.server
  mlx_lm.share
  mlx_lm.upload
)

for tool in "${tools[@]}"; do
  if ! usage lint "$tool/usage.kdl" >/dev/null 2>&1; then
    echo "lint FAILED: $tool/usage.kdl" >&2
    usage lint "$tool/usage.kdl" >&2
    exit 1
  fi
  if ! usage lint "$tool/zh-CN.usage.kdl" >/dev/null 2>&1; then
    echo "lint FAILED: $tool/zh-CN.usage.kdl" >&2
    usage lint "$tool/zh-CN.usage.kdl" >&2
    exit 1
  fi
  # zsh
  usage g completion zsh "$tool" -f "$tool/usage.kdl" > "$tool/_$tool-zsh-en_US"
  usage g completion zsh "$tool" -f "$tool/zh-CN.usage.kdl" > "$tool/_$tool-zsh-zh_CN"
  # bash
  usage g completion bash "$tool" -f "$tool/usage.kdl" > "$tool/_$tool-bash-en_US"
  usage g completion bash "$tool" -f "$tool/zh-CN.usage.kdl" > "$tool/_$tool-bash-zh_CN"
  # fish
  usage g completion fish "$tool" -f "$tool/usage.kdl" > "$tool/_$tool-fish-en_US"
  usage g completion fish "$tool" -f "$tool/zh-CN.usage.kdl" > "$tool/_$tool-fish-zh_CN"
  # nu
  usage g completion nu "$tool" -f "$tool/usage.kdl" > "$tool/_$tool-nu-en_US"
  usage g completion nu "$tool" -f "$tool/zh-CN.usage.kdl" > "$tool/_$tool-nu-zh_CN"
  # powershell
  usage g completion powershell "$tool" -f "$tool/usage.kdl" > "$tool/_$tool-powershell-en_US"
  usage g completion powershell "$tool" -f "$tool/zh-CN.usage.kdl" > "$tool/_$tool-powershell-zh_CN"
done

# sync to zsh site-functions
# dest="${ZSH_COMPLETION_DEST:-$HOME/.cache/zsh/site-functions}"
# mkdir -p "$dest"
# for tool in "${tools[@]}"; do
#   cp "$tool/_$tool" "$tool/_$tool.zh-CN" "$dest/"
# done
