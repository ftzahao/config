# ------------------------------------------------------------------------------
# 0. 基础初始化
# ------------------------------------------------------------------------------

# autoload -Uz compinit; compinit
# 加载补全系统（使用 -d 明确指定 dumpfile，避免默认路径混乱）
autoload -Uz compinit
# 如果 dumpfile 存在且创建时间在 24 小时之内，则使用 -C 加速
if [[ -f "$ZCOMPDUMP" && -n "$ZCOMPDUMP"(#qN.mh+24) ]]; then
    compinit -C -d "$ZCOMPDUMP"
else
    compinit -d "$ZCOMPDUMP"
fi
# 启用 Bash 补全兼容（让很多 Bash 工具的补全能直接用）
autoload -Uz bashcompinit && bashcompinit

# ------------------------------------------------------------------------------
# 1. 核心补全策略（高性能 + 高智能）
# ------------------------------------------------------------------------------

zstyle ':completion:*' completer _expand _complete _approximate

# 模糊匹配（核心）
zstyle ':completion:*' matcher-list \
  'm:{a-zA-Z}={A-Za-z}' \
  'r:|[._-]=* r:|=*'

# 自动菜单
setopt auto_menu
zstyle ':completion:*' menu select

# 分组
zstyle ':completion:*' group-name ''

# 无歧义直接补全
zstyle ':completion:*' insert-unambiguous true

# ------------------------------------------------------------------------------
# 2. UI & 视觉增强
# ------------------------------------------------------------------------------

# 颜色
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}

# 描述
zstyle ':completion:*:descriptions' format '%F{green} %d%f'
zstyle ':completion:*:warnings' format '%F{red} no matches%f'

# ------------------------------------------------------------------------------
# 3. 缓存 + 性能优化
# ------------------------------------------------------------------------------

zstyle ':completion:*' use-cache yes
zstyle ':completion:*' cache-path "$ZCOMPCACHE"

zstyle ':completion:*' rehash true

# ------------------------------------------------------------------------------
# 5. 历史优先
# ------------------------------------------------------------------------------

zstyle ':completion:*' sort false
zstyle ':completion:*:history-words' stop yes

# ------------------------------------------------------------------------------
# 6. 特殊增强
# ------------------------------------------------------------------------------

# cd 智能跳转（忽略 . ..）
zstyle ':completion:*:cd:*' ignore-parents parent pwd

# kill 更友好
zstyle ':completion:*:kill:*' command 'ps -u $USER -o pid,cmd'

# ------------------------------------------------------------------------------
# 7. 插件
# ------------------------------------------------------------------------------

zinit ice wait lucid
zinit light zsh-users/zsh-autosuggestions

zinit ice wait lucid
zinit light zdharma-continuum/fast-syntax-highlighting

# zinit ice wait lucid
# zinit light zdharma-continuum/history-search-multi-word