# ------------------------------------------------------------------------------
# 1. 核心补全策略
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

# zinit ice wait lucid
zinit light zsh-users/zsh-autosuggestions

zinit ice wait lucid
zinit light zdharma-continuum/fast-syntax-highlighting

# zinit ice wait lucid
# zinit light zdharma-continuum/history-search-multi-word

# 自定义补全目录
fpath=($ZSH_COMPLETION_DIR $fpath)