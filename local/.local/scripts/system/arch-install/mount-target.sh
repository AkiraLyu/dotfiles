#!/bin/bash

# swapon /dev/mapper/cryptswap
mount -o noatime,compress=zstd,subvol=@ /dev/mapper/cryptroot /mnt/
mount /dev/nvme0n1p1 /mnt/boot
mount -o noatime,compress=zstd,subvol=@home /dev/mapper/cryptroot /mnt/home
mount -o noatime,compress=zstd,subvol=@snapshots /dev/mapper/cryptroot /mnt/.snapshots
mount -o noatime,compress=zstd,subvol=/ /dev/mapper/cryptroot /mnt/mnt/defvol
