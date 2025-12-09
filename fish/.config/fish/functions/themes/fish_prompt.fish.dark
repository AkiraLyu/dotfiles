set -g __startup 1
set -g __clear 1

set __fish_git_prompt_show_informative_status yes
set __fish_git_prompt_showdirtystate yes
set __fish_git_prompt_showstashstate yes
set __fish_git_prompt_showuntrackedfiles yes
set __fish_git_prompt_showupstream informative

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
    set -g __clear 0
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

        if test $duration_ms -lt 1000
            echo -n "$duration_ms ms"
            return
        end

        if test $duration_ms -ge 1000; and test $duration_ms -lt 60000
            set -l duration_s (math --scale=0 "$duration_ms / 1000")
            set -l remainder_ms (math "$duration_ms % 1000")
            echo -n "$duration_s s $remainder_ms ms"
        end

        if test $duration_ms -ge 60000; and test $duration_ms -lt 3600000
            set -l duration_m (math --scale=0 "$duration_ms / 60000") # 分钟
            set -l remainder_ms (math "$duration_ms % 60000") # 剩余毫秒
            set -l remainder_s (math --scale=0 "$remainder_ms / 1000") # 剩余的秒
            set -l remainder_ms (math "$remainder_ms % 1000") # 剩余的毫秒

            echo "$duration_m min $remainder_s s $remainder_ms ms"
        end

        if test $duration_ms -ge 3600000
            set -l duration_h (math --scale=0 "$duration_ms / 3600000") # 小时
            set -l remainder_ms (math "$duration_ms % 3600000") # 剩余毫秒（小时之外）

            set -l duration_m (math --scale=0 "$remainder_ms / 60000") # 分钟
            set -l remainder_ms (math "$remainder_ms % 60000") # 剩余毫秒（分钟之外）

            set -l duration_s (math --scale=0 "$remainder_ms / 1000") # 秒
            set -l remainder_ms (math "$remainder_ms % 1000") # 剩余的毫秒

            echo "$duration_h h $duration_m min $duration_s s $remainder_ms ms"
        end

        echo
    end
end

function fish_prompt
    if test $__startup -eq 1
        set __startup 0
    else if test $__startup -eq 0
        if test $__clear -eq 1
            printf "\n"
        else
            set -g __clear 1
        end
    end

    #distro
    set_color white
    echo -n ''
    set_color -b white
    set_color black
    echo -n '󰣇 '
    echo -n (__print_exec_time)
    set_color -b normal
    set_color white
    echo -n ''

    echo -n ' •• '

    # 显示当前路径
    set_color white
    echo -n ''
    set_color -b white
    set_color black
    set -l cwd (__replace_home_symbol)
    echo -n $cwd
    set_color -b normal
    set_color white
    echo -n ''
    set_color normal

    #git信息
    if test -d .git
        echo -n ' • '
        set_color white
        echo -n ''
        set_color black
        set_color -b white
        echo -n ''
        echo -n (__fish_git_prompt)
        set_color -b normal
        set_color white
        echo -n ''
        set_color -b normal
    end

    echo

    # 彩色圆条配置
    set_color -o white
    echo -n '•  '
    set_color normal

end

function fish_right_prompt
    #intentionally left blank
end
