#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

tools=(
  llama
  mlx_lm.server
  mlx_lm.chat
  mlx_lm.dynamic_quant
  mlx_lm.benchmark
  mlx_lm.cache_prompt
  mlx_lm.convert
  mlx_lm.evaluate
  mlx_lm.fuse
  mlx_lm.generate
  mlx_lm.lora
  mlx_lm.manage
  mlx_lm.perplexity
  mlx_lm.awq
  mlx_lm.dwq
  mlx_lm.gptq
  mlx_lm.upload
  mlx_lm.share
  llama-cli
  llama-server
  llama-quantize
  llama-perplexity
  llama-bench
  llama-gguf-split
  llama-mtmd-cli
  llama-imatrix
  llama-batched-bench
  llama-completion
  llama-cvector-generator
  llama-export-lora
  llama-fit-params
  llama-mtmd-debug
  llama-results
  llama-tokenize
  llama-tts
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
  usage g completion zsh "$tool" -f "$tool/usage.kdl" > "$tool/_$tool"
  usage g completion zsh "$tool" -f "$tool/zh-CN.usage.kdl" > "$tool/_$tool.zh-CN"
done

# sync to zsh site-functions
dest="${ZSH_COMPLETION_DEST:-/Users/shimenghao/.cache/zsh/site-functions}"
mkdir -p "$dest"
for tool in "${tools[@]}"; do
  cp "$tool/_$tool" "$tool/_$tool.zh-CN" "$dest/"
done
