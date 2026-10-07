# 补全桌面文件与 Flatpak 导出路径；与主题管理保持独立。
begin
    set -l data_dirs \
        "$HOME/.local/share/flatpak/exports/share" \
        /var/lib/flatpak/exports/share \
        /usr/local/share \
        /usr/share

    if set -q XDG_DATA_DIRS
        for data_dir in (string split : -- "$XDG_DATA_DIRS")
            if test -n "$data_dir"; and not contains -- "$data_dir" $data_dirs
                set -a data_dirs "$data_dir"
            end
        end
    end

    set -gx XDG_DATA_DIRS (string join : -- $data_dirs)
end
