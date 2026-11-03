# 加载 mise 环境配置
source $HOME/.config/mise/env.zsh

# 确保 path 数组中的路径不重复
typeset -U path

path+=(
    # 将用户本地可执行文件目录加入搜索路径
    "$HOME/.local/bin"
)