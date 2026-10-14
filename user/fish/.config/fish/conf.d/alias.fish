alias ls="ls -a --color=auto"
alias l="/bin/ls --color=auto"
alias vim=/bin/nvim
alias vi=/bin/vim
alias cat=bat
alias rm='trash-put'
alias cls="printf '\e[H\e[3J'"
if status is-interactive
    abbr --add --command cd -- ... ../..
    abbr --add --command cd -- .... ../../..
end

# scripts
alias snap="~/.local/scripts/backup/btrfs/snapshots.fish create"
alias ec="gpg -e -r "akira.uestc@gmail.com""
alias de="gpg -d"
alias gi="~/.local/scripts/dev/git/init-repo.sh"
