#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

tools=(
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
)

for tool in "${tools[@]}"; do
  usage g completion zsh "$tool" -f "$tool/usage.kdl" > "$tool/_$tool"
  usage g completion zsh "$tool" -f "$tool/zh-CN.usage.kdl" > "$tool/_$tool.zh-CN"
done
