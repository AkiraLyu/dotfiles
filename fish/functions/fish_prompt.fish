# 定义全局变量，初始值为1表示终端刚启动
set -g __startup 1
# 定义全局变量，初始值为0表示未执行clear命令
set -g __clear 0

set __fish_git_prompt_show_informative_status yes
set __fish_git_prompt_showdirtystate yes
set __fish_git_prompt_showstashstate yes
set __fish_git_prompt_showuntrackedfiles yes
set __fish_git_prompt_showupstream informative
set __fish_git_prompt_color_branch white
set __fish_git_prompt_color_upstream_ahead green
set __fish_git_prompt_color_upstream_behind red
set __fish_git_prompt_color_suffix white

set __fish_git_prompt_char_stateseparator ''
set __fish_git_prompt_char_dirtystate '~'
set __fish_git_prompt_char_upstream_equal ''
set __fish_git_prompt_char_stagedstate '+'
set __fish_git_prompt_char_untrackedfiles '?'
set __fish_git_prompt_char_stashstate '$'
set __fish_git_prompt_char_upstream_ahead '⇡'
set __fish_git_prompt_char_upstream_behind '⇣'

# 覆盖clear命令的函数
function clear
    command clear
    set -g __clear 1
end

function __replace_home_symbol
    set -l cwd (pwd)
    set -l home (echo $HOME)
    if string match -q "$home*" "$cwd"
        set cwd (string replace "$home" " " "$cwd")
    end
    if not test -w (pwd)
        set cwd (string join '' " " "$cwd")
    end
    echo $cwd
end

function __print_exec_time
    if set -q CMD_DURATION
        set -l duration_ms $CMD_DURATION
        echo -n "$duration_ms"
        echo -n ms
    end
end

function fish_prompt
    printf '%s@%s %s%s%s > ' $USER $hostname \
        (set_color $fish_color_cwd) (prompt_pwd) (set_color normal)
end

# 执行完config.fish文件后，将__startup设置为0，表示已启动
set -g __startup 0

function fish_right_prompt
    #intentionally left blank
end
