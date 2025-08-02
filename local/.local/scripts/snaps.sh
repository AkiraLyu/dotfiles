#!/bin/fish

set date (date +%y-%m-%d_%H-%M-%S)

set -gx SUBVOL_PATHS   \
    "_home"   \
    "_root"

set -gx SNAP_ROOT "/mnt/defvol/@snapshots"

function create_snaps
    sudo btrfs subvolume snapshot /mnt/defvol/@home /mnt/defvol/@snapshots/snap_home/"$date"
    sudo btrfs subvolume snapshot /mnt/defvol/@ /mnt/defvol/@snapshots/snap_root/"$date"
end

function cleanup_snapshots
    for subvol in $SUBVOL_PATHS
        set -l name (get_subvol_name $subvol)
        set -l snap_dir "$SNAP_ROOT/snap$name"
        if test -d $snap_dir
            sudo btrfs subvolume delete $snap_dir/*
        else
            echo "无快照存在: $snap_dir"
        end
    end
end

function get_subvol_name
    set -l subvol_path $argv[1]
    basename $subvol_path
end

function list_snapshots
    for subvol in $SUBVOL_PATHS
        set -l name (get_subvol_name $subvol)
        set -l snap_dir "$SNAP_ROOT/snap$name"
        echo "子卷: $subvol"
        echo "快照目录: $snap_dir"
        if test -d $snap_dir
            ls -lh $snap_dir
        else
            echo "无快照存在"
        end
        echo "------------------------"
    end
end

switch $argv[1]
    case "create"
        create_snaps
    case "cleanup"
        cleanup_snapshots
    case "list"
        list_snapshots
    case "*"
        echo "Usage: ./snapman.fish [create|cleanup|list]"
        exit 1
end

