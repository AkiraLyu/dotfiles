#!/bin/bash

cd /mnt
btrfs subvolume create _active
btrfs subvolume create _active/_root
btrfs subvolume create _active/_home
btrfs subvolume create _active/_log
btrfs subvolume create _active/_tmp
btrfs subvolume create _snapshots
