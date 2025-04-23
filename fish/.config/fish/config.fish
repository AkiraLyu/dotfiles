# starship init fish | source

export QT_SCREEN_SCALE_FACTORS=1
export QT_FONT_DPI=120

export LIBVA_DRIVER_NAME=iHD

export LFS=/mnt/lfs
export EDITOR=nvim

alias n=neofetch
alias l="ls -l"
alias vim=nvim
alias chat="python ~/.local/scripts/deepseek.py"
alias snap="~/.local/scripts/snaps.sh create"
alias cat=bat

export PATH=/usr/local/sbin:/usr/local/bin:/usr/bin:/home/akira/.cargo/bin:/home/akira/.nix-profile/bin

export QT_XCB_GL_INTEGRATION=none
export CRYPTOGRAPHY_OPENSSL_NO_LEGACY=none

# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
# if test -f /opt/anaconda/bin/conda
#     eval /opt/anaconda/bin/conda "shell.fish" hook $argv | source
# else
#     if test -f "/opt/anaconda/etc/fish/conf.d/conda.fish"
#         . "/opt/anaconda/etc/fish/conf.d/conda.fish"
#     else
#         set -x PATH /opt/anaconda/bin $PATH
#     end
# end
# # <<< conda initialize <<<
