#!/bin/bash

mount -o noatime,compress=zstd,subvol=_active/_root /dev/nvme0n1p2 /mnt/
mkdir /mnt/{home,boot}
mkdir /mnt/boot/efi
mkdir -p /mnt/mnt/defvol /mnt/var/log /mnt/tmp
mount /dev/nvme0n1p1 /mnt/boot/efi
mount -o noatime,compress=zstd,subvol=_active/_home /dev/nvme0n1p2 /mnt/home
mount -o noatime,compress=zstd,subvol=_active/_log /dev/nvme0n1p2 /mnt/var/log
mount -o noatime,compress=zstd,subvol=_active/_tmp /dev/nvme0n1p2 /mnt/tmp
mount -o noatime,compress=zstd,subvol=/ /dev/nvme0n1p2 /mnt/mnt/defvol

arch-chroot /mnt /bin/bash
